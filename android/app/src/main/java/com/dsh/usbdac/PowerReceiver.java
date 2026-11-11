package com.dsh.usbdac;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;

/**
 * 静态广播接收器：只记录 USB 供电状态，绝不据此拉起面板。
 *
 * 面板是否弹出由 UsbDockService 判定，条件是「USB 接入 + ALSA 有活动音频流」。
 * 因为 disk(MTP) 模式同样在供电，若在这里直接拉起，一插数据线就会弹面板。
 */
public class PowerReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            String action = intent.getAction();

            // 开机自启 / 应用更新后自启：把常驻服务拉起来，
            // 否则重启设备后必须手动点一次图标，面板才不会自动弹出。
            if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                    || "android.intent.action.MY_PACKAGE_REPLACED".equals(action)
                    || "android.intent.action.QUICKBOOT_POWERON".equals(action)) {
                android.util.Log.d("DacPanel", "boot-ish action: " + action);
                Intent svc = new Intent(context, UsbDockService.class);
                try {
                    context.startService(svc);
                } catch (Throwable ignored) {
                }
                return;
            }

            if (Intent.ACTION_BATTERY_CHANGED.equals(action)) {
                int plugged = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
                State.plugged = (plugged & BatteryManager.BATTERY_PLUGGED_USB) != 0;
                return;
            }

            if (Intent.ACTION_POWER_CONNECTED.equals(action)) {
                Intent battery = context.registerReceiver(null,
                        new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                if (battery != null) {
                    int plugged = battery.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
                    State.plugged = (plugged & BatteryManager.BATTERY_PLUGGED_USB) != 0;
                }
                return;
            }

            if (Intent.ACTION_POWER_DISCONNECTED.equals(action)) {
                State.plugged = false;
            }
        } catch (Throwable ignored) {
        }
    }
}
