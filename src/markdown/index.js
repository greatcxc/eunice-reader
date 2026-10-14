/**
 * Markdown 渲染管线。
 * 这里只做「装配」——所有解析能力都来自现成开源库，本文件不实现任何语法规则。
 *
 *   markdown-it                 核心解析（MIT）
 *   markdown-it-front-matter    YAML front matter
 *   markdown-it-task-lists      GFM 任务列表
 *   markdown-it-footnote        脚注
 *   markdown-it-emoji           :emoji:
 *   markdown-it-anchor          标题锚点
 *   markdown-it-container       ::: 提示块
 *   @vscode/markdown-it-katex   公式（VSCode 同款插件）—— 按需加载
 *   highlight.js               代码高亮 —— 按需加载
 *
 * 「按需加载」的含义：
 *   公式（katex，261KB CSS 另算）—— 文档出现 `$` 时才载入，渲染前 await 就绪；
 *   代码高亮（highlight.js，154KB）—— 渲染时**完全不做**，只输出转义文本，
 *   等代码块滚进视口由 enhance.js 调 highlightCode() 补上。
 * 两者合计 ~416KB，冷启动不再为它们付出解析/编译成本。
 */

import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import footnote from 'markdown-it-footnote';
// markdown-it-emoji@3 只提供具名导出，没有 default。
// 可选：bare（无任何 emoji）/ light（常用轻量集）/ full（全量）
import { full as emojiFull } from 'markdown-it-emoji';
import anchor from 'markdown-it-anchor';
import container from 'markdown-it-container';

/* ------------------------------------------------------------------ */
/* 按需渲染器                                                          */
/* ------------------------------------------------------------------ */

/** highlight.js 实例；null = 还没加载 */
let hljs = null;
let hljsLoading = null;

/** katex 插件是否已挂到 md 上 */
let katexReady = false;

/** 有未转义的 $ 才可能是公式（`$$…$$` 或 `$…$`） */
const MATH_RE = /\$\$|\$[^\s$]/;

/** 无语言标注的代码块，超过这个长度就不做自动识别了（highlightAuto 随块长超线性增长） */
const AUTO_DETECT_MAX = 4000;

/** 着色结果缓存：编辑时同一块会被反复重渲染，没必要每次重跑 hljs */
const HL_CACHE = new Map();
const HL_CACHE_MAX = 400;

/**
 * 兼容 Vite 与 Node 两套 CJS interop。
 *
 * @vscode/markdown-it-katex 是 CJS 包，不同环境下拿到的层级不一样：
 *   Vite（已预打包成 ESM）  → { default: fn }
 *   Node 动态 import 命名空间 → { default: { __esModule, default: fn } }
 * 所以这里逐层往下剥，直到拿到函数为止 —— 只剥一层会在 Node 下静默失效
 * （表现为公式原样输出成 `$…$`，而没有任何报错）。
 */
function resolvePlugin(mod) {
  let m = mod;
  for (let i = 0; i < 4 && m && typeof m !== 'function'; i++) m = m.default;
  if (typeof m === 'function') return m;
  throw new TypeError('插件导入失败：导出结构异常');
}

function loadHljs() {
  if (!hljsLoading) {
    hljsLoading = import('highlight.js/lib/common')
      .then((m) => {
        hljs = m.default ?? m;
        return hljs;
      })
      // 载入失败就退化成纯文本，不能因为着色而让整篇文档渲染不出来
      .catch((err) => {
        console.warn('[markdown] highlight.js 按需加载失败：', err);
        return null;
      });
  }
  return hljsLoading;
}

function loadKatex() {
  if (katexReady) return Promise.resolve();
  return import('@vscode/markdown-it-katex')
    .then((mod) => {
      md.use(resolvePlugin(mod), {
        throwOnError: false,
        errorColor: '#d1242f',
        strict: false,
      });
      katexReady = true;
      // 样式表跟着引擎一起按需加载：它不必进首屏 <head>，也就不会阻塞首帧；
      // 而且公式文档才会用到它（连同 KaTeX 自带字体，共约 1MB）。
      import('katex/dist/katex.min.css').catch(() => {});
    })
    // 载入失败要留下痕迹：静默吞掉会表现为「公式原样显示成 $…$」而查不出原因
    .catch((err) => console.warn('[markdown] katex 按需加载失败：', err));
}

/**
 * 渲染前装配：确保本次渲染需要的引擎就位。
 *
 * 只有公式需要「渲染前就绪」（否则会把 `$…$` 原样渲染出来）；
 * 代码高亮完全不需要 —— 它由 enhance.js 在滚动时补。
 *
 * @param {string} text 待渲染的 Markdown
 */
