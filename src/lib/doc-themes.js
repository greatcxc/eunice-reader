/**
 * 正文主题注册表
 *
 * 命名与分类参考社区成熟的中文长文排版实践（Typora Bloom 的色系划分、
 * Hekouwang 的中文行长行高指标），刻意避开任何「代码/终端/开发者」意象 ——
 * 这是一个用来读方案、提案与报告的工具，不是代码编辑器。
 *
 * 一款主题 = 一整套文档视觉：纸面、正文、标题、引用、表格、代码块底色、
 * 甚至语法着色的色相，全部同属一个色系。
 */

export const DOC_THEMES = [
  // ───────── 浅色 ─────────
  {
    id: 'plain',
    label: '素白',
    note: '干净的白纸，适合正式文件',
    dark: false,
    group: 'plain',
    swatch: '#ffffff',
  },
  {
    id: 'ricepaper',
    label: '宣纸',
    note: '微黄纸感配朱砂点缀',
    dark: false,
    group: 'plain',
    swatch: '#f8f4ea',
  },
  {
    id: 'warmstone',
    label: '暖石',
    note: '暖米色，柔和不冷',
    dark: false,
    group: 'warm',
    swatch: '#f5f0e6',
  },
  {
    id: 'petal',
    label: '花瓣',
    note: '淡玫瑰粉，温柔',
    dark: false,
    group: 'flower',
    swatch: '#fdf4f5',
  },
  {
    id: 'verdant',
    label: '草木',
    note: '豆绿护眼，久看不累',
    dark: false,
    group: 'flower',
    swatch: '#f2f6ef',
  },
  {
    id: 'wheat',
    label: '麦穗',
    note: '暖黄的秋日气息',
    dark: false,
    group: 'warm',
    swatch: '#fbf6e9',
  },

  // ───────── 深色 ─────────
  {
    id: 'nightfall',
    label: '夜阑',
    note: '深蓝灰，夜里读书',
    dark: true,
    group: 'plain',
    swatch: '#181b21',
  },
  {
    id: 'inkstone',
    label: '墨',
    note: '夜砚墨黑，克制沉静',
    dark: true,
    group: 'plain',
    swatch: '#101013',
  },
  {
    id: 'amber',
    label: '琥珀',
    note: '暖橘，夜里也不冰冷',
    dark: true,
    group: 'warm',
    swatch: '#1c1712',
  },
  {
    id: 'lapis',
    label: '青金',
    note: '藏蓝，稳重的深色',
    dark: true,
    group: 'cool',
    swatch: '#131822',
  },
  {
    id: 'sage',
    label: '鼠尾草',
    note: '暗绿，安静的深色',
    dark: true,
    group: 'flower',
    swatch: '#161c18',
  },
  {
    id: 'ripple',
    label: '涟漪',
    note: '深青碧，清凉通透',
    dark: true,
    group: 'cool',
    swatch: '#111a1c',
  },
];

export const DOC_THEME_BY_ID = new Map(DOC_THEMES.map((t) => [t.id, t]));

export const DOC_THEME_TABS = [
  { id: 'all', label: '全部' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
  { id: 'plain', label: '素雅' },
  { id: 'warm', label: '暖调' },
  { id: 'cool', label: '冷调' },
  { id: 'flower', label: '柔彩' },
];