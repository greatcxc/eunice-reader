#Requires -Version 5.1
<#
  屏幕抓图取证（不是 PrintWindow）

  为什么不用 PrintWindow：它向窗口要一份自绘位图，GPU 合成层
  （毛玻璃、阴影、圆角抗锯齿）不会被包含，抓出来的图会缺字缺层，
  看到的是伪影。CopyFromScreen 直接读显示器的合成结果，是用户眼睛
  真正看到的那一帧。

  用法：powershell -File scripts\capture-window.ps1 -Out shots\app.png
#>
param(
  [string]$ProcessName = 'eunice-reader',
  [string]$Out = 'shots\app.png',
  [int]$ScrollPages = 0,
  [string]$Keys = '',
  [int]$X = 40,
  [int]$Y = 40,
  [int]$Width = 1240,
  [int]$Height = 840,
  [switch]$Maximize,
  [switch]$Isolate
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Win {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT p);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr pid);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X, Y; }
}
'@

function Force-Foreground([IntPtr]$h) {
  $fg = [Win]::GetForegroundWindow()
  $t1 = [Win]::GetWindowThreadProcessId($fg, [IntPtr]::Zero)
  $t2 = [Win]::GetCurrentThreadId()
  [void][Win]::AttachThreadInput($t2, $t1, $true)
  [void][Win]::BringWindowToTop($h)
  [void][Win]::SetForegroundWindow($h)
  [void][Win]::AttachThreadInput($t2, $t1, $false)
}

$p = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
     Where-Object { $_.MainWindowHandle -ne 0 } |
     Select-Object -First 1

if (-not $p) {
  Write-Output "NOT_FOUND: 没有找到 $ProcessName 的主窗口"
  exit 1
}

$h = $p.MainWindowHandle
[void][Win]::ShowWindow($h, 9)   # SW_RESTORE
Start-Sleep -Milliseconds 300
# SWP_NOZORDER(0x4) | SWP_NOACTIVATE(0x10)
[void][Win]::SetWindowPos($h, [IntPtr]::Zero, $X, $Y, $Width, $Height, 0x14)
Force-Foreground $h
Start-Sleep -Milliseconds 900

if ($ScrollPages -gt 0 -or $Keys) {
  Add-Type -AssemblyName System.Windows.Forms
  if ($Keys) {
    # 例如 '^+,' 表示 Ctrl+逗号；SendKeys 用 + 表示 Shift、^ 表示 Ctrl、% 表示 Alt
    [System.Windows.Forms.SendKeys]::SendWait($Keys)
    Start-Sleep -Milliseconds 900
  }
  for ($i = 0; $i -lt $ScrollPages; $i++) {
    [System.Windows.Forms.SendKeys]::SendWait('{PGDN}')
    Start-Sleep -Milliseconds 220
  }
  Start-Sleep -Milliseconds 700
}

# 取客户区在屏幕上的位置：任务栏/阴影不会混进截图
$c = New-Object Win+RECT
[void][Win]::GetClientRect($h, [ref]$c)
$origin = New-Object Win+POINT
[void][Win]::ClientToScreen($h, [ref]$origin)

$w = $c.Right - $c.Left
$ht = $c.Bottom - $c.Top
if ($w -le 0 -or $ht -le 0) { Write-Output "BAD_RECT"; exit 1 }

$bmp = New-Object System.Drawing.Bitmap $w, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($origin.X, $origin.Y, 0, 0, $bmp.Size)
$g.Dispose()

$dir = Split-Path -Parent $Out
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
$bmp.Save((Resolve-Path (Split-Path -Parent $Out) -ErrorAction SilentlyContinue).Path + '\' + (Split-Path -Leaf $Out), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Output "SAVED: $Out  ($w x $ht)"
