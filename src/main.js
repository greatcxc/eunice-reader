/**
 * 应用主入口。
 *
 * 数据流：文件 → Rust 命令读取 → [编辑视图才进 CodeMirror] → markdown-it 渲染
 *        → DOMPurify 消毒 → 界面增强 → 预览区
 *
 * 启动路径上刻意只做「必须做的事」：
 *   - CodeMirror（~575KB）默认视图（阅读）不加载，切到编辑/分栏才动态 import
 *   - 公式/代码高亮（~416KB）由 markdown 管线在文档真的用到时才加载
 *   - mermaid（~5MB）只在文档里出现图表时才加载，不再有「启动后预热」
 *   - 打开方式登记/资源管理器刷新放到窗口显示之后
 *
 * 界面结构是「分组 → 标签」两层：
 *   - 分组（group）＝ 一块独立的阅读区，有自己的标签列表、视图模式与编辑器实例。
 *     默认只有一个；把文件拖到窗口两侧 1/4 才会出现第二个，形成分栏。
 *   - 标签（tab）＝ 一份文档。打开文件默认在新标签里打开并切换过去。
 *   两层都是「活动项」语义：活动分组决定快捷键作用于谁，活动标签决定看哪份文档。
 */

import './styles/app.css';
import './styles/zh-optimize.css';
import './styles/theme.css';
import './styles/print.css';
// katex 的样式表不在这里静态引入：它由 markdown 管线随公式引擎一起按需加载，
// 否则每个文档都要先下一份只有公式文档才用得上的 29KB CSS（且阻塞首屏渲染）。

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openDialog, save as saveDialog, ask } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { renderMarkdown, ensureRenderers } from './markdown/index.js';
import { sanitize, parseTrusted } from './markdown/sanitize.js';
import { enhance, resolvePaths, renderMermaid } from './markdown/enhance.js';
import { initSettingsModal } from './ui/settings.js';
import { icon } from './ui/icons.js';
import {
  loadSettings,
  getSettings,
  saveSettings,
  pushRecentFile,
  pinFile,
  unpinFile,
  removeRecentFile,
  clearRecentFiles,
  nextZoom,
  normalizeZoom,
  normalizeGlass,
} from './lib/store.js';
import { DOC_THEME_BY_ID } from './lib/doc-themes.js';
import { applyFont } from './lib/fonts.js';
import { t, setLocale, detectLocale, applyStaticI18n, getLocale } from './lib/i18n.js';
// createEditor 不在这里 import：编辑器是懒加载的，见 ensureEditor()

/* ------------------------------------------------------------------ */
/* 状态                                                                */
/* ------------------------------------------------------------------ */

const state = {
  /** 分组列表（1 个或 2 个） */
  groups: [],
  /** 活动分组 id：快捷键、工具栏、大纲都作用于它 */
  activeGid: null,

  dark: false,
  /** 最近一次交给统计的文本（延迟到空闲时段再算） */
  statsText: '',
};

let gidSeq = 0;
let tabSeq = 0;

/**
 * 长文档阈值：超过这个字数才启用 content-visibility（见 app.css）。
 * 短文档不值得付这份代价 —— 而且它会让浏览器原生查找（Ctrl+F）看不到
 * 尚未渲染的区域，所以只在真正需要它的长文档上开。
 */
const LONG_DOC_CHARS = 120_000;

/* ------------------------------------------------------------------ */
/* DOM                                                                 */
/* ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);

const dom = {
  workspace: $('workspace'),
  groups: $('groups'),
  outline: $('pane-outline'),
  outlineList: $('outline-list'),
  filename: $('lbl-filename'),
  dirty: $('lbl-dirty'),
  statLines: $('stat-lines'),
  statChars: $('stat-chars'),
  statCursor: $('stat-cursor'),
  statZoom: $('stat-zoom'),
  statTheme: $('stat-theme'),
  statEnc: $('stat-enc'),
  dropOverlay: $('drop-overlay'),
};

/* ------------------------------------------------------------------ */
/* 图标注入                                                            */
/* ------------------------------------------------------------------ */

const ICON_MAP = {
  'btn-open': 'folder-open',
  'btn-save': 'save',
  // 原先用 hard-drive-download，视觉上和「保存」混淆；
  // 改成 download，与保存形成「存回」/「导出」的清晰语义区分
  'btn-saveas': 'download',
  'btn-pdf': 'printer',
  'btn-view-read': 'eye',
  'btn-view-split': 'columns',
  'btn-view-edit': 'code',
  'btn-zen': 'maximize',
  'btn-toggle-outline': 'panel-left',
  'btn-outline-close': 'panel-left-close',
  'btn-theme-quick': 'moon',
  'btn-settings': 'settings',
  'btn-settings-close': 'x',
};

function paintIcons() {
  for (const [id, name] of Object.entries(ICON_MAP)) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = icon(name, id === 'btn-settings-close' ? 16 : 17);
  }
  for (const b of document.querySelectorAll('.tab-add')) b.innerHTML = icon('plus', 15);
  for (const a of document.querySelectorAll('.empty-art')) a.innerHTML = icon('book-open', 44);
  // 自绘窗口控制：与界面同一套图标语言
  $('btn-win-min').innerHTML = icon('minus', 15);
  $('btn-win-close').innerHTML = icon('x', 15);
  paintMaximizeIcon();
}

/** 最大化与还原是同一个按钮：图标跟着窗口状态走 */
let winMaximized = false;

function paintMaximizeIcon() {
  const btn = $('btn-win-max');
  if (!btn) return;
  btn.innerHTML = icon(winMaximized ? 'copy' : 'square', 14);
  btn.setAttribute('aria-label', t(winMaximized ? 'win.restore' : 'win.maximize'));
  btn.dataset.tip = t(winMaximized ? 'win.restore' : 'win.maximize');
  // 最大化时窗口贴满屏幕，右上角那 1px 圆角反而显得毛糙
  document.documentElement.dataset.winMax = winMaximized ? 'on' : 'off';
}

/* ------------------------------------------------------------------ */
/* 自绘窗口控制与缩放                                                  */
/* ------------------------------------------------------------------ */

/**
 * 无边框窗口的最小化 / 最大化 / 关闭，以及 8 个方向的缩放热区。
 *
 * 窗口在 tauri.conf.json 里是 `decorations: false` + `transparent: true`，
 * 系统标题栏没有了，这些职责全部落到界面上：
 *   - 拖动 / 双击最大化 → 顶栏的 data-tauri-drag-region（Tauri 内建行为）
 *   - 缩放 → startResizeDragging，把指针方向交给系统去做真正的缩放循环
 *     （自己算尺寸会在缩放时抖动，而且拖到屏幕边缘的贴边逻辑会失效）
 * 非 Tauri 环境（浏览器里做 UI 调试）全部静默降级，界面照样能用。
 */
function bindWindowControls() {
  const win = () => getCurrentWindow();

  $('btn-win-min').addEventListener('click', () => win().minimize().catch(() => {}));
  $('btn-win-close').addEventListener('click', () => win().close().catch(() => {}));
  $('btn-win-max').addEventListener('click', async () => {
    try {
      await win().toggleMaximize();
      winMaximized = await win().isMaximized();
      paintMaximizeIcon();
    } catch {
      /* 非 Tauri 环境 */
    }
  });

  // 从系统侧改状态（双击顶栏、Win+↑、拖到屏幕顶部贴边）也要同步图标
  win()
    .onResized(async () => {
      try {
        const now = await win().isMaximized();
        if (now !== winMaximized) {
          winMaximized = now;
          paintMaximizeIcon();
        }
      } catch {
        /* ignore */
      }
    })
    .catch(() => {});
  win()
    .isMaximized()
    .then((v) => {
      winMaximized = Boolean(v);
      paintMaximizeIcon();
    })
    .catch(() => {});

  for (const handle of document.querySelectorAll('#resize-handles .rz')) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      win()
        .startResizeDragging(handle.dataset.dir)
        .catch(() => {});
    });
  }
}

/* ------------------------------------------------------------------ */
/* 全屏毛玻璃                                                          */
/* ------------------------------------------------------------------ */

/**
 * 窗口级的 acrylic 玻璃（DWM 把窗口后面的内容模糊掉，见 tauri.conf.json 的
 * windowEffects）+ 界面底色的半透明化（CSS 的 --paper-alpha 等）。
 *
 * 关掉时不需要撤销系统效果：把界面画成不透明，后面那层模糊自然就看不见了 ——
 * 少一次可能失败的运行时调用，也少一种状态。
 */
function applyWindowGlass() {
  document.documentElement.dataset.windowGlass = normalizeGlass(getSettings().windowGlass);
}

/* ------------------------------------------------------------------ */
/* 语言                                                                */
/* ------------------------------------------------------------------ */

/**
 * 切界面语言。
 *
 * 「跟随系统」直接读 navigator.language —— WebView2 里它就是 Windows 的显示语言，
 * 不需要任何原生调用。切完要重刷三处：静态文案、动态渲染的（标签/状态栏/设置面板）、
 * 以及 html lang（影响字体回退与断词规则）。
 */
function applyLocale() {
  const locale = setLocale(detectLocale(getSettings().locale));
  applyStaticI18n();
  paintIcons();
  paintZoom();
  for (const g of state.groups) renderTabs(g);
  updateFilename();
  updateStats();
  buildOutline();
  // 设置抽屉开着就重画一遍，否则里面还是旧语言
  if (settingsModal?.isOpen?.()) settingsModal.refresh();
  return locale;
}

