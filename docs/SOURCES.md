# 数据来源与实测结论

本文记录在真机（山灵 M6 21 版）上实测得到的事实，以及据此确定的数据获取方案。
**所有结论都来自 adb 实测，不是推测。**

## 被测设备

```
型号     : Shanling M6(21)
系统     : Android 7.1.1 / API 25
指纹     : Android/msm8937_64/msm8937_64:7.1.1/NMF26F/ShanLi10271744:user/release-keys
SoC      : msm8937 (骁龙 430) / arm64-v8a
屏幕     : 720×1280 @ 320dpi (4.7")
USB      : VID_05C6&PID_9039，复合设备 = MTP(WPD) + ADB
山灵音乐 : com.shanling.MusicApp v3.2.2（系统应用 /system/app/SLMusicApp）
```

## 三条候选数据源与实测结果

### ① 内核 ALSA —— 不可用（重要发现）

`/proc/asound/card0` 下有 47 个 PCM 节点，`hw_params` 权限为 `-r--r--r--`，
App 也可以读取（横幅能从「无法读取」变成「等待音频流」，说明读取本身成功）。

但**播放 96kHz 音频时扫全部节点**：

```powershell
adb shell 'for f in /proc/asound/card0/pcm*/sub0/hw_params; do v=$(cat $f); [ "$v" != closed ] && echo $f; done'
# → 无输出（全部 closed）

adb shell dumpsys media.audio_flinger | grep -E 'Standby|Sample rate'
# → 四个 Output thread 全部 Standby: yes

adb shell dumpsys audio | grep mMusicActiveMs
# → mMusicActiveMs=0
```

结论：**山灵的 HiFi 播放完全旁路 Android AudioFlinger 与标准 ALSA PCM**，
直接走高通 DSP 私有通路。内核与框架都拿不到当前播放的采样率。

### ② AudioFlinger —— 不可用（且无权限）

`dumpsys media.audio_flinger` 里确实能看到固件按真实采样率配置的线程：

```
AudioOut_D  192000 Hz  pcm16
AudioOut_15  48000 Hz  pcm16
AudioOut_1D 384000 Hz  pcmfloat
AudioOut_25  48000 Hz  pcm16
```

但 `dumpsys` 需要 `android.permission.DUMP`（signature 级），普通 App 无法调用，
且这些是线程配置值而非当前播放流的即时值。

### ③ 无障碍读山灵界面 —— 唯一可行 ✅

山灵播放页的采样率是**原生 TextView**，无障碍可直接读取文本，无需 OCR：

```xml
resource-id="com.shanling.MusicApp:id/playing_title"
text="WAV 96kHz/24bit/4608Kbps"
resource-id="com.shanling.MusicApp:id/playing_music_name"   text="test96"
resource-id="com.shanling.MusicApp:id/playing_music_artist" text="Unknown Artist"
```

真机日志验证：

```
D/DacA11y: service connected
D/DacA11y: format text = WAV 96kHz/24bit/4608Kbps
D/DacA11y: format text = WAV 96kHz/24bit/4608Kbps   ← 持续刷新
```

用正则解析：`([A-Za-z0-9]{2,10})\s+([\d.]+)kHz\s*/\s*(\d+)bit(?:\s*/\s*(\d+)Kbps)?`
另外支持 `DSD64/128/256/512`（DSD 采样率 = 44.1k × 倍数）。

## 关键结构性结论：为什么必须用悬浮窗

这是本项目最容易踩坑的地方，记录如下。

| 承载方式 | 山灵 Activity 状态 | 无障碍能否读到 |
|---|---|---|
| 不透明全屏 Activity | `STOPPED`，窗口被移除 | ❌ `root = null` |
| 透明主题 Activity（`windowIsTranslucent`） | `PAUSED / visible=true`，窗口仍在列表 | ❌ `AccessibilityWindowInfo.getRoot()` 仍返回 `null` |
| 窗口比屏幕矮 1px（想"不完全遮挡"） | `PAUSED` | ❌ 仍然 `null` |
| **悬浮窗（TYPE_PHONE / WindowManager）** | **`RESUMED`** | ✅ 持续可读 |

