package com.dsh.usbdac;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

/**
 * 常驻前台服务。
 *
 * 面板触发条件刻意不用「插上 USB」——disk(MTP) 模式也会给 USB 供电，
 * 那样一插数据线就弹面板，很烦。实测区分两种模式最可靠的信号是：
 *
 *   - USB DAC 模式：音频走标准 USB 音频通路，/proc/asound 的 PCM 是开着的
 *   - disk / 本地播放：山灵引擎旁路 ALSA，PCM 全是 closed
 *
 * 所以只有「USB 已接入 + ALSA 有活动音频流」才拉面板。
 */
public class UsbDockService extends Service {

    private static final String CHANNEL_ID = "dac_panel";
    private static final String ACTION_CLOSE_PANEL = "com.dsh.usbdac.CLOSE_PANEL";
    private static final String ACTION_USB_STATE = "android.hardware.usb.action.USB_STATE";

    private BroadcastReceiver receiver;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private int tick = 0;

    private final Runnable watcher = new Runnable() {
        @Override
        public void run() {
            try {
                AlsaProbe.scan();

                // 每约 5 秒打一次探测状态：DAC 模式下 adb 会断，这些日志
                // 切回普通模式后可以回捞，用来判断「为什么不弹」。
                if ((tick++ % 8) == 0) {
                    String msg = "probe cards=" + AlsaProbe.cardCount
                            + " active=" + AlsaProbe.activeStreams
                            + " fresh=" + State.alsaFresh()
                            + " rate=" + State.alsaRate
                            + " dismissed=" + State.userDismissed
                            + " shown=" + PanelWindow.isShown()
                            + " usb=" + State.usbConnected;
                    android.util.Log.d("DacPanel", msg);
                    Diag.write(msg);
                    Diag.write("  " + AlsaProbe.snapshot());
                }

                // 会话状态机：
                //  · ALSA 有流 = 进入一次 DAC 会话
                //  · ALSA 断流 = 会话结束，同时清掉「用户已关闭」标记
                // 这样用户点退出后不会被 watchdog 立刻重新拉起，只有拔插/重连才会再弹。
                boolean active = State.alsaFresh();
                if (!active) {
                    State.dacSessionActive = false;
                    State.userDismissed = false;
                } else if (!State.dacSessionActive) {
                    State.dacSessionActive = true;
                    State.userDismissed = false;
                }

                if (active && !State.userDismissed && !PanelWindow.isShown()) {
                    String msg = "auto show: rate=" + State.alsaRate
                            + " plugged=" + State.plugged + " usb=" + State.usbConnected
                            + " cards=" + AlsaProbe.cardCount;
                    android.util.Log.d("DacPanel", msg);
                    Diag.write(msg);
                    PanelWindow.show(UsbDockService.this);
                }
            } catch (Throwable ignored) {
            }
            handler.postDelayed(this, 600L);
        }
    };

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        // DAC 模式下 adb 会断，这里把私有目录挂上，关键状态落盘到 files/dac-diag.log，
        // 切回普通模式后可以 run-as 捞出来（此前只有无障碍服务设置过 appDir，
        // 无障碍没开时 Diag 写不进去）。
        State.appDir = getFilesDir();
        Diag.write("service onCreate");

        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                try {
                    String action = intent.getAction();

                    if (Intent.ACTION_BATTERY_CHANGED.equals(action)) {
                        int plugged = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
                        // 只记录供电状态，不再据此弹面板（disk 模式同样在供电）
                        State.plugged = (plugged & BatteryManager.BATTERY_PLUGGED_USB) != 0;
                        return;
                    }

                    if (ACTION_USB_STATE.equals(action)) {
                        boolean connected = intent.getBooleanExtra("connected", false);
                        boolean configured = intent.getBooleanExtra("configured", false);
                        String fn = intent.getStringExtra("usb_function");
                        boolean wasConnected = State.usbConnected;
                        State.usbConnected = connected;
                        android.util.Log.d("DacPanel", "USB_STATE connected=" + connected
                                + " configured=" + configured + " function=" + fn
                                + " (was " + wasConnected + ")");
                        // 把 extras 全量落盘：判断 USB 到底切成了哪种功能
                        // （fn 一直是 null，说明 usb_function 这个 key 在这台机器上不提供）
                        StringBuilder ek = new StringBuilder();
                        android.os.Bundle ex = intent.getExtras();
                        if (ex != null) {
                            for (String k : ex.keySet()) {
                                ek.append(k).append('=').append(ex.get(k)).append(' ');
                            }
                        }
                        Diag.write("USB_STATE connected=" + connected
                                + " configured=" + configured + " fn=" + fn
                                + " was=" + wasConnected + " extras[" + ek + "]");
                        if (connected && !wasConnected) {
                            // USB 重新枚举（插拔、或从 MTP 切到 DAC 模式）：
                            // 视为一次新会话，清掉「用户已关闭」标记，
                            // 否则切模式后不会自动弹面板。
                            State.userDismissed = false;
                            State.dacSessionActive = false;
                        }
                        if (connected) {
                            // USB 刚接上：立刻探一次 ALSA，不等下一个 600ms tick
                            AlsaProbe.scan();
                        }
                    }
                } catch (Throwable ignored) {
                }
            }
        };
        try {
            IntentFilter filter = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
            filter.addAction(ACTION_USB_STATE);
            registerReceiver(receiver, filter);
        } catch (Throwable ignored) {
        }

        // 立刻取一次 sticky 供电状态
        try {
            Intent sticky = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (sticky != null) {
                int p = sticky.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
                State.plugged = (p & BatteryManager.BATTERY_PLUGGED_USB) != 0;
            }
        } catch (Throwable ignored) {
        }

        handler.post(watcher);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            if (intent != null && ACTION_CLOSE_PANEL.equals(intent.getAction())) {
                PanelWindow.hide();
            }

            if (Build.VERSION.SDK_INT >= 26) {
                NotificationManager nm =
                        (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) {
                    NotificationChannel ch = new NotificationChannel(
                            CHANNEL_ID, "USB DAC 面板", NotificationManager.IMPORTANCE_MIN);
                    ch.setShowBadge(false);
                    nm.createNotificationChannel(ch);
                }
            }

            Intent close = new Intent(this, UsbDockService.class);
            close.setAction(ACTION_CLOSE_PANEL);
            PendingIntent closePi = PendingIntent.getService(
                    this, 1, close, PendingIntent.FLAG_UPDATE_CURRENT);

            Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                    ? new Notification.Builder(this, CHANNEL_ID)
                    : new Notification.Builder(this);
            Notification n = builder
                    .setContentTitle("M6 USB DAC")
                    .setContentText("等待 USB DAC 信号…")
                    .setSmallIcon(R.drawable.ic_app)
                    .setOngoing(true)
                    .addAction(android.R.drawable.ic_menu_close_clear_cancel, "关闭面板", closePi)
                    .build();
            startForeground(1001, n);
        } catch (Throwable ignored) {
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(watcher);
        if (receiver != null) {
            try {
                unregisterReceiver(receiver);
            } catch (Throwable ignored) {
            }
            receiver = null;
        }
        super.onDestroy();
    }
}