/* ------------------------------------------------------------------ */
/* 分组与标签                                                          */
/* ------------------------------------------------------------------ */

/** 分组元素内部要用到的节点，一次性解析好挂到分组上 */
function bindGroupDom(g) {
  const el = g.el;
  g.dom = {
    tabbar: el.querySelector('.tabbar'),
    tablist: el.querySelector('.tabbar .tablist'),
    tabAdd: [...el.querySelectorAll('.tab-add')],
    editorPane: el.querySelector('.pane-editor'),
    editorHost: el.querySelector('.editor-host'),
    splitter: el.querySelector('.splitter'),
    previewPane: el.querySelector('.pane-preview'),
    preview: el.querySelector('.markdown-body'),
    emptyState: el.querySelector('.empty-state'),
  };
}

/**
 * 新建一个分组。
 *
 * @param {{id?:string, mode?:string, before?:HTMLElement|null, after?:HTMLElement|null}} opts
 *        before / after 决定插到哪个位置（拖到某一栏的左右两侧用得到），
 *        都没有就追加到末尾。
 */
function createGroup(opts = {}) {
  const id = opts.id || `g${++gidSeq}`;
  const mode = opts.mode || getSettings().viewMode || 'read';

  // 第一个分组用 index.html 里的静态结构（首屏不必再建一次 DOM），
  // 之后的分组克隆它 —— 结构与样式只有一处真相来源。
  let el;
  if (state.groups.length === 0 && !opts.before && !opts.after) {
    el = $('group-g1');
    el.dataset.gid = id;
  } else {
    const template = $('group-g1');
    el = template.cloneNode(true);
    el.removeAttribute('id');
    el.dataset.gid = id;
    if (opts.before) dom.groups.insertBefore(el, opts.before);
    else if (opts.after) dom.groups.insertBefore(el, opts.after.nextSibling);
    else dom.groups.appendChild(el);
  }

  const g = {
    id,
    el,
    mode,
    tabs: [],
    activeId: null,
    dom: null,
    editor: null,
    editorReady: null,
    renderSeq: 0,
    renderTimer: null,
    statsTimer: null,
    autosaveTimer: null,
    previewNeedsRerender: false,
    outlineObserver: null,
  };
  bindGroupDom(g);
  el.className = `group is-${mode}`;

  g.dom.tablist.innerHTML = '';

  state.groups.push(g);
  // state.groups 的顺序必须与 DOM 一致，否则「第几栏」在两边指的是不同的东西。
  // 插到中间时 push 的顺序就不对了，所以统一按 DOM 顺序重排一次 ——
  // 三个分栏（左/中/右都能插）之后这条是硬要求，不能再靠 if (before) 特判。
  state.groups = [...dom.groups.children]
    .map((node) => state.groups.find((x) => x.el === node))
    .filter(Boolean);

  for (const btn of g.dom.tabAdd) {
    btn.innerHTML = icon('plus', 15);
    btn.addEventListener('click', () => {
      setActiveGroup(g);
      openFileDialog();
    });
  }
  // 点分组里任何地方都把它设为活动分组（否则快捷键不知道该作用于哪一栏）
  el.addEventListener('mousedown', () => setActiveGroup(g), true);

  initGroupSplitter(g);
  syncGroupChrome();
  return g;
}

function removeGroup(g) {
  if (state.groups.length <= 1) return;
  g.outlineObserver?.disconnect();
  g.editor?.destroy();
  g.el.remove();
  state.groups = state.groups.filter((x) => x !== g);
  if (state.activeGid === g.id) setActiveGroup(state.groups[0]);
  syncGroupChrome();
}

function setActiveGroup(g) {
  if (!g || state.activeGid === g.id) return;
  state.activeGid = g.id;
  syncGroupChrome();
  buildOutline(g);
  updateFilename();
  updateStats();
}

const activeGroup = () => state.groups.find((g) => g.id === state.activeGid) || state.groups[0];
const activeTab = (g = activeGroup()) => g?.tabs.find((t) => t.id === g.activeId) || null;

/** 分组/标签的外观状态：活动分组、是否分栏、空状态 */
function syncGroupChrome() {
  const multi = state.groups.length > 1;
  dom.groups.classList.toggle('is-multi', multi);
  for (const g of state.groups) {
    g.el.classList.toggle('is-active', g.id === state.activeGid);
    const empty = g.tabs.length === 0;
    g.el.classList.toggle('is-empty', empty);
  }
  if (dom.outline) dom.outline.hidden = !getSettings().showOutline;
}

/** 标签显示名：H1 → 正文前 N 字 → 文件名 */
function titleFromText(text, path) {
  const h1 = /^[ \t]{0,3}#[ \t]+(.+?)[ \t]*#*[ \t]*$/m.exec(text || '');
  if (h1) return h1[1].replace(/[*_`~]/g, '').trim().slice(0, 40);

  const plain = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]{0,3}>\s?/gm, '')
    .replace(/[*_`~[\]()!]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain) return plain.slice(0, 16) + (plain.length > 16 ? '…' : '');
  return fileName(path) || t('tab.untitled');
}

const fileName = (p) => (p ? p.split(/[\\/]/).pop() : '');

function createTab(doc) {
  return {
    id: ++tabSeq,
    path: doc.path,
    baseDir: doc.baseDir ?? baseDirOf(doc.path),
    encoding: doc.encoding,
    text: doc.content,
    dirty: false,
    title: titleFromText(doc.content, doc.path),
    headings: [],
    stats: { text: null, lines: 0, words: 0 },
    statsText: '',
    scrollTop: 0,
  };
}

function baseDirOf(path) {
  if (!path) return null;
  const sep = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  return sep > 0 ? path.slice(0, sep) : null;
}

/* ------------------------------------------------------------------ */
/* 标签栏渲染                                                          */
/* ------------------------------------------------------------------ */

