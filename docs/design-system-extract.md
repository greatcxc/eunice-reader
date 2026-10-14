# Eunice Reader 视觉设计系统提取

> 用途：为「生成一批符合产品风格的美术资产」提供可执行、可回溯的视觉依据。
> 来源：仅 `D:\Eunice-Reader` 源码（只读分析，未修改任何源文件）。
> 所有色值 / 尺寸 / 时长为源码字面值，均标注 `文件:行号`。凡源码未声明者一律标注「未在源码中找到」，不做近似替代。

**证据文件清单**

| 文件 | 作用 | 行数 |
|---|---|---|
| `src/styles/app.css` | 应用外壳令牌、毛玻璃、顶栏/状态栏/侧栏/抽屉/空状态/拖放层 | 1364 |
| `src/styles/theme.css` | 文档正文主题（`data-theme-doc`）13 组变量 + 文档元素取色 | 514 |
| `src/styles/zh-optimize.css` | 中文排版优化层 | 388 |
| `src/styles/print.css` | 打印 / 导出 PDF 版式 | 136 |
| `src/lib/doc-themes.js` | 文档主题注册表（12 款可选） | 124 |
| `src/lib/fonts.js` | 字体预设与 `@font-face` 注入 | 130 |
| `src/ui/icons.js` | Lucide 静态 SVG 注入 | 97 |
| `src/icons/*.svg` | 图标源文件（31 个） | — |
| `index.html` | 外壳与空状态 DOM | 106 |
| `src/ui/settings.js` | 设置抽屉信息层级 | 452 |
| `src/main.js` | 视图模式 / 大纲 / 状态栏文案 / 图标尺寸 | 695 |
| `src/editor/editor.js` | CodeMirror 6 编辑器配色 | 185 |

---

## 0. 结论先行（三条决定美术调性的判断）

1. **产品刻意避开「程序员审美」。** 三处源码注释互为佐证：
   - `theme.css:7-9`：「这里刻意不用任何外部配色库（含 highlight.js 的 82 套代码主题）：对一个用来读方案和提案的工具来说，『挑代码配色』是程序员需求，不是文档需求。语法着色由下面的 `--syn-*` 变量随主题一起给出，**用户不必也不会去关心**。」
   - `settings.js:13-15`：「这里**没有**『代码配色』这种东西：这是一个用来读方案、提案与报告的工具，代码块顶多出现在文档里，不值得让读者去挑 82 套程序员配色。」
   - `doc-themes.js:5-6`：「刻意避开任何『代码/终端/开发者』意象 —— 这是一个用来读方案、提案与报告的工具，不是代码编辑器。」
2. **代码主题不暴露，而是随文档主题捆绑给出。** 代码块底色走 `--code-bg` / `--code-rule`，行内代码走 `--code-inline-bg` / `--code-inline-ink`，语法着色只有 6 个色位 `--syn-{key,str,num,fn,cmt,var}`（`theme.css:41` 注释：「6 色足够，刻意克制」）。**每套主题一个色系、语法色相跟着纸面走**（`theme.css:4-5`）——所以美术资产的正确做法是：以「纸 + 墨 + 一个强调色」为单元出图，而**不是**为代码块单独设计一套配色语言；任何一张资产里，代码块必须是纸面的同色系延伸，不能出现深色 IDE 式的蓝紫高亮面板。
3. **界面层（工具）必须比内容层（文档）退后一层。** `app.css:4`：「设计取向：阅读优先。界面尽量退到背景里，让文档本身成为主角。」具体手段是灰阶界面（`--fg` 到 `--fg-3` 全是中性灰）+ 单一强调色 `#4f46e5`（深色 `#7c73f0`）+ 毛玻璃，界面自身的色彩信息量压到极低。资产的视觉重心应落在「纸感/墨色/克制的暖色强调」，界面元素（按钮、状态栏）即使入画也应是低饱和中性灰与半透明。

---

## 1. 设计令牌（Design Tokens）总表

### 1.1 界面层变量（应用外壳）

来源：`app.css:10-83`（浅色 `:root`）、`app.css:107-152`（`:root[data-theme='dark']`）。

| 变量 | 浅色 `data-theme='light'` | 深色 `data-theme='dark'` | 行号 |
|---|---|---|---|
| `color-scheme` | `light` | `dark` | 11 / 108 |
| `--ui-chrome` | `#f7f8f9` | `#191b20` | 14 / 110 |
| `--ui-chrome-2` | `#f0f1f3` | `#1f2229` | 15 / 111 |
| `--ui-content` | `#ffffff` | `#14161a` | 16 / 112 |
| `--ui-sunken` | `#eceef0` | `#101216` | 17 / 113 |
| `--line` | `rgba(31, 35, 40, 0.1)` | `rgba(255, 255, 255, 0.09)` | 19 / 115 |
| `--line-strong` | `rgba(31, 35, 40, 0.16)` | `rgba(255, 255, 255, 0.15)` | 20 / 116 |
| `--fg` | `#1c1f23` | `#e6e9ee` | 22 / 118 |
| `--fg-2` | `#5b646e` | `#9aa4b0` | 23 / 119 |
| `--fg-3` | `#8b949e` | `#6b7480` | 24 / 120 |
| `--accent` | `#4f46e5` | `#7c73f0` | 26 / 122 |
| `--accent-soft` | `rgba(79, 70, 229, 0.1)` | `rgba(124, 115, 240, 0.16)` | 27 / 123 |
| `--accent-fg` | `#ffffff` | `#0d0f13` | 28 / 124 |
| `--hover` | `rgba(31, 35, 40, 0.055)` | `rgba(255, 255, 255, 0.06)` | 30 / 126 |
| `--press` | `rgba(31, 35, 40, 0.09)` | `rgba(255, 255, 255, 0.1)` | 31 / 127 |
| `--ring` | `rgba(79, 70, 229, 0.32)` | `rgba(124, 115, 240, 0.45)` | 32 / 128 |
| `--warn` | `#b45309` | `#d29922` | 34 / 130 |
| `--danger` | `#d1242f` | `#f85149` | 35 / 131 |
| `--ok` | `#1a7f37` | `#3fb950` | 36 / 132 |
| `--c-note` | `#0969da` | `#4493f8` | 39 / 134 |
| `--c-tip` | `#1a7f37` | `#3fb950` | 40 / 135 |
| `--c-important` | `#8250df` | `#ab7df8` | 41 / 136 |
| `--c-warning` | `#9a6700` | `#d29922` | 42 / 137 |
| `--c-caution` | `#cf222e` | `#f85149` | 43 / 138 |
| `--shadow-sm` | `0 1px 2px rgba(31, 35, 40, 0.06)` | `0 1px 2px rgba(0, 0, 0, 0.4)` | 45 / 140 |
| `--shadow-md` | `0 6px 24px rgba(31, 35, 40, 0.1), 0 1px 3px rgba(31, 35, 40, 0.06)` | `0 6px 24px rgba(0, 0, 0, 0.5)` | 46 / 141 |
| `--shadow-lg` | `0 24px 64px rgba(31, 35, 40, 0.18)` | `0 24px 64px rgba(0, 0, 0, 0.7)` | 47 / 142 |
| `--r-sm` / `--r-md` / `--r-lg` | `5px` / `8px` / `12px` | 同左（未在 dark 覆盖） | 49-51 |
| `--mr-content-width` | `900px` | 同左 | 54 |
| `--mr-font-size` | `16px` | 同左 | 55 |
| `--mr-line-height` | `1.9` | 同左 | 56 |
| `--mr-font-body` | `"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif` | 同左 | 57 |
| `--titlebar-h` | `46px` | 同左 | 59 |
| `--statusbar-h` | `26px` | 同左 | 60 |
| `--glass-bg` | `rgba(247, 248, 249, 0.62)` | `rgba(20, 22, 27, 0.68)` | 72 / 145 |
| `--glass-panel` | `rgba(247, 248, 249, 0.72)` | `rgba(20, 22, 27, 0.78)` | 76 / 146 |
| `--glass-bg-solid` | `rgba(247, 248, 249, 0.98)` | `rgba(20, 22, 27, 0.92)` | 77 / 147 |
| `--glass-hairline` | `rgba(255, 255, 255, 0.6)` | `rgba(255, 255, 255, 0.08)` | 78 / 148 |
| `--glass-shadow` | `0 1px 0 var(--glass-hairline), 0 8px 24px rgba(31, 35, 40, 0.1)` | `0 1px 0 var(--glass-hairline), 0 8px 26px rgba(0, 0, 0, 0.5)` | 80 / 149 |
| `--glass-blur` | `blur(20px) saturate(150%)` | `blur(20px) saturate(150%)` | 81 / 150 |
| `--glass-edge` | `rgba(31, 35, 40, 0.12)` | `rgba(255, 255, 255, 0.14)` | 82 / 151 |

**定义但全仓未被任何规则引用的令牌（做资产时不要当成有效规格）**：
`--ui-chrome-2`、`--accent-fg`、`--glass-bg-solid`、`--glass-edge`、`--r-lg`、`--danger`（以上仅出现在 `app.css` 的定义行）、`--glass-tint`（`app.css:282` 以 `var(--glass-tint, transparent)` 引用，但全仓无定义 → 恒为 `transparent`）。
`--ok` 仅在 `zh-optimize.css:386` 作为 `var(--ok, #1a7f37)` 兜底使用；`--warn` 实用于 `app.css:356`（未保存圆点）、`app.css:740-741`（非 UTF-8 编码徽标）。

### 1.2 文档层变量：13 组主题总表（主干列）

`theme.css` 共 13 组变量集合 = 12 款注册主题（`doc-themes.js:12-112`）+ 1 组 `:root` 兜底（`theme.css:15-48`，无 `data-theme-doc` 时生效）。
**注意：`:root` 兜底不是任何一款可选主题**，其 `--accent` 为 `#9a5b2c`（`theme.css:27`），与「素白」的 `#8a5524`（`theme.css:58`）不同；设置面板只列出 12 款（`settings.js:151` 及 `doc-themes.js`）。

