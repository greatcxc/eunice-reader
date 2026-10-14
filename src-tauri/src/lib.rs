// Windows 原生 Markdown 阅读器 —— Rust 侧。
// 职责只保留四件事：单实例 + 文件参数接管、文件读写、窗口显示、原生导出 PDF。
// 所有 Markdown 解析都在前端完成，这里不做任何渲染。

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use encoding_rs::{Encoding, UTF_8};
use serde::Serialize;
use tauri::{Emitter, Manager};

/// 启动参数里的文件路径。
///
/// 这里刻意**不用**「setup 里 sleep 一段时间后 emit 事件」的做法 ——
/// 前端初始化要测量各套正文主题的真实颜色，耗时不可控，事件会早于
/// 监听器注册而丢失，结果就是双击 .md 打开后窗口空白。
/// 改成前端就绪后主动来取，取走即清空，从根上消除时序竞争。
static STARTUP_FILE: OnceLock<Mutex<Option<String>>> = OnceLock::new();

fn startup_slot() -> &'static Mutex<Option<String>> {
    STARTUP_FILE.get_or_init(|| Mutex::new(None))
}

/// 一次性取走启动文件路径。取过之后返回 None。
#[tauri::command]
fn take_startup_file() -> Option<String> {
    startup_slot()
        .lock()
        .ok()
        .and_then(|mut slot| slot.take())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DocPayload {
    path: String,
    content: String,
    /// "utf-8" | "utf-8-bom" | "gbk" | "gb18030"，用于状态栏提示编码来源
    encoding: String,
}

/// 从 argv 里挑出第一个真实存在的 Markdown 文件路径。
/// Windows 下双击文件时 explorer 传的参数可能是：
///   ["C:\\path\\a.md"]  或  ["C:\\Program Files\\App.exe", "C:\\path\\a.md"]
fn extract_file_arg(argv: &[String]) -> Option<PathBuf> {
    argv.iter()
        .skip(1)
        .filter(|a| !a.starts_with("--") && !a.starts_with('-'))
        .map(PathBuf::from)
        .find(|p| p.is_file())
}

/// 读取文本文件。
///
/// `async` 不是装饰：Tauri 的同步命令在**主线程**上执行，读盘 + 解码会把
/// 事件循环堵住（大文件尤其明显）。加上 async 后命令被丢进异步运行时执行，
/// 主线程只负责收结果。
#[tauri::command(async)]
fn read_text_file(path: String) -> Result<DocPayload, String> {
    let p = Path::new(&path);
    if !p.is_file() {
        return Err(format!("文件不存在: {path}"));
    }

    let bytes = fs::read(p).map_err(|e| format!("读取失败: {e}"))?;
    let (content, encoding) = decode_bytes(&bytes);

    // byte_len / line_count / file_name 以前也一起回传，但前端一次都没用过。
    // 其中 line_count 是白送的一次全文扫描（lines().count()），顺手删掉。
    Ok(DocPayload {
        path,
        content,
        encoding,
    })
}

/// UTF-8 优先；带 BOM 则标记；不是合法 UTF-8 时按中文环境回退 GBK/GB18030。
fn decode_bytes(bytes: &[u8]) -> (String, String) {
    // UTF-8 BOM：剥掉并标记来源
    if let Some(rest) = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        return (String::from_utf8_lossy(rest).into_owned(), "utf-8-bom".to_string());
    }

    // 快路径：std::str::from_utf8 的校验是 SIMD 加速的，比 encoding_rs
    // 解一遍再全文搜 U+FFFD 更快，也少一次整体拷贝。
    if let Ok(s) = std::str::from_utf8(bytes) {
        return (s.to_string(), "utf-8".to_string());
    }

    // 中文环境回退：GB18030 是 GBK 的超集，先试它。
    // 必须看 had_errors —— GB18030 几乎能解码任意字节序列，
    // 不看错误标志就会把 Big5 文档也吞掉。
    for enc_name in ["gb18030", "gbk", "big5"] {
        let enc = match enc_name {
            "gb18030" => encoding_rs::GB18030,
            "gbk" => encoding_rs::GBK,
            _ => encoding_rs::BIG5,
        };
        let (decoded, _, had_errors) = enc.decode(bytes);
        if !had_errors {
            return (decoded.into_owned(), enc_name.to_string());
        }
    }

    // 实在解不出来，按 UTF-8 有损解码，至少不崩
    let fallback: &Encoding = UTF_8;
    (fallback.decode(bytes).0.into_owned(), "utf-8-lossy".to_string())
}

