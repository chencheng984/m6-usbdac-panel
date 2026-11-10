package com.dsh.usbdac;

import android.content.Context;
import android.media.AudioManager;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

/**
 * 暴露给 Web 的 JS 桥（window.DacBridge）。
 * 所有方法返回字符串，Web 端自行 JSON.parse，避免类型转换歧义。
 */
public final class DacBridge {

    private final Context ctx;
    private final Runnable onExit;
    private final Runnable onCheck;

    public DacBridge(Context ctx, Runnable onExit, Runnable onCheck) {
        this.ctx = ctx;
        this.onExit = onExit;
        this.onCheck = onCheck;
    }

    @JavascriptInterface
    public String getSnapshot() {
        try {
            AlsaProbe.scan();
            return SnapshotBuilder.build(ctx);
        } catch (Throwable t) {
            return "{\"link\":\"error\",\"banner\":{\"text\":\"快照读取异常\",\"level\":\"error\"}}";
        }
    }

    @JavascriptInterface
    public String setVolume(int value) {
        try {
            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) {
                return "{\"ok\":false,\"reason\":\"no-audio-manager\"}";
            }
            int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            int v = value;
            if (v < 0) {
                v = 0;
            }
            if (v > max) {
                v = max;
            }
            // flags 用 REMOVE_SOUND_AND_VIBRATE 而不是 0：
            // 既不放提示音、不震动，部分 ROM 上也不会跟着弹系统音量条
            // （M6 的 StatusBar 会监听 VOLUME_CHANGED_ACTION 并显示音量面板）。
            am.setStreamVolume(AudioManager.STREAM_MUSIC, v,
                    AudioManager.FLAG_REMOVE_SOUND_AND_VIBRATE);
            int actual = am.getStreamVolume(AudioManager.STREAM_MUSIC);
            State.volume = actual;
            State.volumeMax = max;

            JSONObject o = new JSONObject();
            o.put("ok", true);
            o.put("actual", actual);
            return o.toString();
        } catch (SecurityException se) {
            return "{\"ok\":false,\"reason\":\"permission\"}";
        } catch (Throwable t) {
            return "{\"ok\":false,\"reason\":\"error\"}";
        }
    }

    @JavascriptInterface
    public void forceCheck() {
        try {
            AlsaProbe.scan();
        } catch (Throwable ignored) {
        }
        if (onCheck != null) {
            onCheck.run();
        }
    }

    @JavascriptInterface
    public void exitApp() {
        if (onExit != null) {
            onExit.run();
        }
    }
}
