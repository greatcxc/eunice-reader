# 构建环境侦察报告 — Eunice Reader

- **任务**：task-2「探察构建环境：Rust/Tauri 工具链与完整构建可行性」
- **执行人**：build-recon（只读侦察，未执行任何安装/编译命令）
- **侦察时间**：2026-10-14 10:00 – 10:12 (Asia/Hong_Kong)
- **仓库根目录**：`D:\Eunice-Reader`
- **结论一句话**：**本机现在不能**执行 `npm run tauri:build`。唯一缺失项是 **Rust 工具链（rustup / cargo / rustc）**；WebView2、MSVC、Windows SDK、Node、前端依赖全部已就绪，补齐 Rust 后即可完整构建。
- **2026-10-16 复核**：Rust 已补齐，`npm run tauri:build` **实测成功**，产物
  `src-tauri/target/release/bundle/nsis/Eunice Reader_1.2.3_x64-setup.exe`（59.33 MB，
  SHA256 `3DC8133B…225214`）。详见文末「9. 复核记录」。

---

## 0. 结论摘要

| 检查项 | 状态 | 证据类型 |
|---|---|---|
| Rust（cargo/rustc/rustup） | ❌ **完全不存在**（2026-10-16 已补齐：cargo/rustc 1.99.0） | 实测（全盘扫描 + `tauri info`） |
| WebView2 Runtime | ✅ 155.0.4283.45 | 实测（注册表 + 文件 + `tauri info`） |
| MSVC C++ 工具链（cl.exe/link.exe） | ✅ VS 2022 Community 17.6.4，MSVC 14.34/14.36 | 实测（vswhere + 文件） |
| Windows SDK | ✅ 10.0.20348.0 / 10.0.22000.0 | 实测（注册表 + 文件树） |
| Node / npm | ✅ v22.19.0 / 10.9.3 | 实测 |
| 前端依赖 node_modules | ✅ 完整（`npm ls --depth=0` 退出码 0） | 实测 |
| Tauri CLI | ✅ 2.12.2，可正常执行 | 实测（`--version` 退出码 0） |
| Python | ✅ 3.10.6 | 实测 |
| Python 第三方依赖 fontTools / brotli | ❌ 未安装 | 实测（`import` 退出码 1） |
| 磁盘空间 | ✅ C: 319.4 GB 空闲，D: 242.8 GB 空闲 | 实测 |
| NSIS 打包工具 | ⚠️ 未缓存，但首次构建会自动下载（源站可达） | 实测 + 推断 |
| 代理环境变量（cargo/rustup 用） | ✅ 全部未设置，无 `~/.cargo/config` | 实测 |

**能否完整构建 `npm run tauri:build`：不能（缺少 Rust 工具链）。**
> 2026-10-16 复核：**现在可以**，且已实测产出安装包。见文末「9. 复核记录」。

---

## 1. 侦察纪律说明

本次任务为**只读侦察**，全程遵守以下约束，未执行：

- ❌ `npm install` / `npm ci`
- ❌ `npm run build` / `npm run tauri:build` / `cargo build`
- ❌ 任何写入 `src-tauri/target` 的编译
- ❌ 任何注册表写入（仅做 HKLM/HKCU 只读查询）
- ❌ 未请求沙箱提权

**唯一写入的文件**：`docs/build-env-report.md`（本文件）。未修改 `package.json`、`.npmrc`、`tauri.conf.json`、`src/` 下任何文件。

**关于 `dist/` 的说明**：侦察过程中（10:04:40）`dist/` 目录由**其他成员**产出。我**没有**执行 `npm run build`；我只是观察到了该产物并对其运行了只读校验脚本。所有涉及 `dist/` 的结论均基于**观察到的既存产物**，而非我自己的构建动作。

---

## 2. 逐项实测结果

### 2.1 Rust 工具链：不存在（这是唯一的缺失项）

#### 实测 A — PATH 查找

```powershell
foreach($n in @('cargo','rustc','rustup','cargo.exe','rustc.exe')){
  $c = Get-Command $n -ErrorAction SilentlyContinue
  if($c){ "FOUND  $n -> $($c.Source)" } else { "MISS   $n" }
}
```

真实输出：

```
MISS   cargo
MISS   rustc
MISS   rustup
MISS   cargo.exe
MISS   rustc.exe
```

#### 实测 B — Rust 相关环境变量

```powershell
foreach($v in @('CARGO_HOME','RUSTUP_HOME','RUSTUP_TOOLCHAIN','RUSTC','CARGO')){ ... }
```

真实输出：

```
UNSET  CARGO_HOME
UNSET  RUSTUP_HOME
UNSET  RUSTUP_TOOLCHAIN
UNSET  RUSTC
UNSET  CARGO
```

#### 实测 C — 全盘扫描（**最有力的一条证据**）

```powershell
$found=@()
foreach($r in @('C:\','D:\')){
  foreach($n in @('cargo.exe','rustc.exe','rustup.exe')){
    Get-ChildItem -LiteralPath $r -Filter $n -Recurse -File -Force -ErrorAction SilentlyContinue |
      ForEach-Object { $found += $_.FullName }
  }
}
if($found.Count -eq 0){ "RESULT: 0 hits across entire C:\ and D:\" } else { $found | Sort-Object -Unique }
```

真实输出：

```
=== FULL-DRIVE search: C:\ and D:\ for cargo.exe / rustc.exe / rustup.exe (all depths) ===
RESULT: 0 hits across entire C:\ and D:\
=== done ===
```

