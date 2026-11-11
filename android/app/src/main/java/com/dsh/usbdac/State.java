package com.dsh.usbdac;

/**
 * 进程内共享状态：各采集器写入，SnapshotBuilder 读取。
 * 全部使用 volatile，采集线程与 UI 线程之间无需额外同步。
 */
public final class State {

    private State() {
    }

    /** USB 供电接入（即插上电脑/充电器） */
    public static volatile boolean plugged = false;

    /** USB 数据连接（ACTION_USB_STATE connected，比供电更可靠地反映 DAC 接入） */
    public static volatile boolean usbConnected = false;

    /** 当前是否处于一次「DAC 会话」中（ALSA 有流） */
    public static volatile boolean dacSessionActive = false;

    /** 本次会话里用户是否手动关过面板；直到 ALSA 流中断才重置，避免关了又立刻弹 */
    public static volatile boolean userDismissed = false;

    /** 系统有音频活动（用于把"已连接"升级为"DAC 工作中"） */
    public static volatile boolean audioActive = false;

    // ---------------- ALSA（P1，内核真实参数） ----------------
    public static volatile boolean alsaAvailable = false;
    public static volatile double alsaRate = 0;
    public static volatile int alsaBits = 0;
    public static volatile int alsaChannels = 0;
    public static volatile String alsaFormat = null;
    public static volatile long alsaAt = 0L;
    public static volatile String alsaError = null;

    // ---------------- 无障碍读山灵界面（P2） ----------------
    public static volatile double a11yRate = 0;
    public static volatile int a11yBits = 0;
    public static volatile int a11yKbps = 0;
    public static volatile String a11yFormat = null;
    public static volatile String a11yTitle = null;
    public static volatile String a11yArtist = null;
    public static volatile long a11yAt = 0L;

    // ---------------- 音量 ----------------
    public static volatile int volume = -1;
    public static volatile int volumeMax = -1;

    /** 数据新鲜度窗口 */
    public static final long FRESH_MS = 4000L;

    /** App 私有目录，供诊断日志落盘（DAC 模式下 adb 断开时事后捞取） */
    public static volatile java.io.File appDir = null;

    public static boolean alsaFresh() {
        return alsaAvailable && alsaRate > 0 &&
                (System.currentTimeMillis() - alsaAt) < FRESH_MS;
    }

    public static boolean a11yFresh() {
        return a11yRate > 0 &&
                (System.currentTimeMillis() - a11yAt) < FRESH_MS;
    }

    public static boolean connected() {
        return plugged || alsaFresh() || a11yFresh();
    }
}
