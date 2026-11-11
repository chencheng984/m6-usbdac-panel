package com.dsh.usbdac;

import android.content.Context;
import android.media.AudioManager;

import org.json.JSONObject;

/**
 * 把 State 组装成 Web 端消费的 JSON 快照。
 *
 * 融合规则：
 *  - rate / bits：优先 ALSA（内核真值），ALSA 不可用时退回无障碍文本
 *  - format / kbps：只有无障碍能提供编码格式与码率；否则格式标 PCM，
 *    码率按 PCM 未压缩公式 rate*bits*channels 计算（真实值，不伪造）
 */
public final class SnapshotBuilder {

    private SnapshotBuilder() {
    }

    public static String build(Context ctx) {
        refreshAudio(ctx);

        boolean alsa = State.alsaFresh();
        boolean a11y = State.a11yFresh();
        boolean connected = State.plugged || alsa || a11y;

        JSONObject root = new JSONObject();
        try {
            root.put("link", connected ? "connected" : "disconnected");
            root.put("plugged", connected);
            root.put("audioActive", State.audioActive);

            double rate = 0;
            int bits = 0;
            int channels = 0;
            String format = null;
            int kbps = 0;
            String title = null;
            String artist = null;
            String source = "none";

            // 实测 M6 的 HiFi 播放完全旁路 ALSA（播放 96kHz 时所有 hw_params 仍为
            // closed、audio_flinger 全 standby），因此无障碍文本是主数据源，
            // 内核 ALSA 仅作为兜底（某些走标准通路的场景可用）。
            if (a11y) {
                rate = State.a11yRate;
                bits = State.a11yBits;
                channels = 2;
                source = "a11y";
                if (State.a11yFormat != null) {
                    format = State.a11yFormat;
                }
                if (State.a11yKbps > 0) {
                    kbps = State.a11yKbps;
                }
                title = State.a11yTitle;
                artist = State.a11yArtist;
            } else if (alsa) {
                rate = State.alsaRate;
                bits = State.alsaBits;
                channels = State.alsaChannels;
                source = "alsa";
            }

            if (format == null && rate > 0) {
                format = "PCM";
            }

            if (kbps <= 0 && rate > 0 && bits > 0) {
                int ch = channels > 0 ? channels : 2;
                kbps = (int) Math.round(rate * 1000.0 * bits * ch / 1000.0);
            }

            JSONObject params = new JSONObject();
            if (rate > 0) {
                params.put("rate", rate);
            }
            if (bits > 0) {
                params.put("bits", bits);
            }
            if (channels > 0) {
                params.put("channels", channels);
            }
            if (format != null) {
                params.put("format", format);
            }
            if (kbps > 0) {
                params.put("kbps", kbps);
            }
            root.put("params", params);
            root.put("source", source);

            JSONObject volume = new JSONObject();
            volume.put("cur", State.volume);
            volume.put("max", State.volumeMax);
            root.put("volume", volume);

            if (title != null && title.length() > 0) {
                JSONObject track = new JSONObject();
                track.put("title", title);
                if (artist != null && artist.length() > 0) {
                    track.put("artist", artist);
                }
                root.put("track", track);
            } else {
                root.put("track", JSONObject.NULL);
            }

            JSONObject caps = new JSONObject();
            caps.put("alsa", State.alsaAvailable);
            caps.put("a11y", DacA11yService.isConnected());
            caps.put("volume", State.volumeMax > 0);
            root.put("caps", caps);

            // 画面保持简洁：不再下发普通提示横幅（"等待音频信息"这类）。
            // 真正的异常由 try/catch 返回 link=error，界面用遮罩降级即可。
            root.put("banner", JSONObject.NULL);
        } catch (Throwable ignored) {
            // 快照构建失败时返回尽量完整的空快照，界面自行降级
            try {
                return "{\"link\":\"error\",\"banner\":{\"text\":\"状态构建失败\",\"level\":\"error\"}}";
            } catch (Throwable ignored2) {
                return "{}";
            }
        }
        return root.toString();
    }

    private static void refreshAudio(Context ctx) {
        try {
            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) {
                return;
            }
            State.volume = am.getStreamVolume(AudioManager.STREAM_MUSIC);
            State.volumeMax = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            State.audioActive = am.isMusicActive();
        } catch (Throwable ignored) {
        }
    }
}