| 主题 key | 中文名 | 块起始行 | `--paper` | `--ink` | `--ink-soft` | `--rule` | `--head-1` | `--head-2` | `--accent` |
|---|---|---|---|---|---|---|---|---|---|
| `:root`（兜底，不可选） | — | 15 | `#ffffff` | `#1f2328` | `#5b6570` | `#dfe3e8` | `#14191f` | `#1f2933` | `#9a5b2c` |
| `plain` | 素白 | 51 | `#ffffff` | `#1f2328` | `#5b6570` | `#dfe3e8` | `#14191f` | `#1f2933` | `#8a5524` |
| `ricepaper` | 宣纸 | 75 | `#f9f5ec` | `#35302a` | `#6b6258` | `#e2d9c8` | `#2a251f` | `#4a3f33` | `#b04a30` |
| `warmstone` | 暖石 | 99 | `#f6f1e7` | `#38322a` | `#6d6459` | `#e0d7c7` | `#2c271f` | `#4c4337` | `#8d5031` |
| `petal` | 花瓣 | 123 | `#fdf5f6` | `#43353a` | `#7c6870` | `#eddcdf` | `#362930` | `#5c4550` | `#b8556e` |
| `verdant` | 草木 | 147 | `#f3f7f0` | `#313b2e` | `#62705b` | `#d7e0d0` | `#26301f` | `#46523d` | `#4d7d45` |
| `wheat` | 麦穗 | 171 | `#fbf7ec` | `#3d382c` | `#756d5c` | `#e6ddc7` | `#302c22` | `#554d3c` | `#96702a` |
| `nightfall` | 夜阑 | 195 | `#181b21` | `#d3d8e0` | `#949da9` | `#2b3038` | `#f0f3f8` | `#dfe4ec` | `#8fa8d8` |
| `inkstone` | 墨 | 219 | `#101013` | `#dcdcdd` | `#8d8d92` | `#26262a` | `#f6f6f7` | `#e6e6e7` | `#b8b2a6` |
| `amber` | 琥珀 | 243 | `#1c1713` | `#ded5c8` | `#9a8d7c` | `#302822` | `#f4ece0` | `#e8dccb` | `#d9a35c` |
| `lapis` | 青金 | 267 | `#131822` | `#d0d6e2` | `#8b95a8` | `#232a37` | `#eef2f9` | `#dbe2ee` | `#7d9fd8` |
| `sage` | 鼠尾草 | 291 | `#161c18` | `#d0dbd2` | `#8d9c90` | `#252e27` | `#eaf3ec` | `#d8e4da` | `#8fbfa0` |
| `ripple` | 涟漪 | 315 | `#111a1c` | `#ccd9d9` | `#859797` | `#1f2c2e` | `#e6f0f0` | `#d2e0e0` | `#78b8b4` |

### 1.3 文档层变量：引用 / 代码块 / 语法着色列

每款主题在同一块内连续定义以下变量（浅色主题自上而下为 `quote-*` → `code-*` → `syn-*`；深色主题同序）。

| 主题 key | `--quote-bg` | `--quote-bar` | `--quote-ink` | `--code-bg` | `--code-rule` | `--code-inline-bg` | `--code-inline-ink` |
|---|---|---|---|---|---|---|---|
| `:root` | `#f7f4ee` | `#c8a882` | `#5f564a` | `#f6f3ed` | `#e6dfd2` | `#f2eee5` | `#96502a` |
| `plain` | `#f7f8f9` | `#b9c0c7` | `#4e565e` | `#f7f8fa` | `#e3e7eb` | `#f0f2f5` | `#a02f38` |
| `ricepaper` | `#f2ebdd` | `#c9876a` | `#6a5c4e` | `#f2ebdc` | `#e0d4bf` | `#ece2ce` | `#a5421f` |
| `warmstone` | `#f0e8da` | `#c3a17c` | `#63594c` | `#f0e8d9` | `#ded2bc` | `#ebe1cf` | `#8d3f22` |
| `petal` | `#fbecef` | `#e0a2b2` | `#71585f` | `#fbebef` | `#eecdd6` | `#f6e2e7` | `#a8445c` |
| `verdant` | `#eaf1e5` | `#a3bb98` | `#57654e` | `#eaf1e4` | `#d1ddc9` | `#e2ebdc` | `#386b33` |
| `wheat` | `#f6efdd` | `#cfb179` | `#665d4b` | `#f6efdd` | `#e2d6bb` | `#efe6cf` | `#8a5f1c` |
| `nightfall` | `#1e222a` | `#3f4a5a` | `#a8b2c0` | `#1d2129` | `#2d333c` | `#262c36` | `#dba08c` |
| `inkstone` | `#18181b` | `#3a3a40` | `#ababaf` | `#171719` | `#29292d` | `#222225` | `#d9a08f` |
| `amber` | `#241d16` | `#4d3d2a` | `#b3a48f` | `#221b14` | `#352b20` | `#2c2318` | `#e0a882` |
| `lapis` | `#191f2b` | `#33415a` | `#a3aec2` | `#181e29` | `#262e3c` | `#212836` | `#d49a92` |
| `sage` | `#1c241e` | `#35473b` | `#a6b7aa` | `#1a221c` | `#29332b` | `#232d25` | `#d3a08e` |
| `ripple` | `#162326` | `#2c4447` | `#a1b6b6` | `#152022` | `#223033` | `#1d2b2d` | `#d09a90` |

| 主题 key | `--syn-key` | `--syn-str` | `--syn-num` | `--syn-fn` | `--syn-cmt` | `--syn-var` |
|---|---|---|---|---|---|---|
| `:root` | `#a03c28` | `#4a7a3e` | `#8a5a1e` | `#4b5bb5` | `#9a9285` | `#6b4f8f` |
| `plain` | `#a6264d` | `#3f7a44` | `#986801` | `#3d63b8` | `#8b949e` | `#6b4f8f` |
| `ricepaper` | `#b0402c` | `#5c7a42` | `#9a6a1c` | `#4a5aa8` | `#a3977f` | `#7a4f80` |
| `warmstone` | `#9d4527` | `#55703f` | `#96601c` | `#4c5499` | `#9d9484` | `#744c78` |
| `petal` | `#b04a66` | `#5f7a52` | `#9c6324` | `#7a5bab` | `#ab929a` | `#9c4a86` |
| `verdant` | `#3f7a3a` | `#6b7a2e` | `#96681f` | `#3d6b9c` | `#94a18b` | `#6a4a8c` |
| `wheat` | `#9c5a22` | `#5e7a35` | `#8f6410` | `#4a5a95` | `#a2977f` | `#71518a` |
| `nightfall` | `#cf8fa0` | `#8fb894` | `#d2a866` | `#8aa8e0` | `#6f7885` | `#b39ad6` |
| `inkstone` | `#d2929a` | `#9bb894` | `#d4ae72` | `#9fb0d8` | `#6a6a70` | `#b9a2d4` |
| `amber` | `#e09a72` | `#a3bb85` | `#d9b06a` | `#b09ad0` | `#7d6f5e` | `#c9a074` |
| `lapis` | `#cf8b98` | `#85b595` | `#d0a566` | `#86a8e2` | `#687385` | `#ad98d8` |
| `sage` | `#cf97a0` | `#8fbb96` | `#cfa768` | `#8aa9d8` | `#69786c` | `#a894cf` |
| `ripple` | `#cf9490` | `#82b7a6` | `#c8a669` | `#82a8c4` | `#647a7a` | `#9d96cd` |

**派生色（不逐主题硬编码，全部由 `--paper`/`--ink`/`--accent` 现算）**——资产里若要复现，请按公式而非取近似色：
| 元素 | 表达式 | 行号 |
|---|---|---|
| `--accent-weak`（文档层） | `color-mix(in srgb, var(--accent) 12%, transparent)` | `theme.css:28` |
| 链接下划线 | `color-mix(in srgb, var(--accent) 32%, transparent)`，hover 时变为 `var(--accent)` | `theme.css:367,371` |
| `mark` 底色 | `color-mix(in srgb, var(--accent) 22%, transparent)`，文字 `var(--ink)` | `theme.css:390-391` |
| 表格斑马纹 | `color-mix(in srgb, var(--ink) 4%, transparent)` | `theme.css:404` |
| 表头底 | `color-mix(in srgb, var(--ink) 8%, transparent)` | `theme.css:408` |
| 表格行 hover | `var(--accent-weak)` | `theme.css:412` |
| 图片占位底 | `color-mix(in srgb, var(--ink) 6%, transparent)` | `theme.css:416` |
| 破图斜纹 | `repeating-linear-gradient(45deg, transparent, transparent 8px, color-mix(in srgb, var(--ink) 7%, transparent) 8px, color-mix(in srgb, var(--ink) 7%, transparent) 16px)` | `theme.css:421-427` |
| h2 分隔线 | `1px solid var(--rule)`；中文层再压为 `color-mix(in srgb, currentColor 16%, transparent)` | `theme.css:362`；`zh-optimize.css:66` |
| 表格边框（中文层） | `color-mix(in srgb, currentColor 18%, transparent)` | `zh-optimize.css:209` |
| hr（中文层） | `color-mix(in srgb, currentColor 15%, transparent)` | `zh-optimize.css:222` |
| 链接下划线（中文层） | `color-mix(in srgb, currentColor 25%, transparent)`，hover `currentColor` | `zh-optimize.css:155,160` |
| 提示块底 / 边（中文层） | 底 `color-mix(... var(--mr-callout-color) 8%, transparent)`；边 `4px solid var(--mr-callout-color)` | `zh-optimize.css:264-266` |

**主题注册表里的 `swatch` 与 CSS `--paper` 不一致（`swatch` 全仓未被渲染逻辑读取，设置卡片实际用 `readVar('--paper')`，见 `settings.js:86-88,216`）**：
`plain` `#ffffff`（=paper）、`ricepaper` `#f8f4ea`（CSS `#f9f5ec`）、`warmstone` `#f5f0e6`（CSS `#f6f1e7`）、`petal` `#fdf4f5`（CSS `#fdf5f6`）、`verdant` `#f2f6ef`（CSS `#f3f7f0`）、`wheat` `#fbf6e9`（CSS `#fbf7ec`）、`nightfall` `#181b21`（=）、`inkstone` `#101013`（=）、`amber` `#1c1712`（CSS `#1c1713`）、`lapis` `#131822`（=）、`sage` `#161c18`（=）、`ripple` `#111a1c`（=）。**取色请以 CSS `--paper` 为准。**

---

## 2. 明暗两套界面与强调色

### 2.1 切换机制（两件事互相独立）

- 文档主题 → `<html data-theme-doc="...">`（`main.js:127`）；界面明暗 → `<html data-theme="light|dark">`（`main.js:131`）。
- 默认联动：`state.dark = s.uiDark !== null ? s.uiDark : docTheme.dark`（`main.js:130`）——即界面明暗默认跟随正文主题深浅，用户手动切过（`Ctrl+Shift+D`，`main.js:514-518`）后以 `uiDark` 为准。
- `index.html:2` 初始为 `data-theme="light"`。
- 玻璃强度 → `<html data-glass="solid|normal|strong">`（`main.js:134`），默认 `normal`（`store.js:22`）。

### 2.2 实际取值

