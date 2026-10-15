/**
 * 设置界面：分两级。
 *
 *   【常用】右侧抽屉 —— 正文主题 / 正文字体 / 文字大小 / 最近打开
 *   【高级】居中模态 —— 排版细节 / 窗口与界面 / 行为 / 文件关联 / 快捷键
 *
 * 为什么分级：抽屉的意义是「边调边看」，它必须短到一眼扫得完。日常真正会调
 * 的只有主题、字体、字号三件事；行高、正文宽度、玻璃强度、界面语言、文件关联、
 * 快捷键这些一年也动不了一次。把它们常驻在同一列里，结果是高频项被低频项稀释，
 * 找一个滑杆要往下滚三屏 —— 这正是旧版「太复杂」的来源。
 *
 * 抽屉仍然刻意不是全屏模态：换主题、调字号必须立刻在左侧文档里看得见。
 *
 * 这里**没有**「代码配色」这种东西：这是一个用来读方案、提案与报告的工具，
 * 代码块顶多出现在文档里，不值得让读者去挑 82 套程序员配色。
 */

import { DOC_THEMES, DOC_THEME_TABS } from '../lib/doc-themes.js';
import { FONT_PRESETS, FONT_CATEGORIES } from '../lib/fonts.js';
import { getSettings, saveSettings, recentEntries, normalizeGlass } from '../lib/store.js';
import { t, pick, isEnglish, LOCALE_OPTIONS } from '../lib/i18n.js';
import { icon } from './icons.js';


/* ------------------------------------------------------------------ */
/* 主题预览                                                            */
/* ------------------------------------------------------------------ */

/**
 * 预览样张。
 *
 * 要同时体现标题、正文、强调、链接、行内代码、引用块与代码块 —— 这些是主题
 * 真正在控制的东西。跟着界面语言走：英文界面里塞一段中文，样张就变成
 * 「看字形」而不是「看配色」。
 */
const SAMPLE = {
  zh: {
    h: '季度营收',
    p: '本月<strong>增长 12%</strong>，主要来自<a>欧洲市场</a>。订单量创下<code>历史新高</code>。',
    q: '订单量创下历史新高',
    c: 'revenue = 1.2e6',
  },
  en: {
    h: 'Quarterly revenue',
    p: 'Up <strong>12%</strong> this month, mostly from <a>Europe</a>. Orders hit a <code>record</code> high.',
    q: 'Orders hit a record high',
    c: 'revenue = 1.2e6',
  },
};

/**
 * 样张内容：标题、正文（含强调、链接、行内代码）、引用块、一小段代码块。
 * 代码块不是为了「看配色」—— 是方案与报告里真的会有命令行和配置片段，
 * 它的底色与边框同样属于主题的一部分。
 */
const sampleHtml = () => {
  const s = isEnglish() ? SAMPLE.en : SAMPLE.zh;
  return `<h4>${s.h}</h4><p>${s.p}</p><blockquote>${s.q}</blockquote><pre><code>${s.c}</code></pre>`;
};

/**
 * 样板页：一只真正按该主题渲染的迷你文档。
 *
 * 用 Shadow DOM + 只注入该主题的 CSS 变量，而不是把整份主题 CSS 复制进来 ——
 * 样板页与主界面互不污染（色块那边同理，只是它们只需要几个色值，
 * 直接以内联变量给就够，不必各开一只 shadow root）。
 *
 * 关键在**它外面那圈衬底**：样板页只占中间一块纸面，四周是界面自己的
 * `--ui-sunken`。旧版的毛病恰恰在这里 —— 预览区正下方直接贴着一条界面白底的
 * 说明栏，用户会以为那层白也是主题的一部分。
 */