> 说明：第一次尝试时我误用了 `-Include`（在无通配符路径下被忽略，导致返回了全部文件而非目标文件）；上表是改用 `-Filter`（文件系统级过滤）后的**正确结果**，并已扩展到 C:\ 与 D:\ 全盘、无深度限制。

#### 实测 D — 常见非标准安装位置逐一确认

探测了 17 个候选路径（scoop / Chocolatey / winget Links / MSYS2 / Program Files / D: 盘等）：

```powershell
$cands = @(
 'C:\Users\great\.cargo\bin\cargo.exe',
 'C:\Users\great\.rustup',
 'C:\Program Files\Rust\bin\cargo.exe',
 'C:\Users\great\scoop\shims\cargo.exe',
 'C:\Users\great\scoop\apps\rustup\current\cargo\bin\cargo.exe',
 'C:\ProgramData\chocolatey\bin\cargo.exe',
 'C:\ProgramData\chocolatey\lib\rust\tools\bin\cargo.exe',
 'C:\Users\great\AppData\Local\Microsoft\WinGet\Links\cargo.exe',
 'C:\Users\great\AppData\Local\Programs\rust\bin\cargo.exe',
 'D:\Rust\bin\cargo.exe', 'D:\rust\bin\cargo.exe', 'D:\tools\rust\bin\cargo.exe',
 'D:\cargo\bin\cargo.exe', 'D:\Program Files\Rust\bin\cargo.exe', ...)
```

真实输出（全部 absent）：

```
absent C:\Users\great\.cargo\bin\cargo.exe
absent C:\Users\great\.cargo\bin\rustc.exe
absent C:\Users\great\.rustup
absent C:\Program Files\Rust\bin\cargo.exe
absent C:\Users\great\scoop\shims\cargo.exe
absent C:\Users\great\scoop\apps\rustup\current\cargo\bin\cargo.exe
absent C:\ProgramData\chocolatey\bin\cargo.exe
absent C:\ProgramData\chocolatey\lib\rust\tools\bin\cargo.exe
absent C:\ProgramData\chocolatey\lib\rust-ms\tools\bin\cargo.exe
absent C:\Users\great\AppData\Local\Microsoft\WinGet\Links\cargo.exe
absent C:\Users\great\AppData\Local\Programs\rust\bin\cargo.exe
absent D:\Rust\bin\cargo.exe
absent D:\rust\bin\cargo.exe
absent D:\tools\rust\bin\cargo.exe
absent D:\cargo\bin\cargo.exe
absent D:\Program Files\Rust\bin\cargo.exe
```

工具根目录 / 包管理器根目录：

```
DIR-NO  C:\Users\great\.cargo
DIR-NO  C:\Users\great\.rustup
DIR-NO  C:\Program Files\Rust
DIR-NO  C:\Users\great\scoop
DIR-NO  C:\ProgramData\chocolatey          ← Chocolatey 根本没装
DIR-NO  C:\Users\great\AppData\Local\Microsoft\WinGet\Links
DIR-NO  C:\msys64                          ← MSYS2 根本没装
DIR-YES C:\tools                           ← 只有 nssm，无关
```

#### 实测 E — WSL 情况

```
--- wsl --status ---
Default Distribution: Ubuntu-22.04
Default Version: 2

--- wsl -l -v ---
  NAME            STATE           VERSION
* Ubuntu-22.04    Stopped         2
```

> WSL Ubuntu-22.04 **存在但处于 Stopped**。我**没有**启动 WSL 去检查里面的 rust：启动 WSL 属于有副作用的操作，且即使里面装了 Linux 版 rust，默认也无法产出 Windows MSVC 目标（需要额外装 Windows target + 交叉链接器）。**此条为推断，未实测。**

#### 实测 F — 权威判定：`tauri info`

这是最强证据 —— Tauri 官方 CLI 自己给出的环境诊断（`--help` 列出的命令包含 `info  Show a concise list of information about the environment, Rust, Node.js and their versions`）：

```powershell
node node_modules\@tauri-apps\cli\tauri.js info
```

真实输出：

```
[✘] Environment
    - OS: Windows 10.0.26200 x86_64 (X64)
    ✔ WebView2: 155.0.4283.45
    ✔ MSVC: Visual Studio Community 2022
    ✘ rustc: not installed!
      Maybe you don't have rust installed! Visit https://rustup.rs/
    ✘ Cargo: not installed!
      Maybe you don't have rust installed! Visit https://rustup.rs/
    ⚠ rustup: not installed!
      If you have rust installed some other way, we recommend uninstalling it
      then use rustup instead. Visit https://rustup.rs/
    ⚠ Rust toolchain: couldn't be detected!
      Maybe you don't have rustup installed? if so, Visit https://rustup.rs/
    - node: 22.19.0
    - pnpm: 10.27.0
    - npm: 10.9.3
    - bun: 1.4.2

[-] Packages
    - tauri 🦀: 2.12.3
    - tauri-build 🦀: No version detected
    - wry 🦀: No version detected
    - tao 🦀: No version detected
    - @tauri-apps/api  ⱼₛ: 2.12.3
    - @tauri-apps/cli  ⱼₛ: 2.12.2

[-] Plugins
    - tauri-plugin-dialog 🦀: 2.8.2
    - @tauri-apps/plugin-dialog  ⱼₛ: 2.8.2
    - tauri-plugin-fs 🦀: 2.7.0
    - @tauri-apps/plugin-fs  ⱼₛ: 2.7.0
    - tauri-plugin-single-instance 🦀: 2.5.3
    - tauri-plugin-opener 🦀: 2.7.1
    - @tauri-apps/plugin-opener  ⱼₛ: 2.7.1

[-] App
    - build-type: bundle
    - CSP: default-src 'self'; font-src 'self' data:; img-src 'self' data: asset: http://asset.localhost https:; script-src 'self'; style-src 'self' 'unsafe-inline'
    - frontendDist: ../dist
    - devUrl: http://127.0.0.1:5183/
    - bundler: Vite
```