浅色与深色的全部取值见 §1.1 表；界面的四个底色层次关系为：`--ui-content`（内容区）↔ `--ui-chrome`（工具区，比内容略暗/略亮）↔ `--ui-chrome-2` ↔ `--ui-sunken`（凹陷，如分段控件底）。浅色 `#ffffff` > `#f7f8f9` > `#f0f1f3` > `#eceef0`；深色 `#14161a` > `#191b20` > `#1f2229` > `#101216`。`app.css:13` 注释点明用意：「界面层：比内容层略暗，明确区分『工具』与『内容』」。

### 2.3 强调色 `--accent` 是什么颜色、用在哪里

- 浅色：**`#4f46e5`**（Indigo-600 系），衍生 `--accent-soft: rgba(79, 70, 229, 0.1)`、`--ring: rgba(79, 70, 229, 0.32)`（`app.css:26-27,32`）。
- 深色：**`#7c73f0`**，衍生 `--accent-soft: rgba(124, 115, 240, 0.16)`、`--ring: rgba(124, 115, 240, 0.45)`（`app.css:122-123,128`）。
- 使用位置（全部为界面层；文档层另有各自的 `--accent` 暖色）：
  1. 图标按钮选中态背景/文字：`.ic-btn.is-on { background: var(--accent-soft); color: var(--accent) }`（`app.css:397-400`）
  2. 分段控件选中文字：`.seg-btn.is-on { background: var(--ui-content); color: var(--accent); box-shadow: var(--shadow-sm) }`（`app.css:468-472`）
  3. 键盘焦点环：`outline: 2px solid var(--ring); outline-offset: 1px`（`app.css:387-388`）
  4. 大纲当前项：底色 `--accent-soft` + 文字 `--accent` + 左侧 2px 强调条（`app.css:582-597`）
  5. 分隔条 hover/拖拽：`background: var(--accent)`（`app.css:702-705`）
  6. 表单控件 focus：`border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring)`（`app.css:990-991`）
  7. 复选框 / 滑杆：`accent-color: var(--accent)`（`app.css:995,1016`）
  8. 卡片选中：`border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft)`（`app.css:1057-1060`、`1246-1249`）
  9. 选中勾标记：`.doc-check { color: var(--accent) }`（`app.css:1204-1213`）
  10. 拖放提示层的整屏薄雾：`background: color-mix(in srgb, var(--accent) 7%, transparent)`（`app.css:795`）
  11. 星标激活色是**唯一**的界面硬编码彩色：`.doc-star.is-on { color: #e3b341 }`（`app.css:1196-1198`），并 `fill: currentColor`（`1200-1202`）
- **文档层强调色与界面强调色是两套**：文档 `--accent` 为暖色系（如素白 `#8a5524`、宣纸 `#b04a30`、夜阑 `#8fa8d8`），定义在 `theme.css`，用于正文链接、`mark`、引用、提示块、复选框 `accent-color`、脚注引用（`theme.css:365-368,389-392,498-504,507-513`）。美术资产若出现「强调色」，应使用**文档主题的暖色强调**，而不是界面的 `#4f46e5`。

---

## 3. 毛玻璃规范

### 3.1 三档强度（浅色 / 深色分别定义）

来源：浅色 `app.css:86-105`，深色 `app.css:154-170`。

| 档位 | 浅色 `--glass-bg` | 浅色 `--glass-panel` | 深色 `--glass-bg` | 深色 `--glass-panel` | `--glass-blur`（两色共用同档值） |
|---|---|---|---|---|---|
| `solid` | `rgba(247, 248, 249, 0.98)` | `rgba(247, 248, 249, 1)` | `rgba(20, 22, 27, 0.98)` | `rgba(20, 22, 27, 1)` | `none` |
| `normal`（默认） | `rgba(247, 248, 249, 0.62)` | `rgba(247, 248, 249, 0.72)` | `rgba(20, 22, 27, 0.68)` | `rgba(20, 22, 27, 0.78)` | `blur(20px) saturate(150%)` |
| `strong` | `rgba(247, 248, 249, 0.48)` | `rgba(247, 248, 249, 0.6)` | `rgba(20, 22, 27, 0.56)` | `rgba(20, 22, 27, 0.66)` | `blur(28px) saturate(165%)` |

深色 `solid` 档另单独覆盖 `--glass-bg` / `--glass-panel` / `--glass-blur`（`app.css:154-158`），不覆盖 `--glass-bg-solid`。

**设计依据（源码注释原文）**：`app.css:63-71`「blur 太大反而看不出是玻璃，只剩一片糊。20px 上下是『明显是玻璃但还能读出下面在滚什么』的临界点，saturate 同理 —— 150% 提一点饱和就够，180% 以上会开始发艳。」以及「backdrop-filter 依赖 GPU 合成……所以底色留 0.62：真模糊时是通透的玻璃，blur 没执行时也还压得住字。」抽屉档位依据见 `app.css:73-75`：「比顶栏更实一点保证控件可读，但必须留住『透』—— 之前给到 0.9 时 blur 完全被吃掉。」

### 3.2 各层的 `backdrop-filter` 字面值（注意：并非全部走 `--glass-blur`）

| 层 | `backdrop-filter` | 底色 | 行号 |
|---|---|---|---|
| `.titlebar` 顶栏 | `var(--glass-blur)`（默认 `blur(20px) saturate(150%)`） | `var(--glass-bg)` | `app.css:261-262` |
| `.statusbar` 状态栏 | **硬编码 `blur(18px) saturate(150%)`**（不随玻璃档位变化） | `var(--glass-bg)` | `app.css:722-723` |
| `.modal` 设置抽屉 | **硬编码 `blur(24px) saturate(160%)`** | `var(--glass-panel)` | `app.css:913-914` |
| `.drop-hint` 拖放提示层 | **硬编码 `blur(5px) saturate(140%)`** | `color-mix(in srgb, var(--accent) 7%, transparent)` | `app.css:795,800` |
| `.sidebar` 大纲侧栏 | **无 `backdrop-filter`**（底色为不透明 `var(--ui-chrome)`） | `var(--ui-chrome)` | `app.css:511` |
| `.pane-editor` | 无（不透明 `var(--ui-content)`） | `var(--ui-content)` | `app.css:626` |

> ⚠️ README `README.md:56-62` 称「顶栏/状态栏/大纲侧栏/设置抽屉都用了 `backdrop-filter`」且参数为 `blur(22px) saturate(180%)`、不透明度「浅色 0.80 / 深色 0.76」——这三项与现行 `app.css` **均不一致**（README 为早期版本遗留）。以 `app.css` 为准。

### 3.3 高光边与阴影写法（玻璃的三件套）

1. **顶栏**：底边高光 + 向下投影，`box-shadow: var(--glass-shadow)`，即 `0 1px 0 rgba(255,255,255,0.6), 0 8px 24px rgba(31,35,40,0.1)`（浅色）／`0 1px 0 rgba(255,255,255,0.08), 0 8px 26px rgba(0,0,0,0.5)`（深色）；`border-bottom: 1px solid var(--line)`（`app.css:263-265`）。
2. **状态栏**：方向相反（往上抬）且高光改为 `inset`，`box-shadow: inset 0 1px 0 var(--glass-hairline), 0 -8px 24px rgba(31, 35, 40, 0.1)`；`border-top: 1px solid var(--line)`（`app.css:724-726`）。深色下未单独覆盖该阴影（深色仍用此浅色 α 值）。
3. **设置抽屉**：三道阴影叠加，`inset 1px 0 0 var(--glass-hairline), -18px 0 42px rgba(31, 35, 40, 0.18), 24px 0 64px rgba(31, 35, 40, 0.14)`；深色为 `inset 1px 0 0 var(--glass-hairline), -18px 0 44px rgba(0, 0, 0, 0.55), 24px 0 70px rgba(0, 0, 0, 0.5)`（`app.css:918-931`）。
4. **大纲侧栏**（非玻璃但同族）：`box-shadow: 8px 0 24px rgba(31, 35, 40, 0.09)`；深色 `8px 0 26px rgba(0, 0, 0, 0.42)`（`app.css:515,520`）。
5. **兜底色衬层**：`.titlebar::before / .statusbar::before / .sidebar::before / .modal::before` 用 `background: var(--glass-tint, transparent)` 铺一层同色底衬，保证 `backdrop-filter` 不执行时文字不与正文糊在一起（`app.css:275-284`）。**`--glass-tint` 全仓未定义 → 当前实际为完全透明，该兜底机制实际未生效**（`app.css` 注释的意图仍在，做资产时可按「文字下方有一层极淡同色底」理解）。
6. 各层内容统一 `position: relative; z-index: 1`（`app.css:286-292`）。

### 3.4 层级（z-index）关系

| z-index | 层 | 行号 |
|---|---|---|
| `0` | `.workspace` 工作区（最底，承载滚动的正文） | `app.css:228` |
| `1` | 顶栏/状态栏/侧栏/抽屉的直接子元素 | `app.css:291` |
| `5` | `.splitter::after` 加宽的拖拽命中区（`inset-inline: -4px`） | `app.css:699` |
| `20` | `.titlebar` 顶栏、`.statusbar` 状态栏 | `app.css:250,714` |
| `60` | `[data-tip]::after` tooltip | `app.css:428` |
| `90` | `.drawer-scrim` 抽屉遮罩 | `app.css:851` |
| `95` | `.drop-hint` 拖放提示层 | `app.css:789` |
| `100` | `.modal-backdrop` 设置抽屉 | `app.css:873` |

**布局前提**：顶栏/状态栏是 `position: absolute` 叠在工作区之上（`app.css:245-250,709-714`），工作区 `inset: 0` 占满整窗（`app.css:225-233`），正文从玻璃层下方滚过——`app.css:214-217` 注释：「若工作区只是 grid 里的一行，它是兄弟元素，毛玻璃什么也模糊不到。」

---

## 4. 字体体系

### 4.1 字体栈原文

**界面字体**（`body`，`app.css:187-188`）：
```
'Microsoft YaHei UI', 'Microsoft YaHei', 'PingFang SC', 'Segoe UI Variable Text',
'Segoe UI', 'Noto Sans SC', system-ui, sans-serif
```

**正文默认字体变量**（`:root`，`app.css:57`）：
```
--mr-font-body: "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif;
```

**正文实际生效栈**（`zh-optimize.css:15-29`，只要 `--mr-font-body` 有值就整体替换）：
```
var(--mr-font-body, "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC",
    "Hiragino Sans GB", "Noto Sans CJK SC", "Source Han Sans SC", "Noto Sans SC",
    "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif)
```

