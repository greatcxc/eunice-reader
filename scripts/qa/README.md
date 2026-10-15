# 设置面板目检工具

在没有 Rust 工具链、也没有打包版 exe 的情况下，用来**在真实浏览器渲染里目检设置面板**
（以及整窗界面）。开发过程中它抓到了两个肉眼容易漏的问题：

1. 主题网格在 flex 列里退化成单列（`auto-fill` 的轨道数被最大内容宽度压住）；
2. `el()` 用 `Object.assign` 设 `<select>.value` 时 option 还没挂上，
   导致「界面透明度」整个下拉框被静默丢掉 —— 不看图根本发现不了。

它还量过一件只有截图能发现的事：主题页签一换行，「★ 收藏」就孤零零掉到第二行，
看上去像排版事故 —— 于是有了 `chipW` 这类尺寸断言。

## 为什么需要单独一个页面

设置抽屉平时要点按钮或按 `Ctrl+,` 才打开，headless 截图拿不到。
本工具直接 `import` 真实的 `src/ui/settings.js` 与 `src/styles/*.css`，
用真实源码渲染，不复制任何样式，因此**看到的即是应用里的样子**。

抽屉（`renderSettings`）与高级模态（`renderAdvanced`）是两个导出、两个容器，
本页两只都渲染：`?adv=1` 打开高级模态，不加就是抽屉本身。

## 用法

两个文件都需要能被 Vite 以 `/xxx.html` 访问到，所以先复制到**项目根目录**
（Vite 只从 root 提供 HTML，放 `dist/` 里会被 SPA fallback 掉）：

```powershell
Copy-Item scripts\qa\settings-harness.html qa-harness.html
Copy-Item scripts\qa\seed-storage.html  qa-seed.html
npm run dev        # 端口 5183
```

先用 seed 页写 localStorage（这一步单独做，是因为 harness 若自己做
`location.replace` 会让 headless 截图停在旧页面上，拍出重复的图）：

```powershell
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
$prof = Join-Path $env:TEMP 'edge-qa'
cmd /c "`"$edge`" --headless=new --disable-gpu-sandbox --user-data-dir=`"$prof`" --virtual-time-budget=3000 --dump-dom `"http://127.0.0.1:5183/qa-seed.html`" > nul 2>nul"
```

然后截图（同一 profile，带 `seeded=1` 跳过重定向）：

```powershell
$base = 'http://127.0.0.1:5183/qa-harness.html?seeded=1'
cmd /c "`"$edge`" --headless=new --disable-gpu-sandbox --user-data-dir=`"$prof`" --force-device-scale-factor=1 --window-size=1000,980 --virtual-time-budget=8000 --screenshot=`"shot.png`" `"$base&scroll=430`" >nul 2>nul"
```

## 查询参数

| 参数 | 作用 |
|---|---|
| `seeded=1` | 跳过 seed 重定向（配合已写过 localStorage 的 profile 使用） |
| `recent=1` | 首次运行：写入示例「最近打开」条目后重定向 |
| `dark=1` | 切到深色界面，验证深色底与对比度 |
| `locale=en-US` | 强制界面语言（同时重刷静态文案，否则页脚还是中文） |
| `adv=1` | 打开高级设置模态（两级结构的第二级） |
| `ascroll=N` | 滚动高级模态正文到 N 像素处 |
| `scroll=N` | 滚动抽屉正文到 N 像素处 |
| `fgrid=N` | 滚动字体网格内部（11 套预设超出一屏，新字体在下面） |
| `tile=N` | 点第 N 个主题色块（验证大样板与色板跟着换） |
| `probe=1` | 把实测尺寸写进 `<title>`，用 `--dump-dom` 读回来做布局断言 |

`probe=1` 的断言字段包括抽屉宽度、大样板/衬底/纸面尺寸、色板点数、色块数量与
列数、页脚高度、分区数与标题、行数、勾选框状态、下拉当前值、最近文件条数、
高级模态宽度与其五个分区、以及缩放系数。这些字段用来防住几件**只有量出来才知道**
的事：主题页签换行、色板掉点、页脚被内容挤出视口、`role=button` 之类被静默丢控件。

---

## 第二个：阅读区缩放（reading-harness.html → qa-read.html）

只驱动真实的 `src/styles/app.css` + 主题 CSS，量「字号 × 缩放系数」这件事：
字体、行高、行宽、内边距、标题/代码块/表格字号、编辑区字号是否**同倍**变化。