> 附加收获：机器上除 npm 外还有 **pnpm 10.27.0** 和 **bun 1.4.2**；本项目用 npm（有 `package-lock.json`），无需切换。
>
> `- tauri-build 🦀: No version detected` / `wry` / `tao` 显示不出，是因为没有 cargo 可供 CLI 去解析依赖树，**不代表** `Cargo.toml` 有问题。

---

### 2.2 WebView2 Runtime：已安装 ✅

#### 实测 — 注册表（只读）

```powershell
$k='HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
if(Test-Path $k){ $p = Get-ItemProperty $k; "pv = $($p.pv)"; "name = $($p.name)" }
```

真实输出：

```
KEY-EXISTS HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}
   pv = 155.0.4283.45
   name = Microsoft Edge WebView2 Runtime
```

同键下其他 clients（旁证）：

```
   {1FAB8CFE-...}  name='Microsoft Bing Service Update'  pv='2.0.0.34'
   {56EB18F8-...}  name='Microsoft Edge'  pv='155.0.4283.45'
   {F3017226-...}  name='Microsoft Edge WebView2 Runtime'  pv='155.0.4283.45'
   {F3C4FE00-...}  name='Microsoft Edge Update'  pv='1.3.283.15'
```

> 注意：`{F3017226-...}` 这一 GUID 就是 WebView2 **Evergreen Runtime** 的标准标识，`pv=155.0.4283.45` 即已安装运行时版本。

#### 实测 — 文件系统

```powershell
Get-ChildItem 'C:\Program Files (x86)\Microsoft\EdgeWebView\Application' -Directory
```

真实输出：

```
DIR-EXISTS C:\Program Files (x86)\Microsoft\EdgeWebView\Application
   version-dir: 154.0.4258.62
   version-dir: 155.0.4283.45
   version-dir: SetupMetrics
```

独立确认：`tauri info` 报 `✔ WebView2: 155.0.4283.45`。

**结论**：WebView2 已安装，无需额外下载。

---

### 2.3 MSVC 生成工具：已安装 ✅（但 `cl.exe` 不在 PATH）

#### 实测 — vswhere

```powershell
& "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" -all -products * -format json
```

真实输出（节选）：

```json
[
  {
    "installationName": "VisualStudio/17.6.4+33815.320",
    "installationPath": "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community",
    "installationVersion": "17.6.33815.320",
    "productId": "Microsoft.VisualStudio.Product.Community",
    "isComplete": true,
    "isLaunchable": true,
    "isRebootRequired": false,
    "displayName": "Visual Studio Community 2022",
    "channelId": "VisualStudio.17.Release"
  }
]
```

#### 实测 — 是否装了 C++ 工作负载（关键）

```powershell
foreach($r in @('Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
                'Microsoft.VisualStudio.Workload.NativeDesktop',
                'Microsoft.VisualStudio.Component.Windows10SDK',
                'Microsoft.VisualStudio.Component.Windows11SDK.22621',
                'Microsoft.VisualStudio.Component.VC.Tools.x86.x64.Spectre')){
  $out = & $vswhere -all -products * -requires $r -property installationPath
  if($out){ "PRESENT  $r" } else { "ABSENT   $r" }
}
```

真实输出：

```
PRESENT  Microsoft.VisualStudio.Component.VC.Tools.x86.x64  -> C:\Program Files\Microsoft Visual Studio\2022\Community
PRESENT  Microsoft.VisualStudio.Workload.NativeDesktop  -> C:\Program Files\Microsoft Visual Studio\2022\Community
PRESENT  Microsoft.VisualStudio.Component.Windows10SDK  -> C:\Program Files\Microsoft Visual Studio\2022\Community
ABSENT   Microsoft.VisualStudio.Component.Windows11SDK.22621
ABSENT   Microsoft.VisualStudio.Component.VC.Tools.x86.x64.Spectre
```

> **这是最关键的一条**：Tauri 在 Windows 上编译 Rust 需要 MSVC 的 **C++ 工具链**（不是仅 .NET/其他工作负载）。`VC.Tools.x86.x64` 与 `Workload.NativeDesktop` 均为 PRESENT，说明 C++ 编译器已装。未装 Spectre 缓解库不影响构建。

#### 实测 — cl.exe / link.exe 实际落盘

```powershell
Get-ChildItem 'C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC' -Directory
Get-ChildItem $msvc -Recurse -Filter cl.exe -File
Get-ChildItem $msvc -Recurse -Filter link.exe -File
```

真实输出：

```
DIR-EXISTS C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC
   toolset: 14.34.31933
   toolset: 14.36.32532
   cl.exe: C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC\14.34.31933\bin\Hostx64\x64\cl.exe
   cl.exe: C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC\14.34.31933\bin\Hostx64\x86\cl.exe
   cl.exe: C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC\14.34.31933\bin\Hostx86\x64\cl.exe
   cl.exe: C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC\14.34.31933\bin\Hostx86\x86\cl.exe
   cl.exe: C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC\14.36.32532\bin\Hostx64\x64\cl.exe
   cl.exe: C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC\14.36.32532\bin\Hostx64\x86\cl.exe
   link.exe: ...\14.34.31933\bin\Hostx64\x64\link.exe
   link.exe: ...\14.34.31933\bin\Hostx64\x86\link.exe
   link.exe: ...\14.34.31933\bin\Hostx86\x64\link.exe
   link.exe: ...\14.34.31933\bin\Hostx86\x86\link.exe
```

