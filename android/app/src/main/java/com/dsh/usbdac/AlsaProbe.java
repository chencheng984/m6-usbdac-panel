package com.dsh.usbdac;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;

/**
 * P1 数据源：直接读内核 ALSA 的 PCM 硬件参数。
 *
 * /proc/asound/card0/pcmXXp|pcmXXc/sub0/hw_params 内容形如：
 *   format: S24_LE
 *   channels: 2
 *   rate: 192000 (192000/1)
 * 未打开时为 "closed"。
 *
 * 目标机（M6 21 / Android 7.1.1）上该文件权限为 -r--r--r--，
 * 但 App 属于 untrusted_app 域，是否能读取决于 SELinux，需真机实测。
 */
public final class AlsaProbe {

    private static final String ASOUND = "/proc/asound";
    private static long lastProbeAt = 0L;

    /** 诊断用：最近一次扫描看到的声卡数 / 活动流数 */
    public static volatile int cardCount = 0;
    public static volatile int activeStreams = 0;

    private AlsaProbe() {
    }

    public static synchronized void scan() {
        long now = System.currentTimeMillis();
        if (now - lastProbeAt < 250L) {
            return;
        }
        lastProbeAt = now;

        File root = new File(ASOUND);
        String[] cards = root.isDirectory() ? root.list() : null;
        if (cards == null) {
            State.alsaAvailable = false;
            State.alsaError = "no " + ASOUND;
            cardCount = 0;
            return;
        }

        // 遍历所有声卡：DAC 模式下 USB 声卡不一定是 card0（可能挂到 card1 以后），
        // 只盯 card0 会漏掉正在播放的那一路，表现就是「切了 DAC 却不弹面板」。
        Hit bestCapture = null;
        Hit bestPlayback = null;
        int seen = 0;
        int active = 0;

        for (String card : cards) {
            if (card == null || !card.startsWith("card")) {
                continue;
            }
            File cardDir = new File(root, card);
            if (!cardDir.isDirectory()) {
                continue;
            }
            seen++;
            String[] names = cardDir.list();
            if (names == null) {
                continue;
            }
            for (String name : names) {
                if (name == null || !name.startsWith("pcm")) {
                    continue;
                }
                File p = new File(cardDir, name + "/sub0/hw_params");
                if (!p.isFile() || !p.canRead()) {
                    continue;
                }
                String text = readSmall(p);
                if (text == null) {
                    continue;
                }
                String trimmed = text.trim();
                if (trimmed.length() == 0 || trimmed.startsWith("closed")) {
                    continue;
                }

                double rate = parseRate(text);
                int bits = parseBits(text);
                int ch = parseChannels(text);
                if (rate <= 0 || bits <= 0) {
                    continue;
                }
                active++;

                Hit hit = new Hit(name, rate, bits, ch, parseFormatName(text));
                if (name.endsWith("c")) {
                    if (bestCapture == null || hit.rate > bestCapture.rate) {
                        bestCapture = hit;
                    }
                } else {
                    if (bestPlayback == null || hit.rate > bestPlayback.rate) {
                        bestPlayback = hit;
                    }
                }
            }
        }

        cardCount = seen;
        activeStreams = active;

        Hit best = bestCapture != null ? bestCapture : bestPlayback;

        if (best == null) {
            // 没有活动流：保留能力标记，但清空数值，避免显示过期数据
            State.alsaAvailable = true;
            State.alsaError = null;
            State.alsaRate = 0;
            State.alsaBits = 0;
            State.alsaChannels = 0;
            State.alsaFormat = null;
            State.alsaAt = 0L;
            return;
        }

        State.alsaAvailable = true;
        State.alsaError = null;
        State.alsaRate = best.rate;
        State.alsaBits = best.bits;
        State.alsaChannels = best.channels;
        State.alsaFormat = best.format;
        State.alsaAt = now;
    }

    private static String readSmall(File f) {
        BufferedReader br = null;
        try {
            br = new BufferedReader(new FileReader(f), 256);
            StringBuilder sb = new StringBuilder(192);
            String line;
            int n = 0;
            while ((line = br.readLine()) != null && n < 24) {
                sb.append(line).append('\n');
                n++;
            }
            return sb.toString();
        } catch (Throwable t) {
            return null;
        } finally {
            if (br != null) {
                try {
                    br.close();
                } catch (Throwable ignored) {
                }
            }
        }
    }

    /** "rate: 192000 (192000/1)" -> 192.0 */
    private static double parseRate(String text) {
        int i = text.indexOf("rate:");
        if (i < 0) {
            return 0;
        }
        int j = text.indexOf('\n', i);
        String line = j > 0 ? text.substring(i, j) : text.substring(i);
        StringBuilder num = new StringBuilder();
        for (int k = 5; k < line.length(); k++) {
            char c = line.charAt(k);
            if (c >= '0' && c <= '9') {
                num.append(c);
            } else if (num.length() > 0) {
                break;
            }
        }
        if (num.length() == 0) {
            return 0;
        }
        try {
            return Double.parseDouble(num.toString()) / 1000.0;
        } catch (Throwable t) {
            return 0;
        }
    }

    /** "format: S24_LE" -> 24 */
    private static int parseBits(String text) {
        String fmt = parseFormatName(text);
        if (fmt == null) {
            return 0;
        }
        String up = fmt.toUpperCase();
        if (up.startsWith("S16")) {
            return 16;
        }
        if (up.startsWith("S24") || up.startsWith("U24")) {
            return 24;
        }
        if (up.startsWith("S32") || up.startsWith("U32") || up.startsWith("FLOAT")) {
            return 32;
        }
        if (up.startsWith("S8") || up.startsWith("U8")) {
            return 8;
        }
        return 0;
    }

    private static String parseFormatName(String text) {
        int i = text.indexOf("format:");
        if (i < 0) {
            return null;
        }
        int j = text.indexOf('\n', i);
        String line = j > 0 ? text.substring(i + 7, j) : text.substring(i + 7);
        line = line.trim();
        return line.length() == 0 ? null : line;
    }

    /** "channels: 2" */
    private static int parseChannels(String text) {
        int i = text.indexOf("channels:");
        if (i < 0) {
            return 0;
        }
        int j = text.indexOf('\n', i);
        String line = j > 0 ? text.substring(i + 9, j) : text.substring(i + 9);
        line = line.trim();
        try {
            return Integer.parseInt(line);
        } catch (Throwable t) {
            return 0;
        }
    }

    private static final class Hit {
        final String pcm;
        final double rate;
        final int bits;
        final int channels;
        final String format;

        Hit(String pcm, double rate, int bits, int channels, String format) {
            this.pcm = pcm;
            this.rate = rate;
            this.bits = bits;
            this.channels = channels;
            this.format = format;
        }
    }
}