```powershell
Copy-Item scripts\qa\reading-harness.html qa-read.html
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
$prof = Join-Path $env:TEMP 'edge-qa'
cmd /c "`"$edge`" --headless=new --disable-gpu-sandbox --user-data-dir=`"$prof`" --window-size=1600,1000 --virtual-time-budget=4000 --dump-dom `"http://127.0.0.1:5183/qa-read.html?zoom=1.5&probe=1`" 2>nul"
```

| 参数 | 作用 |
|---|---|
| `zoom=1.5` | 缩放系数（1 / 1.5 / 2 …） |
| `split=1` | 显示编辑区，验证它的字号也吃同一个系数 |
| `dark=1` | 深色界面 |
| `probe=1` | 把实测值写进 `<title>`：`fontSize / lineHeight / maxWidth / padTop / h1 / code / table / editor`，以及 `chars`（每行能放多少字号） |

**怎么算通过**：`chars` 在不同 zoom 下应当基本相同（窗口够宽时），
即「每行字数不变、整块版面等比放大」；`fontSize` 应当正好是 `16 × zoom`。

---

## 第三个：整个外壳（shell-harness.html → qa-shell.html）

在**纯浏览器**里跑真实的 `src/main.js`：脚本先装好一个假的 Tauri 桥
（`read_text_file` 返回几份写死的文档、窗口 API 返回 null），再取 `index.html` 的 body
结构注入页面，最后 `import('/src/main.js')`。于是标签、分栏、zen、拖放提示这些
交互都能在无头浏览器里驱动与断言 —— **不需要启动真实窗口**（那会抢焦点、打断用电脑的人）。

```powershell
Copy-Item scripts\qa\shell-harness.html qa-shell.html
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
$prof = Join-Path $env:TEMP 'edge-qa-shell'
cmd /c "`"$edge`" --headless=new --disable-gpu-sandbox --user-data-dir=`"$prof`" --window-size=1440,900 --virtual-time-budget=12000 --dump-dom `"http://127.0.0.1:5183/qa-shell.html?qa=1&probe=1&state=split`" 2>nul"
```

`qa=1` 是必须的：入口只在带这个参数时才把内部动作挂到 `window.__mr` 上。

| 参数 | 作用 |
|---|---|
| `state=tabs` | 同一栏开三个标签（验证 H1 取名与前 N 字回退） |
| `state=split` | 右 1/4 分栏 + 往那一栏再开一个标签 |
| `state=split-left` | 左 1/4 分栏（新栏应当出现在左边） |
| `state=zen` | 进入 zen 并模拟鼠标停在顶边 |
| `state=drop&zone=left\|tab\|right` | 拖放三档落点提示 |
| `state=edit` | 编辑视图：验证每个分组各自的 CodeMirror 实例、切标签换正文 |
| `state=click` | 走真实点击路径（点标签 / 点 × / 点 +） |
| `state=shot&shot=tabs\|split\|zen` | README 用截图：读**真实**的 `samples/*.md` 渲染 |
| `state=drop` | 画出落点提示并按坐标命中（验证「提示」与「判定」同源） |
| `state=filedrop` | 模拟完整原生拖入：`enter → over → drop`，走 `handleNativeDrag`（Tauri 回调里那个 payload） |
| `state=tabdrop` | 标签拖动松手：直接调 `applyDrop`（搬运标签的纯逻辑） |
| `state=tabdrag` | 派发真实 `DragEvent`：连 `bindTabDrag` 与 window 上的 dragover/drop 接线一起验 |
| `panes=2\|3` | 拖放前先摆好 2 / 3 栏 |
| `pane=N&zone=left\|mid\|right` | 落点瞄准第 N 栏的哪一档（坐标由该档矩形中心反推） |
| `kind=file\|tab` | 拖的是文件还是标签（决定文案与 origin 高亮） |
| `from=N` | 标签拖动的源栏 |
| `tabs=2` | 源栏先开两个标签（验证「同栏两标签 → 分栏」） |
| `paths=a.md;b.md` | `filedrop` 一次拖入多个文件 |
| `real=1` | 拖放场景改用真实样例文档（README 截图用） |
| `badge=1` | 左下角钉一条实时状态（查询参数 / 命中档位 / 胶囊文本与矩形） |
| `state=empty` | 空状态 |
| `locale=auto\|zh-CN\|en-US` | 强制界面语言（`auto` 走 `navigator.language`） |
| `glass=0\|1` | 全屏毛玻璃开关（切换界面底色的半透明度） |
| `behind=1` | 在页面背后画一块彩色「桌面」，用来**看见**玻璃透出来的是什么 |
| `settings=1` | 打开设置抽屉（点真实按钮），用来核对英文界面下的面板 |
| `adv=1` | 再点真实的「高级设置」入口，走完整入口链路 |
| `esc=1` | 按一次 Esc：应当只关高级模态，抽屉留着（验证 Esc 的层级顺序） |
| `closetab=1\|active` | 关第一个 / 关当前标签 |
| `probe=1` | 把分组数、每栏标签数、标签名、布局令牌、拖放高亮、cm 实例数等写进 `<title>` |

`probe=1` 还会量阅读区的几何（`pvRect` / `paneRect` / `pvFont`）——
正文第一行如果落在标签条底下，这里是唯一能看出来的地方；
语言与窗口相关的字段有 `locale` / `lang` / `emptyTitle` / `secTitles` / `winButtons` /
`resizeZones` / `dragRegion` / `windowGlass` / `paperAlpha`。
设置的两级结构有 `drawerOpen` / `footH` / `advEntry` / `advOpen` / `advSecTitles` /
`advModalW` / `themeTiles` / `themeSwatches` / `themePageH`。

**设置的分级怎么验**（一次跑三种状态即可）：

```powershell
$base = 'http://127.0.0.1:5183/qa-shell.html?qa=1&probe=1&state=split'
foreach ($extra in '&settings=1', '&settings=1&adv=1', '&settings=1&adv=1&esc=1') {
  cmd /c "`"$edge`" --headless=new --disable-gpu-sandbox --user-data-dir=`"$prof`" --window-size=1440,900 --virtual-time-budget=12000 --dump-dom `"$base$extra`" 2>nul"
}
```

应当依次得到：`drawerOpen=true & advOpen=false`、`drawerOpen=true & advOpen=true`、
Esc 之后 `drawerOpen=true & advOpen=false` —— 最后一条是重点，
一次 Esc 把两层一起收掉是很容易犯的错。

**拖放与分栏怎么验**（落点提示有一个必须守住的不变式：它只铺内容区，
且每张卡片与它对应的那一栏重合）：

```powershell
$base = 'http://127.0.0.1:5183/qa-shell.html?qa=1&probe=1&locale=zh-CN'
# 1 栏 / 2 栏 / 3 栏 / 窄窗 各看一遍提示画成了几张卡、几档
cmd /c "`"$edge`" ... --dump-dom `"$base&state=drop&kind=file&pane=0&zone=right`""
cmd /c "`"$edge`" ... --dump-dom `"$base&state=drop&kind=file&panes=2&pane=1&zone=mid`""
cmd /c "`"$edge`" ... --dump-dom `"$base&state=drop&kind=file&panes=3&pane=0&zone=mid`""
cmd /c "`"$edge`" ... --window-size=800,700 --dump-dom `"$base&state=drop&kind=file&pane=0&zone=mid`""
# 松手之后到底发生了什么
cmd /c "`"$edge`" ... --dump-dom `"$base&state=tabdrop&tabs=2&pane=0&zone=left`""
cmd /c "`"$edge`" ... --dump-dom `"$base&state=tabdrag&tabs=2&pane=0&zone=right`""
```

要点：`dzOverBar` / `dzOverSide` / `dzOverStatus` 必须是 `0`（提示层不许盖住顶栏、
大纲侧栏、状态栏），`dzAlignPanes` 必须是 `true`（每张卡片横向正好覆盖它那一栏），
三栏或窄窗时 `dzZones` 里不应再出现左右档。
`state=drop` 的坐标是从**已渲染的档位矩形中心**反推的 —— 所以「命中判定」与
「画面」一旦不同源，`hit` 立刻会对不上，这正是这条断言的价值。

**玻璃效果怎么验**：`behind=1` 画彩色底，`glass=1|0` 各截一张，
再用像素平均值对比（同一区域 `R≈226` vs `R≈253`）。
肉眼看两张截图差异很小是正常的 —— 纸面只放 16% 的背景进来，
**这正是「隐约看到色块、但字仍然清晰」的取舍**。

## 注意

- 这是**开发工具**，不进产物：复制到根目录用完请删掉，别提交。
- 只读渲染，不会写项目文件；localStorage 写在临时浏览器 profile 里。
- 深色/滚动等参数都由页面内 JS 应用（不是服务端渲染），
  因此截图必须带 `--virtual-time-budget` 留出执行时间。
- `.ps1` 文件带 UTF-8 BOM：PowerShell 5.1 读没有 BOM 的脚本会按 ANSI 解码，中文会变乱码。