function renderTabs(g) {
  const list = g.dom.tablist;
  list.innerHTML = '';
  for (const tab of g.tabs) {
    const name = document.createElement('span');
    name.className = 'tab-name';
    name.textContent = tab.title;

    const dot = document.createElement('span');
    dot.className = 'tab-dot';

    const x = document.createElement('button');
    x.className = 'tab-x';
    x.type = 'button';
    x.title = t('tab.close');
    x.setAttribute('aria-label', t('tab.closeNamed', { name: tab.title }));
    x.innerHTML = icon('x', 13);
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(g, tab.id);
    });

    const el = document.createElement('div');
    el.className = `tab${tab.id === g.activeId ? ' is-on' : ''}${tab.dirty ? ' is-dirty' : ''}`;
    el.dataset.tabId = String(tab.id);
    // 提示里带上「可拖动」：拖标签换栏/分栏没有任何可见入口，不写出来没人知道
    el.title = [tab.path || tab.title, t('tab.dragHint')].join('\n');
    // HTML5 拖放：先走拖拽阈值才进入拖动，点选与中键关闭都不受影响
    el.draggable = true;
    el.setAttribute('role', 'tab');
    el.tabIndex = 0;
    el.append(dot, name, x);
    el.addEventListener('click', () => switchToTab(g, tab.id));
    el.addEventListener('auxclick', (e) => {
      // 中键关闭：浏览器标签的肌肉记忆
      if (e.button === 1) {
        e.preventDefault();
        closeTab(g, tab.id);
      }
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        switchToTab(g, tab.id);
      }
    });
    list.appendChild(el);
  }
  // 当前标签滚进可视区（标签多了以后必须保证「刚打开的那个」看得见）
  list.querySelector('.tab.is-on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** 只更新脏标记，不重建整个标签栏（每次击键都重建会很吵） */
function paintTabDirty(g) {
  const tab = activeTab(g);
  for (const el of g.el.querySelectorAll('.tab')) {
    el.classList.toggle('is-on', Number(el.dataset.tabId) === g.activeId);
    el.classList.toggle('is-dirty', Boolean(tab?.dirty) && Number(el.dataset.tabId) === g.activeId);
  }
}

/* ------------------------------------------------------------------ */
/* 标签操作                                                            */
/* ------------------------------------------------------------------ */

function switchToTab(g, tabId) {
  if (g.activeId === tabId) {
    setActiveGroup(g);
    return;
  }
  commitEditor(g);
  const prev = activeTab(g);
  if (prev) {
    prev.scrollTop = g.dom.previewPane.scrollTop;
    if (prev.dirty) {
      paintTabDirty(g);
      bindAutosave(g);
    }
  }
  g.activeId = tabId;
  setActiveGroup(g);
  const tab = activeTab(g);
  if (!tab) return;
  loadTabIntoEditor(g, tab);
  renderTabs(g);
  scheduleRender(g, true);
  updateFilename();
  updateStats();
}

/** 把编辑器当前内容写回标签（编辑器只在编辑/分栏视图下存在） */
function commitEditor(g) {
  const tab = activeTab(g);
  if (!tab || !g.editor) return;
  tab.text = g.editor.getValue();
  tab.dirty = !g.editor.isClean();
}

function loadTabIntoEditor(g, tab) {
  if (!g.editor) return;
  g.editor.setValue(tab.text);
  if (!tab.dirty) g.editor.markClean();
}

async function closeTab(g, tabId) {
  const tab = g.tabs.find((t) => t.id === tabId);
  if (!tab) return;

  if (tab.dirty) {
    const ok = await ask(t('dlg.unsaved.close', { name: tab.title }), {
      title: t('dlg.unsaved.title'),
      kind: 'warning',
      okLabel: t('dlg.unsaved.discard'),
      cancelLabel: t('dlg.cancel'),
    });
    if (!ok) return;
  }

  const wasActive = g.activeId === tabId;
  const removedAt = g.tabs.findIndex((t) => t.id === tabId);
  g.tabs = g.tabs.filter((t) => t.id !== tabId);

  if (!g.tabs.length) {
    g.activeId = null;
    // 这一栏空了：还有别的栏就把它收掉，否则回到空状态
    if (state.groups.length > 1) {
      removeGroup(g);
    } else {
      syncGroupChrome();
      renderTabs(g);
      updateFilename();
      updateStats();
    }
    return;
  }

  if (wasActive) {
    // 关掉第 i 个就读它右边那个；关的是最后一个就读新的最后一个
    g.activeId = g.tabs[Math.min(removedAt, g.tabs.length - 1)].id;
  }
  renderTabs(g);
  if (wasActive) {
    loadTabIntoEditor(g, activeTab(g));
    scheduleRender(g, true);
  }
  syncGroupChrome();
  updateFilename();
  updateStats();
}

/* ------------------------------------------------------------------ */
/* 标签在栏之间搬家                                                    */
/* ------------------------------------------------------------------ */

/**
 * 把一个标签搬到另一栏。
 *
 * 这是「同栏两个标签 → 左右分栏」的实现核心：拖动标签落到某一栏的侧档时，
 * 先建栏再搬标签，走的都是这一条路径。
 *
 * 三个必须自己处理的点：
 *   1. 编辑器是**每栏一个 CodeMirror 实例**，搬之前得先把源栏编辑器的内容
 *      写回标签（commitEditor），否则正在编辑的那几个字会跟着源栏一起蒸发；
 *   2. 源栏空了就整栏收掉 —— 这既是「取消分栏」的自然路径，
 *      也避免留下一个没有任何标签的空壳栏；
 *   3. 目的栏已经开着同一个文件时不搬（否则同一栏会出现两个指向同一文件的标签），
 *      直接返回 false，让调用方保持原状。
 *
 * @returns {boolean} 是否真的搬动了
 */
function moveTabToGroup(from, tabId, to) {
  if (!from || !to || from === to) return false;
  const i = from.tabs.findIndex((t) => t.id === tabId);
  if (i < 0) return false;

  const tab = from.tabs[i];
  if (tab.path && to.tabs.some((t) => t.path === tab.path)) return false;

  commitEditor(from);
  const wasActive = from.activeId === tabId;
  if (wasActive) tab.scrollTop = from.dom.previewPane.scrollTop;

  from.tabs.splice(i, 1);
  const sourceEmptied = from.tabs.length === 0;

  to.tabs.push(tab);
  to.activeId = tab.id;
  setActiveGroup(to);
  loadTabIntoEditor(to, tab);
  renderTabs(to);
  scheduleRender(to, true);

  if (sourceEmptied) {
    from.activeId = null;
    removeGroup(from); // 内部会 syncGroupChrome
  } else {
    if (wasActive) {
      // 搬走的是当前标签：源栏落到右邻（没有就落到最后一个）
      from.activeId = from.tabs[Math.min(i, from.tabs.length - 1)].id;
      loadTabIntoEditor(from, activeTab(from));
      scheduleRender(from, true);
    }
    renderTabs(from);
  }

  syncGroupChrome();
  updateFilename();
  updateStats();
  return true;
}

/* ------------------------------------------------------------------ */
/* 打开文件                                                            */
/* ------------------------------------------------------------------ */

/** 把文件打开到某个分组的某个新标签里；同一栏里已打开过就切过去 */
async function openPath(path, opts = {}) {
  if (!path) return null;
  const g = opts.group || activeGroup();

  const existing = g.tabs.find((t) => t.path === path);
  if (existing) {
    switchToTab(g, existing.id);
    return existing;
  }

  let doc;
  try {
    doc = await invoke('read_text_file', { path });
  } catch (err) {
    await ask(t('dlg.openFailed', { err }), { title: t('dlg.error'), kind: 'error', okLabel: t('dlg.ok') });
    return null;
  }
  if (!doc) return null;

  const tab = createTab(doc);
  g.tabs.push(tab);
  g.activeId = tab.id;
  setActiveGroup(g);
  loadTabIntoEditor(g, tab);
  renderTabs(g);
  syncGroupChrome();
  updateFilename();
  scheduleRender(g, true);
  updateStats();
  pushRecentFile(doc.path);
  return tab;
}

async function openFileDialog() {
  const picked = await openDialog({
    multiple: false,
    filters: [{ name: t('filter.markdown'), extensions: ['md', 'markdown', 'mdown', 'mkd', 'mdwn', 'mdtxt', 'mdtext', 'rmd', 'qmd'] }],
  });
  if (typeof picked === 'string') openPath(picked);
}

/* ------------------------------------------------------------------ */
/* 编辑器（懒加载，每个分组一个实例）                                   */
/* ------------------------------------------------------------------ */

// CodeMirror 全家桶 ~575KB，而默认视图是「阅读」——.group.is-read 下
// 编辑器面板本来就是 display:none。启动时创建它、并把整篇文档灌进去做
// 语法解析，对「只是读一份文档」是纯浪费；只有切到编辑/分栏才真的需要。
async function ensureEditor(g) {
  if (g.editor) return g.editor;
  if (!g.editorReady) {
    g.editorReady = import('./editor/editor.js').then(({ createEditor }) => {
      if (g.editor) return g.editor;
      const e = createEditor(g.dom.editorHost, {
        onChange: () => {
          const tab = activeTab(g);
          if (tab) tab.dirty = true;
          paintTabDirty(g);
          updateStats();
          scheduleRender(g);
          bindAutosave(g);
        },
        onCursor: (line, col) => {
          if (g.id === state.activeGid) updateStats(line, col);
        },
        onSave: () => saveFile(g),
      });
      const tab = activeTab(g);
      e.setValue(tab ? tab.text : '');
      if (!tab || !tab.dirty) e.markClean();
      e.setDark(state.dark);
      g.editor = e;
      return e;
    });
  }
  return g.editorReady;
}

/** 当前活动标签的正文：有编辑器时以编辑器为准 */
function getText(g = activeGroup()) {
  const tab = activeTab(g);
  if (!tab) return '';
  return g.editor ? g.editor.getValue() : tab.text;
}

function isDirty(g = activeGroup()) {
  const tab = activeTab(g);
  if (!tab) return false;
  return g.editor ? !g.editor.isClean() : tab.dirty;
}

/* ------------------------------------------------------------------ */
/* 文本统计                                                            */
/* ------------------------------------------------------------------ */

// 中文按字计、西文按词计。一趟正则扫完全文：
// 旧写法是 `match(中文)` + `replace(中文,' ')` 再 `match(西文)`，在 5MB 文档上
// 每次调用要 150ms，而它挂在每次光标移动上（按一下方向键就卡一下）。
const CJK_OR_WORD = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]|[A-Za-z0-9_'-]+/g;
const CJK_CHAR = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/;

function countWords(text) {
  let cjk = 0;
  let words = 0;
  for (const m of text.matchAll(CJK_OR_WORD)) {
    if (CJK_CHAR.test(m[0])) cjk++;
    else words++;
  }
  return cjk + words;
}

/** 行数：不 split（大文档会造出几十万个字符串），直接数换行 */
function countLines(text) {
  let n = 1;
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n++;
  return n;
}

/**
 * 统计排到「改变停止后 + 空闲」再算。
 * 文本由调用方传入（渲染时已经取过一份），避免再复制一次全文。
 */
function scheduleStats(g, text) {
  const tab = activeTab(g);
  if (!tab) return;
  tab.statsText = text;
  clearTimeout(g.statsTimer);
  g.statsTimer = setTimeout(() => {
    const run = () => {
      const t = tab.statsText;
      if (tab.stats.text === t) return;
      tab.stats = { text: t, lines: countLines(t), words: countWords(t) };
      if (g.id === state.activeGid) updateStats();
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 600 });
    else run();
  }, 400);
}

/* ------------------------------------------------------------------ */
/* 主题                                                                */
/* ------------------------------------------------------------------ */

/**
 * 应用主题。
 *
 * 关键：正文主题（docTheme）和界面明暗（data-theme）是**两件独立的事**。
 * 之前把它们绑在一起，light/dark 互相覆盖，导致换了主题但看着没变化。
 * 现在：正文主题决定文档内所有颜色；data-theme 只管应用外壳（顶栏、侧栏）。
 */