#### 实测 — 但都不在 PATH 上

```powershell
foreach($n in @('cl.exe','link.exe','rc.exe','mt.exe','nmake.exe')){ Get-Command $n }
```

真实输出：

```
MISS  cl.exe
MISS  link.exe
MISS  rc.exe
MISS  mt.exe
MISS  nmake.exe
```

**这是正常现象**（VS 工具链默认只在 Developer Command Prompt 里进 PATH），但它带来一个**必须注意的构建风险**，见 §5。

---

### 2.4 Windows SDK：已安装 ✅

#### 实测 — 注册表（只读）

```powershell
(Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows Kits\Installed Roots').KitsRoot10
```

真实输出：

```
KitsRoot10                             : C:\Program Files (x86)\Windows Kits\10\
KitsRoot81                             : C:\Program Files (x86)\Windows Kits\8.1\
WindowsDebuggersRoot81                 : C:\Program Files (x86)\Windows Kits\8.1\Debuggers\
```

#### 实测 — 文件系统

```powershell
Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\Include' -Directory
Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\Lib' -Directory
Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Directory
```

真实输出：

```
DIR-EXISTS C:\Program Files (x86)\Windows Kits\10
   App Certification Kit / bin / Catalogs / DesignTime / Extension SDKs / Include / Lib
   Licenses / Platforms / Redist / References / Remote / Shortcuts / Source / Testing / UnionMetadata
DIR-EXISTS C:\Program Files (x86)\Windows Kits\10\Include
   10.0.20348.0
   10.0.22000.0
DIR-EXISTS C:\Program Files (x86)\Windows Kits\10\Lib
   10.0.20348.0
   10.0.22000.0
DIR-EXISTS C:\Program Files (x86)\Windows Kits\10\bin
   10.0.14393.0 / 10.0.15063.0 / 10.0.16299.0 / 10.0.17134.0 / 10.0.20348.0 / 10.0.22000.0
   arm / arm64 / x64 / x86
```

资源编译器 `rc.exe`（Tauri 生成 Windows 资源 + 图标时需要）：

```powershell
Get-ChildItem 'C:\Program Files (x86)\Windows Kits' -Recurse -Filter rc.exe -File
```

真实输出：

```
rc.exe: ...\Windows Kits\10\bin\10.0.20348.0\arm64\rc.exe
rc.exe: ...\Windows Kits\10\bin\10.0.20348.0\x64\rc.exe
rc.exe: ...\Windows Kits\10\bin\10.0.20348.0\x86\rc.exe
rc.exe: ...\Windows Kits\10\bin\10.0.22000.0\arm64\rc.exe
rc.exe: ...\Windows Kits\10\bin\10.0.22000.0\x64\rc.exe
```

**结论**：SDK 的 Include / Lib / bin 三件套齐全，两个可用版本（20348 = Server 2022，22000 = Win11 21H2）。满足 Tauri 构建要求。

---

### 2.5 Node / npm / 前端依赖：已就绪 ✅

#### 实测

```
node --version => v22.19.0
npm --version  => 10.9.3
vite installed version = 8.3.4
```

#### 实测 — npm ci 完成状态

侦察开始时 `node_modules/.bin` 不存在（npm ci 正在 reify），结束时已就绪：

```powershell
npm.cmd list --depth=0     # 退出码 0
```

真实输出（节选，31 个顶层依赖全部满足）：

```
markdown-reader@1.0.0 D:\Eunice-Reader
+-- @codemirror/lang-markdown@6.5.2
...
+-- @tauri-apps/api@2.12.3
+-- @tauri-apps/cli@2.12.2
+-- @tauri-apps/plugin-dialog@2.8.2
+-- @tauri-apps/plugin-fs@2.7.0
+-- @tauri-apps/plugin-opener@2.7.1
+-- @vscode/markdown-it-katex@1.1.2
...
+-- mermaid@12.2.0
`-- vite@8.3.4
```

```powershell
Test-Path node_modules\.bin\vite.cmd    # True
Test-Path node_modules\.bin\tauri.cmd   # True
```

> 踩坑记录：`& npm ls --depth=0` 在 PowerShell 下被解析成 `npm pm`（`ls` 别名干扰），报 `Unknown command: "pm"`；改用 `npm.cmd list --depth=0` 正常。**不是环境问题，是 PowerShell 引号/别名问题。**

#### 实测 — Tauri CLI 可执行

```powershell
node node_modules\@tauri-apps\cli\tauri.js --version
```

真实输出：

```
exit=0
tauri-cli 2.12.2
```

平台二进制包也在位：

```
D:\Eunice-Reader\node_modules\@tauri-apps\cli-win32-x64-msvc\cli.win32-x64-msvc.node   16,068,608 bytes
```

**结论**：前端工具链完全就绪。

---

### 2.6 Python：3.10.6 可用，但缺两个第三方包 ⚠️

#### 实测 — 解释器

```powershell
Get-Command python, python3, py, pip, pip3
python --version
python -c "import sys;print(sys.executable);print(sys.version)"
```

真实输出：

```
FOUND python -> C:\Users\great\AppData\Local\Programs\Python\Python310\python.exe
FOUND python3 -> C:\Users\great\AppData\Local\Microsoft\WindowsApps\python3.exe
FOUND py -> C:\WINDOWS\py.exe
FOUND pip -> C:\Users\great\AppData\Local\Programs\Python\Python310\Scripts\pip.exe
FOUND pip3 -> C:\Users\great\AppData\Local\Programs\Python\Python310\Scripts\pip3.exe