function mountDocPage(host, theme) {
  const v = (name) => readVar(name, theme);
  const root = host.attachShadow({ mode: 'open' });

  root.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      .p {
        height: 100%;
        padding: 12px 15px;
        background: ${v('--paper')};
        color: ${v('--ink')};
        font: 11.5px/1.8 "Microsoft YaHei UI", "Segoe UI", sans-serif;
        overflow: hidden;
      }
      h4 { margin: 0 0 5px; font-size: 14px; line-height: 1.3; font-weight: 700;
           color: ${v('--head-1')}; }
      p { margin: 0 0 7px; }
      strong { font-weight: 700; }
      a { color: ${v('--accent')}; text-decoration: underline; text-underline-offset: 2px; }
      code { padding: 1px 4px; border-radius: 3px; background: ${v('--code-inline-bg')};
             color: ${v('--code-inline-ink')}; font: 10.5px/1.5 ui-monospace, Consolas, monospace; }
      blockquote { margin: 0; padding: 5px 10px; font-size: 11px; line-height: 1.65;
                   background: ${v('--quote-bg')}; color: ${v('--quote-ink')};
                   border-left: 3px solid ${v('--quote-bar')}; }
      pre { margin: 7px 0 0; padding: 5px 9px; border-radius: 4px;
            background: ${v('--code-bg')}; border: 1px solid ${v('--code-rule')}; }
      pre code { padding: 0; background: none; color: ${v('--ink')};
                 font: 10.5px/1.55 ui-monospace, Consolas, monospace; }
    </style>
    <div class="p">${sampleHtml()}</div>
  `;
}

/**
 * 读取主题的 CSS 变量值。
 * 做法：临时挂一个带 data-theme-doc 的探针元素，取完即撤。
 * 结果按「主题:变量」缓存 —— 12 个色块各取 7 个变量、大样板另取 9 个，
 * 不缓存要挂上百次探针。
 */
const probeCache = new Map();

function readVar(varName, theme) {
  const key = `${theme.id}:${varName}`;
  if (probeCache.has(key)) return probeCache.get(key);

  let value = 'transparent';
  const probe = document.createElement('div');
  probe.dataset.themeDoc = theme.id;
  probe.style.cssText = 'position:absolute;left:-99999px;width:10px;height:10px;';
  document.body.appendChild(probe);
  try {
    value = getComputedStyle(probe).getPropertyValue(varName).trim() || value;
  } catch {
    /* ignore */
  }
  probe.remove();
  probeCache.set(key, value);
  return value;
}

/** 色板的五个取样点：纸面、正文、标题、强调、引用 */
const PALETTE = [
  ['set.palette.paper', '--paper'],
  ['set.palette.ink', '--ink'],
  ['set.palette.head', '--head-1'],
  ['set.palette.accent', '--accent'],
  ['set.palette.quote', '--quote-bg'],
];

/**
 * 色板：把主题的取色本身摆出来。
 *
 * 配色这种事，让用户从一段样例文字里「猜」是最费劲的 —— 直接给出五个色点，
 * 主题之间比的是什么就一目了然。纸面可能是接近白色的一档，在白底上会消失，
 * 所以描边走界面自己的前景灰（见 .sw），而不是主题的 --rule。
 */
function paletteNode(theme) {
  const box = el('span', { className: 'palette' });
  for (const [labelKey, varName] of PALETTE) {
    const value = readVar(varName, theme);
    const dot = el('span', { className: 'sw' });
    dot.style.background = value;
    dot.title = `${t(labelKey)} · ${value}`;
    dot.setAttribute('aria-label', `${t(labelKey)} ${value}`);
    box.appendChild(dot);
  }
  return box;
}

/** 缩略图小色块要用到的变量：纸面 + 四种「内容色」 */
const TILE_VARS = [
  ['--t-paper', '--paper'],
  ['--t-ink', '--ink'],
  ['--t-head', '--head-1'],
  ['--t-accent', '--accent'],
  ['--t-quote', '--quote-bg'],
  ['--t-quote-bar', '--quote-bar'],
  ['--t-rule', '--rule'],
];


/* ------------------------------------------------------------------ */
/* 表单helpers                                                         */
/* ------------------------------------------------------------------ */

/**
 * 只能写成 HTML 属性、不能直接赋 property 的字段。
 *
 * 另外，凡带连字符的键（`aria-label` / `aria-pressed` / `data-*`）一律走属性：
 * 它们没有同名的 DOM property，`n['aria-label'] = x` 只会挂一个没人看的
 * expando，属性根本没写上 —— 这类失效是静默的，读代码读不出来，
 * 只有 `getAttribute()` 才验得出来。
 */
const ATTRS = new Set(['type', 'value', 'min', 'max', 'step', 'title']);

function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  const late = [];
  for (const [k, v] of Object.entries(props)) {
    if (ATTRS.has(k) || k.includes('-')) {
      // 必须走属性：赋值 property 的时机太早会丢。
      // 典型坑：<select> 的 value 只有在 option 已经存在时才能选中，
      // 而 Object.assign 发生在 appendChild 之前，于是永远选不中。
      late.push([k, v]);
      continue;
    }
    if (k === 'selected' || k === 'checked') {
      // 不能用 setAttribute，必须等节点挂上去之后按 property 设
      late.push([k, v]);
      continue;
    }
    n[k] = v;
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  for (const [k, v] of late) {
    if (k === 'selected' || k === 'checked') n[k] = v;
    else n.setAttribute(k, String(v));
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* 分区卡片与表单控件                                                  */
/* ------------------------------------------------------------------ */

/**
 * 分组卡片。
 *
 * 旧版六个分区共用一条 1px 分隔线，视觉权重完全一样 —— 扫一眼看不出
 * 「正文主题」才是这个面板的主角。改成独立卡片 + 标题栏 + 可选徽标，
 * 主次一眼可辨。
 *
 * @param {string} title 分组标题
 * @param {object} [opts] { badge, hint, children }
 *        hint 可以是字符串，也可以是一个现成的节点（需要实时更新的提示）
 */
function section(title, opts = {}) {
  const { badge, hint, children = [] } = opts;
  const head = el('div', { className: 'sec-head' }, [
    el('span', { className: 'sec-title' }, [title]),
    badge ? el('span', { className: 'sec-badge' }, [badge]) : null,
  ]);
  const body = el('div', { className: 'sec-body' }, [
    hint ? (hint.nodeType ? hint : el('p', { className: 'sec-hint' }, [hint])) : null,
    ...[].concat(children),
  ]);
  return el('div', { className: 'sec' }, [head, body]);
}

/** 一行设置：左侧标签固定宽，右侧控件 + 数值 */
function row(label, control, valueNode) {
  return el('div', { className: 'row' }, [
    el('span', { className: 'row-label' }, [label]),
    el('div', { className: 'row-body' }, [control, valueNode]),
  ]);
}

/** 把 row() 产出的控件/数值取出来，配上标签重新组成一行 */
function rowLabeled(label, rowNode) {
  // 取不到就退化成直接用该节点：宁可这一行没有左右分栏，
  // 也不能像之前那样静默把控件整块丢掉（那会让设置项凭空消失）。
  const body = rowNode.querySelector('.row-body') || rowNode;
  return el('div', { className: 'row' }, [
    el('span', { className: 'row-label' }, [label]),
    body,
  ]);
}

/**
 * 自绘滑杆。
 *
 * 原生 range 在 WebView2 下是系统外观，与整套设计语言脱节（旧版只有
 * 一行 accent-color）。这里用 -webkit-slider-runnable-track 自绘轨道，
 * 并通过 --pct 让「已选」段填成强调色。
 */
function slider(value, min, max, step, format, onInput) {
  const val = el('span', { className: 'row-value' }, [format(value)]);
  const input = el('input', { type: 'range', min, max, step, value });
  const wrap = el('div', { className: 'slider' }, [input]);

  const paint = (v) => {
    const pct = max === min ? 0 : ((v - min) / (max - min)) * 100;
    input.style.setProperty('--pct', pct + '%');
  };
  paint(value);

  input.addEventListener('input', () => {
    const v = Number(input.value);
    val.textContent = format(v);
    paint(v);
    onInput(v);
  });

  return row(null, wrap, val);
}

/** 自绘勾选框：隐藏原生 input，用 .box-mark 画方块与对勾 */
function checkbox(label, checked, onChange) {
  const input = el('input', { type: 'checkbox' });
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { className: 'box' }, [
    input,
    el('span', { className: 'box-mark' }),
    el('span', {}, [label]),
  ]);
}

/** 自绘下拉：外观全在 .sel 里，箭头用伪元素画，不依赖系统控件 */
function select(value, options, onChange) {
  const sel = el('select', {});
  for (const [v, label] of options) {
    const opt = el('option', { value: v }, [label]);
    if (v === value) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  return el('div', { className: 'sel' }, [sel]);
}

/* ------------------------------------------------------------------ */
/* 正文主题                                                            */
/* ------------------------------------------------------------------ */

/**
 * 主题选择器 = 「一块大样板 + 一排小色块」。
 *
 * 为什么不做成 12 张一样大的预览卡：抽屉只有 480px 宽，每张卡摊到 200px 时
 * 样张小到看不出差异（旧版就是这样，一行只有十来个字）。现在改成
 * 「选中的那款给足尺寸看清楚，其余的用色块快速比色」：
 *
 *   - 大样板 384×140，标题/正文/链接/行内代码/引用都在，能真正判断可读性；
 *   - 小色块只画纸面 + 标题条 + 正文条 + 强调条 + 引用块，比色够用，
 *     12 款三行排得下，不用在小框里塞一段读不清的字；
 *   - 名字与说明放在界面自己的底色上，绝不和主题纸面糊在一起。
 */
function themeSection(onChange) {
  const s = getSettings();
  let tab = 'all';
  let starred = [...(s.starredThemes || [])];
  let current = s.docTheme;

  const chips = el('div', { className: 'chips' });
  const tiles = el('div', { className: 'theme-tiles' });
  const stage = el('div', { className: 'show-stage' });
  const nameEl = el('div', { className: 'show-name' });
  const noteEl = el('div', { className: 'show-note' });
  const legend = el('div', { className: 'show-legend' });
  let pageHost = null;

  /* ── 大样板 ── */

  function paintShowcase() {
    const th = DOC_THEMES.find((x) => x.id === current) || DOC_THEMES[0];
    nameEl.textContent = pick(th.label, th.labelEn);
    noteEl.textContent = pick(th.note, th.noteEn);

    // attachShadow 只能调一次，所以每次都换一只新宿主节点
    const host = el('div', { className: 'show-page' });
    mountDocPage(host, th);
    if (pageHost) pageHost.replaceWith(host);
    else stage.appendChild(host);
    pageHost = host;

    legend.replaceChildren(
      el('span', { className: 'legend-label' }, [t('set.theme.palette')]),
      paletteNode(th),
    );
  }

  /* ── 小色块 ── */

  function themeTile(th) {
    const art = el('span', { className: 'tile-art' });
    for (const [cssVar, themeVar] of TILE_VARS) art.style.setProperty(cssVar, readVar(themeVar, th));
    art.append(
      el('span', { className: 'tl tl-h' }),
      el('span', { className: 'tl tl-l' }),
      el('span', { className: 'tl tl-a' }),
      el('span', { className: 'tl tl-q' }),
    );

    const label = pick(th.label, th.labelEn);
    const on = th.id === current;
    const btn = el(
      'button',
      {
        className: 'theme-tile' + (on ? ' is-on' : ''),
        type: 'button',
        title: `${label} · ${pick(th.note, th.noteEn)}`,
        'aria-label': label,
        'aria-pressed': String(on),
      },
      [art, el('span', { className: 'tile-name' }, [label])],
    );
    btn.addEventListener('click', () => select(th.id));

    const isStar = starred.includes(th.id);
    const star = el('button', {
      className: 'tile-star' + (isStar ? ' is-on' : ''),
      type: 'button',
      title: t(isStar ? 'set.unstar' : 'set.star'),
      'aria-label': t(isStar ? 'set.unstar' : 'set.star'),
      innerHTML: icon('star', 12),
    });
    star.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleStar(th.id);
    });

    return el('div', { className: 'tile-wrap' + (isStar ? ' is-starred' : '') }, [btn, star]);
  }

  function visibleThemes() {
    return DOC_THEMES.filter((th) => {
      if (tab === 'all') return true;
      if (tab === 'light') return !th.dark;
      if (tab === 'dark') return th.dark;
      if (tab === 'starred') return starred.includes(th.id);
      return th.group === tab;
    });
  }

  function paintTiles() {
    tiles.replaceChildren();
    const list = visibleThemes();
    if (!list.length) {
      tiles.appendChild(el('div', { className: 'theme-empty' }, [t('set.themeEmpty')]));
      return;
    }
    for (const th of list) tiles.appendChild(themeTile(th));
  }

  function paintChips() {
    chips.replaceChildren();
    // 注意：这里用 item 而不是 t —— t 是 i18n 的取词函数，局部变量不能把它盖掉
    const tabs = DOC_THEME_TABS.map((item) => ({ ...item }));
    if (starred.length) {
      tabs.unshift({ id: 'starred', label: t('set.themeStarred', { n: starred.length }) });
    }
    // 「★ 收藏」页签在看它的时候被取消收藏 → 回「全部」，否则停在空列表上
    if (!tabs.some((item) => item.id === tab)) tab = 'all';

    for (const item of tabs) {
      const b = el('button', { className: 'chip-tab' + (item.id === tab ? ' is-on' : ''), type: 'button' }, [
        pick(item.label, item.labelEn),
      ]);
      b.addEventListener('click', () => {
        tab = item.id;
        paintChips();
        paintTiles();
      });
      chips.appendChild(b);
    }
  }

  function select(id) {
    current = id;
    saveSettings({ docTheme: id });
    paintTiles();
    paintShowcase();
    onChange('docTheme:' + id);
  }

  function toggleStar(id) {
    starred = starred.includes(id) ? starred.filter((x) => x !== id) : [...starred, id];
    saveSettings({ starredThemes: starred });
    paintChips();
    paintTiles();
  }

  paintChips();
  paintTiles();
  paintShowcase();

  return section(t('set.sec.theme'), {
    badge: t('set.theme.count', { n: DOC_THEMES.length }),
    hint: t('set.theme.hint'),
    children: [
      el('div', { className: 'theme-toolbar' }, [chips]),
      el('div', { className: 'showcase' }, [
        el('div', { className: 'show-head' }, [
          el('div', { className: 'show-text' }, [nameEl, noteEl]),
          el('span', { className: 'show-flag' }, [t('set.theme.preview')]),
        ]),
        stage,
        legend,
      ]),
      tiles,
    ],
  });
}

/* ------------------------------------------------------------------ */
/* 正文字体                                                            */
/* ------------------------------------------------------------------ */

function fontSection(onChange) {
  const s = getSettings();
  let tab = 'all';
  const chips = el('div', { className: 'chips' });
  const grid = el('div', { className: 'font-grid' });

  function paint() {
    chips.replaceChildren();
    for (const c of FONT_CATEGORIES) {
      const b = el('button', { className: 'chip-tab' + (c.id === tab ? ' is-on' : ''), type: 'button' }, [
        c.label,
      ]);
      b.addEventListener('click', () => {
        tab = c.id;
        paint();
      });
      chips.appendChild(b);
    }

    grid.replaceChildren();
    for (const f of FONT_PRESETS.filter((x) => tab === 'all' || x.category === tab)) {
      const card = el('button', {
        className: 'font-card' + (f.id === s.fontPreset ? ' is-on' : ''),
        type: 'button',
      }, [
        el('div', { className: 'font-sample' }, [f.sample]),
        el('div', { className: 'font-name' }, [f.label]),
        el('div', { className: 'font-note' }, [f.note]),
      ]);
      card.querySelector('.font-sample').style.fontFamily = f.stack;
      card.addEventListener('click', () => {
        saveSettings({ fontPreset: f.id });
        onChange('font:' + f.id);
        grid.querySelectorAll('.font-card').forEach((c) => c.classList.remove('is-on'));
        card.classList.add('is-on');
      });
      grid.appendChild(card);
    }
  }
  paint();

  return section(t('set.sec.font'), {
    badge: t('set.font.count', { n: FONT_PRESETS.length }),
    hint: t('set.font.hint'),
    children: [el('div', { className: 'theme-toolbar' }, [chips]), grid],
  });
}

/* ------------------------------------------------------------------ */
/* 文字大小（字号 + 缩放，抽屉里的高频组）                              */
/* ------------------------------------------------------------------ */

/**
 * 字号与缩放合成一块。
 *
 * 这两个滑杆调的是同一件事的两半，旧版把它们拆在「排版微调」里，中间还隔着
 * 行高与行宽。这里并排放，并把「基准 × 系数 = 实际」这条算式**实时**显示出来：
 * 用户放大到 150% 后再拖字号，得知道自己在调基准而不是屏幕上的结果。
 */
function sizeSection(actions, onChange) {
  const s = getSettings();
  const zoomPct = Math.round(s.zoom * 100);

  const hint = el('p', { className: 'sec-hint' });
  const paintHint = () => {
    // 注意取新的 state：saveSettings 会整体换对象，render 时捕获的 s 已经过期
    const st = getSettings();
    hint.textContent = t('set.size.hint', {
      effSize: Math.round(st.fontSize * st.zoom * 10) / 10,
      effWidth: Math.round(st.contentWidth * st.zoom),
    });
  };
  paintHint();

  const sizeRow = rowLabeled(
    t('set.fontSize'),
    slider(s.fontSize, 12, 24, 1, (v) => v + ' px', (v) => {
      saveSettings({ fontSize: v });
      paintHint();
      onChange('typography');
    }),
  );

  const zoomRow = rowLabeled(
    t('set.zoom'),
    slider(zoomPct, 50, 300, 5, (v) => `${v}%`, (v) => {
      actions.onZoom(v / 100);
      paintHint();
      onChange('zoom');
    }),
  );
  // 「复位」直接驱动滑杆自己的 input 事件，复用它的数值/填充重绘逻辑
  const zoomInput = zoomRow.querySelector('input[type="range"]');
  const zoomReset = el('button', { className: 'clear-btn mini', type: 'button', title: t('set.zoomReset') }, ['100%']);
  zoomReset.addEventListener('click', () => {
    zoomInput.value = '100';
    zoomInput.dispatchEvent(new Event('input'));
  });
  zoomRow.querySelector('.row-body').appendChild(zoomReset);

  return section(t('set.sec.size'), { hint, children: [sizeRow, zoomRow] });
}

/* ------------------------------------------------------------------ */
/* 最近打开                                                            */
/* ------------------------------------------------------------------ */

/** 小圆钮：最近打开条目右侧的固定 / 移除 */
function rbtn(name, title, on, onClick) {
  const b = el('button', {
    className: 'rbtn' + (on ? ' is-on' : ''),
    type: 'button',
    title,
    'aria-label': title,
    innerHTML: icon(name, 14),
  });
  b.addEventListener('click', (e) => {
    // 别让点击冒泡到整行的「打开」按钮
    e.stopPropagation();
    onClick();
  });
  return b;
}

/**
 * 最近打开的一行：左边是打开按钮，右边是固定 / 移除。
 * 不用「按钮套按钮」的写法（非法 HTML，键盘可达性也会坏）。
 */
function recentRow(entry, actions, refresh) {
  const { path, pinned } = entry;
  const name = path.split(/[\\/]/).pop();
  const dir = path.slice(0, path.length - name.length - 1);

  const open = el('button', { className: 'recent-item', type: 'button', title: path }, [
    pinned ? el('span', { className: 'rpin', innerHTML: icon('pin', 12) }) : null,
    el('span', { className: 'rname' }, [name]),
    el('span', { className: 'rpath' }, [dir]),
  ]);
  open.addEventListener('click', () => actions.onOpenRecent(path));

  const pinBtn = rbtn(pinned ? 'pin-off' : 'pin', t(pinned ? 'set.unpin' : 'set.pin'), pinned, () => {
    if (pinned) actions.onUnpin(path);
    else actions.onPin(path);
    refresh();
  });

  const rmBtn = rbtn('x', t(pinned ? 'set.removePinned' : 'set.remove'), false, () => {
    actions.onRemoveRecent(path);
    refresh();
  });

  return el('div', { className: 'recent-row' + (pinned ? ' is-pinned' : '') }, [
    open,
    el('span', { className: 'ractions' }, [pinBtn, rmBtn]),
  ]);
}

/**
 * 「最近打开」。
 *
 * 放在抽屉最下面而不是最上面：抽屉是有主次的 —— 上面三块是「调外观」，
 * 这一块是「找文件」。打开文件的动作本来就有 Ctrl+O、顶栏按钮和空状态三个
 * 入口，不必再让它占掉第一屏。
 *
 * 只重建这一张卡片而不是整面板，是为了 pin / 移除后不丢滚动位置。
 */
function recentSection(actions) {
  const build = () => {
    const entries = recentEntries();
    const pinnedCount = entries.filter((e) => e.pinned).length;
    const looseCount = entries.length - pinnedCount;

    const list = el('div', { className: 'recent-list' });
    if (!entries.length) {
      list.appendChild(el('p', { className: 'recent-empty' }, [t('set.recent.empty')]));
    } else {
      for (const entry of entries) list.appendChild(recentRow(entry, actions, refresh));
    }

    const openBtn = el('button', { className: 'btn-primary', type: 'button' }, [t('set.recent.open')]);
    openBtn.addEventListener('click', () => actions.onOpenFile?.());

    const clearBtn = el('button', { className: 'clear-btn', type: 'button' }, [
      pinnedCount ? t('set.recent.clearLoose') : t('set.recent.clear'),
    ]);
    clearBtn.disabled = looseCount === 0;
    clearBtn.title = t('set.recent.clearTip');
    clearBtn.addEventListener('click', () => {
      actions.onClearRecent();
      refresh();
    });

    const hint = pinnedCount
      ? t('set.recent.pinnedHint', { n: pinnedCount })
      : t('set.recent.hint');

    return section(t('set.sec.recent'), {
      badge: `${entries.length}`,
      hint,
      children: [list, el('div', { className: 'recent-actions' }, [openBtn, clearBtn])],
    });
  };

  let node = build();
  function refresh() {
    const next = build();
    node.replaceWith(next);
    node = next;
  }
  return node;
}

/* ------------------------------------------------------------------ */
/* 抽屉（常用）                                                        */
/* ------------------------------------------------------------------ */

export function renderSettings(container, onChange, actions) {
  container.innerHTML = '';
  container.appendChild(themeSection(onChange));
  container.appendChild(fontSection(onChange));
  container.appendChild(sizeSection(actions, onChange));
  container.appendChild(recentSection(actions));
}

/* ------------------------------------------------------------------ */
/* 高级设置（低频项）                                                  */
/* ------------------------------------------------------------------ */

/** 文件关联。一次性系统集成，放高级里。 */
function assocSection(actions) {
  if (!actions.readAssocStatus) return null;

  const stateLine = el('div', { className: 'assoc-state' }, [
    el('span', { className: 'dot' }),
    el('span', {}, [t('set.assoc.checking')]),
  ]);
  const actionsRow = el('div', { className: 'recent-actions' });
  const repairBtn = el('button', { className: 'clear-btn', type: 'button' }, [t('set.assoc.repair')]);
  // 状态未知之前先不劝（异步返回后由 paint() 决定显隐）
  const defaultBtn = el('button', { className: 'btn-primary', type: 'button', hidden: true }, [t('set.assoc.makeDefault')]);
  actionsRow.appendChild(repairBtn);
  actionsRow.appendChild(defaultBtn);

  const node = section(t('set.sec.assoc'), {
    hint: t('set.assoc.hint'),
    children: [stateLine, actionsRow],
  });

  const paint = (st) => {
    if (!st) {
      stateLine.className = 'assoc-state';
      stateLine.replaceChildren(
        el('span', { className: 'dot' }),
        el('span', {}, [t('set.assoc.unavailable')]),
      );
      defaultBtn.hidden = true;
      repairBtn.disabled = true;
      return;
    }
    const ours = st.isDefault;
    stateLine.className = 'assoc-state ' + (ours ? 'is-ok' : 'is-warn');
    const label = ours ? 'Eunice Reader' : st.displayName || st.progId || t('set.assoc.other');
    const parts = [
      el('span', { className: 'dot' }),
      el('span', {}, [ours ? t('set.assoc.isDefault', { name: label }) : t('set.assoc.notDefault', { name: label })]),
    ];
    if (!st.iconOk) parts.push(el('span', {}, [t('set.assoc.iconStale')]));
    if (st.userChoice && !ours) parts.push(el('span', {}, [t('set.assoc.userChoice')]));
    stateLine.replaceChildren(...parts);
    // 已经是默认应用时就不必再劝一次
    defaultBtn.hidden = ours;
  };

  const busy = (btn, on) => {
    btn.disabled = on;
  };

  repairBtn.addEventListener('click', async () => {
    busy(repairBtn, true);
    paint(await actions.fixAssociation({ force: true }));
    busy(repairBtn, false);
  });

  defaultBtn.addEventListener('click', async () => {
    busy(defaultBtn, true);
    const st = await actions.fixAssociation({ force: true });
    busy(defaultBtn, false);
    paint(st);
    // 系统仍然指向别的程序 → 只能把用户送到 Windows 的默认应用页面
    if (st && !st.isDefault) {
      const opened = await actions.openDefaultAppsSettings();
      stateLine.appendChild(
        el('span', {}, [
          opened
            ? t('set.assoc.openedTip')
            : t('set.assoc.openManual'),
        ]),
      );
    }
  });

  actions
    .readAssocStatus()
    .then(paint)
    .catch(() => paint(null));

  return node;
}

/** 快捷键表 */
function keysSection() {
  const KEYS = [
    ['Ctrl + =', t('keys.zoomIn')],
    ['Ctrl + -', t('keys.zoomOut')],
    ['Ctrl + 0', t('keys.zoomReset')],
    ['Ctrl + 滚轮', t('keys.zoomWheel')],
    ['Ctrl + Shift + Z', t('keys.zen')],
    ['Ctrl + O', t('keys.open')],
    ['Ctrl + S', t('keys.save')],
    ['Ctrl + Shift + S', t('keys.saveas')],
    ['Ctrl + Shift + E', t('keys.pdf')],
    ['Ctrl + 1 / 2 / 3', t('keys.views')],
    ['Ctrl + B', t('keys.outline')],
    ['Ctrl + Shift + D', t('keys.dark')],
    ['Ctrl + ,', t('keys.settings')],
    ['Ctrl + F', t('keys.search')],
  ];

  const table = el('div', { className: 'key-table' });
  for (const [k, v] of KEYS) {
    table.appendChild(
      el('div', { className: 'key-row' }, [
        el('kbd', {}, [k]),
        el('span', {}, [v]),
      ]),
    );
  }
  return section(t('set.sec.keys'), { children: [table] });
}

/**
 * 高级设置内容。
 *
 * 这里的每一项都是「设置完之后几个月不会再碰」的：
 * 行高、正文宽度、界面透明度、全屏毛玻璃、界面语言、大纲与自动保存、
 * 文件关联、快捷键。它们不是不重要，只是不该和主题/字体/字号抢第一屏。
 */
export function renderAdvanced(container, onChange, actions) {
  const s = getSettings();
  container.innerHTML = '';

  /* ---- 排版细节 ---- */

  const typoHint = el('p', { className: 'sec-hint' });
  const paintTypoHint = () => {
    const st = getSettings();
    typoHint.textContent = t('set.typo.hint', {
      size: st.fontSize,
      zoom: Math.round(st.zoom * 100),
      effSize: Math.round(st.fontSize * st.zoom * 10) / 10,
      width: st.contentWidth,
      effWidth: Math.round(st.contentWidth * st.zoom),
    });
  };
  paintTypoHint();

  container.appendChild(
    section(t('set.sec.typo'), {
      hint: typoHint,
      children: [
        rowLabeled(t('set.lineHeight'), slider(s.lineHeight, 1.4, 2.6, 0.1, (v) => v.toFixed(1), (v) => {
          saveSettings({ lineHeight: v });
          paintTypoHint();
          onChange('typography');
        })),
        rowLabeled(t('set.width'), slider(s.contentWidth, 600, 1600, 20, (v) => v + ' px', (v) => {
          saveSettings({ contentWidth: v });
          paintTypoHint();
          onChange('typography');
        })),
        rowLabeled(
          t('set.glass'),
          select(s.glassLevel || 'normal', [
            ['solid', t('set.glass.solid')],
            ['normal', t('set.glass.normal')],
            ['strong', t('set.glass.strong')],
          ], (v) => {
            saveSettings({ glassLevel: v });
            onChange('glass:' + v);
          }),
        ),
      ],
    }),
  );

  /* ---- 窗口与界面 ---- */

  container.appendChild(
    section(t('set.sec.window'), {
      hint: t('set.window.hint'),
      children: [
        // 全屏毛玻璃：窗口半透明 + 系统 acrylic 模糊，默认中等
        rowLabeled(
          t('set.windowGlass'),
          select(normalizeGlass(s.windowGlass), [
            ['off', t('set.windowGlass.off')],
            ['medium', t('set.windowGlass.medium')],
            ['strong', t('set.windowGlass.strong')],
          ], (v) => {
            saveSettings({ windowGlass: v });
            onChange('windowGlass');
          }),
        ),
        // 语言：默认跟随系统（WebView2 的 navigator.language 就是 Windows 显示语言）
        rowLabeled(
          t('set.locale'),
          select(s.locale || 'auto', LOCALE_OPTIONS.map(([id, zh, en]) => [id, pick(zh, en)]), (v) => {
            saveSettings({ locale: v });
            onChange('locale');
          }),
        ),
      ],
    }),
  );

  /* ---- 行为 ---- */

  container.appendChild(
    section(t('set.sec.behavior'), {
      children: [
        checkbox(t('set.outline.show'), s.showOutline, (v) => {
          saveSettings({ showOutline: v });
          onChange('outline');
        }),
        checkbox(t('set.autosave'), s.autoSave, (v) => {
          saveSettings({ autoSave: v });
          onChange('autoSave');
        }),
      ],
    }),
  );

  /* ---- 文件关联 ---- */

  const assoc = assocSection(actions);
  if (assoc) container.appendChild(assoc);

  /* ---- 快捷键 ---- */

  container.appendChild(keysSection());
}

/* ------------------------------------------------------------------ */
/* 抽屉 / 高级模态的开合                                                */
/* ------------------------------------------------------------------ */

export function initSettingsModal(actions) {
  const drawer = document.getElementById('settings-modal');
  const scrim = document.getElementById('drawer-scrim');
  const adv = document.getElementById('adv-settings');
  const advModal = adv?.querySelector('.adv-modal');
  const advBody = document.getElementById('adv-body');
  const advEntry = document.getElementById('btn-advanced');

  // 自绘图标在这里注入，不改 main.js 的 ICON_MAP（那是顶栏的清单）
  const paintIcons = () => {
    const entryIc = document.getElementById('adv-entry-ic');
    if (entryIc) entryIc.innerHTML = icon('settings', 16);
    const chev = document.getElementById('adv-entry-chev');
    if (chev) chev.innerHTML = icon('chevron-right', 15);
    const close = document.getElementById('btn-adv-close');
    if (close) close.innerHTML = icon('x', 16);
  };
  paintIcons();

  /** 只重画内容，不动抽屉的开合状态（切语言时要保持滚动位置与开合） */
  const render = () => {
    const body = document.getElementById('settings-body');
    try {
      renderSettings(body, actions.onChange, actions);
    } catch (err) {
      console.error('[settings] render failed', err);
      body.textContent = `设置渲染失败：\n${err?.stack || err}`;
    }
  };

  const renderAdvancedPanel = () => {
    try {
      renderAdvanced(advBody, actions.onChange, actions);
    } catch (err) {
      console.error('[settings] advanced render failed', err);
      advBody.textContent = `高级设置渲染失败：\n${err?.stack || err}`;
    }
  };

  const isOpen = () => document.body.classList.contains('settings-open');
  const isAdvancedOpen = () => document.body.classList.contains('advanced-open');

  const open = () => {
    render();
    drawer.hidden = false;
    scrim.hidden = false;
    document.body.classList.add('settings-open');
  };

  const close = () => {
    document.body.classList.remove('settings-open');
    setTimeout(() => {
      drawer.hidden = true;
      scrim.hidden = true;
    }, 260);
  };

  const openAdvanced = () => {
    if (isAdvancedOpen()) return;
    renderAdvancedPanel();
    adv.hidden = false;
    // 先挂上去再加类，否则 transition 拿不到起始状态；
    // 焦点也要等这一类加上之后再移 —— visibility:hidden 的元素 focus() 是空操作
    requestAnimationFrame(() => {
      document.body.classList.add('advanced-open');
      advModal?.focus?.();
    });
  };

  const closeAdvanced = () => {
    if (!isAdvancedOpen()) return;
    document.body.classList.remove('advanced-open');
    setTimeout(() => {
      adv.hidden = true;
    }, 200);
    advEntry?.focus?.();
  };

  const toggle = () => {
    if (isAdvancedOpen()) {
      closeAdvanced();
      return;
    }
    if (isOpen()) close();
    else open();
  };

  document.getElementById('btn-settings').addEventListener('click', toggle);
  document.getElementById('btn-settings-close').addEventListener('click', close);
  scrim.addEventListener('click', close);
  advEntry?.addEventListener('click', openAdvanced);
  adv?.addEventListener('click', (e) => {
    // 只有点遮罩本身才关；点模态内部（含滚动条）不关
    if (e.target === adv) closeAdvanced();
  });
  document.getElementById('btn-adv-close')?.addEventListener('click', closeAdvanced);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // 高级模态在上层，Esc 先关它 —— 否则一次 Esc 会把底下整只抽屉也收掉
    if (isAdvancedOpen()) {
      closeAdvanced();
      return;
    }
    if (isOpen()) close();
  });

  return {
    open,
    close,
    toggle,
    refresh: () => {
      if (isOpen()) render();
      if (isAdvancedOpen()) renderAdvancedPanel();
    },
    isOpen,
    openAdvanced,
    closeAdvanced,
    isAdvancedOpen,
  };
}
