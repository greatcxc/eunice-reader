# 设置面板目检工具

在没有 Rust 工具链、也没有打包版 exe 的情况下，用来**在真实浏览器渲染里目检设置面板**
（以及整窗界面）。开发过程中它抓到了两个肉眼容易漏的问题：

1. 主题网格在 flex 列里退化成单列（`auto-fill` 的轨道数被最大内容宽度压住）；
2. `el()` 用 `Object.assign` 设 `<select>.value` 时 option 还没挂上，
   导致「界面透明度」整个下拉框被静默丢掉 —— 不看图根本发现不了。

## 为什么需要单独一个页面

设置抽屉平时要点按钮或按 `Ctrl+,` 才打开，headless 截图拿不到。
本工具直接 `import` 真实的 `src/ui/settings.js` 与 `src/styles/*.css`，
用真实源码渲染，不复制任何样式，因此**看到的即是应用里的样子**。

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
| `scroll=N` | 滚动抽屉正文到 N 像素处 |
| `fgrid=N` | 滚动字体网格内部（11 套预设超出一屏，新字体在下面） |
| `probe=1` | 把实测尺寸写进 `<title>`，用 `--dump-dom` 读回来做布局断言 |

`probe=1` 的断言字段包括抽屉宽度、主题网格轨道数、卡片宽度、滑杆填充百分比、
勾选框尺寸、页签选中底色、分区数、行数、勾选框状态、下拉当前值、最近文件条数、
以及「最近打开」是否置顶、固定条数、缩放系数。

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
| `state=left-layout` | 左侧标签布局 |
| `state=zen` | 进入 zen 并模拟鼠标停在顶边 |
| `state=drop&zone=left\|tab\|right` | 拖放三档落点提示 |
| `state=edit` | 编辑视图：验证每个分组各自的 CodeMirror 实例、切标签换正文 |
| `state=click` | 走真实点击路径（点标签 / 点 × / 点 +） |
| `state=empty` | 空状态 |
| `layout=top\|left` | 强制标签布局（否则会沿用上一次留在 localStorage 里的值） |
| `closetab=1\|active` | 关第一个 / 关当前标签 |
| `probe=1` | 把分组数、每栏标签数、标签名、布局令牌、拖放高亮、cm 实例数等写进 `<title>` |

`probe=1` 还会量阅读区的几何（`pvRect` / `paneRect` / `pvFont`）——
正文第一行如果落在标签条底下，这里是唯一能看出来的地方。

## 注意

- 这是**开发工具**，不进产物：复制到根目录用完请删掉，别提交。
- 只读渲染，不会写项目文件；localStorage 写在临时浏览器 profile 里。
- 深色/滚动等参数都由页面内 JS 应用（不是服务端渲染），
  因此截图必须带 `--virtual-time-budget` 留出执行时间。
- `.ps1` 文件带 UTF-8 BOM：PowerShell 5.1 读没有 BOM 的脚本会按 ANSI 解码，中文会变乱码。