/// 写回文本文件（始终 UTF-8 无 BOM，保证跨编辑器兼容）。
///
/// 同样标记 async：写大文件时不该堵住主线程。
#[tauri::command(async)]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content.as_bytes()).map_err(|e| format!("写入失败: {e}"))
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn document_stem(path: String) -> Option<String> {
    Path::new(&path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
}

/// 把当前 WebView 直接写成 PDF 文件。
///
/// 之前走的是 `window.print()` —— 那条路会弹出系统打印对话框，
/// 让用户自己在里面再选一次「另存为 PDF」，对一个「导出 PDF」按钮来说
/// 纯属多余，而且打断了心流。
///
/// 这里直接调 WebView2 的 `ICoreWebView2_7::PrintToPdf`：用的是**同一个渲染
/// 引擎**，所以导出的 PDF 与屏幕上看到的排版完全一致（含中文、表格、代码块、
/// 公式、图表），文字仍是可选中可搜索的真文字，而不是一张截图。
///
/// 页边距不在这里设置（全部传 0），交给 CSS 的 `@page` 规则 ——
/// 那样打印对话框里手动打印时也是同一套边距，只有一个真相来源。
/// 取出用于导出的 WebView2 接口与一份 A4 纵向的打印设置。
///
/// 必须在 UI 线程调用（COM  apartment 绑定）。
#[cfg(windows)]
unsafe fn prepare_print(
    controller: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Controller,
) -> Result<
    (
        webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_7,
        webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2PrintSettings,
    ),
    String,
> {
    use webview2_com::Microsoft::Web::WebView2::Win32 as wv2;
    use windows_core::Interface;

    let core = controller
        .CoreWebView2()
        .map_err(|e| format!("取 WebView2 核心失败: {e}"))?;

    // PrintToPdf 挂在 ICoreWebView2_7 上；Environment 挂在 ICoreWebView2_2 上
    let v7: wv2::ICoreWebView2_7 = core
        .cast()
        .map_err(|e| format!("WebView2 版本过低，不支持导出 PDF: {e}"))?;

    let env: wv2::ICoreWebView2Environment = core
        .cast::<wv2::ICoreWebView2_2>()
        .and_then(|v2| v2.Environment())
        .map_err(|e| format!("取 WebView2 环境失败: {e}"))?;

    let settings: wv2::ICoreWebView2PrintSettings = env
        .cast::<wv2::ICoreWebView2Environment6>()
        .and_then(|e| e.CreatePrintSettings())
        .map_err(|e| format!("创建打印设置失败: {e}"))?;

    // A4 纵向，单位是英寸。页边距刻意留 0，交给 CSS 的 @page ——
    // 这样打印对话框里手动打印时也是同一套边距。
    let _ = settings.SetOrientation(wv2::COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT);
    let _ = settings.SetPageWidth(8.27);
    let _ = settings.SetPageHeight(11.69);
    let _ = settings.SetMarginTop(0.0);
    let _ = settings.SetMarginBottom(0.0);
    let _ = settings.SetMarginLeft(0.0);
    let _ = settings.SetMarginRight(0.0);
    // 主题底色是文档视觉的一部分；不打印背景会丢掉整片色块的层次
    let _ = settings.SetShouldPrintBackgrounds(true);
    let _ = settings.SetShouldPrintHeaderAndFooter(false);
    let _ = settings.SetShouldPrintSelectionOnly(false);

    Ok((v7, settings))
}

#[cfg(windows)]
#[tauri::command]
async fn export_pdf(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;

    // with_webview 把闭包投递到 UI 线程执行（COM 必须在该线程），
    // 回调稍后也会在同一线程触发，用 channel 把结果送回异步命令。
    let (tx, mut rx) = tauri::async_runtime::channel::<Result<(), String>>(1);

    win.with_webview(move |webview| {
        let prepared = unsafe { prepare_print(&webview.controller()) };

        let (v7, settings) = match prepared {
            Ok(v) => v,
            Err(e) => {
                let _ = tx.try_send(Err(e));
                return;
            }
        };

        // tx 要同时被「回调」和「同步失败」两条路径用到，所以先克隆一份
        // 交给回调，自己留一份用于 PrintToPdf 立刻失败时上报。
        let tx_cb = tx.clone();
        let handler = webview2_com::PrintToPdfCompletedHandler::create(Box::new(
            move |hr, _is_pdf_file| {
                let outcome = match hr {
                    Ok(()) => Ok(()),
                    Err(e) => Err(format!("导出失败: {e}")),
                };
                let _ = tx_cb.try_send(outcome);
                Ok(())
            },
        ));

        // PrintToPdf 是异步的，路径参数在回调触发前必须一直有效。
        // 一次导出泄漏几十字节、进程退出即回收，比跨线程维护生命周期简单可靠。
        let wide: &'static [u16] = Box::leak(
            path.encode_utf16()
                .chain(std::iter::once(0))
                .collect::<Vec<u16>>()
                .into_boxed_slice(),
        );

        if let Err(e) = unsafe { v7.PrintToPdf(windows_core::PCWSTR(wide.as_ptr()), &settings, &handler) }
        {
            let _ = tx.try_send(Err(format!("启动导出失败: {e}")));
        }
    })
    .map_err(|e| format!("投递到渲染线程失败: {e}"))?;

    // Tauri 的 channel 在发送端被丢弃时返回 None —— 即回调始终没来。
    // 再套一层超时：万一 WebView2 的回调丢了，前端不该永远卡在「导出中」。
    match tokio::time::timeout(std::time::Duration::from_secs(90), rx.recv()).await {
        Ok(Some(result)) => result,
        Ok(None) => Err("导出被中断".into()),
        Err(_) => Err("导出超时，文档可能过于复杂".into()),
    }
}