结论：**只要面板窗口覆盖山灵，访问树就拿不到；必须用悬浮窗**，
且悬浮窗要加 `FLAG_NOT_FOCUSABLE`（不抢焦点），否则它自己会变成 active window。

另外山灵界面静止时不再产生无障碍事件，所以读取不能只靠
`onAccessibilityEvent`，必须由面板 400ms 推送循环主动调用 `DacA11yService.scanNow()`。

## 最终方案：双数据源分工

实测发现两条路径恰好互补，可以自动切换：

| 场景 | ALSA `/proc/asound` | 无障碍读界面 | 面板显示 |
|---|---|---|---|
| **本地播放**（山灵音乐放歌） | 全 `closed`（引擎旁路） | ✅ 读到 `WAV 96kHz/24bit/4608Kbps` | 96 kHz / 24 bit / WAV / 4608 |
| **USB DAC 模式**（电脑放歌） | ✅ 有活动流（实测 48 kHz） | ❌ `root null`（界面不可访问） | 48 kHz（来自 ALSA） |

结论：

1. 本地播放的信息活在 libVLC/FFmpeg（`libslcjni.so` + `libparse.so`）进程内存里，
   没有跨进程接口，只能读它画出来的文字。
2. **USB DAC 模式的界面是系统级/自绘窗口**，无障碍拿到的是 `root null`
   （`AccessibilityWindowInfo.getRoot()` 返回 null），读不到。
   但这条路径上音频走的是标准 USB 音频通路，`/proc/asound` 的 PCM 是开着的，
   **所以 DAC 模式的采样率来自内核 ALSA**。
3. 两种模式的 ALSA 状态天然不同，因此可以直接用来判定当前是不是 DAC 模式。

## 面板触发逻辑（已按需求收敛）

```
USB 供电 && ALSA 有活动音频流  →  自动弹出面板
```

- 插数据线（disk/MTP 模式）：ALSA 全 `closed` → **不弹**
- USB DAC 模式且电脑正在放歌：ALSA 有流 → **弹**
- 用户主动点图标 → 手动弹（不受此限制）

这样避免了一插数据线就弹面板的问题。

## 数据流

```
山灵音乐界面(TextView)
        │  AccessibilityService（遍历 getWindows() + 主动轮询）
        ▼
   State（进程内共享，volatile）
        │
        ├── AudioManager 读取/写入系统媒体音量（真实可用，已验证 30/100 同步）
        │
        ▼
 SnapshotBuilder → JSON 快照
        │
        ▼
 PanelWindow 每 400ms → WebView.evaluateJavascript(window.__dacPush(json))
        │
        ▼
 Web 面板（单一状态源 store + rAF 合帧渲染）
```

## 融合规则（SnapshotBuilder）

- `rate / bits`：优先无障碍（实测 ALSA 不可用），ALSA 仅作兜底
- `format / kbps`：无障碍独有；没有时格式标 `PCM`，码率按 `rate×bits×channels` 计算（PCM 未压缩真实值）
- `volume`：`AudioManager.STREAM_MUSIC`，写入后立即回读；差值 >1 时前端回滚
- `source` 字段随快照下发，前端据此显示数据源角标，**绝不把演示数据标成实时**

## 已验证 / 待验证

已在本机真机验证：

- [x] APK 构建、安装、启动
- [x] 悬浮窗全屏显示，面板布局正确
- [x] 无障碍读到 `WAV 96kHz/24bit/4608Kbps` 并映射为 96 kHz / 24 bit / WAV / 4608
- [x] 曲目 `test96 · Unknown Artist` 显示
- [x] 系统音量 30 读取与显示
- [x] 数据源角标显示「山灵界面」

待真机进一步验证：

- [ ] 插拔数据线触发自动弹出（需人工拔插）
- [ ] **USB DAC 模式下山灵界面是否同样显示采样率**（需在 M6 上切到 USB DAC 模式，电脑端播放）
- [ ] 横屏形态：设备横置时系统是否旋转（`accelerometer_rotation=1` 已开启，但 adb 强制 `user_rotation=1` 未见生效，疑为 LCD 固定竖屏）