function applyThemes() {
  const s = getSettings();
  const root = document.documentElement;

  // 正文主题：直接切 data 属性，主题 CSS 靠它选中
  const docTheme = DOC_THEME_BY_ID.get(s.docTheme) || DOC_THEME_BY_ID.get('plain');
  root.dataset.themeDoc = docTheme.id;

  // 界面明暗：跟随正文主题的深浅，除非用户手动切过
  state.dark = s.uiDark !== null ? s.uiDark : docTheme.dark;
  root.dataset.theme = state.dark ? 'dark' : 'light';

  // 玻璃强度
  root.dataset.glass = s.glassLevel || 'normal';

  // 排版参数
  root.style.setProperty('--mr-font-size', `${s.fontSize}px`);
  root.style.setProperty('--mr-line-height', String(s.lineHeight));
  root.style.setProperty('--mr-content-width', `${s.contentWidth}px`);
  // 缩放系数：只改这一个变量，字号/行宽/留白都由 CSS 里的 calc() 联动
  root.style.setProperty('--mr-zoom', String(s.zoom));

  // 字体
  applyFont(s.fontPreset);

  dom.statTheme.textContent = docTheme.label;
  paintZoom();

  const themeBtn = $('btn-theme-quick');
  if (themeBtn) themeBtn.innerHTML = icon(state.dark ? 'sun' : 'moon', 17);

  for (const g of state.groups) {
    g.editor?.setDark(state.dark);
    if (g.previewNeedsRerender) scheduleRender(g, true);
  }
}

/* ------------------------------------------------------------------ */
/* 显示缩放                                                            */
/* ------------------------------------------------------------------ */

/**
 * 缩放是「一个系数」，不是「几个字号」。
 *
 * 字号、行宽、内边距、编辑器字号全部写成 calc(基准 × --mr-zoom)，
 * 所以放大时正文的每行字数保持不变、整块版面等比变大（和浏览器 Ctrl+= 一致），
 * 而设置里的「正文字号」始终是基准值 —— 放大 150% 后再调字号，
 * 调的仍是基准，不会在放大后的数字上再叠一层。
 */

/** 状态栏上的百分比：非 100% 时染色，提示「你不在默认档位」 */
function paintZoom() {
  if (!dom.statZoom) return;
  const z = normalizeZoom(getSettings().zoom);
  dom.statZoom.textContent = `${Math.round(z * 100)}%`;
  dom.statZoom.classList.toggle('is-zoomed', Math.abs(z - 1) > 1e-6);
}

function applyZoom(value) {
  const z = normalizeZoom(value);
  saveSettings({ zoom: z });
  document.documentElement.style.setProperty('--mr-zoom', String(z));
  paintZoom();
  return z;
}

function zoomStep(dir) {
  return applyZoom(nextZoom(getSettings().zoom, dir));
}

function resetZoom() {
  if (Math.abs(getSettings().zoom - 1) < 1e-6) return 1;
  return applyZoom(1);
}

/** Ctrl + 滚轮缩放：必须 passive:false 才能 preventDefault（否则和 WebView 自带缩放叠加） */
function bindZoomWheel() {
  let last = 0;
  dom.workspace.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const now = e.timeStamp || performance.now();
      if (now - last < 90) return;
      last = now;
      zoomStep(e.deltaY < 0 ? 1 : -1);
    },
    { passive: false },
  );
}

/* ------------------------------------------------------------------ */
/* 渲染                                                                */
/* ------------------------------------------------------------------ */

function scheduleRender(g, immediate = false) {
  clearTimeout(g.renderTimer);
  g.renderTimer = setTimeout(() => render(g), immediate ? 0 : 120);
}

async function render(g = activeGroup()) {
  const tab = activeTab(g);
  if (!tab) {
    g.dom.preview.replaceChildren();
    return;
  }

  const seq = ++g.renderSeq;
  const text = tab.id === g.activeId && g.editor ? g.editor.getValue() : tab.text;

  // 公式/高亮引擎按需装配：首次遇到代码块或公式会多等一次动态 import，
  // 换来的是一年里 99% 的冷启动都不用解析这 416KB。
  await ensureRenderers(text);
  if (seq !== g.renderSeq) return; // 等待期间又改过，这次结果已经过期

  let html;
  try {
    html = renderMarkdown(text);
  } catch (err) {
    g.dom.preview.textContent = t('dlg.renderFailed', { err: err?.message || err });
    return;
  }
  if (seq !== g.renderSeq) return;

  let frag;
  try {
    // 文档里连一个 '<' 都没有 → 输出里不可能有来自文档的标签，
    // 不必为整棵树跑一遍 DOMPurify（实测 1MB 文档、1.28MB HTML 上约 72ms）。
    // 只要出现过 '<'（哪怕只是 `a < b`），就老老实实消毒。
    frag = text.includes('<') ? sanitize(html) : parseTrusted(html);
  } catch (err) {
    g.dom.preview.textContent = t('dlg.sanitizeFailed', { err: err?.message || err });
    return;
  }
  if (seq !== g.renderSeq) return;

  if (tab.baseDir) resolvePaths(frag, tab.baseDir);

  // 长文档才开 content-visibility：视口外的块跳过布局与绘制
  document.body.classList.toggle('is-longdoc', g.id === state.activeGid && text.length >= LONG_DOC_CHARS);

  g.dom.preview.replaceChildren(frag);
  // 一次遍历同时完成界面增强与标题收集（以前是 5 次全树扫描）
  const headings = enhance(g.dom.preview, g.dom.previewPane);

  // 标签名跟着 H1 走：作者改了标题，标签也该跟着改
  const nextTitle = titleFromText(text, tab.path);
  if (nextTitle && nextTitle !== tab.title) {
    tab.title = nextTitle;
    renderTabs(g);
  }

  tab.headings = headings;
  g.previewNeedsRerender = g.dom.preview.querySelector('[data-mermaid-source]') !== null;
  if (g.previewNeedsRerender) renderMermaid(g.dom.preview, state.dark).catch(() => {});

  if (g.id === state.activeGid) buildOutline(g);
  scheduleStats(g, text);

  // 切回标签时恢复上次读到哪
  if (tab.scrollTop) {
    g.dom.previewPane.scrollTop = tab.scrollTop;
    tab.scrollTop = 0;
  }
  if (g.id === state.activeGid) updateStats();
}

/* ------------------------------------------------------------------ */
/* 大纲                                                                */
/* ------------------------------------------------------------------ */

function buildOutline(g = activeGroup()) {
  const tab = activeTab(g);
  const headings = tab?.headings || [];
  dom.outlineList.innerHTML = '';

  if (!headings.length) {
    dom.outlineList.appendChild(
      Object.assign(document.createElement('div'), {
        className: 'outline-empty',
        textContent: t(tab ? 'outline.empty' : 'outline.noDoc'),
      }),
    );
    return;
  }

  for (const h of headings) {
    const btn = document.createElement('button');
    btn.className = 'outline-item';
    btn.type = 'button';
    btn.dataset.level = String(h.level);
    btn.dataset.id = h.id;
    const label = document.createElement('span');
    label.textContent = h.text;
    btn.appendChild(label);
    btn.addEventListener('click', () => {
      const target = g.dom.preview.querySelector(`#${CSS.escape(h.id)}`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    dom.outlineList.appendChild(btn);
  }

  // 滚动时高亮当前所在章节
  g.outlineObserver?.disconnect();
  g.outlineObserver = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        dom.outlineList.querySelectorAll('.outline-item').forEach((el) => {
          el.classList.toggle('is-active', el.dataset.id === e.target.id);
        });
      }
    },
    { root: g.dom.previewPane, rootMargin: '0px 0px -70% 0px' },
  );
  for (const h of headings) {
    const el = g.dom.preview.querySelector(`#${CSS.escape(h.id)}`);
    if (el) g.outlineObserver.observe(el);
  }
}

/* ------------------------------------------------------------------ */
/* 状态栏                                                              */
/* ------------------------------------------------------------------ */

function updateStats(line, col) {
  const g = activeGroup();
  const tab = activeTab(g);

  if (!tab) {
    dom.statLines.textContent = '—';
    dom.statChars.textContent = '';
    dom.statCursor.textContent = '';
    dom.statEnc.hidden = true;
    dom.dirty.hidden = true;
    return;
  }

  // 行数：编辑器在时 O(1) 直接问；阅读模式用缓存值
  const lines = g.editor ? g.editor.lineCount() : tab.stats.lines;
  dom.statLines.textContent = t('stat.lines', { n: lines });
  dom.statChars.textContent = t('stat.words', { n: tab.stats.words });
  dom.statCursor.textContent = line != null ? `${line}:${col}` : '';

  const legacy = tab.encoding !== 'utf-8';
  dom.statEnc.hidden = !legacy;
  dom.statEnc.textContent = String(tab.encoding || '').toUpperCase();
  dom.statEnc.classList.toggle('is-legacy', legacy);

  dom.dirty.hidden = !isDirty(g);
}

function updateFilename() {
  const tab = activeTab();
  if (tab) {
    dom.filename.textContent = fileName(tab.path) || tab.title;
    dom.filename.title = tab.path || tab.title;
  } else {
    dom.filename.textContent = t('tb.noFile');
    dom.filename.title = '';
  }
}

/* ------------------------------------------------------------------ */
/* 文件操作                                                            */
/* ------------------------------------------------------------------ */

/**
 * 导出 PDF。
 *
 * 只弹一次「保存到哪」的对话框，PDF 由 WebView2 原生的 PrintToPdf 直接写盘 ——
 * 不经过系统打印对话框。排版与屏幕完全一致（同引擎、同 CSS），
 * 文字仍是可选中、可搜索的真文字。
 */