**代码字体**（`zh-optimize.css:175-177`）：
```
"Cascadia Code", "JetBrains Mono", Consolas,
"SF Mono", "Menlo", "Microsoft YaHei Mono", "Noto Sans Mono CJK SC",
"Courier New", monospace
```
代码区 `letter-spacing: 0`（`zh-optimize.css:179`，注释：「等宽字体里中英文混排时字号要略小才协调」）。

**7 款字体预设**（`fonts.js:55-112`，`applyFont` 把 `stack` 写入 `--mr-font-body`，`fonts.js:128`）：

| id | 标签 | note | 栈 |
|---|---|---|---|
| `sans`（默认，`store.js:15`） | 思源黑体 | 三万码位全字符 · 默认 | `'Eunice Sans SC', <TAIL>` |
| `serif` | 思源宋体 | 衬线 · 长篇中文阅读 | `'Eunice Serif SC', <TAIL>` |
| `wenkai` | 霞鹜文楷 | 楷体 · 按需加载 194 片 | `'LXGW WenKai', 'Eunice Sans SC', <TAIL>` |
| `inter-sans` | Inter + 思源黑体 | 西文/数字用 Inter | `'Eunice Inter', 'Eunice Sans SC', <TAIL>` |
| `garamond-serif` | Garamond + 思源宋体 | 西文衬线 · 适合引文 | `'Eunice Garamond', 'Eunice Serif SC', <TAIL>` |
| `mono-sans` | JetBrains Mono + 思源黑体 | 等宽 · 技术文档 | `'Eunice Mono', 'Eunice Sans SC', <TAIL>` |
| `system` | 系统字体 | 微软雅黑 · 零加载 | `"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Segoe UI", <TAIL>` |

其中 `TAIL = 'Segoe UI Symbol', 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif`（`fonts.js:43`）。
`@font-face` 家族名（`fonts.js:32-39`）：`Eunice Sans SC`(400/700)、`Eunice Serif SC`(400/700)、`Eunice Inter`(400/700)、`Eunice Garamond`(400)、`Eunice Mono`(400)，全部 `font-display: swap`。霞鹜文楷 `@font-face` 由 `src/fonts/wenkai/regular.css` + `bold.css` 内联注入（`fonts.js:28-29,51`），各 97 个分片，合计 194 片（与 `README.md:110` 一致），每个分片带 `unicode-range`（示例见 `regular.css` 第 1–9 行）。
字号-字重两段结构的依据见 `fonts.js:4-18`（西文字体仅约 230 码位，只能当装饰；Noto SC 30,890+ 码位必选兜底；`✔✗✘ ★` 由 `Segoe UI Symbol` 兜，emoji 由 `Segoe UI Emoji` 兜，均为 Windows 自带）。

### 4.2 字号与行高

| 对象 | 字号 | 行高 | 字重 | 行号 |
|---|---|---|---|---|
| 界面基准（`body`） | `13px` | 未声明（浏览器默认 `normal`；界面各组件另设） | 未声明 | `app.css:189` |
| 文档正文（`.pane-preview > .markdown-body`） | `var(--mr-font-size)`，默认 `16px` | `var(--mr-line-height)`，默认 `1.9` | 继承 | `app.css:667-668`、`store.js:12-13` |
| 正文兜底（`.markdown-body`） | — | `1.9`（`zh-optimize.css:35` 注释：中文正文行高由设置项控制，这里给 1.9 作为兜底） | — | `zh-optimize.css:35` |
| 标题 h1–h6 | **未在源码中找到**（全仓无 `.markdown-body h1…h6 { font-size }` 声明；`README.md:28` 与 `package-lock.json` 列有 `github-markdown-css` 5.9.0，但 `main.js:8-12` 只 import 了 `app.css`、`zh-optimize.css`、`theme.css`、`print.css`、`katex/dist/katex.min.css`，**没有任何文件 import github-markdown-css**）→ 实际取 WebView2 用户代理默认值（h1 `2em`、h2 `1.5em`、h3 `1.17em`、h4 `1em`、h5 `0.83em`、h6 `0.67em`，基于 16px）。**此项为推导值，非源码值** | — | 600 | `zh-optimize.css:53` |
| h4/h5/h6（打印） | 见 print 段 | — | — | `print.css:75-82` |
| 行内代码 | 未显式设字号（`padding: 0.2em 0.4em`） | 继承 | — | `zh-optimize.css:183-186` |
| 代码块 `pre` | 未显式设字号 | `1.65` | — | `zh-optimize.css:188-193` |
| 表格 | `0.95em` | `1.7`（单元格） | 表头 600 | `zh-optimize.css:203,210,214` |
| 脚注 | `0.92em` | — | — | `zh-optimize.css:251` |
| KaTeX | `1.05em` | — | — | `zh-optimize.css:293-295` |
| 代码块语言标签 / 复制按钮 | `0.75em` / `11.5px` | — | — | `zh-optimize.css:349,364` |
| 外链箭头 | `0.75em`、`opacity: 0.55`、`vertical-align: 0.15em` | — | — | `zh-optimize.css:163-168` |
| 打印正文 | `11.5pt` | `1.75` | — | `print.css:68-69` |
| 打印表格 | `10pt` | — | — | `print.css:96` |
| 打印链接地址 | `8.5pt` | — | — | `print.css:121` |

**界面侧字号档位清单（实测字面值）**：`16px`（空状态标题 `.empty-title`，`app.css:771`）、`15px`（字体卡样张 `.font-sample`，`app.css:1252`）、`14px`（拖放提示 `.drop-hint`，`app.css:797`；抽屉标题 `.modal-title`，`app.css:944`）、`13px`（body 基准、`.empty-sub`、`.field-label`、`.field-check`）、`12.5px`（文件名 `.doc-title`、大纲项、`.doc-name`、`.font-name`、最近项名）、`12px`（`.sidebar-title` 之外的 `.outline-empty`、`.field-hint`、`.value-tag`、`.key-row`、`.chip-tab`、`.theme-empty`、`.keys-list`、大纲 4–6 级）、`11.5px`（状态栏、`.mr-copy`、`.rpath`）、`11px`（tooltip、`.sidebar-title`、`.doc-note`、`.font-note`、`kbd`）、`10.5px`（`.status-enc`）。

### 4.3 中文排版特殊处理（逐条 CSS 规则）

| 规则 | 值 | 行号 |
|---|---|---|
| 中文字距放开 | `.markdown-body { letter-spacing: 0.02em }`（注释：「0.02em 是可读性与密度的平衡点」） | `zh-optimize.css:32` |
| 标题字距 | `.markdown-body :where(h1..h6) { letter-spacing: 0.01em }` | `zh-optimize.css:57` |
| 标题字重 | `font-weight: 600`（注释：「中文标题字重普遍偏细，用 600 而不是 700 才够清晰」） | `zh-optimize.css:53` |
| 标题对齐 | `text-align: start`（注释：「标题不参与段落两端对齐，避免最后一字被拉开」） | `zh-optimize.css:51` |
| 标题禁止断行成单字行 | `word-break: keep-all` | `zh-optimize.css:55` |
| 标点挤压 + 中西文自动间距 | `text-spacing-trim: space-first`（注释：「Chromium 123+ / WebView2 支持」） | `zh-optimize.css:38` |
| 不支持时的回退 | `@supports not (text-spacing-trim: space-first) { text-autospace: normal }` | `zh-optimize.css:41-45` |
| 正文两端对齐 | `.markdown-body > p { text-align: justify; text-align-last: start }`（注释：「字间距过大会拉稀，故配合 text-align-last 保持末行自然」） | `zh-optimize.css:97-98` |
| 段间距 | `margin-top: 0; margin-bottom: 1em` | `zh-optimize.css:94-95` |
| 中西文混排断行 | `:where(p, li, td, th, blockquote) { word-break: normal; overflow-wrap: break-word }`（注释：「避免 `1个` `A包` 这类挤在一起」） | `zh-optimize.css:102-105` |
| 标题间距 | h1 `1.6em / 0.8em`；h2 `2em / 0.9em` + `padding-bottom: 0.3em`；h3 `1.6em / 0.7em` | `zh-optimize.css:60-68` |
| h2 底线减淡 | `border-bottom-color: color-mix(in srgb, currentColor 16%, transparent)`（注释：「GitHub 原生样式的 h2 底部边框在中文文档里显得过重」） | `zh-optimize.css:64-66` |
| 列表缩进 | `:where(ul, ol) { padding-inline-start: 2em }`（注释：「中文列表缩进用 2em，比英文的 2ch 更符合阅读习惯」） | `zh-optimize.css:109-112` |
| 列表项间距 | `li { margin-top: 0.35em; margin-bottom: 0.35em }`；`li > p { margin-bottom: 0.5em }` | `zh-optimize.css:114-121` |
| 任务列表 | `li:has(> input[type="checkbox"]) { list-style: none; padding-inline-start: 0 }`；复选框 `margin-inline-end: 0.5em; vertical-align: -0.1em; accent-color: currentColor; width: 1em; height: 1em` | `zh-optimize.css:124-135` |
| 引用块 | `margin-block: 1.2em; padding: 0.6em 1em; border-inline-start-width: 0.25em`（注释：「左侧竖线用更淡的颜色，中文长引用时不刺眼」） | `zh-optimize.css:139-144` |
| 链接 | `text-decoration: none; border-bottom: 1px solid color-mix(in srgb, currentColor 25%, transparent)`（注释：「中文正文里的链接不加下划线会看不清边界，但纯下划线又太吵」） | `zh-optimize.css:152-157` |
| 标题锚点 | `.mr-anchor-link { color: currentColor; opacity: 0.22 }`，hover 标题 `0.7`，直接 hover 锚点 `1`；`transition: opacity 0.15s ease` | `zh-optimize.css:74-89` |
| 表格 | `width: 100%; table-layout: auto; border-collapse: collapse; margin-block: 1.3em; font-size: 0.95em`；单元格 `padding: 0.6em 0.85em; line-height: 1.7`；表头 `white-space: nowrap` | `zh-optimize.css:197-216` |
| 表格横滚容器 | `.mr-table-wrap { overflow-x: auto; margin-block: 1.3em; scrollbar-width: thin }`（注释：「滚动条在 WebView2 里默认不显示，这里强制常显」） | `zh-optimize.css:328-337` |
| 水平线 | `margin-block: 2.2em` | `zh-optimize.css:220-223` |
| 图片 | `border-radius: 6px; margin-block: 0.6em 0.9em` | `zh-optimize.css:227-231` |
| 破图占位 | `min-height: 3em; border: 1px dashed color-mix(currentColor 30%, transparent)` + 45° 斜纹（8px/16px 步长，`currentColor 6%`） | `zh-optimize.css:233-244` |
| 脚注区 | `margin-top: 3em; padding-top: 1em; font-size: 0.92em`；`.footnote-ref { border-bottom: none; padding: 0 0.15em }` | `zh-optimize.css:248-257` |
| Mermaid | `margin-block: 1.4em; text-align: center; overflow: auto`；`svg { max-width: 100%; height: auto; font-family: inherit }` | `zh-optimize.css:303-314` |
| KaTeX 中文回退 | `.katex .mord.text { font-family: inherit }`（注释：「KaTeX 不内置中文字体」） | `zh-optimize.css:292-299` |
| 代码块装饰 | `.mr-code` `position: relative`；语言标签 `top: 0.45em; inset-inline-start: 0.8em; font-size: 0.75em; opacity: 0.5`；复制按钮 `top: 8px; inset-inline-end: 8px; padding: 4px 9px; font-size: 11.5px; border-radius: 6px; opacity: 0`（hover 才显示） | `zh-optimize.css:341-382` |

