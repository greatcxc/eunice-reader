/**
 * HTML 消毒层。
 *
 * Markdown 允许内嵌原始 HTML，而本地 md 文件可能来自不可信来源，
 * 所以渲染结果必须过一遍 DOMPurify 才进 DOM。
 *
 * 注意顺序：Mermaid 图表不走这里 —— 它在插入 DOM 之前由 mermaid 自身的
 * securityLevel: 'strict' 消毒，避免它的 SVG 被本文件的规则误伤。
 */

import DOMPurify from 'dompurify';

/** KaTeX 的 MathML 需要保留，浏览器没有 MathML 时才回退到 HTML+CSS 渲染 */
const KATEX_MATHML = [
  'math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'msubsup',
  'mfrac', 'msqrt', 'mroot', 'mtext', 'mspace', 'mtable', 'mtr', 'mtd',
  'munder', 'mover', 'munderover', 'mpadded', 'mphantom', 'mstyle', 'annotation',
];

/** KaTeX 会用到的 SVG（根号、对勾等） */
const KATEX_SVG = ['svg', 'path', 'line', 'g', 'rect', 'circle', 'use', 'clipPath', 'defs', 'marker'];

/** 扩展语法用到的标签 */
const EXTRA = [
  // 任务列表
  'input', 'label',
  // HTML5 原生折叠
  'details', 'summary',
  // 媒体
  'figure', 'figcaption', 'video', 'audio', 'source',
];

const CONFIG = {
  ADD_TAGS: [...KATEX_MATHML, ...KATEX_SVG, ...EXTRA],
  ADD_ATTR: [
    // 脚注锚点 / 标题锚点依赖 id 和 name
    'id', 'name', 'target', 'rel', 'align',
    // 代码块语言标记
    'data-lang', 'data-mermaid-source',
    // 任务列表
    'type', 'checked', 'disabled',
    // 无障碍
    'aria-hidden', 'aria-label', 'role',
    // KaTeX 输出标记
    'aria-hidden-math-style', 'stretchy', 'separator', 'accent', 'accentunder',
    'displaystyle', 'scriptlevel', 'mathvariant', 'linethickness', 'fence',
  ],
  // 允许 data: 图片（内嵌 base64 图），以及 asset:/http(s): 外链图
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|ftp):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'base', 'form', 'input:not([type=checkbox])'],
  FORBID_ATTR: ['style', 'srcset'],
  KEEP_CONTENT: true,
  RETURN_DOM_FRAGMENT: true,
};

/**
 * @param {string} html markdown-it 渲染结果
 * @returns {DocumentFragment} 已消毒的片段，可直接 appendChild
 */
export function sanitize(html) {
  return DOMPurify.sanitize(html, CONFIG);
}

/**
 * 「可信 HTML」直接解析成片段，跳过 DOMPurify。
 *
 * 适用条件：原始 Markdown 里**一个 `<` 都没有**。此时 markdown-it 的输出
 * 只可能由它自己生成（标签、属性全部来自插件与本项目配置），不含任何来自
 * 文档的标签；文档里的文字、URL 都已按各自规则转义（linkify / validateLink
 * 会挡掉 javascript: 之类的协议）。因此这一趟整树消毒是纯开销
 * —— 实测 1MB 文档、1.28MB HTML 上约 72ms。
 *
 * 判断交给调用方（main.js）：只要文档里出现过 `<`，哪怕只是 `a < b`，
 * 也照旧走 sanitize()，宁可多花这 72ms。
 *
 * @param {string} html markdown-it 渲染结果
 * @returns {DocumentFragment}
 */
export function parseTrusted(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return tpl.content;
}

/** 纯文本提取，用于生成状态栏字数统计 */
export function extractText(node) {
  return node.textContent || '';
}