async function exportPdf() {
  const tab = activeTab();
  if (!tab?.path) {
    await ask(t('dlg.noDocForPdf'), { title: t('dlg.warning'), kind: 'warning', okLabel: t('dlg.ok') });
    return;
  }

  // 默认文件名与当前文档同名，换个扩展名
  const stem = tab.path.replace(/\.[^.]+$/, '');
  const picked = await saveDialog({
    defaultPath: `${stem}.pdf`,
    filters: [{ name: t('filter.pdf'), extensions: ['pdf'] }],
  });
  if (!picked) return;

  // 导出期间隐藏代码块的复制按钮等交互痕迹，导完恢复
  const cleanup = prepareForPrint();
  try {
    // 中文字体是分片按需加载的：不等 fonts.ready 导出，开头几页会掉回后备字体
    if (document.fonts?.ready) {
      await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]);
    }
    await invoke('export_pdf', { path: picked });
  } catch (err) {
    await ask(t('dlg.exportFailed', { err: err?.message || err }), {
      title: t('dlg.error'),
      kind: 'error',
      okLabel: t('dlg.ok'),
    });
  } finally {
    cleanup();
  }
}

function prepareForPrint() {
  document.body.classList.add('is-printing');
  const pressed = [];
  document.querySelectorAll('.mr-copy').forEach((b) => {
    pressed.push([b, b.style.display]);
    b.style.display = 'none';
  });
  return () => {
    document.body.classList.remove('is-printing');
    for (const [b, prev] of pressed) b.style.display = prev;
  };
}

async function saveTab(g, tab) {
  if (!tab?.path) return false;
  const content = tab.id === g.activeId && g.editor ? g.editor.getValue() : tab.text;
  try {
    await invoke('write_text_file', { path: tab.path, content });
    tab.text = content;
    tab.dirty = false;
    if (tab.id === g.activeId) {
      g.editor?.markClean();
      paintTabDirty(g);
      updateStats();
    } else {
      renderTabs(g);
    }
    return true;
  } catch (err) {
    await ask(t('dlg.saveFailed', { err }), { title: t('dlg.error'), kind: 'error', okLabel: t('dlg.ok') });
    return false;
  }
}

async function saveFile(forceAs = false, g = activeGroup()) {
  const tab = activeTab(g);
  if (!tab) return false;

  if (!tab.path || forceAs) {
    const picked = await saveDialog({
      defaultPath: tab.path || t('save.untitled'),
      filters: [{ name: t('filter.markdown'), extensions: ['md'] }],
    });
    if (!picked) return false;
    tab.path = picked;
    tab.baseDir = baseDirOf(picked);
    updateFilename();
  }
  return saveTab(g, tab);
}

function bindAutosave(g) {
  const s = getSettings();
  clearTimeout(g.autosaveTimer);
  const tab = activeTab(g);
  if (!s.autoSave || !tab?.path) return;
  g.autosaveTimer = setTimeout(() => {
    if (tab.dirty) saveTab(g, tab);
  }, s.autoSaveDelay);
}

/* ------------------------------------------------------------------ */
/* 布局                                                                */
/* ------------------------------------------------------------------ */

async function applyViewMode(mode, g = activeGroup()) {
  // 分栏/编辑都要真的用编辑器，这时才把 CodeMirror 载进来
  if (mode !== 'read') await ensureEditor(g);

  g.mode = mode;
  g.el.classList.remove('is-read', 'is-split', 'is-edit');
  g.el.classList.add(`is-${mode}`);
  // 切换视图时清掉分隔条的手动宽度，回到均分
  g.dom.editorPane.style.flex = '';
  g.dom.previewPane.style.flex = '';

  if (g.id === state.activeGid) {
    applyViewModeButtons(mode);
    saveSettings({ viewMode: mode });
  }
  if (mode !== 'read') g.editor?.focus();
}

function applyOutline() {
  const show = getSettings().showOutline;
  dom.outline.hidden = !show;
  $('btn-toggle-outline').classList.toggle('is-on', show);
  // zen 下大纲显隐直接改变左侧热区的宽度（m.left）。
  // 不重测的话：进 zen 时大纲是隐藏的，之后 Ctrl+B 打开大纲也永远唤不出抽屉。
  zen.measure?.();
  // 大纲占的是内容区左边那一条：拖动过程中开关大纲，落点提示要跟着重画
  refreshDropTargets();
}

/** 拖动过程中布局变了（窗口缩放 / 大纲显隐）就按新几何重画落点 */
function refreshDropTargets() {
  if (!dragSession.active) return;
  const target = dragSession.target;
  buildDropTargets(dragSession.kind);
  // 重画之后胶囊要重新搬回原来的那一档：否则提示会「亮着但没有字」
  if (target) paintDropTarget(target);
}

function initGroupSplitter(g) {
  let dragging = false;

  g.dom.splitter.addEventListener('mousedown', (e) => {
    dragging = true;
    g.dom.splitter.classList.add('is-dragging');
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = g.el.getBoundingClientRect();
    // 宽度基准是大纲侧栏的右边缘，不是分组容器的左边缘
    const base = dom.outline.hidden ? 0 : Math.max(0, dom.outline.getBoundingClientRect().right - rect.left);
    const width = Math.min(Math.max(e.clientX - rect.left - base, 240), rect.width - base - 320);

    // .group 是 flex 容器，设置 grid-template-columns 不起作用，
    // 必须直接给编辑器面板设 flex-basis。
    g.el.classList.remove('is-read');
    g.el.classList.add('is-split');
    g.dom.editorPane.style.flex = `0 0 ${width}px`;
    g.dom.previewPane.style.flex = '1 1 0';

    if (g.id === state.activeGid) applyViewModeButtons('split');
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    g.dom.splitter.classList.remove('is-dragging');
  });

  // 双击分隔条恢复 50/50
  g.dom.splitter.addEventListener('dblclick', () => {
    g.dom.editorPane.style.flex = '';
    g.dom.previewPane.style.flex = '';
  });
}

/** 切换视图按钮的高亮（拖动分隔条时也要同步） */
function applyViewModeButtons(mode) {
  for (const [id, m] of [
    ['btn-view-read', 'read'],
    ['btn-view-split', 'split'],
    ['btn-view-edit', 'edit'],
  ]) {
    $(id).classList.toggle('is-on', mode === m);
  }
}

/* ------------------------------------------------------------------ */
/* Zen 模式                                                            */
/* ------------------------------------------------------------------ */

const zen = { on: false, fullscreen: false, top: false, left: false, bottom: false };

/**
 * zen 的唤出热区：
 *   ZEN_EDGE —— 指针离窗口边缘多近算「靠近」（原来只有 6px，实际用起来几乎够不着）
 *   ZEN_KEEP —— 已经唤出后，再往外走多远才收起（迟滞，避免手一抖就闪）
 */
const ZEN_EDGE = 28;
const ZEN_KEEP = 40;

function paintZenButton() {
  const btn = $('btn-zen');
  if (!btn) return;
  btn.innerHTML = icon(zen.on ? 'minimize' : 'maximize', 17);
  btn.classList.toggle('is-on', zen.on);
  btn.dataset.tip = t(zen.on ? 'tb.zen.off' : 'tb.zen.on');
}

/**
 * 进出 zen。
 *
 * 「此时如果最大化，应当触发全屏」—— 最大化仍然留着一条窗口边框，
 * 和「全是内容」是矛盾的，所以进入 zen 时若窗口是最大化状态，直接切真全屏。
 * 退出时把全屏还回去。
 *
 * 不再碰 `setDecorations`：窗口本身就是无边框的（decorations: false），
 * 早先在这里「退出 zen 时恢复装饰」会把系统标题栏凭空加回来。
 */
async function setZen(on) {
  if (on === zen.on) return;
  zen.on = on;
  document.body.classList.toggle('is-zen', on);
  if (!on) {
    zen.top = zen.left = zen.bottom = false;
    document.body.classList.remove('zen-top', 'zen-left', 'zen-bottom');
  } else {
    // 进入时量一次：顶栏/标签条/侧栏的高度决定「唤出后要停留多久才收起」。
    // 同步量一次是必要的：只靠下面那一帧的话，进 zen 后立刻把指针甩到左边缘
    // 会读到初始的 m.left = 0，左热区当场失效。getBoundingClientRect 会强制
    // 布局，类名刚切上去也量得到正确值。rAF 那次留给「布局之后还要再校一次」。
    zen.measure?.();
    requestAnimationFrame(() => zen.measure?.());
  }
  paintZenButton();

  try {
    const win = getCurrentWindow();
    if (on) {
      const maximized = await win.isMaximized();
      if (maximized) {
        zen.fullscreen = true;
        await win.setFullscreen(true);
      }
    } else if (zen.fullscreen) {
      await win.setFullscreen(false);
      zen.fullscreen = false;
    }
  } catch (err) {
    // 非 Tauri 环境（浏览器里做 UI 调试）没有窗口 API：zen 的视觉部分照样成立
    console.warn('[zen] 窗口操作不可用：', err);
  }
}