**行内代码与代码块的底色/文字/描边来自主题层**：`.markdown-body :not(pre) > code { background-color: var(--code-inline-bg); color: var(--code-inline-ink) }`（`theme.css:430-433`）；`pre, pre.mr-code { background-color: var(--code-bg); border: 1px solid var(--code-rule); color: var(--ink) }`（`theme.css:435-440`）。

### 4.4 打印/PDF 版式要点（`print.css`）

- `@page { size: A4; margin: 18mm 16mm }`（`print.css:132-135`）；注释说明页边距由 `@page` 独占，Rust 侧打印设置留 0（`print.css:8-10`）。
- 打印强制浅色：`:root, :root[data-theme='dark']` 覆写 `--ui-content/--ui-chrome` → `#ffffff`，`--fg` → `#1c1f23`，`--fg-2` → `#3d444d`，`--fg-3` → `#59636e`，`--line` → `#d0d7de`，`--c-*` 恢复浅色语义色（`print.css:14-28`）。
- 隐藏界面层：`.titlebar, .statusbar, .sidebar, .splitter, .pane-editor, .drawer-scrim, .modal-backdrop, .empty-state, .toast` → `display: none !important`（`print.css:31-41`）。
- 正文：`max-width: none; padding: 0; font-size: 11.5pt; line-height: 1.75; background: #fff; color: #1c1f23`（`print.css:63-72`）。
- 分页控制：h1–h4 `break-after: avoid-page; break-inside: avoid`；`table/pre/blockquote/.mr-callout/img/.mr-mermaid { break-inside: avoid }`（`print.css:75-92`）。
- 打印态代码块：`white-space: pre-wrap; border: 1px solid #d0d7de; background: #f6f8fa`（`print.css:104-109`）。
- 打印态链接：`color: inherit; border-bottom: none; word-break: break-all`，并在 `::after` 输出 ` (attr(data-href))`，颜色 `#6e7781`（`print.css:111-123`）。
- 打印时隐藏：`.mr-copy`、`.mr-code-lang`、`.mr-external-mark`、`.mr-anchor-link`（`print.css:125-130`）。

---

## 5. 形状、间距、描边、投影、动效取值清单

### 5.1 圆角

| 值 | 用途 | 行号 |
|---|---|---|
| `--r-sm: 5px` | 图标按钮、大纲项、最近项、tooltip、表单控件、`.doc-star` | `app.css:49` |
| `--r-md: 8px` | 分段控件容器、`chips` 容器、主题卡、字体卡、`.doc-grid`、`.font-grid` | `app.css:50` |
| `--r-lg: 12px` | **全仓未引用** | `app.css:51` |
| `6px` | `.seg-btn`、`.chip-tab`、行内代码、图片、提示块、`.mr-copy` | `app.css:457,1157`；`zh-optimize.css:185,228,265,368` |
| `4px` | `.status-enc`、`kbd`、`.doc-dot`、`doc-star` 实测为 `5px` | `app.css:734,834,1083,1177` |
| `8px` | 滚动条滑块 | `app.css:1352` |
| `999px` | 拖放提示胶囊 `.drop-hint span` | `app.css:805` |
| `50%` | 未保存圆点 `.doc-dirty`（6×6px） | `app.css:352-357` |
| `1px` / `3px` / `4px` | 侧栏选中强调条 `.outline-item.is-active::before`（2px 宽）／主题缩略图引用条（`3px`，`settings.js:54`）／提示块左侧条 | `app.css:588-597` |

### 5.2 间距（实际字面值）

| 位置 | 值 | 行号 |
|---|---|---|
| 顶栏内边距 / 间隙 | `padding: 0 10px`；`gap: 8px`（`.tb-group` `gap: 2px`，`.ic-split` `gap: 1px; margin-left: 2px; padding-left: 4px`） | `app.css:258-259,311,301-304` |
| 顶栏分隔线 `.tb-gap` | `1px × 18px`，`margin: 0 6px` | `app.css:322-327` |
| 文件名区 | `gap: 7px`，`max-width: 40%` | `app.css:336,338` |
| 状态栏 | `gap: 14px`；`padding: 0 14px`；`height: var(--statusbar-h)` = `26px` | `app.css:715-719` |
| 侧栏 | 宽 `264px`（硬编码；`store.js:17` 的 `outlineWidth: 260` **全仓未被应用**）；`sidebar-head` 高 `34px`，`padding: 0 8px 0 14px`；列表 `padding: 0 8px 16px` | `app.css:503,531-532,548` |
| 大纲项 | `min-height: 28px`；`padding: 5px 8px 5px 10px`；层级缩进 `22px / 34px / 44px` | `app.css:556-557,600-604` |
| 正文排版区 | `padding: 40px 40px 45vh`；阅读模式 `padding-top: 56px` | `app.css:669,673` |
| 分段控件 | `padding: 2px; gap: 1px`；按钮 `30×24px` | `app.css:443-444,453-454` |
| 图标按钮 | `30×30px`；小号 `.ic-sm` `24×24px` | `app.css:366-367,403-404` |
| 抽屉 | 宽 `min(var(--drawer-w, 420px), 100vw)`（`--drawer-w` 无定义 → 实际 420px）；`modal-head` 高 `46px`，`padding: 0 10px 0 20px`；`modal-body` `padding: 0 20px 24px` | `app.css:875,937-938,949` |
| 字段 | `.field { padding: 18px 0 }`；`.field-label` `margin-bottom: 3px`；`.field-hint` `margin-bottom: 10px`；`.field-row` `gap: 12px`；`.field-check` `gap: 9px` | `app.css:954,965,972,1002,1008` |
| 表单控件 | `height: 32px; padding: 0 10px; min-width: 240px`；复选框 `15×15px`；`.value-tag { min-width: 62px }` | `app.css:977-984,1014-1015,1021` |
| 主题卡网格 | `repeat(auto-fill, minmax(168px, 1fr))`；`gap: 7px`；`max-height: 420px`；`padding: 9px` | `app.css:1030-1033` |
| 缩略图 / 卡片元信息 | `.doc-preview { height: 78px }`；`.doc-meta { gap: 8px; padding: 6px 8px }`；`.doc-dot { 13×13px }` | `app.css:1063,1074-1075,1081-1082` |
| 字体卡网格 | `minmax(150px, 1fr)`；`gap: 6px`；`max-height: 300px`；`padding: 10px`；卡片 `padding: 10px 11px` | `app.css:1219-1234` |
| 快捷键表 | `minmax(210px, 1fr)`；`gap: 6px 16px` | `app.css:1110-1111` |
| 最近文件 | `max-height: 200px; gap: 1px`；项 `padding: 7px 9px; gap: 9px` | `app.css:1285-1287,1293-1295` |
| 空状态 | `gap: 10px; padding: 24px`；`.empty-art { margin-bottom: 6px }`；`.empty-keys { gap: 18px; margin-top: 10px }` | `app.css:753-754,766,816-817` |
| 拖放提示 | `gap: 8px`；胶囊 `padding: 7px 16px` | `app.css:794,804` |
| `kbd` | `min-width: 20px; padding: 2px 6px` | `app.css:830-831` |
| tooltip | `top: calc(100% + 7px)`（`.seg` 内为 `+9px`）；`padding: 4px 8px` | `app.css:416,476` |
| 主题缩略图内（Shadow DOM） | `.t { padding: 10px 11px }`；`font: 11.5px/1.65`；`blockquote { padding: 3px 7px; border-left: 3px solid }` | `settings.js:47-54` |
| 滚动条 | `width/height: 11px`；滑块 `border: 3px solid transparent`（侧栏/主题网格/抽屉内为 `2px`） | `app.css:1340-1341,1350,1360-1363` |

### 5.3 描边宽度

| 值 | 用途 | 行号 |
|---|---|---|
| `1px` | 界面全部基础分隔（`var(--line)`）：顶栏底边、状态栏顶边、侧栏右边、编辑器右边、字段分隔、卡片边框；`1px solid var(--line-strong)` 用于表单控件与 `kbd`、`.status-enc`、`.doc-dot` | `app.css:263,724,512,627,955,979,832,733,1084` |
| `1px`（文档） | `h2` 底边、`hr`、链接下划线、表格边框、`pre` 边框（`--code-rule`）、破图虚线 | `theme.css:362,375-377,367,396,438`；`zh-optimize.css:236` |
| `2px` | 焦点环 `outline: 2px solid var(--ring)`；卡片选中外发光 `0 0 0 2px var(--accent-soft)`；侧栏活动强调条宽 `2px`；`kbd` 底边 `border-bottom-width: 2px`；CodeMirror 光标 `borderLeftWidth: 2px` | `app.css:387,1059,1248,594,833`；`editor.js:42` |
| `3px` | 表单 focus 外发光 `0 0 0 3px var(--ring)`；滚动条滑块透明边框 | `app.css:991,1350` |
| `4px` | 提示块左侧竖线 `border-inline-start: 4px solid var(--mr-callout-color)` | `zh-optimize.css:264` |
| `0.25em` | 文档 `blockquote` 左边线（`border-inline-start-width`） | `zh-optimize.css:143` |
| `1.75`（SVG） | 图标统一描边：`.ic { stroke-width: 1.75 }`——注意 SVG 文件属性为 `stroke-width="2"`，CSS 类选择器优先于表现属性，故**实际渲染为 1.75** | `app.css:209`；`src/icons/*.svg:10` |

### 5.4 投影

见 §3.3（玻璃层）与 §5.2 行号；另附：
`.titlebar .ic-btn` 无投影；`.seg-btn.is-on` 用 `var(--shadow-sm)`；`.doc-card.is-on` 用 `var(--accent-soft)` 外发光；tooltip 用 `var(--shadow-md)`（`app.css:429`）；`.drop-hint span` 用 `var(--shadow-md)`（`app.css:807`）。

