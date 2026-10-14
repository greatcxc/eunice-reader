; ─────────────────────────────────────────────────────────────
;  Tauri NSIS 安装钩子
;
;  负责 Tauri 配置无法表达、而 Windows 又必须写对的几件事：
;    1. 右键菜单「使用 Eunice Reader 打开」（9 种扩展名）
;    2. 「打开方式」候选：登记成带名字的应用条目，而不是裸 exe
;    3. .md 的文件类型图标 —— 必须是文档图标，而不是 app 图标
;
;  ── 钩子名必须用 NSIS_HOOK_* ──
;  Tauri v2 的 installer.nsi 里是这样调用的：
;      !ifmacrodef NSIS_HOOK_POSTINSTALL
;        !insertmacro NSIS_HOOK_POSTINSTALL
;      !endif
;  它并**不**调用 customInstall / customUnInstall。
;  早先这里定义的是 customInstall，宏从未被 insertmacro，
;  于是整段注册逻辑静默失效 —— 而且因为宏不被展开，
;  里面引用的未定义变量也不会报错，构建照样成功。
;  现在用 POSTINSTALL / POSTUNINSTALL：它们分别在
;  「文件关联已写好」与「关联已拆除」之后执行，正好用来覆盖 / 清理。
;
;  ── 图标为什么必须写在 Markdown Document 上 ──
;  Tauri 用 APP_ASSOCIATE 建的 ProgId 就是 fileAssociations[].name
;  （本项目 = Markdown Document），并把它自己的 DefaultIcon 写成 exe 图标。
;  Windows 解析 .md 的图标时只看这个类（用户选过的 UserChoice 也指向它），
;  所以图标必须覆盖在它身上。早先覆盖的是另起的 EuniceReader.Markdown.1 ——
;  没有任何地方引用那个类，等于没写，.md 依旧显示 app 图标。
;
;  用 SHCTX 而不是写死 HKCR：Tauri 会根据 installMode
;  决定装到 HKLM 还是 HKCU（SHCTX 在 .onInit 里由 SetShellVarContext 设定），
;  写死会导致免安装模式注册错位置。
; ─────────────────────────────────────────────────────────────

!define EUNICE_PROGID "Markdown Document"   ; 必须与 tauri.conf.json 的 fileAssociations[].name 一致
!define EUNICE_APPNAME "Eunice Reader"
!define EUNICE_MENU_ID "EuniceReader"
!define EUNICE_ICON "$INSTDIR\icons\file-markdown.ico"
!define EUNICE_CMD '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

; 单个扩展名：文件图标 + 右键菜单 + 「打开方式」候选
!macro EUNICE_ASSOC_EXT EXT
  ; 先把原有图标值记一份，卸载时还原（别的程序也可能往这里写过）
  ReadRegStr $R0 SHCTX "Software\Classes\.${EXT}\DefaultIcon" ""
  WriteRegStr SHCTX "Software\Classes\.${EXT}" "EuniceIconBackup" "$R0"
  WriteRegStr SHCTX "Software\Classes\.${EXT}\DefaultIcon" "" "${EUNICE_ICON},0"

  WriteRegStr SHCTX "Software\Classes\.${EXT}\shell\${EUNICE_MENU_ID}" "" "使用 ${EUNICE_APPNAME} 打开"
  WriteRegStr SHCTX "Software\Classes\.${EXT}\shell\${EUNICE_MENU_ID}" "Icon" "${EUNICE_ICON},0"
  WriteRegStr SHCTX "Software\Classes\.${EXT}\shell\${EUNICE_MENU_ID}\command" "" '${EUNICE_CMD}'

  ; 值名必须是 ProgId。旧版本这里写的是 "${MAINBINARYNAME}.exe"，
  ; Windows 把它当成一个不存在的文件类 → 「打开方式」里显示成裸 exe，
  ; 用户选中它之后 UserChoice 也被记成这个 exe，图标自然还是 app 图标。
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${EUNICE_PROGID}" ""
  DeleteRegValue SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${MAINBINARYNAME}.exe"
!macroend