python --version  => Python 3.10.6
py --version      => Python 3.10.6
python3 --version => (空)

C:\Users\great\AppData\Local\Programs\Python\Python310\python.exe
3.10.6 (tags/v3.10.6:9c7b4bd, Aug  1 2022, 21:53:49) [MSC v.1932 64 bit (AMD64)]
```

> ⚠️ `python3` 指向 `WindowsApps\python3.exe`，是 Microsoft Store 的**占位/别名程序**，`--version` 无输出。**脚本一律用 `python`（3.10.6），不要用 `python3`。**

#### 实测 — 各 .py 脚本的 import 依赖

```powershell
Select-String -Path 'D:\Eunice-Reader\scripts\*.py' -Pattern '^\s*(import|from)\s'
```

真实输出：

```
check-build-css.py:15: import glob
check-build-css.py:16: import os
check-build-css.py:17: import re
check-build-css.py:18: import sys
check-coverage.py:11: import os
check-coverage.py:12: import sys
check-coverage.py:13: import glob
check-coverage.py:45: from fontTools.ttLib import TTFont      ← 第三方
check-themes.py:14: import io
check-themes.py:15: import os
check-themes.py:16: import re
check-themes.py:17: import sys
check-themes.py:18: from collections import Counter
subset-fonts.py:12: import os
subset-fonts.py:13: import sys
subset-fonts.py:14: import subprocess
subset-fonts.py:72: import brotli       # noqa: F401        ← 第三方
subset-fonts.py:73: import fontTools                      ← 第三方
```

#### 实测 — fontTools / brotli 是否已装

```powershell
python -c "import fontTools"    # exit=1
python -c "import brotli"       # exit=1
python -m pip freeze
```

真实输出：

```
--- import fontTools exit=1 ---
--- import brotli exit=1 ---
```

`pip freeze` 共 43 个包，**完全没有 fontTools / brotli**（相关包只有 `numpy` / `pillow` / `lxml` / `sympy` / `markitdown` 等，与字体子集化无关）。

实际运行 `check-coverage.py` 得到的报错：

```
exit=1
ERROR: 需要 fontTools。运行: pip install fonttools brotli
```

**结论**：`check-coverage.py` 与 `subset-fonts.py` 在当前环境**跑不了**，需 `python -m pip install fonttools brotli`（用户级安装，无需管理员）。

---

### 2.7 网络与代理（cargo/rustup 视角）

#### 实测 — 代理环境变量全部未设置

```
unset HTTP_PROXY
unset HTTPS_PROXY
unset ALL_PROXY
unset http_proxy
unset https_proxy
unset all_proxy
unset NO_PROXY
```

```
C:\Users\great\.cargo\config.toml exists=False
C:\Users\great\.cargo\config exists=False
C:\Users\great\.cargo exists=False
```

> 这点很重要：项目 `.npmrc` 里那个死代理 `http://127.0.0.1:7892`（已确认 7892/7890/10809/1080 端口**无监听**）**只影响 npm**。cargo 和 rustup 走的是环境变量 + `~/.cargo/config`，两者都为空 → **将来安装 Rust 后拉 crates.io 不会被这个死代理拖累**。

#### 实测 — 安装源可达性（仅 HEAD 请求，未下载负载）

```powershell
foreach($u in @('https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe',
                'https://sh.rustup.rs',
                'https://github.com/tauri-apps/binary-releases/releases/download/nsis-3/nsis-3.zip',
                'https://crates.io/api/v1/crates/tauri')){
  Invoke-WebRequest -Uri $u -Method Head -TimeoutSec 20 -UseBasicParsing -MaximumRedirection 5
}
```

真实输出：

```
HTTP 200  len=12721664   https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe
HTTP 200  len=29915      https://sh.rustup.rs
HTTP 200  len=2346723    https://github.com/tauri-apps/binary-releases/releases/download/nsis-3/nsis-3.zip
HTTP 200  len=888698     https://crates.io/api/v1/crates/tauri
```

**结论**：Rust 安装源、crates.io、NSIS 打包工具源**全部可达**，无需代理。

---

### 2.8 磁盘空间

```powershell
Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Name -in @('C','D') }
```

真实输出：

```
Name  UsedGB  FreeGB
----  ------  ------
C      565.5   319.4
D      733.8   242.8
```

**结论**：充裕。Rust 工具链（~1.5 GB）+ `target/` 目录（Tauri release 构建，LTO + `opt-level=s`，预计 3–8 GB）都能容纳。

---

### 2.9 NSIS 打包工具：未缓存，但首次构建会自动下载 ⚠️

#### 实测 — 缓存目录

```powershell
foreach($d in @("$env:LOCALAPPDATA\tauri","$env:APPDATA\tauri","$env:LOCALAPPDATA\tauri\NSIS")){ Test-Path $d }
```

真实输出：

```
absent C:\Users\great\AppData\Local\tauri
absent C:\Users\great\AppData\Roaming\tauri
absent C:\Users\great\AppData\Local\tauri\NSIS
absent C:\Users\great\AppData\Local\tauri\WixTools314

makensis NOT on PATH (Tauri downloads its own NSIS)
```

> `tauri.conf.json` 的 `bundle.targets` 是 `["nsis"]`，Tauri 2 在首次 `tauri build` 时会自动把 NSIS 工具链下载到 `%LOCALAPPDATA%\tauri`。
> **推断（未实测，因未构建）**：首次构建会额外联网拉取 `nsis-3.zip`（实测 2,346,723 B ≈ 2.2 MiB）及 `nsis_tauri_utils.dll`；源站实测 HTTP 200 可达，故不构成阻塞。

