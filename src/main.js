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
  const on = getSettings().windowGlass !== false;
  document.documentElement.dataset.windowGlass = on ? 'on' : 'off';
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
    tabrail: el.querySelector('.tabrail'),
    tablist: el.querySelector('.tabbar .tablist'),
    railTablist: el.querySelector('.tabrail .tablist'),
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
 * @param {{id?:string, mode?:string, before?:HTMLElement|null}} opts
 *        before 有值时插到该元素之前（拖到左侧 1/4 用得到），否则追加到末尾。
 */
function createGroup(opts = {}) {
  const id = opts.id || `g${++gidSeq}`;
  const mode = opts.mode || getSettings().viewMode || 'read';

  // 第一个分组用 index.html 里的静态结构（首屏不必再建一次 DOM），
  // 之后的分组克隆它 —— 结构与样式只有一处真相来源。
  let el;
  if (state.groups.length === 0 && !opts.before) {
    el = $('group-g1');
    el.dataset.gid = id;
  } else {
    const template = $('group-g1');
    el = template.cloneNode(true);
    el.removeAttribute('id');
    el.dataset.gid = id;
    if (opts.before) dom.groups.insertBefore(el, opts.before);
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

  // 标签列表的挂载点跟随布局：顶部布局挂 .tabbar，左侧布局挂 .tabrail
  g.dom.tablist.innerHTML = '';
  g.dom.railTablist.innerHTML = '';

  state.groups.push(g);
  if (opts.before) {
    // 插到最前面：保持 state.groups 的顺序与 DOM 一致
    state.groups = [g, ...state.groups.filter((x) => x !== g)];
  }

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
  applyTabLayout();
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
  for (const list of [g.dom.tablist, g.dom.railTablist]) {
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
      el.title = tab.path || tab.title;
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
  }
  // 当前标签滚进可视区（标签多了以后必须保证「刚打开的那个」看得见）
  for (const list of [g.dom.tablist, g.dom.railTablist]) {
    list.querySelector('.tab.is-on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

/** 只更新脏标记，不重建整个标签栏（每次击键都重建会很吵） */
function paintTabDirty(g) {
  const tab = activeTab(g);
  for (const el of g.el.querySelectorAll('.tab')) {
    el.classList.toggle('is-on', Number(el.dataset.tabId) === g.activeId);
    el.classList.toggle('is-dirty', Boolean(tab?.dirty) && Number(el.dataset.tabId) === g.activeId);
  }
}

/** 标签布局（顶部 / 左侧）：两个容器都保持渲染，靠 CSS 与 hidden 切换 */
function applyTabLayout() {
  const layout = getSettings().tabLayout === 'left' ? 'left' : 'top';
  document.documentElement.dataset.tabLayout = layout;
  for (const g of state.groups) {
    g.dom.tabrail.hidden = layout !== 'left';
    renderTabs(g);
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

/** 唤出用的边缘厚度与「停留」判断要用到的两条玻璃的高度 */
const ZEN_EDGE = 6;
const ZEN_KEEP = 16;

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
    // 进入时量一次：顶栏/标签条/侧栏的高度决定「唤出后要停留多久才收起」
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
    const tabbarH =
      getSettings().tabLayout === 'left' ? 0 : document.querySelector('.tabbar')?.getBoundingClientRect().height || 0;
    const railW =
      getSettings().tabLayout === 'left' ? document.querySelector('.tabrail')?.getBoundingClientRect().width || 0 : 0;
    const sideW = dom.outline.hidden ? 0 : dom.outline.getBoundingClientRect().width || 0;
    const statusH = document.querySelector('.statusbar')?.getBoundingClientRect().height || 0;
    m = { top: titlebarH + tabbarH, left: railW + sideW, bottom: statusH };
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
      if (e.clientX <= ZEN_EDGE) next.left = true;
      else if (zen.left && e.clientX > m.left + ZEN_KEEP) next.left = false;
    }

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
/* 拖放：中间开标签，两侧 1/4 分栏                                     */
/* ------------------------------------------------------------------ */

/** 把物理像素坐标换算成窗口内的逻辑坐标，再判断落在哪一档 */
function zoneForPosition(position) {
  const dpr = window.devicePixelRatio || 1;
  const x = (position?.x ?? 0) / dpr;
  const w = window.innerWidth || 1;
  if (x < w * 0.25) return 'left';
  if (x > w * 0.75) return 'right';
  return 'tab';
}

function paintDropZone(zone) {
  dom.dropOverlay.hidden = false;
  document.body.classList.add('is-dropping');
  for (const el of dom.dropOverlay.querySelectorAll('.dz')) {
    el.classList.toggle('is-target', el.dataset.zone === zone);
  }
}

function hideDropZone() {
  dom.dropOverlay.hidden = true;
  document.body.classList.remove('is-dropping');
}

/**
 * 按落点打开文件。
 * 左侧 1/4 → 在这一侧开一个分栏（已有分栏就用左边那栏）；右侧同理；中间 → 当前栏的新标签。
 */
function openAtZone(path, zone) {
  if (!path) return;
  if (zone === 'tab' || !zone) {
    openPath(path, { group: activeGroup() });
    return;
  }
  let target;
  if (state.groups.length > 1) {
    target = zone === 'left' ? state.groups[0] : state.groups[state.groups.length - 1];
  } else {
    const current = activeGroup();
    target = createGroup(zone === 'left' ? { before: current.el } : {});
    setActiveGroup(target);
  }
  openPath(path, { group: target });
}

/**
 * 把文件拖进窗口即可打开。
 *
 * 之前写的是 HTML5 的 drag/drop + `file.path`，但 `File.path` 是 Electron
 * 的私有属性，WebView2 里永远是 undefined —— 也就是拖进来完全没反应。
 * 真正可用的是 Tauri 在原生层接管拖放后发出的事件，它直接带文件路径。
 */
async function bindDragDrop() {
  // 浏览器里直接打开（没有 Tauri runtime）时，至少别让拖放变成默认的「打开文件」
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  try {
    const webview = getCurrentWebview();
    await webview.onDragDropEvent((event) => {
      const p = event.payload;
      if (p.type === 'enter' || p.type === 'over') {
        paintDropZone(zoneForPosition(p.position));
      } else if (p.type === 'drop') {
        const zone = zoneForPosition(p.position);
        hideDropZone();
        if (p.paths?.length) openAtZone(p.paths[0], zone);
      } else {
        hideDropZone();
      }
    });
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
    applyTabLayout();
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
        } else if (reason === 'tabLayout') {
          applyTabLayout();
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
        applyTabLayout,
        applyViewMode,
        switchToTab,
        closeTab,
        activeGroup,
        activeTab,
        createGroup,
        zoneForPosition,
        paintDropZone,
        hideDropZone,
        // 语言与窗口玻璃：无头 QA 要能直接驱动
        applyLocale,
        applyWindowGlass,
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