### 5.5 过渡时长与缓动曲线（全量清单）

| 对象 | transition | 行号 |
|---|---|---|
| `.ic-btn` | `background 0.12s ease, color 0.12s ease` | `app.css:374` |
| tooltip | `opacity 0.14s ease, transform 0.14s ease`；hover 加 `transition-delay: 0.35s`（位移 `translateY(-3px)` → `0`） | `app.css:427,435` |
| `.seg-btn` | `background 0.14s ease, color 0.14s ease, box-shadow 0.14s ease` | `app.css:461` |
| `.outline-item` | `background 0.1s ease, color 0.1s ease` | `app.css:567` |
| `.splitter` | `background 0.14s ease` | `app.css:691` |
| `.drawer-scrim` | `opacity 0.22s ease` | `app.css:856` |
| `.modal-backdrop` | 开：`transform 0.26s cubic-bezier(0.32, 0.72, 0, 1), visibility 0s`；收：`transform 0.26s cubic-bezier(0.32, 0.72, 0, 1), visibility 0s linear 0.26s` | `app.css:884-886,898-900` |
| `.modal` | `box-shadow 0.26s cubic-bezier(0.32, 0.72, 0, 1)` | `app.css:923` |
| `.doc-card` / `.font-card` | `border-color 0.12s ease, box-shadow 0.12s ease` | `app.css:1050,1239` |
| `.doc-star` | `opacity 0.14s ease, color 0.14s ease, background 0.14s ease` | `app.css:1182` |
| `.chip-tab` | `background 0.14s, color 0.14s`（无缓动关键字） | `app.css:1163` |
| `.mr-anchor-link` | `opacity 0.15s ease` | `zh-optimize.css:79` |
| 文档链接 | `border-color 0.15s ease` | `zh-optimize.css:156` |
| `.mr-copy` | `opacity 0.15s ease, background 0.15s ease` | `zh-optimize.css:372` |
| 正文滚动 | `.pane-preview { scroll-behavior: smooth }`；大纲跳转 `scrollIntoView({ behavior: 'smooth', block: 'start' })` | `app.css:641`；`main.js:224` |
| JS 侧计时 | 渲染防抖 `120ms`（立即渲染 `0`）；自动保存 `1200ms`；抽屉关闭后 `260ms` 收起隐藏；「已复制」`1600ms` 复位；mermaid 预热 `1500ms`；导出前等字体就绪上限 `2500ms` | `main.js:159,605,439,85,678,359`；`store.js:20` |

**统一缓动曲线**：界面动效只用了 `ease`（默认）与一条自定义曲线 **`cubic-bezier(0.32, 0.72, 0, 1)`**（仅用于抽屉滑动与其阴影，`app.css:885,899,923`）。

---

## 6. 图标语言

- **图标库**：Lucide（`lucide-static` 1.56.0，ISC 许可，`package.json` 依赖与 `src/icons/*.svg:1` 许可头一致）。
- **注入方式**：构建期内联——`icons.js:8-32` 用 `?raw` 把 SVG 作为字符串导入，`icons.js:64-69` 的 `clean()` 去掉注释头与 `class/width/height` 属性，`icon(name, size = 18, cls = '')` 再写回 `width/height` 与 `class="ic …"`（`icons.js:79-85`）。**不产生任何网络请求**（`icons.js:3-5`）。
- **线条粗细**：SVG 源文件为 `stroke-width="2"`、`stroke-linecap="round"`、`stroke-linejoin="round"`、`fill="none"`、`viewBox="0 0 24 24"`（`src/icons/*.svg:7-12`，31 个文件全部一致）；CSS 统一覆盖为 **`stroke-width: 1.75`**（`app.css:206-210`，同时 `display: block; flex: none`）。
- **颜色继承**：SVG 内 `stroke="currentColor"`（`src/icons/*.svg:9`），因此自动跟随 `color`；图标按钮默认 `color: var(--fg-2)`，hover `var(--fg)`（`app.css:372,379`）；星标激活 `#e3b341` 且 `fill: currentColor`（`app.css:1196-1202`）。`aria-hidden` 被替换为 `data-ic`（`icons.js:84`）。
- **尺寸档位**（源码实际调用值，非设计猜测）：

| 尺寸 | 用途 | 行号 |
|---|---|---|
| `44px` | 空状态插画 `book-open` | `main.js:102` |
| `17px` | 顶栏全部图标按钮（含明暗切换的 sun/moon） | `main.js:99,147` |
| `16px` | 设置抽屉关闭按钮 | `main.js:99` |
| `15px` | 设置内「清空最近」按钮 `x` | `settings.js:374` |
| `14px` | 主题卡星标 `star`、选中勾 `check` | `settings.js:198,218` |
| `13px` | 代码块复制按钮 `copy` | `enhance.js:71` |
| `11px` | 外链箭头 `external-link`（`externalIcon(11)`，函数默认 `12`） | `enhance.js:111`；`icons.js:95` |
| `14`（未被调用） | `copyIcon` 默认值 | `icons.js:90-92` |
| `18`（未被调用） | `icon()` 默认尺寸 | `icons.js:79` |

- **图标清单（注册表 `RAW` 的 24 个键，`icons.js:34-61`）**：
  `folder-open`、`save`、`save-as`（源文件 `hard-drive-download.svg`）、`eye`、`columns`（`columns-2.svg`）、`code`（`code-xml.svg`）、`list`、`settings`、`sun`、`moon`、`copy`、`x`、`search`、`file-text`、`chevron-right`、`book-open`、`panel-left-close`、`panel-left`（**实际指向 `list-tree.svg`**，`icons.js:51-54` 注释：「panel-left 在 17px 下只是两条竖线，认不出是什么；list-tree 有明确的层级线条」）、`pencil`、`check`、`star`、`printer`、`download`、`external-link`。
- **实际渲染出来的图标（18 个）**：`folder-open`、`save`、`download`、`printer`、`eye`、`columns`、`code`、`panel-left`(=list-tree)、`panel-left-close`、`moon`/`sun`、`settings`、`x`、`book-open`、`star`、`check`、`copy`、`external-link`（映射见 `main.js:79-103`、`settings.js:198,218,374`、`enhance.js:71,111`）。
- **注册但从未被调用的 6 个**：`save-as`、`list`、`search`、`file-text`、`chevron-right`、`pencil`。
- **磁盘上存在但完全未被 import 的 6 个 SVG**：`chevron-down.svg`、`file-down.svg`、`panel-left-open.svg`、`rows-3.svg`、`type.svg`、`zoom-in.svg`。（磁盘共 31 个 SVG，`icons.js:8-32` 仅导入 25 个。）
- **`panel-left.svg` 被导入（`icons.js:25`）但未登记进 `RAW`**：`'panel-left'` 这个键实际指向 `listTree`（`icons.js:54`），故 `panel-left.svg` 的图形从未被渲染——大纲按钮画的是 `list-tree`。

---

## 7. 界面组件清单与视觉描述

### 7.1 顶栏 `.titlebar`
结构（`index.html:11-37`）：左组（打开/保存 ＋ `.ic-split` 分出的另存为/导出 PDF）＋ 中间文件名 `.tb-doc`（`.doc-title` + 未保存圆点 `.doc-dirty`）＋ 右组（`.seg` 三段视图控件、`.tb-gap` 竖分隔、大纲/明暗/设置三个图标按钮）。
视觉：高 `46px`（`--titlebar-h`）；`position: absolute; top: 0; z-index: 20`；flex 布局 `gap: 8px; padding: 0 10px`；底色 `--glass-bg` + `--glass-blur`；底边 `1px solid var(--line)` + `--glass-shadow`；`user-select: none`。文件名 `font-weight: 600; font-size: 12.5px; color: var(--fg-2)`，单行省略号、`max-width: 40%`；未保存圆点 `6×6px` 正圆 `background: var(--warn)`。**所有图标按钮 30×30px、透明底、圆角 5px，无边框。**

### 7.2 分段控件 `.seg` / `.seg-btn`
容器：`display: flex; gap: 1px; padding: 2px; border-radius: 8px; background: var(--ui-sunken)`（`app.css:440-447`）。按钮 `30×24px`，圆角 `6px`，未选中文字 `var(--fg-3)`；hover 文字 `var(--fg-2)`；选中 `background: var(--ui-content); color: var(--accent); box-shadow: var(--shadow-sm)`（`app.css:449-472`）。语义为「凹陷槽 + 抬起的白色滑块」。

### 7.3 图标按钮 `.ic-btn`
`30×30px`（`.ic-sm` 24×24px），`border: none; border-radius: 5px; background: transparent; color: var(--fg-2)`；hover `background: var(--hover); color: var(--fg)`；按 `--press`；焦点 `outline: 2px solid var(--ring); outline-offset: 1px`；禁用 `opacity: 0.35`；激活 `.is-on { background: var(--accent-soft); color: var(--accent) }`（`app.css:362-405`）。tooltip 由 `data-tip` 属性驱动，出现于 `top: calc(100% + 7px)`，胶囊 `--r-sm`，底 `var(--fg)`、字 `var(--ui-chrome)`、`font-size: 11px`，hover 延迟 `0.35s`（`app.css:408-436`）。

### 7.4 大纲侧栏 `.sidebar`
宽 `264px`（固定），`margin-top: var(--titlebar-h)`、`height: calc(100% - 46px - 26px)`，底色 `var(--ui-chrome)`（**不透明，非玻璃**），右边 `1px solid var(--line)`，右向投影 `8px 0 24px rgba(31,35,40,0.09)`（深色 `8px 0 26px rgba(0,0,0,0.42)`），`overflow: hidden`（`app.css:502-521`）。
头 `.sidebar-head` 高 `34px`，标题 `.sidebar-title` 为 `11px / 600 / letter-spacing: 0.07em / text-transform: uppercase / color: var(--fg-3)`（「大纲」二字为中文，uppercase 对其无影响）。
列表项 `.outline-item`：`min-height: 28px`，`font-size: 12.5px`，`color: var(--fg-2)`，圆角 5px，`text-align: start`，溢出省略；hover `--hover` + `--fg`；**当前项** `background: var(--accent-soft); color: var(--accent); font-weight: 600`，并带左侧 `2px`、上下各内缩 `6px`、圆角 `1px` 的强调条（`::before`）。层级：1 级 `600` + `--fg`；2/3 级缩进 `22px/34px`；4–6 级缩进 `44px`、`font-size: 12px`、`color: var(--fg-3)`（`app.css:551-604`）。空态 `.outline-empty`：`padding: 16px 12px; font-size: 12px; line-height: 1.8; color: var(--fg-3)`，文案「当前文档没有标题。」（`main.js:206`）。