---

## 3. 完整构建可行性结论

### ❌ 本机当前**不能**执行 `npm run tauri:build`

**唯一缺失项（一句话）**：**Rust 工具链完全未安装** —— `rustup` / `cargo` / `rustc` 三者皆无，全盘 C:\ 与 D:\ 零命中。

**除 Rust 外，Windows 端 Tauri 2 的全部宿主前置条件均已满足**：

| Tauri 2 Windows 前置条件 | 本机状态 |
|---|---|
| WebView2 Runtime | ✅ 155.0.4283.45 |
| MSVC C++ 生成工具 | ✅ VS 2022 Community 17.6.4（`VC.Tools.x86.x64` + `NativeDesktop`） |
| Windows SDK | ✅ 10.0.20348.0 / 10.0.22000.0（含 `rc.exe`） |
| Node.js + 前端依赖 | ✅ v22.19.0，`npm ls` 退出码 0 |
| Tauri CLI | ✅ 2.12.2 |
| Rust 工具链 | ❌ **缺失** |
| NSIS 打包器 | ⚠️ 未缓存，首次构建自动下载（源站可达） |

`Cargo.toml` 声明 `rust-version = "1.77.2"`、`edition = "2021"` —— 装当前 stable 即可满足。

---

## 4. 最小代价补齐方案（补齐 Rust 工具链）

### 4.1 需要装什么

| 项目 | 内容 |
|---|---|
| **组件** | **rustup**（Rust 官方工具链管理器），它再拉 `stable-x86_64-pc-windows-msvc` 工具链 |
| **下载** | `rustup-init.exe` —— 实测 **12,721,664 字节（≈ 12.1 MiB）** |
| **地址** | `https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe`（实测 HTTP 200） |
| **安装体积** | 工具链本体约 1.4–1.7 GB（**推断**，官方文档量级；未实测） |
| **管理员权限** | ❌ **不需要**。已确认 `C:\Users\great\.cargo` 与 `C:\Users\great\.rustup` 均不存在，rustup 会装进用户目录（`%USERPROFILE%\.cargo`、`%USERPROFILE%\.rustup`） |
| **重启** | ❌ **不需要**。但 PATH 更新后需**开新终端**才生效 |
| **磁盘** | C: 剩 319 GB，D: 剩 243 GB → 充裕 |
| **代理** | 不需要（无代理变量、无 `~/.cargo/config`；源站实测可达） |

### 4.2 建议命令

```powershell
# 1) 下载安装器（12.1 MiB）
Invoke-WebRequest `
  -Uri 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe' `
  -OutFile "$env:TEMP\rustup-init.exe"

# 2) 静默安装 stable MSVC 工具链（用户级，无需管理员）
& "$env:TEMP\rustup-init.exe" -y --default-toolchain stable-x86_64-pc-windows-msvc --profile minimal

