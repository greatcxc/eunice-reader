/**
 * 字体系统
 *
 * ── 为什么是「西文装饰 + Noto SC 兜底」的两段结构 ──
 * 实测（scripts/check-coverage.py）每款字体的真实 cmap：
 *
 *   Noto Sans SC / Noto Serif SC   30,890+ 码位
 *     中文 ✓ 中文标点 ✓ 西文标点 ✓ 数学符号 ✓ 希腊字母 ✓ 箭头 ✓ 全角符号 ✓
 *     缺：上下标（部分）、✔✗✘ 这类符号
 *   Inter / EB Garamond / JetBrains Mono   约 230 码位
 *     只有 ASCII + 少量符号，中文与数学符号全缺
 *
 * 所以西文字体只能当「装饰」用在前面的位置，任何它没有的字符都由
 * Noto SC 接住 —— 这也是为什么 fallback 链里 Noto SC 是必选项而不是可选项。
 *
 * ✔✗✘ / ★ 这类符号连 Noto SC 也没有，由系统 Segoe UI Symbol 兜住；
 * emoji 交给 Segoe UI Emoji。这两个是 Windows 自带，无需打包。
 */

import inter400 from '../fonts/inter-400.woff2?url';
import inter700 from '../fonts/inter-700.woff2?url';
import garamond400 from '../fonts/garamond-400.woff2?url';
import mono400 from '../fonts/mono-400.woff2?url';
import symbolGap400 from '../fonts/symbol-gap-400.woff2?url';
// 所有 CJK 字体都不再整包引入：它们被切成「常用/次常用/冷门」三层分片
// （scripts/slice-fonts.py 生成到 src/fonts/faces/），由 loadSlicedFaces()
// 按家族动态注入。见下面 SLICED_FACES 的说明。
//
// 文楷的两份 CSS（194 条 @font-face、~210KB）同样不在这里静态引入：
// 首次选中文楷时才由 injectWenkai() 动态 import，冷启动不再为它解析。
// 这几处都必须保留 `?inline` —— Vite 会把 CSS 里的 url() 改写成
// new URL('…woff2', import.meta.url)，分片文件才会真正产出到 assets/。

const CORE_FACES = `
@font-face{font-family:'Eunice Inter';font-style:normal;font-weight:400;font-display:swap;src:url(${inter400}) format('woff2')}
@font-face{font-family:'Eunice Inter';font-style:normal;font-weight:700;font-display:swap;src:url(${inter700}) format('woff2')}
@font-face{font-family:'Eunice Garamond';font-style:normal;font-weight:400;font-display:swap;src:url(${garamond400}) format('woff2')}
@font-face{font-family:'Eunice Mono';font-style:normal;font-weight:400;font-display:swap;src:url(${mono400}) format('woff2')}
@font-face{font-family:'Eunice Symbol Gap';font-style:normal;font-weight:400;font-display:swap;src:url(${symbolGap400}) format('woff2')}
`;

/**
 * 分片 CJK 字体表（scripts/slice-fonts.py 生成）。
 *
 * 没有 unicode-range 的 @font-face，浏览器必须把**整个**字体下完、解压、解析
 * 才能画出第一个字。实测思源黑体首屏仅常规体就要 4077KB / 137ms，
 * 加粗体合计 8.12MB、约 400ms —— 中文字会先用后备字体显示，字体到了再整篇回流。
 *
 * 切成三层后，浏览器按 unicode-range 只取文档真正用到的那几片：
 *   常用层 ~260KB / 次常用层 ~300KB / 冷门层 ~3.7MB（生僻字才拉）。
 * 字符覆盖一点没少：三层并集 == 原字体 cmap（生成脚本里做断言）。
 * 表本身用动态 import 按需注入：不选这个家族就一个字节都不下载。
 */
const SLICED_FACES = {
  'Eunice Sans SC': [
    () => import('../fonts/faces/sans-400.css?inline'),
    () => import('../fonts/faces/sans-700.css?inline'),
  ],
  'Eunice Serif SC': [
    () => import('../fonts/faces/serif-400.css?inline'),
    () => import('../fonts/faces/serif-700.css?inline'),
  ],
  'Eunice Swei': [() => import('../fonts/faces/swei-400.css?inline')],
  'Eunice ZhiSong': [() => import('../fonts/faces/zhisong-400.css?inline')],
  'Eunice Sarasa': [() => import('../fonts/faces/sarasa-400.css?inline')],
  'Eunice Glow': [() => import('../fonts/faces/glow-400.css?inline')],
};