/** 鼠标靠近边缘 → 唤出对应的界面层；离开 → 自动隐藏 */
function bindZenReveal() {
  let m = { top: 80, left: 0, bottom: 26 };
  zen.measure = () => {
    if (!zen.on) return m;
    const titlebarH = document.querySelector('.titlebar')?.getBoundingClientRect().height || 0;
    const tabbarH = document.querySelector('.tabbar')?.getBoundingClientRect().height || 0;
    const sideW = dom.outline.hidden ? 0 : dom.outline.getBoundingClientRect().width || 0;
    const statusH = document.querySelector('.statusbar')?.getBoundingClientRect().height || 0;
    m = { top: titlebarH + tabbarH, left: sideW, bottom: statusH };
    // 抽屉宽度交给 CSS：抽屉展开时正文裁到抽屉右侧，抽屉底下变成透明，
    // 系统 acrylic 直接透上来 —— 透明窗口里没有 backdrop-filter，
    // 这是抽屉拿到真模糊的唯一路径（见 app.css 玻璃区的 zen-left clip-path）。
    document.body.style.setProperty('--zen-drawer-w', m.left + 'px');
    // 大纲收起后左侧已没东西可唤出，把残留的展开态一并清掉，
    // 免得 zen-left 类还挂着、热区却对着一条空抽屉反复触发。
    if (!m.left && zen.left) {
      zen.left = false;
      document.body.classList.remove('zen-left');
    }
    return m;
  };

  const remeasure = () => {
    if (zen.on) zen.measure();
  };
  window.addEventListener('resize', remeasure);

  window.addEventListener('pointermove', (e) => {
    if (!zen.on) return;
    const h = window.innerHeight;
    const next = { top: zen.top, left: zen.left, bottom: zen.bottom };

    if (e.clientY <= ZEN_EDGE) next.top = true;
    else if (zen.top && e.clientY > m.top + ZEN_KEEP) next.top = false;

    if (m.left > 0) {
      // 顶部那一条（y <= ZEN_EDGE）归顶栏热区：贴着顶边滑向左上角
      // 去够顶栏按钮时，大纲抽屉不能半路弹出来抢这个角。
      if (e.clientX <= ZEN_EDGE && e.clientY > ZEN_EDGE) next.left = true;
      else if (zen.left && e.clientX > m.left + ZEN_KEEP) next.left = false;
    }

    // 抽屉展开的这一刻重新量一次：它要把正文裁开（--zen-drawer-w），
    // 只认进入 zen 时那一次测量的话，中途开关过大纲就会拿到过期宽度。
    if (next.left && !zen.left) {
      zen.measure();
      next.left = m.left > 0; // 大纲收起时本来就没东西可唤出
    }

    // 左上角的最终归属：抽屉展开后，它占住的这一竖条（含顶部的大纲
    // 标题和收起按钮）归抽屉 —— 顶栏即使已经唤出也要让开，
    // 否则标题栏压在收起按钮上，永远点不到。想开顶栏，从抽屉右侧够上去。
    if (next.top && next.left && e.clientX <= m.left) next.top = false;

    if (e.clientY >= h - ZEN_EDGE) next.bottom = true;
    else if (zen.bottom && e.clientY < h - m.bottom - ZEN_KEEP) next.bottom = false;

    if (next.top !== zen.top) {
      zen.top = next.top;
      document.body.classList.toggle('zen-top', zen.top);
    }
    if (next.left !== zen.left) {
      zen.left = next.left;
      document.body.classList.toggle('zen-left', zen.left);
    }
    if (next.bottom !== zen.bottom) {
      zen.bottom = next.bottom;
      document.body.classList.toggle('zen-bottom', zen.bottom);
    }
  });

  // 鼠标离开窗口：全部收起
  document.addEventListener('mouseleave', () => {
    if (!zen.on) return;
    zen.top = zen.left = zen.bottom = false;
    document.body.classList.remove('zen-top', 'zen-left', 'zen-bottom');
  });
}

/* ------------------------------------------------------------------ */
/* 拖放：落点按「栏」划分，不按窗口的 1/4                              */
/* ------------------------------------------------------------------ */

/**
 * 分栏上限。
 *
 * 三栏是「每栏还能好好读一行中文」的下限（1280px 窗口、大纲展开时每栏约 340px）。
 * 到顶之后干脆不画分栏档 —— 宁可不提示，也不提示一件自己兑现不了的事。
 */
const MAX_GROUPS = 3;

/** 分栏后每一栏至少要有的宽度 */
const MIN_PANE_WIDTH = 320;

/**
 * 这一次拖动的状态。
 *
 * 原生文件拖入与标签拖动共用同一套落点，区别只在 kind 与松手后兑现的动作：
 *   file → 打开文件；tab → 搬运标签。
 */
const dragSession = { kind: null, fromGid: null, tabId: null, target: null, active: false };

/**
 * 拖动提示的可用区域 = 内容区。
 *
 * `.groups` 自己铺满整窗（顶栏与状态栏是浮在它上面的两条玻璃），所以上下要按那两条裁掉；
 * 左右不必管 —— 大纲侧栏是 `.groups` 的兄弟节点，`.groups` 的左边界本来就在它右边。
 *
 * 上边界量的是标题栏的 **bottom** 而不是写死 46px：zen 里标题栏会滑出视野，
 * 量出来自然是 0，提示层于是跟着铺到窗口顶 —— 硬编码那个数字在 zen 下会留一条空档。
 */
function contentRect() {
  const box = dom.groups.getBoundingClientRect();
  const bar = document.querySelector('.titlebar')?.getBoundingClientRect();
  const bottom = parseFloat(getComputedStyle(document.body).getPropertyValue('--bottom-offset')) || 0;
  const top = bar ? Math.min(Math.max(box.top, bar.bottom), box.bottom) : box.top;
  return { left: box.left, top, right: box.right, bottom: Math.max(top, box.bottom - bottom) };
}

/** 现在还能不能再开一栏：栏数到顶、或再分下去每栏就太窄了，都不给分栏档 */
function canSplitNow(box = contentRect()) {
  if (state.groups.length >= MAX_GROUPS) return false;
  return box.right - box.left >= MIN_PANE_WIDTH * (state.groups.length + 1);
}

/** 一档落点：一块可命中的矩形。文案先存在 dataset 上，命中时才搬到那一档（见 paintDropTarget） */
function zoneEl(zone, label, origin = false) {
  const n = document.createElement('div');
  n.className = `dz dz-${zone}${origin ? ' is-origin' : ''}`;
  n.dataset.zone = zone;
  n.dataset.label = label;
  return n;
}

/**
 * 落点胶囊：整层只有这一个，命中哪一档就搬进哪一档。
 *
 * 旧写法是「每档各放一个胶囊，用 opacity 切换显隐」—— 三档都写字会互相打架，
 * 所以只能靠选中态压住另外两个。改成单例搬运之后：节点少一半，
 * 也不可能出现两份文案同时可见，而且「文本内容」本身就是当前状态，不必再去读样式。
 */
let dropLabelEl = null;

/**
 * 按当前的分栏实况重画落点。
 *
 * 每一栏一张卡片，卡片的 left/top/width/height **直接取那一栏的
 * `getBoundingClientRect()`**，卡片内部再切左 / 中 / 右三档。
 *
 * 这样做的关键收益是：提示画在哪、松手会发生什么，出自同一份几何。
 * 旧版这两件事是各算各的 —— 提示是「窗口宽度三等分」（还 `inset: 0` 盖住了顶栏与大纲），
 * 判定也是窗口的 1/4；一旦分了栏，中间那一档横跨两栏，看到的和发生的根本对不上。
 */
function buildDropTargets(kind) {
  const box = contentRect();
  const split = canSplitNow(box);
  const overlay = dom.dropOverlay;

  overlay.replaceChildren();
  dropLabelEl = document.createElement('span');
  dropLabelEl.className = 'dz-label';
  overlay.style.left = `${box.left}px`;
  overlay.style.top = `${box.top}px`;
  overlay.style.width = `${Math.max(0, box.right - box.left)}px`;
  overlay.style.height = `${Math.max(0, box.bottom - box.top)}px`;

  for (const g of state.groups) {
    const r = g.el.getBoundingClientRect();
    const left = Math.max(r.left, box.left);
    const top = Math.max(r.top, box.top);
    const right = Math.min(r.right, box.right);
    const bottom = Math.min(r.bottom, box.bottom);

    const card = document.createElement('div');
    card.className = 'dz-pane';
    card.dataset.gid = g.id;
    card.style.left = `${left - box.left}px`;
    card.style.top = `${top - box.top}px`;
    card.style.width = `${Math.max(0, right - left)}px`;
    card.style.height = `${Math.max(0, bottom - top)}px`;

    // 拖着标签回到自己那一栏：中档要明确写出「松开不会变」，并且不高亮强调色
    const isOrigin = kind === 'tab' && g.id === dragSession.fromGid;
    if (isOrigin) card.classList.add('is-origin');

    if (split) {
      card.appendChild(zoneEl('left', t(kind === 'tab' ? 'drop.tabLeft' : 'drop.fileLeft')));
    }
    card.appendChild(
      zoneEl(
        'mid',
        kind !== 'tab' ? t('drop.fileMid') : isOrigin ? t('drop.stay') : t('drop.tabMid'),
        isOrigin,
      ),
    );
    if (split) {
      card.appendChild(zoneEl('right', t(kind === 'tab' ? 'drop.tabRight' : 'drop.fileRight')));
    }

    overlay.appendChild(card);
  }
}

/**
 * 命中判定：拿指针去撞**已经渲染出来的** `.dz` 矩形。
 *
 * 不再自己算百分比 —— 视觉与逻辑同源之后，「看到的」与「会发生」不可能再对不上。
 * 指针不在任何一档里（顶栏、大纲侧栏、状态栏、窗口外）就返回 null：
 * 文件落到 null 进当前栏，标签落到 null 原地不动（等于取消）。
 */
