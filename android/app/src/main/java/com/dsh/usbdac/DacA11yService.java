package com.dsh.usbdac;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 数据源：用无障碍服务读取山灵音乐播放页的文本节点。
 *
 * 实测山灵 MusicApp 播放页的采样率信息是原生 TextView：
 *   id/playing_title        = "WAV 96kHz/24bit/4608Kbps"
 *   id/playing_music_name   = 曲名
 *   id/playing_music_artist = 艺术家
 *
 * 为什么只能走这条路：M6 的 HiFi 播放完全旁路 Android AudioFlinger 与
 * 标准 ALSA（播放 96kHz 时 hw_params 全 closed、flinger 全 standby、
 * mMusicActiveMs=0），内核和框架都拿不到采样率。
 *
 * 另外本面板必须用悬浮窗（而非 Activity）承载：Activity 覆盖会让山灵
 * onStop、窗口不可访问，访问树直接变 null。悬浮窗不改变下层生命周期，
 * 山灵保持 RESUMED，节点可读。
 */
public class DacA11yService extends AccessibilityService {

    private static final String TAG = "DacA11y";
    private static final String PKG = "com.shanling.MusicApp";
    private static final String ID_TITLE = "com.shanling.MusicApp:id/playing_music_name";
    private static final String ID_ARTIST = "com.shanling.MusicApp:id/playing_music_artist";
    private static final String ID_FORMAT = "com.shanling.MusicApp:id/playing_title";

    /** 例：WAV 96kHz/24bit/4608Kbps */
    private static final Pattern P_PCM = Pattern.compile(
            "([A-Za-z0-9]{2,10})\\s+([0-9]+(?:\\.[0-9]+)?)\\s*kHz\\s*/\\s*([0-9]+)\\s*bit"
                    + "(?:\\s*/\\s*([0-9]+)\\s*Kbps)?");
    /** 例：DSD64 / DSD128 */
    private static final Pattern P_DSD = Pattern.compile("DSD\\s*(64|128|256|512)");

    private static volatile boolean connected = false;
    private static volatile DacA11yService sInstance = null;

    private long lastEventScanAt = 0L;
    private String lastFormatText = null;
    private long lastDiagAt = 0L;

    public static boolean isConnected() {
        return connected;
    }

    /**
     * 面板推送循环（400ms）主动调用，避免依赖山灵界面是否产生无障碍事件。
     * 山灵界面在播放结束后是静止的，不会有事件，只能主动读。
     */
    public static void scanNow() {
        DacA11yService s = sInstance;
        if (s == null || !connected) {
            return;
        }
        try {
            AccessibilityNodeInfo root = s.findShanlingRoot();
            if (root == null) {
                s.diag("scanNow: root null");
                return;
            }
            s.readNodes(root);
        } catch (Throwable t) {
            Log.w(TAG, "scanNow failed", t);
        }
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        connected = true;
        sInstance = this;
        try {
            State.appDir = getFilesDir();
        } catch (Throwable ignored) {
        }
        Log.i(TAG, "service connected");
    }

    @Override
    public boolean onUnbind(Intent intent) {
        connected = false;
        sInstance = null;
        Log.i(TAG, "service unbound");
        return super.onUnbind(intent);
    }

    @Override
    public void onDestroy() {
        sInstance = null;
        connected = false;
        super.onDestroy();
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) {
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastEventScanAt < 500L) {
            return;
        }
        lastEventScanAt = now;

