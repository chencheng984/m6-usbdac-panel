plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.dsh.usbdac"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "com.dsh.usbdac"
        minSdk = 24
        targetSdk = 37
        versionCode = 1
        versionName = "1.0.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    // 界面直接复用仓库根目录的 web/，避免两份代码漂移
    sourceSets {
        getByName("main") {
            assets.srcDirs("../../web")
        }
    }
}