export async function ensureRenderers(text) {
  const t = text || '';
  if (!katexReady && MATH_RE.test(t)) await loadKatex();
}

/**
 * 空闲时预热高亮引擎。
 *
 * 高亮是「滚进视口才做」的，如果完全不预热，第一次滚动撞上代码块时
 * 正好要等一次 154KB 的动态 import —— 卡在滚动那一下最难受。
 * 所以文档里确实有代码块时，趁空闲先把它取回来（154KB，不是 mermaid 那种 5MB，
 * 可以放心预热；启动后固定 1.5 秒预热 mermaid 那种做法才是错的）。
 */
export function preloadHighlight() {
  loadHljs().catch(() => {});
}

/** GitHub 风格提示块 */
const CALLOUTS = [
  { name: 'note', cls: 'mr-callout-note', label: '说明' },
  { name: 'tip', cls: 'mr-callout-tip', label: '提示' },
  { name: 'important', cls: 'mr-callout-important', label: '重要' },
  { name: 'warning', cls: 'mr-callout-warning', label: '注意' },
  { name: 'caution', cls: 'mr-callout-caution', label: '警告' },
];

/**
 * 代码块输出：**不着色**，只把源码转义后放进 DOM，并带上 data-lang。
 *
 * 着色由 enhance.js 在代码块滚进视口时调用 highlightCode() 补上。
 * 这样「打开文档」和「每击键重渲染」都不再为高亮付费 ——
 * 以前这里对无标注块调 highlightAuto，一篇 1MB 文档的 400+ 个围栏
 * 能把渲染从 22ms 拖到 113ms。
 */
function highlight(code, lang) {
  const language = (lang || '').trim().toLowerCase().split(/\s+/)[0];

  // Mermaid 刻意**不在这里**处理：highlight 的返回值一定会被默认 fence 规则
  // 裹进 <pre><code>，图表必须跳过这层包装，所以由下面的 fence 规则直接接管。
  const langAttr = language ? ` data-lang="${md.utils.escapeHtml(language)}"` : '';
  return `<pre class="mr-code"${langAttr}><code class="hljs">${md.utils.escapeHtml(code)}</code></pre>`;
}

/**
 * 给「滚进视口的代码块」补着色（供 enhance.js 调用）。
 *
 * 首次调用会按需载入 highlight.js（154KB，一次），结果按 (lang, code) 缓存。
 *
 * @param {string} code 代码原文（未转义）
 * @param {string|undefined} lang data-lang 的值
 * @returns {Promise<string|null>} 高亮后的 HTML；null 表示保持纯文本
 */
export async function highlightCode(code, lang) {
  const key = `${lang || ''}\u0000${code}`;
  if (HL_CACHE.has(key)) return HL_CACHE.get(key);

  await loadHljs();

  let html = null;
  if (hljs) {
    const language = (lang || '').trim().toLowerCase().split(/\s+/)[0];
    try {
      if (language && hljs.getLanguage(language)) {
        html = hljs.highlight(code, { language, ignoreIllegals: true }).value;
      } else if (!language && code.length <= AUTO_DETECT_MAX) {
        // 无语言标注才自动识别，而且只对**视口内**的块做：
        // 单块 0.5ms（160B）~ 11ms（1.7KB），同时在屏的通常只有几个；
        // 在渲染整篇时做同一件事，400+ 个围栏就是近一倍的渲染开销。
        html = hljs.highlightAuto(code).value;
      }
    } catch {
      html = null; // 着色失败就保持纯文本，不能因此中断阅读
    }
  }

  if (HL_CACHE.size >= HL_CACHE_MAX) HL_CACHE.clear();
  HL_CACHE.set(key, html);
  return html;
}

export const md = new MarkdownIt({
  html: true, // 本地文档常内嵌 HTML（如 <img>、<details>），关掉会让浏览体验残缺
  linkify: true,
  typographer: false, // typographer 会把中文引号替换成英文弯引号，中文文档里是破坏
  breaks: false, // GFM 规范行为；开启会让所有换行变段落，和 GitHub 显示不一致
  highlight,
});

// 注意：markdown-it-front-matter@0.2.4（2020 年）与 markdown-it 15 不兼容，
// 单独使用即抛 `cb is not a function`，因此不使用该插件。
// Front Matter 只是文件头部的 YAML 分隔，不是 Markdown 语法，渲染前剥离即可。
const FRONT_MATTER = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * 剥离文件头部的 YAML Front Matter。
 * @param {string} text
 * @returns {{ text: string, meta: string|null }}
 */