### 7.5 分栏拖拽条 `.splitter`
宽 `1px`，`cursor: col-resize`，底色 `var(--line)`；`::after` 用 `inset-inline: -4px` 扩出 9px 命中区并 `z-index: 5`；hover 与拖拽中 `.is-dragging` 变 `var(--accent)`，`transition: background 0.14s ease`（`app.css:685-705`）。拖拽逻辑宽度钳制：最小 `240px`，预览至少保留 `320px`（`main.js:448`）；双击复位为 50/50（`main.js:467-470`）。

### 7.6 状态栏 `.statusbar`
高 `26px`（`--statusbar-h`），`z-index: 20`，flex `gap: 14px; padding: 0 14px`，`font-size: 11.5px`，`color: var(--fg-3)`，`background: var(--glass-bg)` + `backdrop-filter: blur(18px) saturate(150%)`，`border-top: 1px solid var(--line)`，`box-shadow: inset 0 1px 0 var(--glass-hairline), 0 -8px 24px rgba(31,35,40,0.1)`，**`font-variant-numeric: tabular-nums`**（数字不跳动），`user-select: none`（`app.css:709-729`）。
内容顺序（`index.html:74-81`）：行数 `行 N` → `字 N` → 光标 `行:列` → `.spacer` → 主题名 → 编码徽标。文案格式 `行 ${lines}` / `字 ${wc.total}` / `${line}:${col}`（`main.js:266-268`）；无文档时为 `—` 且其余置空（`main.js:255-261`）。
编码徽标 `.status-enc`：`padding: 1px 6px; border: 1px solid var(--line-strong); border-radius: 4px; font-size: 10.5px; letter-spacing: 0.03em`；非 UTF-8 时 `.is-legacy` 文字与边框转 `var(--warn)`（`app.css:731-742`）。

### 7.7 设置抽屉 `.modal`
**刻意的非全屏模态**：`index.html:88-97` + `settings.js:3-6` 注释「设置是右侧抽屉：换主题、调字号，效果必须立刻在左侧文档中看得见」。`README.md:52` 的旧描述（「抽屉展开时顶栏、工作区、状态栏一起收窄」）与现行实现不符——现行 `.modal-backdrop` 为 `position: fixed; z-index: 100`，`body.settings-open` 时 `translateX(0)`，正文排版与滚动位置**完全不动**（`app.css:903-905`）。
结构：`.drawer-scrim` 极轻遮罩 `background: rgba(12, 14, 18, 0.1)`，`transition: opacity 0.22s ease`，点击关闭（`app.css:848-866`；`settings.js:446`）→ `.modal-backdrop`（宽 `min(420px, 100vw)`，收回态 `translateX(100%)` + `visibility: hidden`，`z-index: 100`）→ `.modal`（`background: var(--glass-panel)` + `backdrop-filter: blur(24px) saturate(160%)`，`border-left: 1px solid var(--line)`，三道阴影，圆角 0）。
头部 `.modal-head` 高 `46px`、`padding: 0 10px 0 20px`、底边 1px，标题 `font-size: 14px; font-weight: 600`。
**信息层级（`settings.js:7-15` 注释 + 实际顺序）**：① 正文主题（主角：分类 chips ＋ 主题卡网格，每卡含真实中文排版的 Shadow DOM 缩略图、纸面色点、主题名、说明、星标收藏、选中勾）→ ② 正文字体（chips ＋ 字体卡网格，样张按预设字体实时渲染）→ ③ 排版微调（字号 `12–24px` 步长 1；行高 `1.4–2.6` 步长 0.1；正文宽度 `600–1600px` 步长 20；界面透明度 三选一）→ ④ 行为（大纲开关、编辑时自动保存）→ ⑤ 最近打开（最多 10 条，`store.js:64`）→ ⑥ 快捷键表。
字段视觉：`.field { padding: 18px 0; border-bottom: 1px solid var(--line) }`（末项去线）；标签 `13px/600`；说明 `12px / line-height 1.75 / --fg-3`；选择框与文本框 `height: 32px`、圆角 5px、底 `var(--ui-chrome)`、边 `1px solid var(--line-strong)`、focus 边 `--accent` + `0 0 0 3px var(--ring)`；滑杆与复选框 `accent-color: var(--accent)`（`app.css:953-1025`）。
主题卡：`.doc-card` `border: 1px solid var(--line); border-radius: 8px; background: var(--ui-content)`，hover 边框 `--line-strong`，选中 `border-color: var(--accent)` + `box-shadow: 0 0 0 2px var(--accent-soft)`；缩略图高 `78px`；`.doc-dot` `13×13px`、圆角 `4px`、边 `--line-strong`、底为 `readVar('--paper')`；`.doc-star` `20×20px`、圆角 `5px`、默认 `opacity: 0`，hover 卡片时浮现（注释：「避免常驻的视觉噪音」，`app.css:1166`）；选中勾 `14px`、色 `--accent`（`settings.js:187-235`、`app.css:1040-1214`）。

### 7.8 空状态 `.empty-state` / `.empty-art`
`index.html:61-69`：`.empty-art`（44px `book-open` 图标）＋ `.empty-title`「还没有打开文档」＋ `.empty-sub`「打开一个 Markdown 文件开始阅读，或直接把文件拖进窗口」＋ `.empty-keys`（两组 `kbd`：`Ctrl`+`O` 打开、`Ctrl`+`,` 设置）。
视觉：绝对铺满 `inset: 0`，`background: var(--ui-content)`，垂直水平居中，`gap: 10px; padding: 24px; text-align: center`；插画 `color: var(--fg-3); opacity: 0.4; margin-bottom: 6px`（**极淡的线性插画**）；标题 `16px/600/--fg-2`；副标题 `13px/--fg-3`；键位提示 `gap: 18px; margin-top: 10px; font-size: 12px`（`app.css:746-780,814-826`）。`kbd`：`min-width: 20px; padding: 2px 6px; border: 1px solid var(--line-strong); border-bottom-width: 2px; border-radius: 4px; background: var(--ui-chrome); font-size: 11px; line-height: 1.4; text-align: center; color: var(--fg-2)`（`app.css:828-841`）。

### 7.9 拖放提示层 `.drop-hint`
`index.html:100-102`：整屏 + 一句「松手即可打开」。`position: fixed; inset: 0; z-index: 95`；底色 `color-mix(in srgb, var(--accent) 7%, transparent)`；`backdrop-filter: blur(5px) saturate(140%)`；`font-size: 14px; font-weight: 600; pointer-events: none`；由 `body.is-dropping` 显示（`app.css:786-812`）。提示胶囊：`padding: 7px 16px; border-radius: 999px; background: var(--ui-chrome); box-shadow: var(--shadow-md)`。
**刻意不画虚线边框**——`app.css:783-784` 注释：「那一圈 dash 会在正文边缘凭空加一条线，比提示本身还抢眼。」**做资产时不要给拖放态加 dashed 描边。**

### 7.10 提示块 callout（`:::note` 语法）
来源：标记由 `markdown/index.js:44-50` 的 `CALLOUTS` 生成 5 类 —— `note` 说明、`tip` 提示、`important` 重要、`warning` 注意、`caution` 警告；DOM 为 `.mr-callout > .mr-callout-title(.mr-callout-icon + .mr-callout-label) + .mr-callout-body`（`index.js:117-120`）。
样式（`zh-optimize.css:261-288`）：`margin-block: 1.3em; padding: 0.9em 1.1em; border-inline-start: 4px solid var(--mr-callout-color); border-radius: 6px; background: color-mix(... 8%, transparent)`；标题 `display: flex; gap: 0.5em; font-weight: 600; margin-bottom: 0.4em`，**只有标题着色，正文保持正常色**（注释：「否则整段字都会变色」）。
语义色映射（`zh-optimize.css:284-288` → `app.css:39-43,134-138`）：note `#0969da`/`#4493f8`、tip `#1a7f37`/`#3fb950`、important `#8250df`/`#ab7df8`、warning `#9a6700`/`#d29922`、caution `#cf222e`/`#f85149`。
> ⚠️ **级联观察**：`theme.css:507-513` 用同特异性选择器 `.markdown-body .mr-callout` 再设 `background: var(--accent-weak)`、`border-inline-start-color: var(--accent)`、`.mr-callout-title { color: var(--accent) }`。按 `main.js:8-11` 的 import 顺序（app → zh-optimize → theme → print），`theme.css` 位于 `zh-optimize.css` 之后，**同名属性以 theme 的文档强调色生效**，`--c-*` 语义色在正文预览中被覆盖（仍保留于令牌层与打印变量中）。资产若画 callout，建议按「主题强调色的 12% 淡底 + 同色 4px 左条」呈现，而非固定 5 色。
- `.mr-callout-icon` 是空 span（无图标内容，`index.js:118`），5 类 callout 目前**不使用图标**。

### 7.11 表格
结构：`enhance.js:40-48` 把每张 `table` 包进 `.mr-table-wrap`。视觉：`width: 100%; table-layout: auto; border-collapse: collapse; margin-block: 1.3em; font-size: 0.95em`；单元格 `padding: 0.6em 0.85em; border: 1px solid color-mix(currentColor 18%, transparent); line-height: 1.7`；表头 `font-weight: 600; white-space: nowrap`。主题层再加：边框色 `var(--rule)`；表头底 `color-mix(ink 8%)`；偶数行 `color-mix(ink 4%)`；行 hover `var(--accent-weak)`（`theme.css:394-413`）。横向滚动常显（`scrollbar-width: thin`）。

### 7.12 代码块
结构：`index.js:70` 输出 `<pre class="mr-code" data-lang="…"><code class="hljs">…`；`enhance.js:51-89` 追加语言标签 `.mr-code-lang` 与复制按钮 `.mr-copy`（`icon('copy', 13)` + 文字「复制」）。视觉：`pre` 底 `var(--code-bg)`、边 `1px solid var(--code-rule)`、文字 `var(--ink)`、`line-height: 1.65`、`padding: 1em 1.15em`、`overflow: auto`、`position: relative`；语言标签 `top: 0.45em; inset-inline-start: 0.8em; font-size: 0.75em; opacity: 0.5`；复制按钮 `top/right: 8px; padding: 4px 9px; font-size: 11.5px; border: 1px solid color-mix(currentColor 18%); border-radius: 6px; background: color-mix(currentColor 7%); opacity: 0` → hover 代码块或按钮聚焦时 `opacity: 1`，点击后 `.is-done` 变 `var(--ok)` 并显示「已复制」1.6s（`zh-optimize.css:341-388`、`enhance.js:72-86`）。
行内代码：`background-color: var(--code-inline-bg); color: var(--code-inline-ink); padding: 0.2em 0.4em; border-radius: 4px`。
语法着色仅 6 个变量，映射见 `theme.css:443-486`（keyword/literal/name → `--syn-key`；string/regexp/addition → `--syn-str`；number/symbol/bullet → `--syn-num`；title/section/built_in → `--syn-fn`；comment/quote/meta/deletion → `--syn-cmt` + `font-style: italic`；variable/attr/property/type/params → `--syn-var`）。

