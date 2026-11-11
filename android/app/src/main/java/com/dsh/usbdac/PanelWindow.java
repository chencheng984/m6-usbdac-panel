package com.dsh.usbdac;

import android.content.Context;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

import org.json.JSONObject;

/**
 * 面板窗口：用 WindowManager 悬浮层承载 WebView。
 *
 * 为什么不用 Activity 全屏：只要面板窗口覆盖山灵界面，山灵就会被
 * onStop / 窗口不可访问，无障碍拿到的是 null，采样率彻底读不到。
 * 悬浮窗不影响下层 Activity 生命周期 —— 山灵保持 RESUMED、界面持续
 * 刷新，无障碍才能实时读到采样率。
 */
public final class PanelWindow {

    private static WebView sWebView;
    private static WindowManager sWm;
    private static Context sCtx;
    private static volatile boolean sShown = false;

    private static final Handler sHandler = new Handler(Looper.getMainLooper());
    private static final Runnable sPusher = new Runnable() {
        @Override
        public void run() {
            push();
            if (sShown) {
                sHandler.postDelayed(this, 400L);
            }
        }
    };

    private PanelWindow() {
    }

    public static boolean isShown() {
        return sShown;
    }

    public static void show(final Context ctx) {
        runOnMain(new Runnable() {
            @Override
            public void run() {
                showInternal(ctx);
            }
        });
    }

    private static void showInternal(Context ctx) {
        if (sShown) {
            return;
        }
        sCtx = ctx.getApplicationContext();
        try {
            WebView wv = new WebView(sCtx);
            WebSettings ws = wv.getSettings();
            ws.setJavaScriptEnabled(true);
            ws.setDomStorageEnabled(true);
            ws.setAllowFileAccess(true);
            ws.setAllowContentAccess(true);
            ws.setSupportZoom(false);
            ws.setBuiltInZoomControls(false);
            ws.setTextZoom(100);
            wv.setBackgroundColor(0xFF0B0C0E);
            // 诊断：原生层触摸是否到达（区分「窗口收不到」和「WebView 吞掉」）
            wv.setOnTouchListener(new android.view.View.OnTouchListener() {
                @Override
                public boolean onTouch(android.view.View v, android.view.MotionEvent e) {
                    android.util.Log.d("DacPanel", "native touch a=" + e.getActionMasked()
                            + " " + Math.round(e.getX()) + "," + Math.round(e.getY()));
                    return false;
                }
            });
            wv.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onConsoleMessage(android.webkit.ConsoleMessage cm) {
                    android.util.Log.d("DacPanel", "[console] " + cm.message());
                    return true;
                }
            });

            DacBridge bridge = new DacBridge(sCtx,
                    new Runnable() {
                        @Override
                        public void run() {
                            // 用户主动关闭：标记本会话已关闭，否则 watchdog 会在
                            // 600ms 后因为 ALSA 还有流而立刻把面板弹回来。
                            State.userDismissed = true;
                            hide();
                        }
                    },
                    new Runnable() {
                        @Override
                        public void run() {
                            AlsaProbe.scan();
                        }
                    });
            wv.addJavascriptInterface(bridge, "DacBridge");

            WindowManager wm = (WindowManager) sCtx.getSystemService(Context.WINDOW_SERVICE);
            // 用 MATCH_PARENT 跟随当前屏幕与旋转；不要手写物理像素尺寸，
            // 否则设备旋转时窗口请求尺寸会和实际 frame 不一致，内容被裁、触摸坐标错位。
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.MATCH_PARENT,
                    overlayType(),
                    // 不再使用 FLAG_LAYOUT_IN_SCREEN / FLAG_LAYOUT_NO_LIMITS：
                    // 那会把状态栏与导航栏一起盖掉，用户就回不到桌面了。
                    WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
                            // 不抢焦点：否则本面板会成为 active window，无障碍读不到山灵
                            | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            // 显式声明非模态：部分 ROM 上 NOT_FOCUSABLE 不会自动带上它，
                            // 结果窗口收不到触摸，面板「完全点不动」
                            | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                    PixelFormat.TRANSLUCENT);
            lp.gravity = Gravity.TOP | Gravity.LEFT;
            lp.x = 0;
            lp.y = 0;
            wm.addView(wv, lp);

            sWebView = wv;
            sWm = wm;
            sShown = true;

            // 关键：addView 之后视图尺寸可能还是 0。若此刻就 loadUrl，
            // 页面会以 0x0 的 viewport 初始化 —— 表现就是「黑屏 + 触摸全无效」。
            // 等窗口真正完成一次布局再加载，并顺手把尺寸打进日志便于排查。
            sHandler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (sWebView == null) {
                        return;
                    }
                    try {
                        android.util.Log.d("DacPanel", "wv size " + sWebView.getWidth()
                                + "x" + sWebView.getHeight());
                        if (sWebView.getWidth() == 0 || sWebView.getHeight() == 0) {
                            sWebView.requestLayout();
                        }
                        sWebView.loadUrl("file:///android_asset/index.html");
                        sHandler.removeCallbacks(sPusher);
                        sHandler.post(sPusher);
                    } catch (Throwable ignored) {
                    }
                }
            }, 260L);
        } catch (Throwable t) {
            sShown = false;
            sWebView = null;
            sWm = null;
        }
    }

    /**
     * 关闭面板。必须切到主线程：
     * Web 的 @JavascriptInterface 回调运行在 WebView 的 JavaBridge 线程，
     * 直接调用 WindowManager.removeView() 会抛异常导致悬浮窗关不掉。
     */
    public static void hide() {
        runOnMain(new Runnable() {
            @Override
            public void run() {
                hideInternal();
            }
        });
    }

    private static void hideInternal() {
        sShown = false;
        sHandler.removeCallbacks(sPusher);
        if (sWebView != null) {
            try {
                if (sWm != null) {
                    sWm.removeViewImmediate(sWebView);
                }
            } catch (Throwable ignored) {
            }
            try {
                sWebView.loadUrl("about:blank");
                sWebView.destroy();
            } catch (Throwable ignored) {
            }
            sWebView = null;
            sWm = null;
        }
    }

    private static void runOnMain(Runnable r) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            r.run();
        } else {
            sHandler.post(r);
        }
    }

    private static void push() {
        if (sWebView == null || sCtx == null) {
            return;
        }
        try {
            // 主动轮询：不依赖山灵界面是否发生无障碍事件
            DacA11yService.scanNow();
            AlsaProbe.scan();
            String json = SnapshotBuilder.build(sCtx);
            String quoted = JSONObject.quote(json);
            sWebView.evaluateJavascript(
                    "window.__dacPush && window.__dacPush(" + quoted + ");", null);
        } catch (Throwable ignored) {
        }
    }

    private static int overlayType() {
        if (Build.VERSION.SDK_INT >= 26) {
            return WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        }
        return WindowManager.LayoutParams.TYPE_PHONE;
    }
}
