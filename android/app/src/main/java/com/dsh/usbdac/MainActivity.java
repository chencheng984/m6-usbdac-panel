package com.dsh.usbdac;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/**
 * 入口 Activity：自己不留界面，只负责拉起常驻服务并显示悬浮面板，然后立即退出，
 * 以免遮挡山灵界面导致无障碍读不到采样率。
 */
public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            startService(new Intent(this, UsbDockService.class));
        } catch (Throwable ignored) {
        }
        PanelWindow.show(this);
        finish();
    }
}
