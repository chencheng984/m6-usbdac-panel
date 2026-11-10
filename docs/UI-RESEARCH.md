# 四个设计资源站对本项目的适配评估

评估对象：[MotionSites](https://motionsites.ai/)、[React Bits](https://www.reactbits.dev/)、[UIverse](https://uiverse.io/)、[Aceternity UI](https://ui.aceternity.com/)。

评估前提（本项目硬约束，先讲清楚，否则结论会走偏）：

| 约束 | 值 |
|---|---|
| 运行环境 | Android 7.1.1 / API 25，系统 WebView，能力按 **Chromium 51** 处理 |
| SoC | msm8937（骁龙 430），低端，面板 400 ms 刷新一次 |
| 技术栈 | 纯静态 HTML + CSS + ES5 JS，**零 npm / 零构建 / 零框架 / 零网络** |
| 画布 | 固定 640×360 横屏（真机 1280×720 @ dpr2），无滚动 |
| 交互 | 只有触摸按下与拖动，**没有 hover**，没有键盘 |
| 体积 | APK 约 0.9 MB，不能引入运行时 |

---

## 一、一句话结论

| 站点 | 性质 | 代码能否直接用 | 本项目该拿它做什么 |
|---|---|---|---|
| MotionSites | 付费 AI 建站 prompt / 灵感库 | ❌ 没有组件代码 | 只借**布局节奏与氛围**，dashboard 分类的排版套路与本项目同构 |
| React Bits | React 动画组件库（4 种变体） | ❌ 需要 React + GSAP/motion/three | 借**效果思路**，用原生 CSS/SVG 重写，单个约 30–60 行 |
| UIverse | 纯 CSS 组件市场 | ✅ 部分可直接抄（约 15%） | 唯一能直接复制代码的站，但必须挑老组件 |
| Aceternity UI | React + Tailwind + Framer Motion | ❌ 需要 React + Tailwind + motion | 借**视觉母题**（翻牌、流光边框、聚光、数字滚动） |

**能直接搬代码的只有 UIverse；能搬效果的只有 React Bits / Aceternity；MotionSites 只有启发价值。**
把 React Bits 或 Aceternity 整套引入本项目，APK 会从 0.9 MB 涨到十几 MB，且 Chromium 51 跑不动它们的动效运行时——所以正确做法是**看它们的效果，用原生重写**。

---

## 二、逐站评估

### 1. MotionSites（motionsites.ai）

- **是什么**：AI 建站提示词 + 设计灵感库，分类为 Hero / SaaS / Dashboard / 3D / Portfolio / Fintech 等，内容是一条条「可复制的 prompt 与效果预览」，另有 Backgrounds、3D 站点目录、Academy 教学。
- **对本项目**：没有任何可执行代码可抄。有价值的只有两点：
  1. **Dashboard 类排版的节奏**：顶部状态条 → 巨型主指标 → 胶囊/标签化次级指标 → 侧边控制器 → 底部信息带。本项目现有布局（左参数 / 右音量环 / 顶栏状态 / 底部曲目）正好是这套结构的变体，说明方向没错。
  2. **入场编排**：它的 dashboard 预览普遍是错峰入场（顶栏 → 主指标 → 次级 → 控制器），而不是整块淡入。这一点已经落地成本项目的入场序列。
- **结论**：当灵感板看，不要当组件库。

### 2. React Bits（reactbits.dev）

- **是什么**：开源 React 动画组件库，按「UI 组件 / 动效 / 背景 / 文字动画 / 微交互」分类，每个组件提供 JS/TS × CSS/Tailwind 四种变体，依赖随组件变化（gsap、motion、three、ogl）。
- **按本项目筛出来能用的（效果可移植）**：

| 组件 | 用在本项目哪 | 适配度 | 重写成本 |
|---|---|---|---|
| [Comet Dial](https://www.reactbits.dev/micro/comet-dial) | 音量环：角度拖拽 + 彗星头 | ★★★ 最贴合 | SVG 加 3 个 circle + 角度计算 |
| [Counter](https://www.reactbits.dev/components/counter) | 音量数字 odometer 滚轮 | ★★★ | 每位一列 0–9 + translateY |
| [SplitFlapText](https://www.reactbits.dev/text-animations/split-flap-text) | 采样率变化时翻牌 | ★★ | 40 行 JS + 30 行 CSS |
| [Border Glow](https://www.reactbits.dev/components/border-glow) / [Star Border](https://www.reactbits.dev/animations/star-border) | 连接态卡片流光描边 | ★★ | 1 个 SVG rect + 1 条 keyframes |
| [Spotlight Card](https://www.reactbits.dev/components/spotlight-card) | 触摸按下的聚光反馈 | ★（需 hover→touch 改造） | 1 个 div 改 left/top |

- **明确不能用的**：Glass Surface / Fluid Glass / Metallic Paint / Strands / Meta Balls（WebGL shader，骁龙 430 直接放弃）、所有 `Scroll*` 系列（面板无滚动）、Dock / Bubble Menu / Carousel / Circular Gallery（信息架构用不上）、所有依赖鼠标轨迹的效果（真机没有 hover）。
- **结论**：当「效果字典」用。每个效果抄思路不抄代码。

### 3. UIverse（uiverse.io）

- **是什么**：纯 CSS/HTML 组件市场（也有 Tailwind 版本），体量大、质量参差，大量组件是 2023 年后的新写法。
- **实测筛选结论**（对 61 个组件详情页逐一读源码验证）：约 **15% 可直接抄**，约 **35% 改一两行可用**，其余在 Chromium 51 上**静默失效**（不报错、只是坏掉，最难排查）。
- **可用的（可直接参考）**：
  - 音量滑杆：[happy-dodo-17](https://uiverse.io/Galahhad/happy-dodo-17) — `::-webkit-slider-thumb` 零尺寸 + `box-shadow:-200px 0 0 200px` 填充，零 JS 的老技法，51 完全支持
  - 粗滑杆：[chatty-frog-63](https://uiverse.io/seyed-mohsen-mousavi/chatty-frog-63)
  - 霓虹状态灯（多层 inset/外发光 box-shadow）：[quick-moth-22](https://uiverse.io/vinodjangid07/quick-moth-22)
  - 渐变描边深色卡：[heavy-elephant-39](https://uiverse.io/alexruix/heavy-elephant-39)（删掉 `filter:blur(25px)` 那层即可）
  - 轻量 loader：[strange-dragonfly-94](https://uiverse.io/mrpumps31232/strange-dragonfly-94)（597 B）、[bright-firefox-37](https://uiverse.io/Li-Deheng/bright-firefox-37)
- **不能用的**：几乎所有**环形/旋钮控件**都靠 `conic-gradient`（Chrome 69+，本项目拿不到）；所有玻璃卡靠 `backdrop-filter`（76+）；新式排布靠 `flex gap`（84+）。**环形控件继续用现有 SVG + stroke-dasharray 是最稳的**，这点 UIverse 帮不上。
- **结论**：唯一能直接复制代码的站。规则是只看 2022 年前的写法，凡出现 `conic-gradient / backdrop-filter / gap / :has() / aspect-ratio` 一律放弃。

### 4. Aceternity UI（ui.aceternity.com）

- **是什么**：React + Tailwind CSS + Framer Motion 的组件与区块大全（114+ 组件、183 blocks、17 模板），用 shadcn CLI 安装。
- **按本项目筛出来能借的视觉母题**：

| 组件 | 借什么 | 落地 |
|---|---|---|
| [Text Flipping Board](https://ui.aceternity.com/components/text-flipping-board) | split-flap 翻牌 | 采样率数字 |
| [Moving Border](https://ui.aceternity.com/components/moving-border) | 沿边框跑的光段 | 连接态卡片描边 |
| [Card Spotlight](https://ui.aceternity.com/components/card-spotlight) | 径向聚光 | 手指按下的位置反馈 |
| [Stats With Number Ticker](https://ui.aceternity.com/blocks/stats-sections/stats-with-number-ticker) | 数字滚动 | 音量数字 |
| [Glowing Effect](https://ui.aceternity.com/components/glowing-effect) | 边缘光脉冲 | 数据变化时闪一次 |
| [Notch](https://ui.aceternity.com/components/notch) | 顶部悬浮切口导航 | 顶栏状态条可参考其形态 |

- **不能用的**：Liquid Glass（需要真实折射，性能杀手）、所有 3D Card / Parallax Hero / Wobble Card（鼠标依赖 + 3D 变换）、所有依赖 Framer Motion `layout` 的共享元素动画、所有 scroll 驱动效果。
- **结论**：当视觉母题库用，尤其适合「面板要有硬件感」这个方向。

---

## 三、横向对比

| 维度 | MotionSites | React Bits | UIverse | Aceternity UI |
|---|---|---|---|---|
| 代码可直接用 | 0 | 0（需 React/motion） | 约 15% | 0（需 React/Tailwind/motion） |
| 效果思路可借 | 布局节奏 | 高 | 中 | 高 |
| 移植到本项目的成本 | 极低（只改排版） | 中（手写原生版） | 低（抄 CSS 再删新特性） | 中（手写原生版） |
| 对本项目的净收益 | 低 | **高** | 中 | **高** |
| 风险 | 无 | 直接引依赖会炸体积与性能 | 静默失效（最难查） | 同 React Bits |

**推荐投入顺序**：Aceternity 的母题（翻牌 / 流光 / 数字滚动）> React Bits 的交互（彗星环 / odometer）> UIverse 的小件 CSS > MotionSites 的排版参考。

---

## 四、已经落地到面板的动效

本次已直接改在面板上（不是演示页），并已通过 `assembleDebug` 验证打包无误。全部遵循「**JS 异常时界面照常显示**」的失败安全写法：动画都挂在附加类上，类不在就完全正常。

| # | 动效 | 触发时机 | 改动文件 | 成本 |
|---|---|---|---|---|
| 1 | **入场序列**：顶栏下滑 → 采样率上浮 → 三格参数错峰 → 音量环生长 → 底部收尾，附一道金色扫描线 | 面板每次弹出，播一次，总长 ≈ 940 ms | `css/layout.css`、`js/main.js` | 8 条 keyframes，零逐帧 JS |
| 2 | **状态点呼吸扩散**：绿点外两层同心圆扩散 | 已连接时常驻 | `css/components.css` | 1 条 keyframes（替代原 box-shadow 呼吸） |
| 3 | **写入中旋转虚线环**：音量环外圈虚线转动，把「等回读校验」可视化 | `volState = pending` | `index.html`（加 1 个 circle）、`css/components.css`、`js/ui/volume.js` | 1 条 keyframes + 类切换 |
| 4 | **数据刷新脉冲**：参数卡边框闪一次金光 | **仅当采样率/位深/格式/码率真的变化**，值不变不闪 | `css/components.css`、`js/ui/params.js` | 1 条 keyframes + 一次签名比较 |
| 5 | **待机遮罩**：USB 图标缓慢浮动 + 一段金光沿数据线描边循环 | 断开态 | `index.html`、`css/components.css` | 2 条 keyframes |
| 6 | **音量区联动**：拖动竖条时——条变亮、旋钮放大发光、音量数字提亮、填充高度跟随手指；松手 180 ms 回弹 | 拖动音量条时 | `index.html`、`css/components.css`、`js/ui/volume.js` | 3 条 keyframes + 状态类同步 |

设计取舍：**没有把这些动效挂在 400 ms 刷新循环上**。面板是常驻悬浮窗，任何「每帧都在动」的东西都会在骁龙 430 上累积成耗电与掉帧；动效只挂在「状态变化」和「面板弹出」两个事件上。

---

## 五、还在实验室里、没落地的候选

预览页：`docs/ui-lab/index.html`（直接双击打开，无需服务器）。共 12 个效果 + 3 个布局方案。

| 推荐度 | 效果 | 不落地的原因（或落地条件） |
|---|---|---|
| ★★★ | Split-Flap 翻牌采样率 | 采样率变化场景真实存在，视觉收益最高；需要改 `params.js` 的数字渲染路径 |
| ★★★ | 彗星拖尾音量环 | 视觉收益最高，但要把 `volume.js` 的 `setRing` 换成弧+尾+头三件套 |
| ★★ | Odometer 音量数字 | 需要和 `pending` 乐观更新对齐，避免回读时数字乱跳 |
| ★★ | 曲目跑马灯 | 需先测文本宽度，短曲名不能滚（否则一直在动） |
| ★★ | ± 按钮 ripple | 高频操作反馈，但与现有 `:active` 缩放可能重复 |
| ★ | 按压聚光 | 触摸场景收益一般，且与 ripple 功能重叠 |
| ★ | 写入失败抖动 | 失败本身已有红环 + 横幅，再加抖动属于锦上添花 |

---

## 六、布局建议

三个方案都画在 `docs/ui-lab/index.html` 的「二 · 布局候选」里，可直接对比。

| 方案 | 结构 | 评价 |
|---|---|---|
| **A · 现状**（左参数 / 右音量环） | 信息层级清楚：一个巨型主指标 + 三个次级 + 一个可操作控件 | **推荐保留**。640×360 里可用区只有约 230 px 高，任何新增卡片都会挤压主指标。当前布局的信息密度已经接近上限，问题不在布局而在「没有动效表达状态」 |
| B · HUD 双柱（96 px 巨型数字 + 胶囊标签 + 竖向音量条） | 更像仪表盘，横向更宽松 | 可选。若将来要加「音量历史」「信号强度」这类信息，B 的横排结构更好扩展；但要弃用圆环，触摸目标从环变成细竖条，**可点性下降**，不推荐在 640×360 上换 |
| C · 双主指标（采样率与音量各占半屏） | 两个数同权重 | **不推荐**。音量是「可操作项」，采样率是「只读项」，同权重会让人分不清哪个能拖 |

结论：**布局不动，动效补齐**。这是本轮改动采取的策略。

---

## 七、不要碰的技术清单（针对 Chromium 51）

来自对这四个站点的实际样本统计，以下特性会**静默失效**（不报错，只是坏掉）：

1. `conic-gradient`（Chrome 69+）— UIverse 的环形/旋钮控件首选写法，全灭
2. `backdrop-filter`（76+）— 所有玻璃拟态卡
3. `aspect-ratio`（88+）
4. flex `gap`（84+）— 新组件排间距全靠它，要换 margin
5. `:has()`（105+）、`:focus-within`（60+）
6. `rotate: / scale: / translate:` 独立变换属性（104+）
7. `inset:` 简写（87+）、`clip-path: path()`（88+）
8. 无前缀 `filter: blur()`（53+）— 必须写 `-webkit-filter`
9. 大面积 `filter: blur(25px)` 做发光层 — 不是兼容问题，是骁龙 430 性能问题
10. ES2017+ 语法：`async/await`（55+）、`Object.entries`、可选链 `?.`（80+）— 本项目现有代码是 ES5，保持

**本项目的安全区间**：CSS 变量（49+）、flexbox（无 gap）、`transform + transition + @keyframes`、SVG `stroke-dasharray/dashoffset` 动画、`-webkit-mask-image`、多层 `box-shadow`。所有已落地动效都在这个区间内。

---

## 八、KNOB 主题（已落地，替换了原金色主题）

参照一张 KNOB 旋钮交互设计图（纯黑 + 橙红 + 竖向渐变条 + 旋钮图标），把面板横屏化重做：

| 决策 | 做法 | 为什么 |
|---|---|---|
| 配色收敛到单色 | 全站只剩一个橙红 `#FF5A1F`，出现在状态点、音量条、数据源角标 | 参考图里橙红是唯一彩色，靠它引导注意力；多色会让 640×360 显得吵 |
| 音量形态换掉 | 圆环 → 竖直轨道 + 填充 + 旋钮：填充高度 = 音量，旋钮角度 = 音量 | 参考图 III→IV 的核心就是「条的形状随数值缩短」，这比圆环更直觉 |
| 旋钮指针 | 白色圆 + 橙指针，旋转角度跟随音量 | 对应参考图 I→II 的旋钮图标转动 |
| 数字重量级化 | 采样率 78px / 600 / 负字距 | 参考图的层级几乎全靠字号与字重，不靠框线 |
| 状态色同源 | 已连接 = 橙、写入中 = 亮橙呼吸、失败 = 红 | 保持单色语言，用明度与动效区分状态 |

设计稿与规范：`docs/ui-lab/knob.html`（含 I–IV 状态序列）。
旧金色主题完整备份：`docs/archive/gold-theme/`。

后续布局调整（按需求）：音量卡**移到左侧**、`±` 步进键**移除**（音量只靠拖动竖条）；
长采样率（44.1 / 352.8 / 2822.4）自动降字号，避免撑出卡片。

再后续的比例调整（Apple 式对齐）：音量卡宽 176、轨道 72 × 176（约 1:2.4）、
圆角 30 与卡片 28 同心；卡内上下留白相等（各约 24），左右各 50；
去掉音量数字后的 `VOLUME` 英文标签；删除曲目行（DAC 模式取不到元数据），
底部只留数据源角标；footer 高度 42 → 30，两张卡因此各高出 12px。

### 交互手感（按 Apple「流体界面」原则重做音量条）

| 原则 | 具体做法 |
|---|---|
| 响应在按下时，不在松手时 | `pointerdown` 立即取值并更新，不等 `click` |
| 直接操纵 1:1 | 拖动期间**去掉**填充高度与旋钮位置的过渡，手指到哪条到哪，零滞后 |
| 可中断 | 任何时刻再次按下立即接管；松手后的落定动画会被新的按下打断，不锁输入 |
| 橡皮筋边界 | 拖出轨道时旋钮按渐近曲线位移（最大 ±10px），不是硬停；松手弹回 |
| 提交反馈 | 松手后等一次写入确认，成功则旋钮「落定」一下 + 数字回色；只在松手后触发，拖动过程中的每次成功不闪 |
| 减少动态 | `prefers-reduced-motion: reduce` 下关闭呼吸/旋转/落定与入场位移动画，只保留状态变化 |

实现落在 `web/js/ui/volume.js`（橡皮筋 + commit 状态机）与 `web/css/components.css`
（拖动期过渡覆盖、`--over` 变量、commit keyframes、reduced-motion 段）。

### 背景材质

面板底层加了一张石材纹理 + 半透明遮罩（`opacity 0.30`）。两个坑值得记：

1. **原图太暗**：源图均值只有 16.6/255，直接加遮罩会更黑（几乎全黑）。处理流程是
   旋转 90°（竖图转横图）→ 裁 16:9 → 提亮 2.2 倍 → 压到 960×540 WebP（100 KB）。
2. **CSS 多层背景在缩放容器里不绘制**：`.app` 带 `transform: scale()` 时，
   `background-image: linear-gradient(...), url(...)` 与内部 `img + object-fit` 都不出图
   （实测像素恒为纯底色）。最终改成「固定 640×360 的内联 `<img>` + `opacity`」才稳定渲染；
   图片本身是 16:9，直接铺满不会变形，也就不需要 `object-fit`。
3. **毛玻璃要在 51 上成立**：`backdrop-filter` 是 Chrome 76+，51 完全不认。
   试过「先模糊背景层（`filter: blur(7px)`）+ 半透明卡片」的等效方案，能出磨砂感，
   但**最终按需求回退了**——卡片回到深色半透明（`rgba(26,27,32,0.90)`），背景恢复清晰纹理。
   若日后要毛玻璃，上面的等效思路仍可用。

改动文件：`web/css/base.css`（tokens）、`web/css/components.css`（音量区重写 + 全部配色）、
`web/index.html`（音量区结构）、`web/js/ui/volume.js`（角度拖拽 → 纵向比例拖拽）。
数据获取、乐观更新、回读校验、失败回滚、失败安全策略全部未变。

---

## 九、参考链接

- [MotionSites](https://motionsites.ai/)
- [React Bits](https://www.reactbits.dev/) · [组件总览 llms.txt](https://reactbits.dev/llms.txt) · [Comet Dial](https://www.reactbits.dev/micro/comet-dial)
- [UIverse](https://uiverse.io/) · [happy-dodo-17 滑杆](https://uiverse.io/Galahhad/happy-dodo-17) · [quick-moth-22 状态灯](https://uiverse.io/vinodjangid07/quick-moth-22)
- [Aceternity UI](https://ui.aceternity.com/) · [Text Flipping Board](https://ui.aceternity.com/components/text-flipping-board) · [Moving Border](https://ui.aceternity.com/components/moving-border) · [组件清单 llms.txt](https://ui.aceternity.com/llms.txt)
