/**
 * 界面文案（i18n）。
 *
 * 为什么不用 i18next 之类的库：本项目只有两种语言、没有复数/性别/日期本地化需求，
 * 一张表 + 一个 t() 就够了；引入库反而是首屏体积与一层运行时。
 *
 * 语言从哪来：WebView2 的 `navigator.language` 就是 Windows 的显示语言，
 * 所以「跟随系统」不需要任何原生调用。用户在设置里可以手选覆盖。
 *
 * 词条命名：`区域.用途`，值里可以用 {name} 占位。
 */

export const LOCALE_AUTO = 'auto';

/** 设置面板里的下拉项 */
export const LOCALE_OPTIONS = [
  [LOCALE_AUTO, '跟随系统', 'Follow system'],
  ['zh-CN', '简体中文', '简体中文'],
  ['en-US', 'English', 'English'],
];

const DICT = {
  'zh-CN': {
    /* ── 顶栏 ── */
    'tb.open': '打开 · Ctrl+O',
    'tb.save': '保存 · Ctrl+S',
    'tb.saveas': '另存为 Markdown · Ctrl+Shift+S',
    'tb.pdf': '导出 PDF · Ctrl+Shift+E',
    'tb.view.read': '阅读 · Ctrl+1',
    'tb.view.split': '分栏（源码 + 预览）· Ctrl+2',
    'tb.view.edit': '编辑 · Ctrl+3',
    'tb.zen.on': 'Zen 模式 · Ctrl+Shift+Z',
    'tb.zen.off': '退出 Zen 模式 · Esc',
    'tb.outline': '大纲 · Ctrl+B',
    'tb.theme': '切换明暗 · Ctrl+Shift+D',
    'tb.settings': '设置 · Ctrl+,',
    'tb.noFile': '未打开文件',
    'tb.unsaved': '有未保存的修改',

    /* ── 窗口控制按钮 ── */
    'win.minimize': '最小化',
    'win.maximize': '最大化',
    'win.restore': '向下还原',
    'win.close': '关闭',

    /* ── 大纲 ── */
    'outline.title': '大纲',
    'outline.collapse': '收起大纲',
    'outline.empty': '当前文档没有标题。',
    'outline.noDoc': '还没有打开文档。',

    /* ── 空状态 ── */
    'empty.title': '还没有打开文档',
    'empty.sub': '打开一个 Markdown 文件开始阅读，或直接把文件拖进窗口',
    'empty.open': '打开',
    'empty.settings': '设置',
    'empty.zoom': '放大',

    /* ── 拖放 ── */
    'drop.left': '在左侧分栏打开',
    'drop.tab': '在新标签页打开',
    'drop.right': '在右侧分栏打开',

    /* ── 标签 ── */
    'tab.open': '打开文件 · Ctrl+O',
    'tab.close': '关闭标签',
    'tab.closeNamed': '关闭 {name}',
    'tab.untitled': '未命名',

    /* ── 状态栏 ── */
    'stat.lines': '行 {n}',
    'stat.words': '字 {n}',
    'stat.zoomTip': '显示缩放（Ctrl + = / - / 0，或 Ctrl + 滚轮）',

    /* ── 对话框 ── */
    'dlg.ok': '好',
    'dlg.cancel': '取消',
    'dlg.error': '错误',
    'dlg.warning': '无法导出',
    'dlg.unsaved.title': '未保存的修改',
    'dlg.unsaved.close': '「{name}」有未保存的修改，确定要关闭吗？',
    'dlg.unsaved.discard': '放弃修改并关闭',
    'dlg.openFailed': '打开失败：{err}',
    'dlg.saveFailed': '保存失败：{err}',
    'dlg.noDocForPdf': '请先打开一个文档再导出 PDF。',
    'dlg.exportFailed': '导出 PDF 失败：{err}',
    'dlg.renderFailed': '渲染出错：{err}',
    'dlg.sanitizeFailed': '内容消毒失败：{err}',
    'filter.markdown': 'Markdown 文档',
    'filter.pdf': 'PDF 文档',
    'save.untitled': '未命名.md',

    /* ── 设置面板 ── */
    'set.title': '设置',
    'set.close': '关闭 · Esc',
    'set.hint.recent': '打开文件是这个应用最高频的动作，所以放在最上面。',
    'set.sec.recent': '最近打开',
    'set.sec.theme': '正文主题',
    'set.sec.font': '正文字体',
    'set.sec.typo': '排版微调',
    'set.sec.behavior': '行为',
    'set.sec.assoc': '文件关联',
    'set.sec.keys': '快捷键',
    'set.recent.pinnedHint': '固定的 {n} 条不会被「清空未固定」移除。',
    'set.recent.hint': '点条目右侧的图钉可固定到顶部，固定项不会被清空。',
    'set.recent.empty': '还没有打开过文件。',
    'set.recent.open': '打开文件…',
    'set.recent.clear': '清空记录',
    'set.recent.clearLoose': '清空未固定',
    'set.recent.clearTip': '已固定的条目会保留',
    'set.pin': '固定到顶部',
    'set.unpin': '取消固定',
    'set.remove': '从列表移除',
    'set.removePinned': '取消固定并移除',
    'set.theme.count': '{n} 款',
    'set.theme.hint': '控制整篇文档的视觉：背景、正文、标题、引用块、表格、代码块底色全部联动。点一下即可在左侧文档中看到效果。',
    'set.font.count': '{n} 套',
    'set.font.hint': '中文字体内置完整字符集，任何汉字都不会回退到系统字体导致字形突变。',
    'set.typo.hint': '字号 × 缩放 = 实际显示：正文 {size} px × {zoom}% = {effSize} px，行宽 {width} px → {effWidth} px。缩放对正文、代码块、表格与编辑区同时生效。',
    'set.zoom': '显示缩放',
    'set.zoomReset': '回到 100%',
    'set.fontSize': '正文字号',
    'set.lineHeight': '行高',
    'set.width': '正文宽度',
    'set.glass': '界面透明度',
    'set.glass.solid': '实色（最清晰）',
    'set.glass.normal': '半透明（默认）',
    'set.glass.strong': '强通透',
    'set.windowGlass': '全屏毛玻璃',
    'set.windowGlass.off': '关闭（完全不透明）',
    'set.windowGlass.medium': '中等（隐约透出下层窗口）',
    'set.windowGlass.strong': '强（更透，模糊更明显）',
    'set.locale': '界面语言',
    'set.tabLayout': '标签布局',
    'set.tabLayout.top': '顶部（顶栏下方一条）',
    'set.tabLayout.left': '左侧（正文左边一列）',
    'set.outline.show': '显示大纲侧栏',
    'set.autosave': '编辑时自动保存',
    'set.assoc.hint': '资源管理器里 .md 的图标、右键菜单「使用 Eunice Reader 打开」，以及「打开方式」候选列表。',
    'set.assoc.checking': '正在检查…',
    'set.assoc.unavailable': '当前环境读不到注册表（开发模式），关联设置不可用。',
    'set.assoc.isDefault': '默认程序：{name}',
    'set.assoc.notDefault': '当前 .md 默认程序是「{name}」，不是 Eunice Reader',
    'set.assoc.other': '其他程序',
    'set.assoc.iconStale': '（图标待修复）',
    'set.assoc.userChoice': '（由系统「默认应用」决定，程序改不了）',
    'set.assoc.repair': '修复图标与右键菜单',
    'set.assoc.makeDefault': '设为默认打开方式',
    'set.assoc.openedTip': '（已打开系统「默认应用」设置：把 .md 指给 Eunice Reader 即可）',
    'set.assoc.openManual': '（请到系统「默认应用」里把 .md 指给 Eunice Reader）',
    'set.themeEmpty': '这个分类下暂时没有主题，换个分类看看。',
    'set.themeStarred': '★ 收藏 {n}',
    'set.star': '收藏',
    'set.unstar': '取消收藏',

    /* ── 快捷键表 ── */
    'keys.zoomIn': '放大显示',
    'keys.zoomOut': '缩小显示',
    'keys.zoomReset': '缩放复位 100%',
    'keys.zoomWheel': '连续缩放',
    'keys.zen': 'Zen 模式（Esc 退出）',
    'keys.open': '打开文件（新标签）',
    'keys.save': '保存',
    'keys.saveas': '另存为',
    'keys.pdf': '导出 PDF',
    'keys.views': '阅读 / 分栏 / 编辑',
    'keys.outline': '大纲侧栏',
    'keys.dark': '明暗切换',
    'keys.settings': '本设置',
    'keys.search': '搜索',
  },

  'en-US': {
    'tb.open': 'Open · Ctrl+O',
    'tb.save': 'Save · Ctrl+S',
    'tb.saveas': 'Save as Markdown · Ctrl+Shift+S',
    'tb.pdf': 'Export PDF · Ctrl+Shift+E',
    'tb.view.read': 'Reading · Ctrl+1',
    'tb.view.split': 'Split (source + preview) · Ctrl+2',
    'tb.view.edit': 'Edit · Ctrl+3',
    'tb.zen.on': 'Zen mode · Ctrl+Shift+Z',
    'tb.zen.off': 'Leave Zen mode · Esc',
    'tb.outline': 'Outline · Ctrl+B',
    'tb.theme': 'Toggle light / dark · Ctrl+Shift+D',
    'tb.settings': 'Settings · Ctrl+,',
    'tb.noFile': 'No file open',
    'tb.unsaved': 'Unsaved changes',

    'win.minimize': 'Minimize',
    'win.maximize': 'Maximize',
    'win.restore': 'Restore',
    'win.close': 'Close',

    'outline.title': 'Outline',
    'outline.collapse': 'Hide outline',
    'outline.empty': 'This document has no headings.',
    'outline.noDoc': 'No document open.',

    'empty.title': 'No document open',
    'empty.sub': 'Open a Markdown file to start reading, or drop one into the window',
    'empty.open': 'Open',
    'empty.settings': 'Settings',
    'empty.zoom': 'Zoom',

    'drop.left': 'Open in the left pane',
    'drop.tab': 'Open in a new tab',
    'drop.right': 'Open in the right pane',

    'tab.open': 'Open file · Ctrl+O',
    'tab.close': 'Close tab',
    'tab.closeNamed': 'Close {name}',
    'tab.untitled': 'Untitled',

    'stat.lines': 'Line {n}',
    'stat.words': '{n} words',
    'stat.zoomTip': 'Display zoom (Ctrl + = / - / 0, or Ctrl + wheel)',

    'dlg.ok': 'OK',
    'dlg.cancel': 'Cancel',
    'dlg.error': 'Error',
    'dlg.warning': 'Cannot export',
    'dlg.unsaved.title': 'Unsaved changes',
    'dlg.unsaved.close': '“{name}” has unsaved changes. Close it anyway?',
    'dlg.unsaved.discard': 'Discard and close',
    'dlg.openFailed': 'Could not open the file: {err}',
    'dlg.saveFailed': 'Could not save: {err}',
    'dlg.noDocForPdf': 'Open a document before exporting to PDF.',
    'dlg.exportFailed': 'PDF export failed: {err}',
    'dlg.renderFailed': 'Render error: {err}',
    'dlg.sanitizeFailed': 'Sanitizing failed: {err}',
    'filter.markdown': 'Markdown documents',
    'filter.pdf': 'PDF documents',
    'save.untitled': 'untitled.md',

    'set.title': 'Settings',
    'set.close': 'Close · Esc',
    'set.hint.recent': 'Opening files is the most frequent action, so it lives at the top.',
    'set.sec.recent': 'Recent',
    'set.sec.theme': 'Document theme',
    'set.sec.font': 'Body font',
    'set.sec.typo': 'Typography',
    'set.sec.behavior': 'Behaviour',
    'set.sec.assoc': 'File association',
    'set.sec.keys': 'Shortcuts',
    'set.recent.pinnedHint': 'The {n} pinned item(s) survive “Clear unpinned”.',
    'set.recent.hint': 'Use the pin on the right of a row to keep it on top; pinned items are never cleared.',
    'set.recent.empty': 'No files opened yet.',
    'set.recent.open': 'Open file…',
    'set.recent.clear': 'Clear list',
    'set.recent.clearLoose': 'Clear unpinned',
    'set.recent.clearTip': 'Pinned items are kept',
    'set.pin': 'Pin to top',
    'set.unpin': 'Unpin',
    'set.remove': 'Remove from list',
    'set.removePinned': 'Unpin and remove',
    'set.theme.count': '{n} themes',
    'set.theme.hint': 'Controls the whole document: background, body, headings, quotes, tables and code blocks move together. Click to preview it in the document on the left.',
    'set.font.count': '{n} presets',
    'set.font.hint': 'The CJK fonts ship with a complete character set, so no glyph ever falls back to a system font.',
    'set.typo.hint': 'Size × zoom = what you see: body {size} px × {zoom}% = {effSize} px, measure {width} px → {effWidth} px. Zoom applies to the body, code blocks, tables and the editor.',
    'set.zoom': 'Display zoom',
    'set.zoomReset': 'Back to 100%',
    'set.fontSize': 'Body size',
    'set.lineHeight': 'Line height',
    'set.width': 'Measure',
    'set.glass': 'UI transparency',
    'set.glass.solid': 'Solid (sharpest)',
    'set.glass.normal': 'Translucent (default)',
    'set.glass.strong': 'Very translucent',
    'set.windowGlass': 'Full-window glass',
    'set.windowGlass.off': 'Off (fully opaque)',
    'set.windowGlass.medium': 'Medium (windows behind show through faintly)',
    'set.windowGlass.strong': 'Strong (more transparent, stronger blur)',
    'set.locale': 'Interface language',
    'set.tabLayout': 'Tab layout',
    'set.tabLayout.top': 'Top (a strip under the toolbar)',
    'set.tabLayout.left': 'Left (a column beside the text)',
    'set.outline.show': 'Show outline sidebar',
    'set.autosave': 'Autosave while editing',
    'set.assoc.hint': 'The .md icon in Explorer, the “Open with Eunice Reader” context menu entry, and the Open-with candidate list.',
    'set.assoc.checking': 'Checking…',
    'set.assoc.unavailable': 'The registry is not readable here (dev mode); association settings are unavailable.',
    'set.assoc.isDefault': 'Default app: {name}',
    'set.assoc.notDefault': 'Currently .md opens with “{name}”, not Eunice Reader',
    'set.assoc.other': 'another app',
    'set.assoc.iconStale': ' (icon needs repair)',
    'set.assoc.userChoice': ' (decided in Windows Default apps; programs cannot change it)',
    'set.assoc.repair': 'Repair icon and context menu',
    'set.assoc.makeDefault': 'Set as default app',
    'set.assoc.openedTip': ' (Windows Default apps is open: point .md at Eunice Reader there)',
    'set.assoc.openManual': ' (Open Windows Default apps and point .md at Eunice Reader)',
    'set.themeEmpty': 'No themes in this category yet.',
    'set.themeStarred': '★ Starred {n}',
    'set.star': 'Star',
    'set.unstar': 'Unstar',

    'keys.zoomIn': 'Zoom in',
    'keys.zoomOut': 'Zoom out',
    'keys.zoomReset': 'Reset zoom to 100%',
    'keys.zoomWheel': 'Continuous zoom',
    'keys.zen': 'Zen mode (Esc to leave)',
    'keys.open': 'Open file (new tab)',
    'keys.save': 'Save',
    'keys.saveas': 'Save as',
    'keys.pdf': 'Export PDF',
    'keys.views': 'Reading / split / edit',
    'keys.outline': 'Outline sidebar',
    'keys.dark': 'Toggle light / dark',
    'keys.settings': 'This panel',
    'keys.search': 'Search',
  },
};