!macro EUNICE_UNASSOC_EXT EXT
  DeleteRegKey SHCTX "Software\Classes\.${EXT}\shell\${EUNICE_MENU_ID}"
  ; 只删自己登记的那个值，别删 .${EXT}\OpenWithProgids 这个键 ——
  ; 别的程序（编辑器等）也在里面登记
  DeleteRegValue SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${EUNICE_PROGID}"

  ; 图标：有备份就还原，没有就删掉我们写的那个值（不删整个键，
  ; 万一别的程序也往里写了东西）。标签带扩展名，9 次展开互不冲突。
  ReadRegStr $R0 SHCTX "Software\Classes\.${EXT}" "EuniceIconBackup"
  StrCmp $R0 "" eunice_icon_none_${EXT}
    WriteRegStr SHCTX "Software\Classes\.${EXT}\DefaultIcon" "" "$R0"
    Goto eunice_icon_done_${EXT}
  eunice_icon_none_${EXT}:
    DeleteRegValue SHCTX "Software\Classes\.${EXT}\DefaultIcon" ""
  eunice_icon_done_${EXT}:
  DeleteRegValue SHCTX "Software\Classes\.${EXT}" "EuniceIconBackup"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; 本宏在「文件关联已写好」之后执行，所以下面都是**覆盖 / 补齐**
  ; Tauri 写下的内容，而不是抢先创建。

  !insertmacro EUNICE_ASSOC_EXT "md"
  !insertmacro EUNICE_ASSOC_EXT "markdown"
  !insertmacro EUNICE_ASSOC_EXT "mdown"
  !insertmacro EUNICE_ASSOC_EXT "mkd"
  !insertmacro EUNICE_ASSOC_EXT "mdwn"
  !insertmacro EUNICE_ASSOC_EXT "mdtxt"
  !insertmacro EUNICE_ASSOC_EXT "mdtext"
  !insertmacro EUNICE_ASSOC_EXT "rmd"
  !insertmacro EUNICE_ASSOC_EXT "qmd"

  ; ── ProgId 本体 ──
  ; 类已由 Tauri 建好（.md 的默认值指向它），这里补齐它缺的：
  ; DefaultIcon 指向 exe 正是「.md 显示 app 图标」的直接原因。
  WriteRegStr SHCTX "Software\Classes\${EUNICE_PROGID}" "" "Markdown 文档"
  WriteRegStr SHCTX "Software\Classes\${EUNICE_PROGID}" "FriendlyTypeName" "Markdown 文档 (${EUNICE_APPNAME})"
  WriteRegStr SHCTX "Software\Classes\${EUNICE_PROGID}\DefaultIcon" "" "${EUNICE_ICON},0"
  WriteRegStr SHCTX "Software\Classes\${EUNICE_PROGID}\shell" "" "open"
  WriteRegStr SHCTX "Software\Classes\${EUNICE_PROGID}\shell\open" "" "使用 ${EUNICE_APPNAME} 打开"
  WriteRegStr SHCTX "Software\Classes\${EUNICE_PROGID}\shell\open\command" "" '${EUNICE_CMD}'

  ; ── 「打开方式」里的应用条目 ──
  ; 少了这一段，列表里显示的是 eunice-reader.exe（裸文件名 + app 图标）。
  ; 图标刻意也给文档图标：用户从列表里选中它之后 Windows 会把 UserChoice
  ; 指到这个条目，配 app 图标的话 .md 又会变成「看起来像程序」。
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe" "FriendlyAppName" "${EUNICE_APPNAME}"
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe" "ApplicationName" "${EUNICE_APPNAME}"
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe" "ApplicationCompany" "Eunice"
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\DefaultIcon" "" "${EUNICE_ICON},0"
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\shell\open\command" "" '${EUNICE_CMD}'

  ; ── 清理旧版本写错位置的东西 ──
  ; EuniceReader.Markdown.1 没有任何地方引用（图标写在它身上等于没写）。
  ; 程序首次启动时也会做同样的迁移，所以升级安装的机器不必等下次运行。
  DeleteRegKey SHCTX "Software\Classes\EuniceReader.Markdown.1"

  ; 标记已注册，卸载时据此判断是否清理
  WriteRegStr SHCTX "Software\EuniceReader" "ContextMenuInstalled" "1"

  ; 让资源管理器立刻重读关联并重建图标缓存。
  ; SHCNF_FLUSH(0x1000) 比只发事件更彻底 —— 只发事件时图标缓存可能还是旧的，
  ; 表现为「注册表已经对了，但资源管理器里还是老图标」。
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; 本宏在「关联已拆除」之后执行，只清理上面那套自己写进去的东西
  !insertmacro EUNICE_UNASSOC_EXT "md"
  !insertmacro EUNICE_UNASSOC_EXT "markdown"
  !insertmacro EUNICE_UNASSOC_EXT "mdown"
  !insertmacro EUNICE_UNASSOC_EXT "mkd"
  !insertmacro EUNICE_UNASSOC_EXT "mdwn"
  !insertmacro EUNICE_UNASSOC_EXT "mdtxt"
  !insertmacro EUNICE_UNASSOC_EXT "mdtext"
  !insertmacro EUNICE_UNASSOC_EXT "rmd"
  !insertmacro EUNICE_UNASSOC_EXT "qmd"

  ; ProgId 本体（含我们补的 DefaultIcon）由 Tauri 的 APP_UNASSOCIATE 在上面
  ; 逐个扩展名地删掉了，这里刻意不再删一次：
  ; 「Markdown Document」这个名字来自 tauri.conf.json，别的 Markdown 程序
  ; （尤其同样是 Tauri 做的）也可能用同名类，重复删有误伤的可能。

  ; 应用条目是我们建的（Tauri 不管这一块），必须删掉，
  ; 否则「打开方式」里会长期留一个指向已卸载程序的「Eunice Reader」
  DeleteRegKey SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe"

  DeleteRegKey SHCTX "Software\EuniceReader"

  ; 卸载后同样通知资源管理器刷新，否则图标要注销才消失
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)'
!macroend