        try {
            AccessibilityNodeInfo root = findShanlingRoot();
            if (root == null) {
                diag("event: root null");
                return;
            }
            readNodes(root);
        } catch (Throwable t) {
            Log.w(TAG, "event handling failed", t);
        }
    }

    @Override
    public void onInterrupt() {
    }

    /** 先试焦点窗口，再遍历所有交互窗口（山灵可能被悬浮面板遮挡但仍 RESUMED） */
    private AccessibilityNodeInfo findShanlingRoot() {
        try {
            AccessibilityNodeInfo active = getRootInActiveWindow();
            if (active != null) {
                CharSequence p = active.getPackageName();
                if (p != null && PKG.contentEquals(p)) {
                    return active;
                }
            }
        } catch (Throwable ignored) {
        }

        try {
            List<AccessibilityWindowInfo> windows = getWindows();
            if (windows == null) {
                return null;
            }
            AccessibilityNodeInfo fallback = null;
            for (int i = 0; i < windows.size(); i++) {
                AccessibilityWindowInfo w = windows.get(i);
                if (w == null) {
                    continue;
                }
                AccessibilityNodeInfo r;
                try {
                    r = w.getRoot();
                } catch (Throwable t) {
                    continue;
                }
                if (r == null) {
                    continue;
                }
                CharSequence p = r.getPackageName();
                if (p != null && PKG.contentEquals(p)) {
                    if (w.isActive()) {
                        return r;
                    }
                    if (fallback == null) {
                        fallback = r;
                    }
                }
            }
            return fallback;
        } catch (Throwable t) {
            Log.w(TAG, "getWindows failed", t);
            return null;
        }
    }

    private void readNodes(AccessibilityNodeInfo root) {
        String title = textOf(root, ID_TITLE);
        String artist = textOf(root, ID_ARTIST);
        String format = textOf(root, ID_FORMAT);

        if (title != null) {
            State.a11yTitle = title;
        }
        if (artist != null) {
            State.a11yArtist = artist;
        }
        if (format != null) {
            if (!format.equals(lastFormatText)) {
                lastFormatText = format;
                Log.d(TAG, "format text = " + format);
                Diag.write("FORMAT=" + format + " TITLE=" + title);
            }
            parseFormat(format);
        } else {
            diag("playing_title missing");
        }
    }

    /** 把诊断信息落到 App 私有目录，DAC 模式下 adb 断开时可事后再捞 */
    private void diag(String msg) {
        long now = System.currentTimeMillis();
        if (now - lastDiagAt > 5000L) {
            lastDiagAt = now;
            Log.d(TAG, msg);
            // 把当前可见文本全部抓下来，便于判断 DAC 界面是不是可读的原生控件
            AccessibilityNodeInfo root = findShanlingRoot();
            String texts = root == null ? "(no root)" : textSummary(root);
            Diag.write(msg + " | windows=" + windowSummary() + " | texts=" + texts);
        }
    }

    /** 递归收集节点树里的全部文本（限深限量，避免刷爆日志） */
    private String textSummary(AccessibilityNodeInfo root) {
        StringBuilder sb = new StringBuilder();
        try {
            collectText(root, sb, 0);
        } catch (Throwable ignored) {
        }
        return sb.length() == 0 ? "(empty)" : sb.toString();
    }

    private void collectText(AccessibilityNodeInfo n, StringBuilder sb, int depth) {
        if (n == null || depth > 14 || sb.length() > 700) {
            return;
        }
        CharSequence t = n.getText();
        if (t != null && t.length() > 0) {
            sb.append('"').append(t).append("\" ");
        }
        int cnt;
        try {
            cnt = n.getChildCount();
        } catch (Throwable e) {
            return;
        }
        for (int i = 0; i < cnt && i < 40; i++) {
            AccessibilityNodeInfo c = null;
            try {
                c = n.getChild(i);
            } catch (Throwable ignored) {
            }
            if (c != null) {
                collectText(c, sb, depth + 1);
            }
        }
    }

    private String windowSummary() {
        try {
            List<AccessibilityWindowInfo> ws = getWindows();
            if (ws == null) {
                return "null";
            }
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < ws.size(); i++) {
                try {
                    AccessibilityWindowInfo w = ws.get(i);
                    if (w == null) {
                        continue;
                    }
                    AccessibilityNodeInfo r = w.getRoot();
                    String pkg = "?";
                    if (r != null && r.getPackageName() != null) {
                        pkg = r.getPackageName().toString();
                    }
                    sb.append('[').append(pkg).append(w.isActive() ? "*" : "");
                    sb.append(']');
                } catch (Throwable ignored) {
                }
            }
            return sb.toString();
        } catch (Throwable t) {
            return "err";
        }
    }

    private String textOf(AccessibilityNodeInfo root, String viewId) {
        try {
            List<AccessibilityNodeInfo> list = root.findAccessibilityNodeInfosByViewId(viewId);
            if (list == null) {
                return null;
            }
            for (int i = 0; i < list.size(); i++) {
                AccessibilityNodeInfo n = list.get(i);
                if (n == null) {
                    continue;
                }
                CharSequence t = n.getText();
                if (t != null && t.length() > 0) {
                    return t.toString();
                }
            }
        } catch (Throwable ignored) {
        }
        return null;
    }

    private void parseFormat(String raw) {
        String s = raw.trim();

        Matcher m = P_PCM.matcher(s);
        if (m.find()) {
            String fmt = m.group(1);
            if (fmt != null) {
                State.a11yFormat = fmt.toUpperCase();
            }
            try {
                State.a11yRate = Double.parseDouble(m.group(2));
            } catch (Throwable ignored) {
            }
            try {
                State.a11yBits = Integer.parseInt(m.group(3));
            } catch (Throwable ignored) {
            }
            if (m.group(4) != null) {
                try {
                    State.a11yKbps = Integer.parseInt(m.group(4));
                } catch (Throwable ignored) {
                }
            }
            State.a11yAt = System.currentTimeMillis();
            return;
        }

        Matcher d = P_DSD.matcher(s);
        if (d.find()) {
            int mult;
            try {
                mult = Integer.parseInt(d.group(1));
            } catch (Throwable t) {
                return;
            }
            State.a11yFormat = "DSD" + mult;
            State.a11yRate = 44.1 * mult;
            State.a11yBits = 1;
            State.a11yKbps = 0;
            State.a11yAt = System.currentTimeMillis();
        }
    }
}