# 3) 开新终端（或刷新 PATH），验证
cargo --version
rustc --version
```

> `--profile minimal` 只装 `rustc`/`cargo`/`rust-std`，省约 300–400 MB；Tauri 构建不需要 `rust-docs`/`clippy`。若后续要用 clippy 再 `rustup component add clippy` 即可。

补齐后的完整构建链路（首次会额外联网拉依赖，**推断量级**：crates.io 依赖约 300–500 MB + NSIS 2.2 MiB）：

```powershell
cd D:\Eunice-Reader
npm run tauri:build
```

产物（依 `Cargo.toml` 与 README）：

- 可执行文件：`src-tauri\target\release\eunice-reader.exe`
- NSIS 安装包：`src-tauri\target\release\bundle\nsis\*.exe`

### 4.3 ⚠️ 一个必须提醒的构建风险（**推断，未实测**）

`cl.exe` / `link.exe` / `rc.exe` **都不在 PATH 上**（§2.3 实测）。Rust 在 `windows-msvc` 目标下最终链接要调用 `link.exe`，社区中「装了 VS 但不在 Developer Prompt 里跑 `cargo build` → 报 `link.exe not found` / `LINK : fatal error`」是高频问题（参见 [rust-lang/rust#149099](https://github.com/rust-lang/rust/issues/149099)、[Tauri 环境排错](https://text.ibetter.kr/tauri/part-01-tauri-2-%ec%8b%9c%ec%9e%91%ed%95%98%ea%b8%b0/02-os%eb%b3%84-%ed%99%98%ea%b2%bd-%ea%b5%ac%ec%84%b1-%ed%8a%b8%eb%9f%ac%eb%b8%94%ec%8a%88%ed%8c%85)）。

**因为本机没有 Rust，我无法实测这一点** —— 明确标注为**推断**。

**建议的安全姿势**：装完 Rust 后，从 **x64 Native Tools Command Prompt for VS 2022**（或先跑 `vcvars64.bat` / `Enter-VsDevShell`）里执行构建：

```powershell
& "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community\Common7\Tools\Launch-VsDevShell.ps1" -Arch amd64 -HostArch amd64
cd D:\Eunice-Reader
npm run tauri:build
```

若在普通 PowerShell 里能直接构建成功，则无需此步（不试不知道）。

---

## 5. 当前环境下**可以**完成的等价构建范围

> 说明：以下命令我**只对标注「实测」的项真正执行过**；`npm run build` 因任务硬约束**未由我执行**，但 `dist/` 产物已由其他成员于 10:04:40 产出，属**观察到的既存事实**。

### 5.1 前端生产构建

| 命令 | 运行时 | 状态 |
|---|---|---|
| `npm run build`（= `vite build` → `dist/`） | node 22.19.0 + vite 8.3.4 | ✅ **依赖就绪**（`npm ls` 退出码 0、`.bin\vite.cmd` 存在）；产物已观察到生成于 10:04:40，`dist/` 共 **26.52 MB** |
| `npm run dev`（= `vite`，127.0.0.1:5183） | node | ✅ 依赖就绪（未实测启动） |
| `npm run preview` | node | ✅ 依赖就绪（未实测启动） |

产物观察（`dist/`）：`index.html` 5,306 B；`assets/` 含 `index-DLJz2JAW.js` 407,195 B、`index-BIDiNssZ.css` 33,332 B、`mermaid-D60eNI2e.js` 5,089,161 B、`katex-C7xYi-YQ.js` 261,847 B、`editor-ChuP-O8C.js` 575,048 B、`hljs-DDEZfzer.js` 154,273 B，以及大量字体（`serif-400` 5.7 MB、`serif-700` 5.9 MB、`sans-400` 4.2 MB、`sans-700` 4.3 MB 等）。

### 5.2 校验脚本

| 脚本 | 运行时 | 状态 | 实测证据 |
|---|---|---|---|
| `node scripts/smoke-test.mjs` | **仅 node** | ✅ **实测通过** | `exit=0`，`渲染烟雾测试：32/32 通过` / `全部通过。` |
| `python scripts/check-themes.py` | python 3.10.6，**仅标准库** | ✅ **实测通过** | `exit=0`，输出「主题总数: 12 / 分组: {'plain': 4, 'warm': 3, 'flower': 3, 'cool': 2} / 浅色 6 / 深色 6」→ `全部通过。` |
| `python scripts/check-build-css.py` | python 3.10.6，**仅标准库** | ✅ **实测通过** | `exit=0`，`检查文件: index-BIDiNssZ.css`；`backdrop-filter 4 处`、`color-mix( 22 处`、`break-inside 2 处`、`-webkit-backdrop-filter 0 处（应为 0）` → `全部通过。` |
| `python scripts/check-coverage.py` | python + **fontTools** | ❌ **被阻塞** | `exit=1`：`ERROR: 需要 fontTools。运行: pip install fonttools brotli` |
| `python scripts/subset-fonts.py` | python + **fontTools + brotli** | ❌ **被阻塞** | 两个 import 均 `exit=1` |
| `node scripts/probe-katex.mjs` | node + `@vscode/markdown-it-katex` | ⚠️ 依赖已装（1.1.2，`npm ls` 确认），**未运行** | — |

**前置顺序注意**：`check-build-css.py` 读 `dist/assets`。在 `dist/` 不存在时它的实测表现是：

```
exit=1
没有找到 dist/assets 下的应有 CSS，请先运行 npm run build
```

所以顺序必须是 **`npm run build` → `python scripts/check-build-css.py`**。（现在 `dist/` 已存在，故已能通过。）

**解锁被阻塞脚本**（用户级，无需管理员）：

```powershell
python -m pip install fonttools brotli
```

> 补充观察（推断）：`dist/assets` 里中文字体单文件 4–6 MB，正是 `subset-fonts.py` 要解决的问题；该脚本目前因缺 `fontTools`/`brotli` 无法运行。

### 5.3 PowerShell 脚本（需 pwsh，本次未逐个验证运行）

`scripts\capture-window.ps1`、`scripts\shot-app.ps1`、`scripts\check-fonts.ps1`、`scripts\make-icon.ps1` —— 均为 pwsh 脚本，运行时为 PowerShell。其中 `capture-window.ps1` / `shot-app.ps1` 需要已构建/运行中的 GUI，当前无法验证。

### 5.4 当前环境**无法**完成的

- `npm run tauri:dev`（需要 `cargo`）❌
- `npm run tauri:build`（需要 `cargo` + NSIS 下载）❌
- 任何 `src-tauri/target/**` 产物：实测 `src-tauri\target exists = False`，即**从未编译过**

---

## 6. 实测 vs 推断 对照表

| 结论 | 实测 / 推断 |
|---|---|
| cargo/rustc/rustup 全盘零命中（C:\ 与 D:\） | **实测** |
| WebView2 155.0.4283.45 已安装 | **实测**（注册表 + 文件 + `tauri info`） |
| MSVC C++ 工作负载已装，cl.exe/link.exe 落盘于 14.34/14.36 | **实测** |
| cl.exe/link.exe/rc.exe 不在 PATH | **实测** |
| Windows SDK 10.0.20348.0 / 10.0.22000.0 齐全，含 rc.exe | **实测** |
| node 22.19.0 / npm 10.9.3 / vite 8.3.4 / 依赖完整 | **实测** |
| Tauri CLI 2.12.2 可执行 | **实测** |
| Python 3.10.6；`python3` 是 Store 占位符 | **实测** |
| fontTools / brotli 未安装 | **实测** |
| 无代理环境变量、无 `~/.cargo/config`；7892 端口无监听 | **实测** |
| rustup-init.exe / crates.io / nsis-3.zip 源站 HTTP 200 | **实测**（HEAD 请求） |
| `check-themes.py` 通过（12 主题） | **实测**（我执行） |
| `check-build-css.py` 通过 | **实测**（我执行，基于他人产出的 `dist/`） |
| `smoke-test.mjs` 32/32 通过 | **实测**（我执行） |
| `npm run build` 能产出可用 `dist/` | **观察到的既存事实**（产物时间戳 10:04:40，**非我执行**） |
| **不能**完整构建 `npm run tauri:build` | **实测 + 直接推论**（Rust 缺失是硬阻塞） |
| 补 Rust 后即可构建 | **推断**（其余前置条件均已实测满足） |
| 装 Rust 需 ~1.5 GB、无需管理员/重启 | **推断**（基于 rustup 官方默认行为；已实测用户级目录不存在，故走用户级安装） |
| 普通 PowerShell 里可能因缺 `link.exe` 而链接失败 | **推断**，**未实测**（无 Rust 无法验证） |
| 首次 `tauri build` 会自动下载 NSIS | **推断**（Tauri 2 已知行为 + 缓存目录实测缺失 + 源站实测可达） |
| WSL 里是否有 rust | **未检查**（未启动 WSL；且 Linux rust 默认无法产出 Windows MSVC 目标） |

---

## 7. 附：发现的两处文档不一致（供 Lead 参考）

1. **README 与 `Cargo.toml` 对可执行文件名的描述不一致**（读文件推断，未实测）
   - `README.md:191` 写：`可执行文件：src-tauri/target/release/markdown-reader.exe`
   - 但 `src-tauri/Cargo.toml:14-16` 明确声明 `[[bin]] name = "eunice-reader"`，并附注释说明「默认会用 package.name，产出 markdown-reader.exe，与安装包里的『Eunice Reader』对不上」
   - → 实际产物应为 **`src-tauri\target\release\eunice-reader.exe`**，README 该行已过期。
   - `README.md:192` 的安装包路径 `src-tauri/target/release/bundle/nsis/*.exe` 与 `bundle.targets: ["nsis"]` 一致，可信。

2. **仓库根目录存在一个非项目文件**：`D:\Eunice-Reader\.npmrc.dsh-backup`（非我创建）。若它是「改 `.npmrc` 前备份死代理配置」留下的，请确认最终是否需要保留。

---

## 8. 附：一条命令速查

```powershell
# —— 现在就能跑（无需 Rust）——
npm run build                            # Vite 生产构建 → dist/
node scripts/smoke-test.mjs              # 渲染烟雾测试（实测 32/32 通过）
python scripts/check-themes.py           # 主题一致性（实测通过）
python scripts/check-build-css.py        # 构建产物 CSS 校验（需先 npm run build；实测通过）

# —— 装两个 python 包后即可用 ——
python -m pip install fonttools brotli
python scripts/check-coverage.py         # 字体字符覆盖实测
python scripts/subset-fonts.py           # 中文字体子集化

# —— 现在是阻塞的：先补 Rust 工具链 ——
# https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe  (12.1 MiB)
# 建议在 VS 2022 x64 Native Tools 环境里执行，规避 link.exe 不在 PATH 的风险
npm run tauri:dev                        # 开发模式
npm run tauri:build                      # 完整 NSIS 安装包构建
# 产物：src-tauri\target\release\eunice-reader.exe
#       src-tauri\target\release\bundle\nsis\*.exe
```

---

## 9. 复核记录 — 2026-10-16（Rust 补齐后的实测）

上面第 3、5.4 节的「不能构建」已过期：Rust 工具链后来装上了，本次**真的构建了一次**。

| 项目 | 实测值 |
|---|---|
| rustup 工具链 | `stable-x86_64-pc-windows-msvc`（`~/.rustup/toolchains/…`） |
| cargo / rustc | **1.99.0** |
| `.cargo\bin` | 全部是指向 `rustup.exe` 的符号链接（`Get-ChildItem` 长度为 0 是正常的） |
| 构建命令 | `npm run tauri:build`（PATH 里补 `C:\Users\great\.cargo\bin`） |
| 前端构建 | vite 8.3.4，2283 modules，`index-BqatJnJm.js` 298.0 KB / `index-C5AXW8JY.css` 50.7 KB |
| Rust 编译 | release profile，**1m 40s** |
| 可执行文件 | `src-tauri\target\release\eunice-reader.exe`（60.93 MB） |
| **安装包** | **`src-tauri\target\release\bundle\nsis\Eunice Reader_1.2.3_x64-setup.exe`（59.33 MB）** |
| SHA256 | `3DC8133B75EF5E875F70C9CC8D97417014DBF6C44C885C66242AC7BFCD225214` |
| 版本资源 | FileVersion / ProductVersion = `1.2.3`，ProductName = `Eunice Reader` |

**§4.3 那个「推断的风险」不成立**：普通 PowerShell（没有跑 `vcvars64`、`link.exe` 不在 PATH）里
直接构建成功 —— `cc`/`rustc` 会自己按注册表把 MSVC 找出来，不需要 Developer Prompt。
第 4.3 节与第 6 节对照表里的对应行可以按此作废。

**NSIS 确实是首次自动下载的**（`%LOCALAPPDATA%\tauri`），下载后即缓存，与推断一致。

**产物内容如何核验**：前端资源在 exe 里是压缩后内嵌的，直接搜字符串搜不到；
有效做法是对比**资源清单里的哈希文件名**——`dist/assets/index-BqatJnJm.js` 与
`index-C5AXW8JY.css` 都在 exe 里，而上一版构建的 `index-C0y5kvK4.js` 已不存在。
再往前一步：这两个文件在 `dist/` 里确实含有本次新增的 CSS 类与文案
（`.dz-pane` / `.adv-backdrop` / `.theme-tiles` / 「这一栏打开」/「留在原处」），
于是「源码 → dist → 安装包」这条链是闭合的。

**安装包未签名**（没有代码签名证书），Windows SmartScreen 首次运行会提示「未知发布者」——
这是预期，不是构建失败。