function hitDropTarget(clientX, clientY) {
  for (const zone of dom.dropOverlay.querySelectorAll('.dz')) {
    const r = zone.getBoundingClientRect();
    if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
      return {
        gid: zone.parentElement.dataset.gid,
        zone: zone.dataset.zone,
        origin: zone.classList.contains('is-origin'),
      };
    }
  }
  return null;
}

function paintDropTarget(target) {
  dragSession.target = target;
  let hitZone = null;
  for (const zone of dom.dropOverlay.querySelectorAll('.dz')) {
    const on =
      Boolean(target) &&
      zone.dataset.zone === target.zone &&
      zone.parentElement.dataset.gid === target.gid;
    zone.classList.toggle('is-target', on);
    if (on) hitZone = zone;
  }
  if (!dropLabelEl) return;
  if (hitZone) {
    dropLabelEl.textContent = hitZone.dataset.label || '';
    hitZone.appendChild(dropLabelEl);
  } else {
    dropLabelEl.remove();
  }
}

function showDropOverlay(kind, fromGid = null) {
  dragSession.kind = kind;
  dragSession.fromGid = fromGid;
  dragSession.active = true;
  dragSession.target = null;
  buildDropTargets(kind);
  dom.dropOverlay.hidden = false;
  document.body.classList.add('is-dropping');
  document.body.classList.toggle('is-tab-drag', kind === 'tab');
}

function hideDropOverlay() {
  dragSession.active = false;
  dragSession.kind = null;
  dragSession.fromGid = null;
  dragSession.target = null;
  dom.dropOverlay.hidden = true;
  dom.dropOverlay.replaceChildren();
  dropLabelEl = null;
  document.body.classList.remove('is-dropping', 'is-tab-drag');
}

/**
 * 兑现落点。
 *
 * 侧档 = 在那一栏旁边新开一栏（栏数到顶时侧档根本不会被画出来，所以这里不必再拦）；
 * 中档 = 进那一栏：文件开成新标签，标签则整条搬过去。
 * 落在内容区之外（target 为 null）时：文件进当前栏，标签原地不动。
 *
 * @param {{gid:string,zone:string}|null} target
 * @param {{paths?:string[], tabId?:number, fromGid?:string}} payload
 */
async function applyDrop(target, payload = {}) {
  const paneOf = (gid) => state.groups.find((g) => g.id === gid) || null;
  const anchor = target ? paneOf(target.gid) : null;
  const sideOf = (pane) => (target.zone === 'left' ? { before: pane.el } : { after: pane.el });

  if (payload.tabId) {
    const from = paneOf(payload.fromGid);
    if (!from || !target) return false;
    if (target.zone === 'mid') return moveTabToGroup(from, payload.tabId, anchor);
    if (!anchor) return false;
    return moveTabToGroup(from, payload.tabId, createGroup(sideOf(anchor)));
  }

  const paths = payload.paths || [];
  if (!paths.length) return false;

  let to;
  if (target && target.zone !== 'mid' && anchor) to = createGroup(sideOf(anchor));
  else if (anchor) to = anchor;
  else to = activeGroup();

  // 一次拖入多个文件：第一份决定落点，其余依次开成同一栏的标签
  for (const p of paths) await openPath(p, { group: to });
  return true;
}

/**
 * 在指定一侧新开一栏并打开文件。
 *
 * 只是 applyDrop 的一个薄封装（不做落点判定），留给工装与将来可能加的
 * 「在右侧分栏打开」菜单项用。
 */
function openAtZone(path, zone) {
  if (!path) return;
  if (zone !== 'left' && zone !== 'right') {
    openPath(path, { group: activeGroup() });
    return;
  }
  const anchor = activeGroup();
  const to = createGroup(zone === 'left' ? { before: anchor.el } : { after: anchor.el });
  openPath(path, { group: to });
}

/** 物理像素 → CSS 像素。高 DPI 屏上不除这一下，落点会整体偏出去一大截 */
function toCss(position) {
  const dpr = window.devicePixelRatio || 1;
  return { x: (position?.x ?? 0) / dpr, y: (position?.y ?? 0) / dpr };
}

/**
 * 原生拖入（从资源管理器拖文件进来）。
 *
 * 为什么不走 HTML5 的 drag/drop：`File.path` 是 Electron 的私有属性，
 * WebView2 里永远是 undefined —— 拖进来会完全没反应。
 * Tauri 在原生层接管后发的事件里直接带路径，这才是可用的那条路。
 */
function handleNativeDrag(payload) {
  const p = payload || {};
  const pt = toCss(p.position);

  if (p.type === 'enter' || p.type === 'over') {
    if (!dragSession.active || dragSession.kind !== 'file') showDropOverlay('file');
    paintDropTarget(hitDropTarget(pt.x, pt.y));
    return;
  }
  if (p.type === 'drop') {
    const target = hitDropTarget(pt.x, pt.y);
    const paths = p.paths || [];
    hideDropOverlay();
    if (paths.length) applyDrop(target, { paths });
    return;
  }
  hideDropOverlay();
}

/**
 * 标签拖动：把「同栏两个标签」变成左右分栏的那条路径。
 *
 * 用 HTML5 拖放而不是自己撸 pointer 事件：被拖的东西本来就是 DOM 节点，
 * 浏览器自带的拖影 / 光标 / 起拖阈值都是现成的，也不会和点选、中键关闭打架。
 * 落点复用上面那套 —— 所以拖动标签时看到的提示与拖文件进来时是同一张图。
 */
function bindTabDrag() {
  dom.groups.addEventListener('dragstart', (e) => {
    const from = e.target instanceof Element ? e.target.closest('.tab') : null;
    if (!from) return;
    // 按在 × 上往外拖不该变成拖标签（那是「关标签」的手势）
    if (e.target.closest('.tab-x')) {
      e.preventDefault();
      return;
    }
    const g = state.groups.find((x) => x.el.contains(from));
    const tabId = Number(from.dataset.tabId);
    if (!g || !tabId) return;

    dragSession.tabId = tabId;
    dragSession.fromGid = g.id;
    // Chromium 里不 setData 就根本不会真的开始拖
    e.dataTransfer?.setData('text/plain', String(tabId));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    from.classList.add('is-dragging');
    showDropOverlay('tab', g.id);
  });

  const end = () => {
    if (!dragSession.tabId && !dragSession.active) return;
    dragSession.tabId = null;
    for (const n of dom.groups.querySelectorAll('.tab.is-dragging')) n.classList.remove('is-dragging');
    hideDropOverlay();
  };
  window.addEventListener('dragend', end);
  // 拖出窗口：没了后续 dragover，不主动收一下提示会一直挂在屏幕上
  window.addEventListener('dragleave', (e) => {
    if (dragSession.kind === 'tab' && !e.relatedTarget) paintDropTarget(null);
  });
}

async function bindDragDrop() {
  // 浏览器里直接打开（没有 Tauri runtime）时，至少别让拖放变成默认的「打开文件」
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (dragSession.kind !== 'tab') return;
    paintDropTarget(hitDropTarget(e.clientX, e.clientY));
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (dragSession.kind !== 'tab') return;
    const payload = { tabId: dragSession.tabId, fromGid: dragSession.fromGid };
    const target = hitDropTarget(e.clientX, e.clientY);
    hideDropOverlay();
    applyDrop(target, payload);
  });

  bindTabDrag();

  // 拖动过程中窗口被缩放：落点要按新几何重画，否则提示会停在旧位置上
  window.addEventListener('resize', refreshDropTargets);

  try {
    const webview = getCurrentWebview();
    await webview.onDragDropEvent((event) => handleNativeDrag(event.payload));
  } catch {
    /* 非 Tauri 环境：忽略 */
  }
}

/* ------------------------------------------------------------------ */
/* 快捷键                                                              */
/* ------------------------------------------------------------------ */

function initShortcuts() {
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) {
      if (e.key === 'Escape' && zen.on) setZen(false);
      return;
    }

    const k = e.key.toLowerCase();
    // 缩放认 e.code 而不是 e.key：中文/日文输入法下 '=' 键的 key 可能是别的字符，
    // 而 code 只描述物理按键。小键盘的 +/- 也一并认下。
    const code = e.code;

    if (code === 'Equal' || code === 'NumpadAdd' || k === '+' || k === '=') {
      // 浏览器默认也会把 Ctrl+= 当缩放，必须拦下，否则会和自带缩放叠加
      e.preventDefault();
      zoomStep(1);
    } else if (code === 'Minus' || code === 'NumpadSubtract' || k === '-' || k === '_') {
      e.preventDefault();
      zoomStep(-1);
    } else if (code === 'Digit0' || code === 'Numpad0' || k === '0') {
      e.preventDefault();
      resetZoom();
    } else if (k === 's') {
      e.preventDefault();
      saveFile(e.shiftKey);
    } else if (k === 'e' && e.shiftKey) {
      e.preventDefault();
      exportPdf();
    } else if (k === 'o') {
      e.preventDefault();
      openFileDialog();
    } else if (k === 'z' && e.shiftKey) {
      e.preventDefault();
      setZen(!zen.on);
    } else if (k === '1') {
      applyViewMode('read');
    } else if (k === '2') {
      applyViewMode('split');
    } else if (k === '3') {
      applyViewMode('edit');
    } else if (k === 'b') {
      const s = getSettings();
      saveSettings({ showOutline: !s.showOutline });
      applyOutline();
    } else if (k === 'd' && e.shiftKey) {
      e.preventDefault();
      const next = !state.dark;
      saveSettings({ uiDark: next });
      applyThemes();
    } else if (k === ',') {
      e.preventDefault();
      settingsModal?.toggle();
    }
  });
}