const slicedLoaded = new Set();

function loadSlicedFaces(stack) {
  for (const [family, loaders] of Object.entries(SLICED_FACES)) {
    if (!stack.includes(family)) continue;
    for (const load of loaders) {
      if (slicedLoaded.has(load)) continue;
      slicedLoaded.add(load);
      load()
        .then((mod) => {
          const style = document.createElement('style');
          style.textContent = mod.default;
          document.head.appendChild(style);
        })
        .catch(() => {
          /* 取不到分片表就退回系统字体链，不影响阅读 */
        });
    }
  }
}

/**
 * 符号补齐层。
 *
 * 实测所有开源中文字体：✔ U+2714 / ✗ U+2717 / ✘ U+2718 与大部分上下标
 * 只有更纱等宽齐备，思源黑体与思源宋体**都缺**。
 * 以往靠 Windows 专有的 Segoe UI Symbol 兜底 —— 一旦离开 Windows 就是豆腐块。
 *
 * 这里从更纱等宽（OFL 1.1）子集化出这 30 个码位（2.8 KB），
 * 插在每条字体栈的第二位，于是兜底链变成：
 *     装饰字体 → 符号补齐层 → 思源 SC → 系统符号 → emoji
 * 前三级全部随包分发，不再依赖任何系统字体。
 * 许可与版权声明见 src/fonts/licenses/sarasa-mono-sc-OFL.txt。
 */
const SYMBOL_GAP = `'Eunice Symbol Gap'`;

/** 系统符号/emoji 兜底：以上都覆盖不到时才会用到（正常文档不应触发） */
const TAIL = `${SYMBOL_GAP}, 'Segoe UI Symbol', 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif`;

let injected = false;
function injectFaces() {
  if (injected) return;
  injected = true;
  const style = document.createElement('style');
  style.id = 'mr-faces';
  style.textContent = CORE_FACES;
  document.head.appendChild(style);
}

/**
 * 文楷字体表按需注入。
 *
 * 194 个分片（8.8MB，按 unicode-range 切分）对应 194 条 @font-face 规则、
 * 约 210KB CSS。它们原先被 `?inline` 打进入口 JS，并在启动时就挂进文档 ——
 * 每个人每次启动都要解析这 210KB 规则，哪怕一辈子不选文楷。
 * 现在改成动态 import：只有真的选中文楷时才把这份 CSS 取回来挂上。
 */
let wenkaiInjected = null;
function injectWenkai() {
  if (!wenkaiInjected) {
    wenkaiInjected = Promise.all([
      import('../fonts/wenkai/regular.css?inline'),
      import('../fonts/wenkai/bold.css?inline'),
    ])
      .then(([regular, bold]) => {
        const style = document.createElement('style');
        style.id = 'mr-faces-wenkai';
        style.textContent = `${regular.default}\n${bold.default}`;
        document.head.appendChild(style);
      })
      .catch(() => {
        /* 取不到就继续用思源黑体兜底，不影响阅读 */
      });
  }
  return wenkaiInjected;
}

