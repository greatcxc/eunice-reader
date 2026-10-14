/**
 * 渲染后处理：把「markdown-it 输出的 HTML」变成「可直接阅读的界面」。
 * 这里全是界面增强（复制按钮、滚动容器、图片兜底、按需着色），
 * 不涉及 Markdown 语义解析。
 *
 * 两条性能原则：
 *   1. **一次遍历**：以前 wrapTables / enhanceCodeBlocks / enhanceImages /
 *      markExternalLinks / collectHeadings 各扫一遍整棵 DOM，长文档上就是
 *      5 次全树 querySelectorAll。现在合并成一次 TreeWalker。
 *   2. **着色按需**：代码高亮不在渲染时做，而是等代码块滚进视口
 *      （IntersectionObserver，±400px 预读）再补。markdown-it 只输出转义文本，
 *      于是「打开」和「每击键重渲染」都不再为高亮付出代价。
 */

import { convertFileSrc } from '@tauri-apps/api/core';
import { icon, externalIcon } from '../ui/icons.js';
import { highlightCode, preloadHighlight } from '../markdown/index.js';

/* ------------------------------------------------------------------ */
/* 相对路径解析                                                        */
/* ------------------------------------------------------------------ */

/** 相对路径链接/图片解析：本地 md 里写 ![](./a.png) 时，必须基于 md 自身目录 */
const ABS_URL_RE = /^(https?:|data:|asset:|blob:|mailto:|#|\/)/i;

export function resolvePaths(fragment, baseDir) {
  if (!baseDir) return fragment;

  const join = (rel) => {
    try {
      return convertFileSrc(`${baseDir.replace(/[\\/]+$/, '')}\\${rel.replace(/\//g, '\\')}`);
    } catch {
      return rel;
    }
  };

  // 一次遍历同时处理 img 与 a（原来是两次全树查询）
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.tagName === 'IMG') {
      const src = n.getAttribute('src');
      if (src && !ABS_URL_RE.test(src)) n.setAttribute('src', join(src));
    } else if (n.tagName === 'A') {
      const href = n.getAttribute('href');
      // 只改文档内锚点之外的相对链接；锚点交给前端滚动处理
      if (href && !ABS_URL_RE.test(href)) n.setAttribute('href', join(href));
    }
  }

  return fragment;
}

/* ------------------------------------------------------------------ */
/* 单项增强（都由 enhance 的一次遍历驱动）                              */
/* ------------------------------------------------------------------ */

/** 表格横向滚动：窄屏下宽表格不撑破布局 */
function wrapTable(table) {
  if (table.parentElement?.classList.contains('mr-table-wrap')) return;
  const wrap = document.createElement('div');
  wrap.className = 'mr-table-wrap';
  table.parentNode.insertBefore(wrap, table);
  wrap.appendChild(table);
}

/** 图片兜底：路径写错时给出明确提示，而不是一个碎图图标 */
function bindImageFallback(img) {
  img.addEventListener(
    'error',
    () => {
      img.classList.add('is-broken');
      img.title = `图片无法加载：${img.getAttribute('src') || '(空路径)'}`;
    },
    { once: true },
  );
}

/** 外链：加 ↗ 标记，让用户知道会离开本地文档 */
function markExternal(a) {
  if (a.querySelector('.mr-external-mark')) return;
  const mark = document.createElement('span');
  mark.className = 'mr-external-mark';
  mark.innerHTML = externalIcon(11);
  a.appendChild(mark);
}

/* ---- 代码块：语言标签 + 复制按钮 + 按需着色 ---- */

let highlightObserver = null;
/** 预热只需一次（hljs 载入后一直留在内存里） */
let preloadScheduled = false;

function enhanceCodeBlock(pre) {
  const code = pre.querySelector('code');
  if (!code) return;

  const lang = pre.dataset.lang;

  if (lang && !pre.querySelector('.mr-code-lang')) {
    const tag = document.createElement('span');
    tag.className = 'mr-code-lang';
    tag.textContent = lang;
    pre.appendChild(tag);
  }

  if (!pre.querySelector('.mr-copy')) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mr-copy';
    btn.title = '复制代码';
    btn.setAttribute('aria-label', '复制代码');
    btn.innerHTML = `${icon('copy', 13)}<span>复制</span>`;
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const span = btn.querySelector('span');
      try {
        await navigator.clipboard.writeText(code.innerText);
        btn.classList.add('is-done');
        span.textContent = '已复制';
      } catch {
        span.textContent = '复制失败';
      }
      setTimeout(() => {
        span.textContent = '复制';
        btn.classList.remove('is-done');
      }, 1600);
    });
    pre.appendChild(btn);
  }

  // 已经着色过的块（code 里有元素子节点）不必再观察
  if (!code.firstElementChild) highlightObserver?.observe(pre);
}