/* ------------------------------------------------------------------ */
/* 初始化                                                              */
/* ------------------------------------------------------------------ */

function bindToolbar() {
  $('btn-open').addEventListener('click', openFileDialog);
  $('btn-save').addEventListener('click', () => saveFile());
  $('btn-saveas').addEventListener('click', () => saveFile(true));
  $('btn-pdf').addEventListener('click', exportPdf);
  $('btn-view-read').addEventListener('click', () => applyViewMode('read'));
  $('btn-view-split').addEventListener('click', () => applyViewMode('split'));
  $('btn-view-edit').addEventListener('click', () => applyViewMode('edit'));
  $('btn-zen').addEventListener('click', () => setZen(!zen.on));

  const toggleOutline = () => {
    const s = getSettings();
    saveSettings({ showOutline: !s.showOutline });
    applyOutline();
  };
  $('btn-toggle-outline').addEventListener('click', toggleOutline);
  $('btn-outline-close').addEventListener('click', toggleOutline);

  const toggleTheme = () => {
    // 界面明暗独立于正文主题：这里只翻转外壳，不动文档配色
    const next = !state.dark;
    saveSettings({ uiDark: next });
    applyThemes();
  };
  $('btn-theme-quick').addEventListener('click', toggleTheme);

  // 状态栏上的百分比：点一下回到 100%，不用记快捷键
  dom.statZoom?.addEventListener('click', resetZoom);
}

function bindPreviewLinks() {
  dom.groups.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    // 外部链接交给系统浏览器，内部锚点正常滚动
    if (/^https?:\/\//i.test(href)) {
      e.preventDefault();
      openUrl(href).catch(() => {});
    }
  });
}

/**
 * 「打开方式」登记 + 通知资源管理器刷新。
 *
 * 两件事都曾经跑在首帧之前：每次启动写 9 个注册表子键，再发一次
 * SHCNE_ASSOCCHANGED 让资源管理器重读文件关联。现在：
 *   1. 只在窗口显示之后做（不占启动关键路径）；
 *   2. Rust 侧带版本戳，只有首次运行或版本升级才真的动手，
 *      register_open_with 返回 true 时才需要通知 Explorer。
 */
function registerFileAssociations() {
  invoke('register_open_with')
    .then((changed) => {
      if (changed) return invoke('notify_association_changed');
      return null;
    })
    .catch(() => {
      /* 开发模式下可执行文件路径不存在，静默跳过 */
    });
}

/* ------------------------------------------------------------------ */
/* 文件关联（设置面板用）                                              */
/* ------------------------------------------------------------------ */

/** 读当前 .md 的关联状态；非 Tauri 环境返回 null，面板会隐藏这一区 */
async function readAssocStatus() {
  try {
    return await invoke('assoc_status');
  } catch {
    return null;
  }
}

/**
 * 修复 / 设为默认。
 *
 * 分两步，是因为 Windows 从 8 开始就不允许程序直接写「默认应用」：
 * UserChoice 带哈希校验，任何第三方写入都会被系统忽略并回滚。
 * 所以能自己做的（图标、右键菜单、打开方式候选）我们来，
 * 剩下那一步只能把用户送到系统设置页面去点确认。
 */
async function fixAssociation({ force = false } = {}) {
  try {
    const changed = await invoke('register_open_with', { force });
    if (changed !== false || force) await invoke('notify_association_changed');
  } catch (err) {
    console.warn('[assoc] 注册失败：', err);
  }
  return readAssocStatus();
}

/** 打开系统「默认应用」设置页（Windows 只认用户本人在这里的确认） */
async function openDefaultAppsSettings() {
  try {
    await invoke('open_default_apps_settings');
    return true;
  } catch (err) {
    console.warn('[assoc] 打开系统设置失败：', err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */

async function init() {
  try {
    loadSettings();
    // 语言要最先落地：后面每一步渲染出来的文案都依赖它
    applyLocale();
    applyWindowGlass();
    paintIcons();

    // 主题深链接：?theme=dusk 可直接以指定主题打开，方便调试与分享同一套排版
    const urlTheme = new URLSearchParams(location.search).get('theme');
    if (urlTheme && DOC_THEME_BY_ID.has(urlTheme)) saveSettings({ docTheme: urlTheme });

    applyThemes();

    // 第一个分组：默认是阅读模式 —— 这一步不会创建编辑器，也就不会加载 CodeMirror
    const g1 = createGroup({ mode: getSettings().viewMode });
    state.activeGid = g1.id;
    applyViewModeButtons(g1.mode);
    applyOutline();
    syncGroupChrome();

    initShortcuts();
    bindToolbar();
    bindPreviewLinks();
    bindDragDrop();
    bindZoomWheel();
    bindZenReveal();
    bindWindowControls();
    paintZenButton();
    applyLocale();

    settingsModal = initSettingsModal({
      onChange: (reason) => {
        if (reason.startsWith('glass:')) {
          saveSettings({ glassLevel: reason.split(':')[1] });
        } else if (reason.startsWith('font:')) {
          saveSettings({ fontPreset: reason.split(':')[1] });
        } else if (reason === 'windowGlass') {
          applyWindowGlass();
          return; // 只影响底色，不必重跑主题与大纲
        } else if (reason === 'locale') {
          applyLocale();
          return;
        }
        applyThemes();
        applyOutline();
      },
      onOpenRecent: (p) => openPath(p),
      onOpenFile: () => openFileDialog(),
      onPin: (p) => pinFile(p),
      onUnpin: (p) => unpinFile(p),
      onRemoveRecent: (p) => removeRecentFile(p),
      onClearRecent: () => clearRecentFiles(),
      onZoom: (z) => applyZoom(z),
      readAssocStatus,
      fixAssociation,
      openDefaultAppsSettings,
    });

    // 外壳已经完整渲染（主题、视图模式、空状态都已就位），先把窗口亮出来，
    // 再做需要 IPC 往返的事（注册监听、取启动文件、读盘打开文档）。
    // 于是一段「双击 .md 打开」的等待期里，用户看到的是应用界面而不是空白。
    invoke('show_main_window').catch(() => {});

    // Tauri IPC 相关的初始化单独兜底：即使运行在没有 Tauri runtime 的环境里
    // （例如直接用浏览器打开做 UI 调试），界面也应该完整渲染而不是白屏。
    try {
      // 主动去取启动参数里的文件，而不是等 Rust 侧 emit ——
      // 监听器注册晚于事件发出就会丢事件，双击 .md 打开时会得到空白窗口。
      await listen('open-file', (event) => {
        openPath(event.payload);
      });

      const startupFile = await invoke('take_startup_file').catch(() => null);
      if (startupFile) await openPath(startupFile);
      activeGroup().editor?.focus();

      // 这里刻意**不再**预热 mermaid：现在它真的是动态 chunk，
      // 启动后 1.5 秒去预热等于把 5MB 又拉回冷启动路径上。
      // 含图表的文档会在 render() 里按需加载（renderMermaid 自己保证）。
    } catch (err) {
      console.warn('[Markdown Reader] 非 Tauri 环境，已跳过文件 IPC：', err);
    }

    updateFilename();
    updateStats();

    // 只在显式带上 ?qa=1 时暴露内部动作：QA 工具（scripts/qa/shell-harness.html）
    // 要在真实浏览器里驱动标签/分栏/zen，又不能把这些钩子留在正常入口上。
    if (new URLSearchParams(location.search).has('qa')) {
      window.__mr = {
        state,
        openPath,
        openAtZone,
        openFileDialog,
        setZen,
        applyViewMode,
        switchToTab,
        closeTab,
        activeGroup,
        activeTab,
        createGroup,
        setActiveGroup,
        // 拖放与分栏：无头 QA 要能驱动「文件拖入」与「标签拖动」这两条真实路径，
        // 而不是只调一个画提示的壳。handleNativeDrag 收的就是 Tauri 事件里那个 payload。
        contentRect,
        buildDropTargets,
        hitDropTarget,
        paintDropTarget,
        showDropOverlay,
        hideDropOverlay,
        applyDrop,
        moveTabToGroup,
        handleNativeDrag,
        dragSession,
        // 语言与窗口玻璃：无头 QA 要能直接驱动
        applyLocale,
        applyWindowGlass,
        applyOutline,
        getLocale,
      };
    }
  } catch (err) {
    // 初始化失败也要让用户看到原因，而不是一个永远黑屏的窗口
    document.body.innerHTML = `<pre style="padding:24px;color:#cf222e;font:14px/1.7 monospace;white-space:pre-wrap">启动失败：\n${err?.stack || err}</pre>`;
  } finally {
    // 窗口显示必须放在 finally：否则前面任何一步抛错，
    // 窗口会永远保持 visible:false，用户只看到「双击没反应」。
    invoke('show_main_window').catch(() => {});
    // 窗口已经可见之后再做环境相关的杂事
    setTimeout(registerFileAssociations, 0);
  }
}

let settingsModal = null;

init();