export const FONT_PRESETS = [
  {
    id: 'sans',
    label: '思源黑体',
    labelEn: 'Noto Sans SC',
    note: '三万码位全字符 · 默认',
    noteEn: '30k glyphs, complete set · default',
    category: 'sans',
    sample: '中文正文 Aa 123 ±≈',
    stack: `'Eunice Sans SC', ${TAIL}`,
  },
  {
    id: 'serif',
    label: '思源宋体',
    labelEn: 'Noto Serif SC',
    note: '衬线 · 长篇中文阅读',
    noteEn: 'Serif, made for long CJK reads',
    category: 'serif',
    sample: '中文正文 Aa 123 ±≈',
    stack: `'Eunice Serif SC', ${TAIL}`,
  },
  {
    id: 'wenkai',
    label: '霞鹜文楷',
    labelEn: 'LXGW WenKai',
    note: '楷体 · 按需加载 194 片',
    noteEn: 'Kai script, loaded in 194 slices on demand',
    category: 'kai',
    sample: '中文正文 Aa 123',
    stack: `'LXGW WenKai', 'Eunice Sans SC', ${TAIL}`,
  },
  {
    id: 'inter-sans',
    label: 'Inter + 思源黑体',
    labelEn: 'Inter + Noto Sans SC',
    note: '西文/数字用 Inter',
    noteEn: 'Latin and digits in Inter',
    category: 'sans',
    sample: 'English Aa 123 ±≈',
    stack: `'Eunice Inter', 'Eunice Sans SC', ${TAIL}`,
  },
  {
    id: 'garamond-serif',
    label: 'Garamond + 思源宋体',
    labelEn: 'Garamond + Noto Serif SC',
    note: '西文衬线 · 适合引文',
    noteEn: 'Latin serif, good for quotations',
    category: 'serif',
    sample: 'English Aa 123 ±≈',
    stack: `'Eunice Garamond', 'Eunice Serif SC', ${TAIL}`,
  },
  {
    id: 'mono-sans',
    label: 'JetBrains Mono + 思源黑体',
    labelEn: 'JetBrains Mono + Noto Sans SC',
    note: '等宽 · 技术文档',
    noteEn: 'Monospace, for technical docs',
    category: 'mono',
    sample: 'mono Aa 123 ±≈',
    stack: `'Eunice Mono', 'Eunice Sans SC', ${TAIL}`,
  },

  /* ───────── 以下为扩充的 4 款（均内置完整字符集，可直接作正文） ───────── */

  {
    id: 'swei',
    label: '狮尾圆体',
    labelEn: 'Swei Gothic',
    note: '圆体 · 柔和不幼稚',
    noteEn: 'Rounded, soft but not childish',
    category: 'round',
    sample: '中文正文 Aa 123 ±≈',
    // 狮尾圆体只有中文字形，西文与数字由思源黑体接住，故把它放在第二位
    stack: `'Eunice Swei', 'Eunice Sans SC', ${TAIL}`,
  },
  {
    id: 'zhisong',
    label: '霞鹜新致宋',
    labelEn: 'LXGW Neo ZhiSong',
    note: '老式衬线 · 书卷气',
    noteEn: 'Old-style serif, bookish',
    category: 'serif',
    sample: '中文正文 Aa 123 ±≈',
    stack: `'Eunice ZhiSong', 'Eunice Serif SC', ${TAIL}`,
  },
  {
    id: 'sarasa-mono',
    label: '更纱等宽',
    labelEn: 'Sarasa Mono SC',
    note: '等宽中文 · 码位最全',
    noteEn: 'Monospaced CJK, widest coverage',
    category: 'mono',
    sample: '等宽中文 Aa 123 ±≈',
    stack: `'Eunice Sarasa', ${TAIL}`,
  },
  {
    id: 'glow-sans',
    label: '未来荧黑',
    labelEn: 'Glow Sans',
    note: '几何无衬线 · 偏现代',
    noteEn: 'Geometric sans, modern',
    category: 'sans',
    sample: '中文正文 Aa 123 ±≈',
    stack: `'Eunice Glow', 'Eunice Sans SC', ${TAIL}`,
  },
  {
    id: 'system',
    label: '系统字体',
    labelEn: 'System fonts',
    note: '微软雅黑 · 零加载',
    noteEn: 'Microsoft YaHei, zero download',
    category: 'system',
    sample: '系统字体 Aa 123',
    stack: `"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Segoe UI", ${TAIL}`,
  },
];

export const FONT_BY_ID = new Map(FONT_PRESETS.map((f) => [f.id, f]));

export const FONT_CATEGORIES = [
  { id: 'all', label: '全部', labelEn: 'All' },
  { id: 'sans', label: '无衬线', labelEn: 'Sans' },
  { id: 'serif', label: '衬线', labelEn: 'Serif' },
  { id: 'round', label: '圆体', labelEn: 'Rounded' },
  { id: 'kai', label: '楷体', labelEn: 'Kai' },
  { id: 'mono', label: '等宽', labelEn: 'Mono' },
  { id: 'system', label: '系统', labelEn: 'System' },
];

export function applyFont(id) {
  injectFaces();
  const preset = FONT_BY_ID.get(id) || FONT_PRESETS[0];
  // 分片字体表按家族按需注入（不选到的家族一个字节都不下载）
  loadSlicedFaces(preset.stack);
  // 文楷的分片表等到真的用到它时再注入（见 injectWenkai）
  if (preset.stack.includes('LXGW WenKai')) injectWenkai();
  document.documentElement.style.setProperty('--mr-font-body', preset.stack);
  return preset;
}