/// 非 Windows 平台没有 WebView2，直接报错而不是静默失败。
#[cfg(not(windows))]
#[tauri::command]
async fn export_pdf(_app: tauri::AppHandle, _path: String) -> Result<(), String> {
    Err("当前平台暂不支持导出 PDF".into())
}

/* ------------------------------------------------------------------ */
/* Windows 文件关联                                                    */
/* ------------------------------------------------------------------ */

/**
 * Windows 文件关联用的 ProgId。
 *
 * **必须与 tauri.conf.json 里 `fileAssociations[].name` 一致。**
 * Tauri 的 NSIS 模板用它调 `APP_ASSOCIATE` 建类，装完之后
 * `HKCU\Software\Classes\.md\(默认)` 指向的就是这个名字。
 * 早先这里另起了一个 `EuniceReader.Markdown.1`，把文档图标写在它身上 ——
 * 而 Windows 从来不看那个类（没有任何地方引用它），于是 .md 依旧用 exe 图标。
 */
const MARKDOWN_PROGID: &str = "Markdown Document";

/// 支持关联的扩展名，与 tauri.conf.json 的 fileAssociations 同步。
const MARKDOWN_EXTS: [&str; 9] = [
    "md", "markdown", "mdown", "mkd", "mdwn", "mdtxt", "mdtext", "rmd", "qmd",
];

/// 注册内容的结构版本。**改动注册逻辑就要 +1**：
/// 注册表只在首次运行 / 版本号变化时才重写，只改代码不改这个数字，
/// 已经装好的用户永远等不到新内容。
const ASSOC_REVISION: u32 = 2;

/// 当前可执行文件。
///
/// 旧实现用 `package_info().name`（那是 productName「Eunice Reader」）拼文件名，
/// 又取了 `resource_dir()` 的**父目录** —— 而实际二进制叫 `eunice-reader.exe`，
/// 就在资源目录里。于是 canonicalize 永远失败，函数静默 `return Ok(false)`，
/// 整套注册一次都没执行过。`current_exe()` 不需要猜。
fn current_exe() -> Result<PathBuf, String> {
    std::env::current_exe().map_err(|e| format!("取当前程序路径失败: {e}"))
}

/// 文件类型图标：安装包由 `bundle.resources` 放到资源目录的 `icons/` 下。
/// 开发模式（未打包）取不到，调用方会回落到 exe 图标。
fn markdown_icon(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path()
        .resource_dir()
        .ok()
        .map(|d| d.join("icons").join("file-markdown.ico"))
        .filter(|p| p.exists())
}

