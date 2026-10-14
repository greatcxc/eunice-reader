param(
  [string]$Exe = "$PSScriptRoot\..\src-tauri\target\release\eunice-reader.exe",
  [string]$Doc = '',
  [string]$Out = "$PSScriptRoot\..\.tmp-app-shot.png",
  [int]$WaitSeconds = 9
)

# 启动 Markdown Reader 并打开样例文档，然后把窗口置前截屏。
# 用于在真实 Tauri 窗口里目检渲染效果（内置浏览器只能验证 Web 页面，看不到原生窗口）。
#
# 路径全部相对脚本自身，默认指向本仓库的 release 产物；
# 想截已安装的版本就传 -Exe "$env:LOCALAPPDATA\com.eunice.reader\eunice-reader.exe"。
#
# 注意 1：本文件带 UTF-8 BOM。PowerShell 5.1 读没有 BOM 的 .ps1 会按系统 ANSI 解码，
# 文件里的中文会变成乱码（路径字面量因此失效）。改这个文件时别把 BOM 弄丢。
# 注意 2：样例文档用通配符取，不在脚本里写死中文文件名 —— 即使编码出问题也能找到。
# 注意 3：这里不用 here-string 传 C# 代码。PowerShell 5.1 的 here-string 解析
# 依赖 CRLF 行尾，而本仓库文件可能是 LF，会导致整段 C# 被当成 PowerShell 解析而报语法错误。

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing

$Exe = [System.IO.Path]::GetFullPath($Exe)
if (-not (Test-Path $Exe)) { throw "找不到可执行文件: $Exe" }

if (-not $Doc) {
  $sample = Get-ChildItem "$PSScriptRoot\..\samples\*.md" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $sample) { throw "找不到样例文档（samples\*.md）" }
  $Doc = $sample.FullName
}
$Doc = [System.IO.Path]::GetFullPath($Doc)
$Out = [System.IO.Path]::GetFullPath($Out)
if (-not (Test-Path $Doc)) { throw "找不到样例文档: $Doc" }

Get-Process eunice-reader -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 800

Write-Output "启动: $Exe"
Start-Process -FilePath $Exe -ArgumentList "`"$Doc`""
Start-Sleep -Seconds $WaitSeconds

# 把应用窗口最大化并拉到前台（SW_MAXIMIZE = 3）
$cs = @(
  'using System;',
  'using System.Runtime.InteropServices;',
  'public class MrWin {',
  '  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);',
  '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);',
  '}'
) -join "`n"

Add-Type -ErrorAction SilentlyContinue -TypeDefinition $cs

$procs = @(Get-Process eunice-reader -ErrorAction SilentlyContinue)
$p = $procs | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1

if ($p) {
  [MrWin]::ShowWindow($p.MainWindowHandle, 3) | Out-Null
  [MrWin]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
  Start-Sleep -Seconds 3
  Write-Output "窗口标题: $($p.MainWindowTitle)"
} else {
  Write-Output "警告：进程数 $($procs.Count)，但未取到主窗口句柄"
}

$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()

Write-Output "截图: $Out ($($screen.Width)x$($screen.Height))"