export function stripFrontMatter(text) {
  const m = FRONT_MATTER.exec(text);
  if (!m) return { text, meta: null };
  return { text: text.slice(m[0].length), meta: m[1] };
}

// 注意：下面所有插件都必须传「插件本身」，写成 plugin() 会让 md 参数为 undefined 而运行时崩。
md.use(taskLists, { enabled: false, label: true, labelAfter: true });
md.use(footnote);
md.use(anchor, {
  slugify: (s) => encodeURIComponent(String(s).trim().toLowerCase().replace(/\s+/g, '-')),
  // 刻意**不开** permalink：标题后面那个「#」在中文文档里既抢眼又没有实际用途
  // （大纲侧栏已经能跳转，链接锚点靠 id 就够）。只保留 slugify 生成的 id。
});

md.use(emojiFull);

for (const c of CALLOUTS) {
  md.use(container, c.name, {
    render(tokens, idx) {
      const token = tokens[idx];
      if (token.nesting !== 1) return '</div>\n';
      return `<div class="mr-callout mr-callout-${c.name}" role="note">
  <div class="mr-callout-title"><span class="mr-callout-icon"></span><span class="mr-callout-label">${c.label}</span></div>
  <div class="mr-callout-body">
`;
    },
  });
}

// markdown-it-container 会生成 container_<name>_open / _close 两条渲染规则，
// close 必须精确闭合 render 里打开的两个 div。
for (const c of CALLOUTS) {
  md.renderer.rules[`container_${c.name}_close`] = () => '  </div>\n</div>\n';
}

// katex 插件由 ensureRenderers() 在文档出现公式时才挂上（见文件头说明）。

/* Mermaid：围栏直接渲染成块级容器，**不经过** <pre><code>。
 *
 * 交给 options.highlight 返回一个 `<div>` 是走不通的：markdown-it 的默认 fence
 * 规则只在返回值以 `<pre` 开头时才原样采用，否则一律再裹一层
 * <pre><code class="language-mermaid">。于是块级图表被塞进行内元素 code 里 ——
 * 嵌套非法、语义上也不是代码，还会继承 pre 的 padding / white-space: pre /
 * 等宽字体；最明显的一处是导出 PDF：print.css 给 `.markdown-body pre` 加了边框和
 * 底色，每个图表都会被套上一圈「代码块」的灰框。
 * 所以这里接管 fence 规则：mermaid 围栏返回裸容器（源码转义后进 DOM，
 * 画图交给 enhance.js 的 renderMermaid()），其余围栏仍走默认实现。
 */
const defaultFence = md.renderer.rules.fence;

md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const info = (token.info || '').trim().toLowerCase().split(/\s+/)[0];
  if (info === 'mermaid') {
    return `<div class="mr-mermaid" data-mermaid-source>${md.utils.escapeHtml(token.content)}</div>\n`;
  }
  return defaultFence(tokens, idx, options, env, self);
};

// 链接：新窗口打开 + 防 tabnabbing；相对路径链接原样保留给 Tauri 解析
const defaultLinkOpen =
  md.renderer.rules.link_open ||
  ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options, env, self));

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet('href') || '';
  const isExternal = /^https?:\/\//i.test(href);
  if (isExternal) {
    tokens[idx].attrSet('target', '_blank');
    tokens[idx].attrSet('rel', 'noopener noreferrer');
    tokens[idx].attrJoin('class', 'mr-link-external');
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

// 图片：懒加载 + 加载失败占位（本地相对路径图片很常见）
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const src = token.attrGet('src') || '';
  // 远程图与本地图都值得懒加载：本地图走 asset:// 也是同步解码，
  // 长文档里几十张图会直接拖慢首屏（本地图不再等待滚动才解码）。
  token.attrSet('loading', 'lazy');
  token.attrSet('decoding', 'async');
  if (/^(https?:)?\/\//i.test(src)) {
    token.attrSet('referrerpolicy', 'no-referrer');
  }
  token.attrJoin('class', 'mr-img');
  return self.renderToken(tokens, idx, options, env, self);
};

/**
 * 渲染入口（同步）。
 * 调用方必须先 `await ensureRenderers(text)` 再调本函数。
 * @param {string} text 原始 Markdown
 * @returns {string} HTML 字符串（未消毒）
 */
export function renderMarkdown(text) {
  if (!text) return '';
  return md.render(stripFrontMatter(text).text);
}

/** 行内渲染，用于标题/摘要等场景 */
export function renderInline(text) {
  return md.renderInline(text || '');
}