/// 把关联信息写进 HKCU\Software\Classes。
///
/// 写 HKCU 而不是 HKLM：免管理员权限，与 installMode=currentUser 一致。
/// 安装器（NSIS 钩子）做的是同一件事，两边必须保持一致 ——
/// 安装包负责新装的机器，这里负责已经装好、只升级了程序的机器。
fn write_association(app: &tauri::AppHandle) -> Result<(), String> {
    let exe = current_exe()?;
    let exe_str = exe.to_string_lossy().to_string();
    let exe_name = exe
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .ok_or_else(|| "取可执行文件名失败".to_string())?;

    // 文档图标优先；取不到就用 exe 图标，至少不会没有图标
    let icon_value = markdown_icon(app)
        .map(|p| format!("{},0", p.to_string_lossy()))
        .unwrap_or_else(|| format!("{exe_str},0"));

    let hkcu = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
    let (classes, _) = hkcu
        .create_subkey(r"Software\Classes")
        .map_err(|e| format!("打开 HKCU\\Software\\Classes 失败: {e}"))?;

    let command = format!("\"{exe_str}\" \"%1\"");

    for ext in MARKDOWN_EXTS {
        // 1) 文件图标。UserChoice 缺位时 Windows 就按扩展名这一层找图标
        if let Ok((key, _)) = classes.create_subkey(format!(r".{ext}\DefaultIcon")) {
            let _ = key.set_value("", &icon_value);
        }

        // 2) 右键菜单「使用 Eunice Reader 打开」
        let verb_path = format!(r".{ext}\shell\EuniceReader");
        if let Ok((key, _)) = classes.create_subkey(&verb_path) {
            let _ = key.set_value("", &"使用 Eunice Reader 打开");
            let _ = key.set_value("Icon", &icon_value);
        }
        if let Ok((key, _)) = classes.create_subkey(format!(r"{verb_path}\command")) {
            let _ = key.set_value("", &command);
        }

        // 3) 「打开方式」候选。这里的**值名必须是 ProgId**：
        //    旧实现写的是 "eunice-reader.exe"，Windows 把它当成一个不存在的
        //    文件类，于是在「打开方式」里显示成裸 exe（图标也是 app 图标）。
        if let Ok((key, _)) = classes.create_subkey(format!(r".{ext}\OpenWithProgids")) {
            let _ = key.set_value(MARKDOWN_PROGID, &"");
            let _ = key.delete_value(exe_name.as_str());
        }
    }

    // 4) ProgId 本体：显示名 + 打开命令 + 文档图标
    if let Ok((key, _)) = classes.create_subkey(MARKDOWN_PROGID) {
        let _ = key.set_value("", &"Markdown 文档");
        let _ = key.set_value("FriendlyTypeName", &"Markdown 文档 (Eunice Reader)");
    }
    if let Ok((key, _)) = classes.create_subkey(format!(r"{MARKDOWN_PROGID}\DefaultIcon")) {
        let _ = key.set_value("", &icon_value);
    }
    if let Ok((key, _)) = classes.create_subkey(format!(r"{MARKDOWN_PROGID}\shell")) {
        let _ = key.set_value("", &"open");
    }
    if let Ok((key, _)) = classes.create_subkey(format!(r"{MARKDOWN_PROGID}\shell\open")) {
        let _ = key.set_value("", &"使用 Eunice Reader 打开");
    }
    if let Ok((key, _)) = classes.create_subkey(format!(r"{MARKDOWN_PROGID}\shell\open\command")) {
        let _ = key.set_value("", &command);
    }

    // 5) 应用条目：让「打开方式」列表显示「Eunice Reader」而不是文件名。
    //    图标也给文档图标 —— 用户从列表里选中它之后，Windows 会把 UserChoice
    //    指向这个条目，用 app 图标的话 .md 又会变回「看起来像程序」。
    let app_key = format!(r"Applications\{exe_name}");
    if let Ok((key, _)) = classes.create_subkey(&app_key) {
        let _ = key.set_value("FriendlyAppName", &"Eunice Reader");
        let _ = key.set_value("ApplicationName", &"Eunice Reader");
        let _ = key.set_value("ApplicationCompany", &"Eunice");
    }
    if let Ok((key, _)) = classes.create_subkey(format!(r"{app_key}\DefaultIcon")) {
        let _ = key.set_value("", &icon_value);
    }
    if let Ok((key, _)) = classes.create_subkey(format!(r"{app_key}\shell\open\command")) {
        let _ = key.set_value("", &command);
    }

    // 6) 迁移：删掉旧版本写错位置的那个 ProgId（没人引用，纯残留）
    let _ = classes.delete_subkey_all("EuniceReader.Markdown.1");

    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AssocStatus {
    /// 当前 .md 实际生效的 ProgId
    prog_id: String,
    /// 它的展示名（取不到就回落成 ProgId）
    display_name: String,
    /// 打开命令是否指向本程序
    is_default: bool,
    /// 是否由 UserChoice 决定 —— 是的话程序无法改写，只能用户手动改
    user_choice: bool,
    /// 文件类型图标是否已经是本程序的文档图标
    icon_ok: bool,
}

/**
 * 读当前 .md 的关联状态，给设置面板用。
 *
 * 解析顺序与资源管理器一致：UserChoice → HKCU\Software\Classes → HKCR。
 * 只看 `.md`（主扩展名），其余 8 个扩展名走同一套逻辑，没必要逐个报。
 */
#[tauri::command]
fn assoc_status(app: tauri::AppHandle) -> AssocStatus {
    use winreg::enums::{HKEY_CLASSES_ROOT, HKEY_CURRENT_USER};

    let hkcu = winreg::RegKey::predef(HKEY_CURRENT_USER);
    let hkcr = winreg::RegKey::predef(HKEY_CLASSES_ROOT);

    let read_default = |key: &winreg::RegKey| -> Option<String> {
        key.get_value::<String, _>("").ok().filter(|v| !v.is_empty())
    };

    let mut user_choice = false;
    let mut prog_id = None;
    if let Some(choice) = hkcu
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.md\UserChoice")
        .ok()
        .and_then(|k| k.get_value::<String, _>("ProgId").ok())
        .filter(|v| !v.is_empty())
    {
        user_choice = true;
        prog_id = Some(choice);
    }

    if prog_id.is_none() {
        prog_id = hkcu
            .open_subkey(r"Software\Classes\.md")
            .ok()
            .and_then(|k| read_default(&k));
    }
    if prog_id.is_none() {
        prog_id = hkcr.open_subkey(".md").ok().and_then(|k| read_default(&k));
    }

    let prog_id = prog_id.unwrap_or_default();

    let display_name = if prog_id.is_empty() {
        "未关联".to_string()
    } else {
        hkcr.open_subkey(&prog_id)
            .ok()
            .and_then(|k| {
                k.get_value::<String, _>("FriendlyTypeName")
                    .ok()
                    .or_else(|| read_default(&k))
            })
            .unwrap_or_else(|| prog_id.clone())
    };

    let exe_name = current_exe()
        .ok()
        .and_then(|p| p.file_name().map(|s| s.to_string_lossy().to_lowercase()))
        .unwrap_or_default();
    let command = hkcr
        .open_subkey(format!(r"{prog_id}\shell\open\command"))
        .ok()
        .and_then(|k| read_default(&k))
        .unwrap_or_default()
        .to_lowercase();
    let is_default = !exe_name.is_empty() && command.contains(&exe_name);

    let want_icon = markdown_icon(&app).map(|p| p.to_string_lossy().to_lowercase());
    let have_icon = hkcr
        .open_subkey(format!(r"{prog_id}\DefaultIcon"))
        .ok()
        .and_then(|k| read_default(&k))
        .map(|v| v.to_lowercase());
    let icon_ok = match (want_icon, have_icon) {
        (Some(want), Some(have)) => have.trim().trim_end_matches(",0").trim() == want,
        _ => false,
    };

    AssocStatus {
        prog_id,
        display_name,
        is_default,
        user_choice,
        icon_ok,
    }
}

/**
 * 把本程序登记进 Windows 的「打开方式」候选列表，并修好文件类型图标。
 *
 * 与安装器（NSIS 钩子）做同一件事，理由有两条：
 *   1. Windows 的「选择打开方式」依赖 `OpenWithProgids`，而未运行过的程序
 *      不会进入该列表 —— 首次启动补写一次，用户不必重启 Explorer；
 *   2. 安装包已经装好、只升级了程序的机器，靠这里把注册内容刷新到当前版本。
 *
 * 注意这里**不能**直接写 UserChoice（Windows 8 起带哈希校验，写入会被忽略），
 * 「设为默认」那一步只能由用户在系统设置里确认，见 open_default_apps_settings。
 *
 * @param force 忽略版本戳强制重写（设置面板里的「修复」按钮用）
 */
#[tauri::command(async)]
fn register_open_with(app: tauri::AppHandle, force: Option<bool>) -> Result<bool, String> {
    use winreg::enums::HKEY_CURRENT_USER;

    let version = app.package_info().version.to_string();
    let stamp = format!("{version}+r{ASSOC_REVISION}");
    let hkcu_root = winreg::RegKey::predef(HKEY_CURRENT_USER);

    // 同一版本 + 同一注册内容已经写过就直接返回：不写注册表，也不惊动资源管理器
    if force != Some(true) {
        if let Ok(key) = hkcu_root.open_subkey(r"Software\EuniceReader") {
            if let Ok(cur) = key.get_value::<String, _>("assoc_version") {
                if cur == stamp {
                    return Ok(false);
                }
            }
        }
    }

    write_association(&app)?;

    // 记下「这个版本 + 这套注册内容已经写过」，下次启动整段跳过
    if let Ok((key, _)) = hkcu_root.create_subkey(r"Software\EuniceReader") {
        let _ = key.set_value("assoc_version", &stamp);
        let _ = key.set_value("ContextMenuInstalled", &"1");
    }

    Ok(true)
}

/**
 * 打开系统「默认应用」设置页。
 *
 * 这是「设为默认」里程序唯一能做的最后一公里：UserChoice 由系统哈希保护，
 * 程序写不进去（写进去也会被回滚）。与其伪造哈希骗系统，
 * 不如把用户送到该点的地方点一下。
 */
#[tauri::command]
async fn open_default_apps_settings(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url("ms-settings:defaultapps", None::<&str>)
        .map_err(|e| format!("打开系统设置失败: {e}"))
}

/// 通知资源管理器文件关联已变化，刷新右键菜单而不必注销登录
#[tauri::command]
fn notify_association_changed() {
    // SHCNE_ASSOCCHANGED
    const SHCNE_ASSOCCHANGED: i32 = 0x0800_0000;
    const SHCNF_IDLIST: u32 = 0x0000;
    #[link(name = "shell32")]
    extern "system" {
        fn SHChangeNotify(
            event: i32,
            flags: u32,
            item1: *const core::ffi::c_void,
            item2: *const core::ffi::c_void,
        );
    }
    unsafe {
        SHChangeNotify(
            SHCNE_ASSOCCHANGED,
            SHCNF_IDLIST,
            core::ptr::null(),
            core::ptr::null(),
        );
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // WebView2 硬件加速：backdrop-filter（毛玻璃）依赖 GPU 合成，
    // 在软件渲染回退下属性会被解析但不执行，表现为「只有半透明没有模糊」。
    // 必须在 WebView2 创建之前设置该环境变量。
    #[cfg(windows)]
    {
        if std::env::var_os("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_none() {
            std::env::set_var(
                "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                "--enable-gpu --ignore-gpu-blocklist --enable-gpu-rasterization \
                 --enable-zero-copy --disable-gpu-driver-bug-workarounds",
            );
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // 已经开着的时候再双击另一个 .md：切到已有窗口并把新文件推给它
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
                if let Some(p) = extract_file_arg(&argv) {
                    let _ = w.emit_to("main", "open-file", p.to_string_lossy().to_string());
                }
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            show_main_window,
            document_stem,
            take_startup_file,
            register_open_with,
            assoc_status,
            open_default_apps_settings,
            notify_association_changed,
            export_pdf
        ])
        .setup(|_app| {
            // 启动参数里的文件先存起来，等前端 ready 后主动来取
            if let Some(p) = extract_file_arg(&std::env::args().collect::<Vec<_>>()) {
                if let Ok(mut slot) = startup_slot().lock() {
                    *slot = Some(p.to_string_lossy().to_string());
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("启动 Markdown Reader 失败");
}