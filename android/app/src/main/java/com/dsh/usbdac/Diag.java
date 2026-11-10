package com.dsh.usbdac;

import java.io.File;
import java.io.FileOutputStream;

/**
 * 极简诊断日志：写到 App 私有目录 files/dac-diag.log。
 * USB DAC 模式下 adb 会断开，事后再用 run-as 把日志捞出来即可。
 */
public final class Diag {

    private static final Object LOCK = new Object();
    private static final long MAX_BYTES = 64 * 1024L;

    private Diag() {
    }

    public static void write(String msg) {
        synchronized (LOCK) {
            FileOutputStream fos = null;
            try {
                File dir = State.appDir;
                if (dir == null) {
                    dir = new File("/data/local/tmp");
                }
                File f = new File(dir, "dac-diag.log");
                if (f.length() > MAX_BYTES) {
                    // 简单截断，避免无限增长
                    boolean ignored = f.delete();
                }
                fos = new FileOutputStream(f, true);
                String line = System.currentTimeMillis() + " " + msg + "\n";
                fos.write(line.getBytes("UTF-8"));
            } catch (Throwable ignored) {
            } finally {
                if (fos != null) {
                    try {
                        fos.close();
                    } catch (Throwable ignored) {
                    }
                }
            }
        }
    }
}