### 7.13 脚注
`.footnotes { margin-top: 3em; padding-top: 1em; font-size: 0.92em; border-top-color: var(--rule); color: var(--ink-soft) }`（`zh-optimize.css:248-252`、`theme.css:493-496`）；`.footnote-ref { border-bottom: none; padding: 0 0.15em }`，引用链接颜色 `var(--accent)`（`theme.css:498-500`）。列表标记色 `var(--ink-soft)`（`theme.css:489-491`）。

### 7.14 任务列表
`.markdown-body input[type='checkbox'] { accent-color: var(--accent) }`（主题层，`theme.css:502-504`）；中文层：`.markdown-body input[type="checkbox"] { margin-inline-end: 0.5em; vertical-align: -0.1em; accent-color: currentColor; width: 1em; height: 1em }`，且 `li:has(> input[type="checkbox"]) { list-style: none; padding-inline-start: 0 }`（`zh-optimize.css:124-135`）。**方块复选框为原生控件，由 `accent-color` 驱动，无自定义图形。**

### 7.15 编辑器（编辑/分栏视图，非文档层但影响整套观感）
CodeMirror 6，主题内联于 `editor.js:19-51`：浅色 `fg #1f2328 / bg #ffffff / 选区 rgba(9,105,218,0.20) / 光标 #0969da / 行号 #818b98 / 当前行 rgba(31,35,40,0.045) / 行号栏右边框 #e4e8ed / tooltip 边 #d0d7de`；深色 `fg #e6edf3 / bg #0d1117 / 选区 rgba(56,139,253,0.35) / 光标 #4493f8 / 行号 #6e7681 / 当前行 rgba(255,255,255,0.04) / 行号栏右边框 #21262d / tooltip 边 #30363d`；光标粗 `2px`；语法着色 12 组（`editor.js:54-83`，浅色 keyword `#cf222e`、string `#0a3069`、comment `#6e7781`、name `#0550ae`、number `#953800`、heading `#8250df`、link `#0969da`；深色 keyword `#ff7b72`、string `#a5d6ff`、comment `#8b949e`、name `#79c0ff`、number `#ffa657`、heading `#d2a8ff`、link `#a5d6ff`；invalid `#f85149`）。
> 注意：**编辑器的代码配色是独立的一套（GitHub 风格），与文档层 `--syn-*` 不同源**。这印证了「文档层不暴露程序员配色」——只有用户主动切到编辑视图时才会看到代码着色。资产若表现「编辑态」，可用这里的冷色；表现「阅读态」，必须用 `--syn-*` 暖色系。

### 7.16 滚动条
`::-webkit-scrollbar { width: 11px; height: 11px }`；轨道透明；滑块 `background: color-mix(in srgb, var(--fg) 20%, transparent)`、`border: 3px solid transparent`、`background-clip: content-box`、`border-radius: 8px`；hover 加深为 `color-mix(in srgb, var(--fg) 34%, transparent)`；侧栏/主题网格/抽屉内滑块边框收窄为 `2px`（`app.css:1339-1364`）。

### 7.17 视图模式（决定资产里出现哪种界面）
三档：`read`（默认，`store.js:11`；隐藏编辑器与分隔条，预览占满，`padding-top: 56px`）、`split`（两栏 `flex: 1 1 0` 平分）、`edit`（编辑器占满，预览隐藏）。类名 `.is-read / .is-split / .is-edit` 挂在 `.workspace` 上（`app.css:488-498,649-660`；`main.js:411-421`）。快捷键 `Ctrl+1/2/3`（`main.js:504-509`）。

---

## 8. 气质关键词（13 个，逐个附源码依据）

| # | 关键词 | 依据 |
|---|---|---|
| 1 | **阅读优先** | `app.css:4`「设计取向：阅读优先。界面尽量退到背景里，让文档本身成为主角。」默认 `viewMode: 'read'`（`store.js:11`）。 |
| 2 | **非程序员审美** | `theme.css:7-9`、`settings.js:13-15`、`doc-themes.js:5-6` 三处明示；全仓不存在「代码配色」选择项，语法色仅有 6 个 `--syn-*`（`theme.css:41`）。 |
| 3 | **纸与墨** | 文档层令牌以 `--paper` / `--ink` / `--rule` 命名（`theme.css:15-20`）；`.pane-preview { background: var(--paper) }` 铺满整屏——`theme.css:342-345`「真正的『纸』是预览区，正文只是纸上排的字」。 |
| 4 | **暖调克制** | 6 款浅色主题的纸面全部为暖白/微黄（`#ffffff`→`#fdf5f6`→`#f6f1e7`→`#fbf7ec`），强调色为赭/朱/豆绿（`#8a5524`/`#b04a30`/`#4d7d45`）；`doc-themes.js:5`「刻意避开任何『代码/终端/开发者』意象」。 |
| 5 | **半透明玻璃** | 半透明底 + `blur(20px) saturate(150%)` + 高光内边 + 极淡投影的三件套（`app.css:235-240,261-265`），且布局必须让正文从玻璃下滚过（`app.css:214-217`）。 |
| 6 | **层次清晰** | 界面底色分四层 `#ffffff / #f7f8f9 / #f0f1f3 / #eceef0`；`app.css:13`「界面层：比内容层略暗，明确区分『工具』与『内容』」；侧栏/抽屉一律带方向性投影拉开层次（`app.css:513-515,916-921`）。 |
| 7 | **安静** | 星标默认 `opacity: 0` 只在 hover 浮现（`app.css:1166,1181`）；复制按钮默认透明（`zh-optimize.css:371`）；标题锚点默认 `opacity: 0.22`（`zh-optimize.css:76`）。 |
| 8 | **中文长文友好** | 行高默认 `1.9`（`store.js:13`）、字距 `0.02em`（`zh-optimize.css:32`）、`text-spacing-trim: space-first`（`38`）、列表缩进 `2em`（`111`）、`text-align: justify`（`97`）；设置面板提示「中文正文建议 16–18px」「1.8–2.0 最舒适」（`settings.js:300,308`）。 |
| 9 | **12 款一套一色系** | `doc-themes.js:8-9`「一款主题 = 一整套文档视觉」；`theme.css:10-12` 中间色一律从纸面与正文色派生，避免「一半新配色一半旧配色」。 |
| 10 | **克制动效** | 全部过渡集中在 `0.1s–0.26s`，只有一条自定义曲线 `cubic-bezier(0.32, 0.72, 0, 1)`（`app.css:885,899,923`）；tooltip 还带 `0.35s` 延迟防误触（`app.css:435`）。 |
| 11 | **细腻描边** | 界面分隔全用 `--line`（浅色 `rgba(31,35,40,0.1)`）；图标描边从 Lucide 的 `2` 收细到 `1.75`（`app.css:209`）；h2 底线在中文层再减淡到 `currentColor 16%`（`zh-optimize.css:66`）。 |
| 12 | **边调边看** | `settings.js:4-5`「刻意不用全屏模态框 —— 设置的意义是『边调边看』」；抽屉 `z-index: 100` 压在正文之上，正文排版与滚动位置不动（`app.css:903-905`）。 |
| 13 | **自足离线** | 图标构建期内联、零网络请求（`icons.js:3-4`）；字体本地打包（`fonts.js:20-29`），完整字符集不作子集化妥协（`README.md:106-108`）。 |

### 对美术资产的三条落地约束（由以上推导）

1. **底色只用「纸」**：浅色资产底色取 12 款主题的 `--paper`（`#ffffff`–`#fdf5f6`–`#f6f1e7`–`#fbf7ec`），深色取 `#181b21`/`#101013`/`#1c1713`/`#131822`/`#161c18`/`#111a1c`；**不要出现纯黑 `#000` 或冷白 `#f8f9fa` 这类界面灰作为主体**（界面灰只用于工具栏层）。
2. **强调色跟随主题，不做全局品牌色**：文档层强调色是暖色（`#8a5524` / `#b04a30` / `#b8556e` / `#4d7d45` / `#96702a` 或深色的 `#8fa8d8` / `#d9a35c` / `#78b8b4`）；界面 `#4f46e5` 只属于工具层，不应进入文档画面。
3. **代码块必须与纸面同色系**：底色 = 主题自己的 `--code-bg`（如素白 `#f7f8fa`、宣纸 `#f2ebdc`、夜阑 `#1d2129`），边框 = `--code-rule`，着色 = 6 个 `--syn-*` 暖/自然色相；**禁止深色 IDE 式面板与霓虹高亮**——这正是 `theme.css:7-9` 要排除的「程序员审美」。

---

## 附：与 README 不一致之处（README 为早期版本，勿作规范）

| README 说法 | 位置 | 源码实际 |
|---|---|---|
| 毛玻璃参数 `blur(22px) saturate(180%)` | `README.md:61` | 顶栏/状态栏/抽屉的 `--glass-blur` 为 `blur(20px) saturate(150%)`（`app.css:81`）；状态栏 `blur(18px) saturate(150%)`、抽屉 `blur(24px) saturate(160%)` |
| 不透明度「浅色 0.80 / 深色 0.76」 | `README.md:62` | `--glass-bg` 浅色 `0.62` / 深色 `0.68`；`--glass-panel` 浅色 `0.72` / 深色 `0.78`（`app.css:72,76,145,146`） |
| 「顶栏/状态栏/大纲侧栏/设置抽屉都用了 `backdrop-filter`」 | `README.md:56` | 侧栏无 `backdrop-filter`，底色不透明 `var(--ui-chrome)`（`app.css:511`） |
| 「82 套代码主题」为主题卖点 | `README.md:64-73` | 已移除：`src/lib/themes.js` 不存在；`settings.js:13-15` 明确「这里没有代码配色这种东西」 |
| 「抽屉展开时顶栏、工作区、状态栏一起收窄」 | `README.md:52` | 现行抽屉为浮层，正文不动（`app.css:903-905`） |

**未在源码中找到的规格**：`.markdown-body h1–h6` 的字号声明（无 github-markdown-css 引入）；`--drawer-w` 的实际赋值；`--glass-tint` 的定义；`outlineWidth` 设置项的应用点。
