/**
 * 设置持久化。用 localStorage —— 纯本地应用，不需要引入 store 插件。
 * 所有写入都做了 try/catch，配额满或隐私模式下不应导致应用崩溃。
 */

const KEY = 'markdown-reader/settings/v1';

/** 「最近打开」里未固定条目的上限（固定条目不吃这个额度） */
export const RECENT_MAX = 10;

/**
 * 缩放档位。
 *
 * 用固定档位而不是连续加减：连续加减会让 100% 变成 103% 这种没人想要的值，
 * 而且键盘连按容易冲过头。档位两端按等比取，100% 两侧对称好认。
 */
export const ZOOM_STEPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
export const ZOOM_MIN = ZOOM_STEPS[0];
export const ZOOM_MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1];

/** 全屏毛玻璃挡位 */
export const GLASS_LEVELS = ['off', 'medium', 'strong'];

/**
 * 玻璃挡位归一化。1.2.0 里这个设置是布尔值（开/关），
 * 这里把老数据映射成挡位，免得升级后设置直接失效。
 */
export function normalizeGlass(value) {
  if (value === true) return 'medium';
  if (value === false) return 'off';
  return GLASS_LEVELS.includes(value) ? value : 'medium';
}

const DEFAULTS = {
  docTheme: 'plain',          // 正文主题：整套文档视觉（背景/正文/标题/表格/代码块）
  uiDark: null,               // 界面明暗；null = 跟随正文主题的深浅
  viewMode: 'read',           // read | split | edit —— 默认纯阅读，按需切到源码
  tabLayout: 'top',           // top = 顶栏下方一条；left = 正文左侧一列
  locale: 'auto',             // auto = 跟随系统语言（WebView2 的 navigator.language）
  windowGlass: 'medium',      // 全屏毛玻璃挡位：off | medium | strong（窗口半透明 + 系统 acrylic）
  zoom: 1,                    // 显示缩放系数：正文字号、行宽、编辑区字号都乘以它
  fontSize: 16,               // 基准字号；屏幕上实际显示的是 fontSize × zoom
  lineHeight: 1.9,            // 中文正文默认行高比英文高
  contentWidth: 900,
  fontPreset: 'sans',
  showOutline: false,         // 大纲默认关闭，需要时用 Ctrl+B 打开
  outlineWidth: 260,
  spellcheck: false,
  autoSave: true,
  autoSaveDelay: 1200,
  starredThemes: [],          // 星标收藏的正文主题 id
  glassLevel: 'normal',       // glass 强度：solid | normal | strong
  lastDir: null,
  recentFiles: [],            // 最近打开（不含已固定项，固定项单列在下面）
  pinnedFiles: [],            // 固定在「最近打开」顶部的文件，清空记录时保留
};

let state = { ...DEFAULTS };

/** 把任意输入夹到合法缩放区间；非法值一律回落到 1 */
export function normalizeZoom(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(n * 100) / 100));
}

/**
 * 沿档位表步进一档。
 * @param {number} current 当前系数
 * @param {number} dir >0 放大，<0 缩小
 */
export function nextZoom(current, dir) {
  const z = normalizeZoom(current);
  if (dir > 0) return ZOOM_STEPS.find((s) => s > z + 1e-6) ?? ZOOM_MAX;
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] < z - 1e-6) return ZOOM_STEPS[i];
  }
  return ZOOM_MIN;
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { ...DEFAULTS, ...parsed };
      // 旧版本脏数据兜底：必须是数组 / 必须是合法系数
      if (!Array.isArray(state.recentFiles)) state.recentFiles = [];
      if (!Array.isArray(state.pinnedFiles)) state.pinnedFiles = [];
      state.zoom = normalizeZoom(state.zoom);
      state.windowGlass = normalizeGlass(state.windowGlass);
    }
  } catch {
    state = { ...DEFAULTS };
  }
  return state;
}

export function getSettings() {
  return state;
}

/**
 * 更新设置并落盘
 * @param {Partial<typeof DEFAULTS>} patch
 */
export function saveSettings(patch) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 配额或隐私模式：设置本次会话内仍生效，只是不持久化
  }
  return state;
}

/* ------------------------------------------------------------------ */
/* 最近打开 / 固定                                                     */
/* ------------------------------------------------------------------ */

/** 打开一个文件后登记：已固定的不重复进最近列表，也不打乱固定顺序 */
export function pushRecentFile(path) {
  if (!path) return state.recentFiles;
  if (state.pinnedFiles.includes(path)) return state.recentFiles;
  const list = [path, ...state.recentFiles.filter((p) => p !== path)].slice(0, RECENT_MAX);
  saveSettings({ recentFiles: list });
  return list;
}

export function pinFile(path) {
  if (!path) return state;
  return saveSettings({
    pinnedFiles: [path, ...state.pinnedFiles.filter((p) => p !== path)],
    // 同一个文件不该同时出现在固定区和最近区，固定后从最近区摘掉
    recentFiles: state.recentFiles.filter((p) => p !== path),
  });
}

/** 取消固定：回落成普通的最近条目，仍然置顶显示 */
export function unpinFile(path) {
  return saveSettings({
    pinnedFiles: state.pinnedFiles.filter((p) => p !== path),
    recentFiles: [path, ...state.recentFiles.filter((p) => p !== path)].slice(0, RECENT_MAX),
  });
}

/** 从两个列表里彻底移除（固定条目的 × 也走这里） */
export function removeRecentFile(path) {
  return saveSettings({
    recentFiles: state.recentFiles.filter((p) => p !== path),
    pinnedFiles: state.pinnedFiles.filter((p) => p !== path),
  });
}

/** 清空记录：只清未固定的，固定的留着 —— 这正是不固定的意义 */
export function clearRecentFiles() {
  return saveSettings({ recentFiles: [] });
}

/**
 * 「最近打开」的显示列表：固定项在前，其余按最近顺序跟在后面。
 * @returns {{path:string, pinned:boolean}[]}
 */
export function recentEntries() {
  return [
    ...state.pinnedFiles.map((path) => ({ path, pinned: true })),
    ...state.recentFiles.map((path) => ({ path, pinned: false })),
  ];
}