let current = 'zh-CN';

/** 保留语言代码的 BCP-47 形态，同时容忍 zh / zh-Hans / en 这类简写 */
export function normalizeLocale(value) {
  if (!value || value === LOCALE_AUTO) return LOCALE_AUTO;
  const v = String(value).toLowerCase();
  if (v.startsWith('zh')) return 'zh-CN';
  if (v.startsWith('en')) return 'en-US';
  return 'zh-CN';
}

/** 「跟随系统」时用 navigator.language —— WebView2 里它就是 Windows 的显示语言 */
export function detectLocale(pref) {
  const wanted = normalizeLocale(pref);
  if (wanted !== LOCALE_AUTO) return wanted;
  return normalizeLocale(navigator.language || navigator.languages?.[0] || 'zh-CN');
}

export function setLocale(locale) {
  current = normalizeLocale(locale) === LOCALE_AUTO ? detectLocale(LOCALE_AUTO) : normalizeLocale(locale);
  document.documentElement.lang = current;
  document.documentElement.dataset.locale = current;
  return current;
}

export const getLocale = () => current;
export const isEnglish = () => current === 'en-US';

/**
 * 取词条。找不到就回落到中文，再找不到就把 key 原样返回 ——
 * 宁可显示一个 key，也不要显示 undefined。
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 */
export function t(key, vars) {
  const table = DICT[current] || DICT['zh-CN'];
  let s = table[key] ?? DICT['zh-CN'][key] ?? key;
  if (vars) {
    s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k])));
  }
  return s;
}

/** 数据文件里的双语字段：label / labelEn、note / noteEn */
export function pick(zhValue, enValue) {
  return isEnglish() && enValue ? enValue : zhValue;
}

/**
 * 把 index.html 里的静态文案换掉。
 * data-i18n → textContent；data-i18n-tip → data-tip；data-i18n-aria → aria-label；
 * data-i18n-placeholder → placeholder。
 */
export function applyStaticI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll('[data-i18n-tip]')) {
    el.dataset.tip = t(el.dataset.i18nTip);
  }
  for (const el of root.querySelectorAll('[data-i18n-aria]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  }
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) {
    el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
  }
}