/**
 * 给一个代码块补着色。
 *
 * hljs 的输出只含它自己生成的 span/class，源码在写进 DOM 前已被 escapeHtml，
 * 因此这里 innerHTML 不会引入未消毒的内容（DOMPurify 在插入前已经跑过一遍）。
 */
async function paintHighlight(pre) {
  const code = pre.querySelector('code');
  if (!code || code.firstElementChild) return;
  const raw = code.textContent || '';
  if (!raw.trim()) return;
  const html = await highlightCode(raw, pre.dataset.lang);
  if (html != null) code.innerHTML = html;
}

/* ---------------------------------------------------------------- */
/* Mermaid：按需加载，冷启动不拖慢                                    */
/* ---------------------------------------------------------------- */

let mermaidModule = null;
let mermaidReady = null;
let mermaidSeq = 0;
let mermaidIsDark = false;

function loadMermaid(dark) {
  if (mermaidReady && mermaidIsDark === dark) return mermaidReady;
  mermaidIsDark = dark;
  mermaidReady = import('mermaid').then((mod) => {
    const m = mod.default;
    mermaidModule = m;
    m.initialize({
      startOnLoad: false,
      // strict = mermaid 自己做消毒，我们才敢把它的 SVG 直接插进 DOM
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'default',
      fontFamily: 'inherit',
      flowchart: { htmlLabels: false },
    });
    return m;
  });
  return mermaidReady;
}

export async function renderMermaid(root, dark) {
  const nodes = [...root.querySelectorAll('[data-mermaid-source]')];
  if (!nodes.length) return;

  // 必须在这里主动确保已加载，不能依赖 warmupMermaid 是否已经跑完 ——
  // 用户可能在预热触发前就打开了含图表的文档，那样图表会永远不渲染。
  const mermaid = await loadMermaid(typeof dark === 'boolean' ? dark : mermaidIsDark);

  for (const node of nodes) {
    const source = node.textContent || '';
    const id = `mr-mermaid-${++mermaidSeq}`;
    try {
      const { svg } = await mermaid.render(id, source);
      node.innerHTML = svg;
      node.removeAttribute('data-mermaid-source');
      node.classList.add('is-rendered');
    } catch (err) {
      node.classList.add('is-error');
      node.innerHTML = '';
      const pre = document.createElement('pre');
      pre.className = 'mr-mermaid-error';
      pre.textContent = `图表语法错误：${err?.message || err}\n\n${source}`;
      node.appendChild(pre);
    }
  }
}

/* ---------------------------------------------------------------- */

/**
 * 一次性施加全部界面增强。
 *
 * 先遍历收集、再统一改 DOM：TreeWalker 在遍历途中被就地插入的包裹层
 * （表格外面套 .mr-table-wrap）会打乱游标，所以两段式更稳。
 *
 * @param {HTMLElement} container .markdown-body 容器
 * @param {Element} [scrollRoot] 预览滚动容器，作为按需着色的观察根
 * @returns {Array<{id:string, level:number, text:string}>} 标题（大纲用）
 */
export function enhance(container, scrollRoot) {
  const tables = [];
  const codeBlocks = [];
  const images = [];
  const links = [];
  const headings = [];

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const tag = node.tagName;
    if (tag === 'TABLE') tables.push(node);
    else if (tag === 'PRE' && node.classList.contains('mr-code')) codeBlocks.push(node);
    else if (tag === 'IMG' && node.classList.contains('mr-img')) images.push(node);
    else if (tag === 'A' && node.classList.contains('mr-link-external')) links.push(node);
    else if (tag.length === 2 && tag[0] === 'H' && node.id) {
      headings.push({ id: node.id, level: Number(tag[1]), text: node.textContent?.trim() || '' });
    }
  }

  // 每次渲染重建观察器：旧的代码块节点已经离开文档，留着只会让它们无法回收
  highlightObserver?.disconnect();
  highlightObserver = new IntersectionObserver(
    (entries, obs) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        obs.unobserve(e.target);
        paintHighlight(e.target);
      }
    },
    { root: scrollRoot || null, rootMargin: '400px 0px' },
  );

  for (const table of tables) wrapTable(table);
  for (const pre of codeBlocks) enhanceCodeBlock(pre);
  for (const img of images) bindImageFallback(img);
  for (const a of links) markExternal(a);

  // 有代码块就趁空闲把高亮引擎取回来，省得第一次滚动时才现加载
  if (codeBlocks.length && !preloadScheduled) {
    preloadScheduled = true;
    const warm = () => preloadHighlight();
    if (typeof requestIdleCallback === 'function') requestIdleCallback(warm, { timeout: 2000 });
    else setTimeout(warm, 400);
  }

  return headings;
}

/** 收集标题，生成大纲（目录）。enhance() 已经顺路收好了，这里保留独立入口备用。 */
export function collectHeadings(container) {
  return [...container.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]')].map((el) => ({
    id: el.id,
    level: Number(el.tagName[1]),
    text: el.textContent?.trim() || '',
  }));
}
