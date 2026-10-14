/**
 * 设置抽屉（右侧）。
 *
 * 刻意不用全屏模态框 —— 设置的意义是「边调边看」：换主题、调字号，
 * 效果必须立刻在左侧文档中看得见。
 *
 * 分区顺序按重要性：
 *   1. 最近打开（最高频的入口，放最上面；支持固定与逐个移除）
 *   2. 正文主题（主角）—— 12 款中文命名，每款带真实中文排版缩略图
 *   3. 字体
 *   4. 排版微调（含显示缩放：所有尺寸的公共系数）
 *   5. 行为
 *   6. 文件关联（一次性的系统集成，放后面）
 *
 * 这里**没有**「代码配色」这种东西：这是一个用来读方案、提案与报告的工具，
 * 代码块顶多出现在文档里，不值得让读者去挑 82 套程序员配色。
 */

import { DOC_THEMES, DOC_THEME_TABS } from '../lib/doc-themes.js';
import { FONT_PRESETS, FONT_CATEGORIES } from '../lib/fonts.js';
import { getSettings, saveSettings, recentEntries } from '../lib/store.js';
import { t, pick, isEnglish, LOCALE_OPTIONS } from '../lib/i18n.js';
import { icon } from './icons.js';


/* ------------------------------------------------------------------ */
/* 缩略图用的真实内容                                                  */
/* ------------------------------------------------------------------ */

/**
 * 主题预览用的一段真实内容：要同时体现标题、正文、强调、引用。
 * 跟着界面语言走 —— 英文界面里塞一段中文，缩略图会变成「看字形」而不是「看配色」。
 */
const DOC_SAMPLE_ZH = `<h3>季度营收</h3><p>本月<strong>增长 12%</strong>，主要来自<a>欧洲市场</a>。订单量创下新高。</p><blockquote>订单量创新高</blockquote>`;
const DOC_SAMPLE_EN = `<h3>Quarterly revenue</h3><p>Up <strong>12%</strong> this month, mostly from <a>Europe</a>. Orders hit a new high.</p><blockquote>Orders hit a new high</blockquote>`;
const docSample = () => (isEnglish() ? DOC_SAMPLE_EN : DOC_SAMPLE_ZH);

/**
 * 主题缩略图。
 *
 * 用 Shadow DOM + 局部注入对应主题的 CSS 变量，而不是把整份主题 CSS 复制进来 ——
 * 这样 12 张卡片互不污染，也不会影响主文档。
 */
function mountDocThumb(host, theme) {
  const root = host.attachShadow({ mode: 'open' });
  const bg = readVar('--paper', theme);
  const fg = readVar('--ink', theme);
  const heading = readVar('--head-1', theme);
  const quoteBg = readVar('--quote-bg', theme);
  const quoteBar = readVar('--quote-bar', theme);
  const quoteInk = readVar('--quote-ink', theme);
  const link = readVar('--accent', theme);

  root.innerHTML = `
    <style>
      .t { padding: 12px 13px; background: ${bg}; color: ${fg};
           font: 12px/1.75 "Microsoft YaHei UI", sans-serif; height: 100%; }
      h3 { margin: 0 0 5px; font-size: 13px; color: ${heading}; }
      p { margin: 0 0 7px; }
      strong { font-weight: 700; }
      a { color: ${link}; text-decoration: underline; }
      blockquote { margin: 0; padding: 4px 9px; background: ${quoteBg};
                   border-left: 3px solid ${quoteBar}; color: ${quoteInk}; font-size: 11.5px; }
    </style>
    <div class="t">${docSample()}</div>
  `;
}

/**
 * 读取主题的 CSS 变量值。
 * 做法：临时挂一个带 data-theme-doc 的探针元素，取完即撤。
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

/** 缩略图左侧的色块（用主题纸面色），便于快速扫视 */
function themeSwatch(theme) {
  return readVar('--paper', theme);
}

/* ------------------------------------------------------------------ */
/* 表单helpers                                                         */
/* ------------------------------------------------------------------ */

/** 只能写成 HTML 属性、不能直接赋 property 的字段 */
const ATTRS = new Set(['type', 'value', 'min', 'max', 'step', 'title']);

function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  const late = [];
  for (const [k, v] of Object.entries(props)) {
    if (ATTRS.has(k)) {
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
 */
function section(title, opts = {}) {
  const { badge, hint, children = [] } = opts;
  const head = el('div', { className: 'sec-head' }, [
    el('span', { className: 'sec-title' }, [title]),
    badge ? el('span', { className: 'sec-badge' }, [badge]) : null,
  ]);
  const body = el('div', { className: 'sec-body' }, [
    hint ? el('p', { className: 'sec-hint' }, [hint]) : null,
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
/* 渲染                                                                */
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
 * 「最近打开」。放整个面板最上面：打开文件是这个应用最高频的动作，
 * 固定（pin）的条目常驻顶部且不会被「清空」带走。
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

export function renderSettings(container, onChange, actions) {
  const s = getSettings();
  container.innerHTML = '';

  /* ================= 1. 最近打开（最高频，排最前） ================= */

  container.appendChild(recentSection(actions));

  /* ================= 2. 正文主题（主角） ================= */

  let themeTab = 'all';
  let starred = [...(s.starredThemes || [])];

  const themeGrid = el('div', { className: 'doc-grid' });
  const themeChips = el('div', { className: 'chips' });

  function paintThemes() {
    themeChips.innerHTML = '';

    // 注意：这里用 th 而不是 t —— t 是 i18n 的取词函数，局部变量不能把它盖掉
    const tabs = DOC_THEME_TABS.map((tab) => ({ ...tab }));
    if (starred.length) tabs.unshift({ id: 'starred', label: t('set.themeStarred', { n: starred.length }) });

    for (const tab of tabs) {
      const b = el('button', { className: 'chip-tab' + (tab.id === themeTab ? ' is-on' : ''), type: 'button' }, [
        pick(tab.label, tab.labelEn),
      ]);
      b.addEventListener('click', () => {
        themeTab = tab.id;
        paintThemes();
      });
      themeChips.appendChild(b);
    }

    themeGrid.innerHTML = '';
    const list = DOC_THEMES.filter((th) => {
      if (themeTab === 'all') return true;
      if (themeTab === 'light') return !th.dark;
      if (themeTab === 'dark') return th.dark;
      if (themeTab === 'starred') return starred.includes(th.id);
      return th.group === themeTab;
    });

    if (!list.length) {
      themeGrid.appendChild(el('div', { className: 'theme-empty' }, [t('set.themeEmpty')]));
      return;
    }

    for (const th of list) {
      const label = pick(th.label, th.labelEn);
      const preview = el('div', { className: 'doc-preview' });
      mountDocThumb(preview, th);

      const isStar = starred.includes(th.id);
      const star = el('button', {
        className: 'doc-star' + (isStar ? ' is-on' : ''),
        type: 'button',
        title: t(isStar ? 'set.unstar' : 'set.star'),
        'aria-label': t(isStar ? 'set.unstar' : 'set.star'),
      });
      star.innerHTML = icon('star', 14);

      const card = el(
        'div',
        { className: 'doc-card' + (th.id === s.docTheme ? ' is-on' : ''), title: label },
        [
          preview,
          el('div', { className: 'doc-meta' }, [
            el('span', { className: 'doc-dot' }),
            el('div', { className: 'doc-text' }, [
              el('div', { className: 'doc-name' }, [label]),
              el('div', { className: 'doc-note' }, [pick(th.note, th.noteEn)]),
            ]),
            star,
            el('span', { className: 'doc-check' }),
          ]),
        ],
      );
      card.querySelector('.doc-dot').style.background = themeSwatch(th);
      card.querySelector('.doc-dot').style.borderColor = readVar('--rule', th);
      card.querySelector('.doc-check').innerHTML = icon('check', 14);

      card.addEventListener('click', () => {
        saveSettings({ docTheme: th.id });
        onChange('docTheme:' + th.id);
        themeGrid.querySelectorAll('.doc-card').forEach((c) => c.classList.remove('is-on'));
        card.classList.add('is-on');
      });

      star.addEventListener('click', (e) => {
        e.stopPropagation();
        starred = starred.includes(th.id) ? starred.filter((x) => x !== th.id) : [...starred, th.id];
        saveSettings({ starredThemes: starred });
        paintThemes();
      });

      themeGrid.appendChild(card);
    }
  }

  paintThemes();

  container.appendChild(
    section(t('set.sec.theme'), {
      badge: t('set.theme.count', { n: DOC_THEMES.length }),
      hint: t('set.theme.hint'),
      children: [el('div', { className: 'theme-toolbar' }, [themeChips]), themeGrid],
    }),
  );

  /* ================= 3. 字体 ================= */

  let fontTab = 'all';
  const fontGrid = el('div', { className: 'font-grid' });
  const fontChips = el('div', { className: 'chips' });

  function paintFonts() {
    fontChips.innerHTML = '';
    for (const c of FONT_CATEGORIES) {
      const b = el('button', { className: 'chip-tab' + (c.id === fontTab ? ' is-on' : ''), type: 'button' }, [
        c.label,
      ]);
      b.addEventListener('click', () => {
        fontTab = c.id;
        paintFonts();
      });
      fontChips.appendChild(b);
    }

    fontGrid.innerHTML = '';
    for (const f of FONT_PRESETS.filter((x) => fontTab === 'all' || x.category === fontTab)) {
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
        fontGrid.querySelectorAll('.font-card').forEach((c) => c.classList.remove('is-on'));
        card.classList.add('is-on');
      });
      fontGrid.appendChild(card);
    }
  }
  paintFonts();

  container.appendChild(
    section(t('set.sec.font'), {
      badge: t('set.font.count', { n: FONT_PRESETS.length }),
      hint: t('set.font.hint'),
      children: [el('div', { className: 'theme-toolbar' }, [fontChips]), fontGrid],
    }),
  );

  /* ================= 4. 排版微调 =================
     这里所有数值都是「基准值」：屏幕上真实的大小 = 基准 × 缩放系数。
     面板里直接把这条算式写进 hint，免得用户放大到 150% 后再去调字号，
     却不知道调的是基准还是放大后的结果。 */

  const zoomPct = Math.round(s.zoom * 100);
  const scaleOf = (v) => Math.round(v * s.zoom * 10) / 10;

  const zoomRow = rowLabeled(
    t('set.zoom'),
    slider(zoomPct, 50, 300, 5, (v) => `${v}%`, (v) => {
      actions.onZoom(v / 100);
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

  container.appendChild(
    section(t('set.sec.typo'), {
      hint: t('set.typo.hint', {
        size: s.fontSize,
        zoom: zoomPct,
        effSize: scaleOf(s.fontSize),
        width: s.contentWidth,
        effWidth: scaleOf(s.contentWidth),
      }),
      children: [
        zoomRow,
        rowLabeled(t('set.fontSize'), slider(s.fontSize, 12, 24, 1, (v) => v + ' px', (v) => {
          saveSettings({ fontSize: v });
          onChange('typography');
        })),
        rowLabeled(t('set.lineHeight'), slider(s.lineHeight, 1.4, 2.6, 0.1, (v) => v.toFixed(1), (v) => {
          saveSettings({ lineHeight: v });
          onChange('typography');
        })),
        rowLabeled(t('set.width'), slider(s.contentWidth, 600, 1600, 20, (v) => v + ' px', (v) => {
          saveSettings({ contentWidth: v });
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

  /* ================= 5. 行为 ================= */

  container.appendChild(
    section(t('set.sec.behavior'), {
      children: [
        // 语言：默认跟随系统（WebView2 的 navigator.language 就是 Windows 显示语言）
        rowLabeled(
          t('set.locale'),
          select(s.locale || 'auto', LOCALE_OPTIONS.map(([id, zh, en]) => [id, pick(zh, en)]), (v) => {
            saveSettings({ locale: v });
            onChange('locale');
          }),
        ),
        // 全屏毛玻璃：窗口半透明 + 系统 acrylic 模糊，默认开
        rowLabeled(
          t('set.windowGlass'),
          select(String(s.windowGlass !== false), [
            ['true', t('set.windowGlass.on')],
            ['false', t('set.windowGlass.off')],
          ], (v) => {
            saveSettings({ windowGlass: v === 'true' });
            onChange('windowGlass');
          }),
        ),
        rowLabeled(
          t('set.tabLayout'),
          select(s.tabLayout || 'top', [
            ['top', t('set.tabLayout.top')],
            ['left', t('set.tabLayout.left')],
          ], (v) => {
            saveSettings({ tabLayout: v });
            onChange('tabLayout');
          }),
        ),
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

  /* ================= 6. 文件关联 =================
     为什么这里需要用户点一下：Windows 8 起「默认应用」由 UserChoice 决定，
     它带哈希校验，程序写入会被系统直接忽略。安装器能做的只有把本程序
     登记成候选（图标、右键菜单、打开方式），最后那一步必须用户本人确认。 */

  if (actions.readAssocStatus) {
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

    const secNode = section(t('set.sec.assoc'), {
      hint: t('set.assoc.hint'),
      children: [stateLine, actionsRow],
    });
    container.appendChild(secNode);

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
  }

  /* ================= 快捷键 ================= */

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

  const keyTable = el('div', { className: 'key-table' });
  for (const [k, v] of KEYS) {
    keyTable.appendChild(
      el('div', { className: 'key-row' }, [
        el('kbd', {}, [k]),
        el('span', {}, [v]),
      ]),
    );
  }
  container.appendChild(section(t('set.sec.keys'), { children: [keyTable] }));
}

/* ------------------------------------------------------------------ */
/* 抽屉开合                                                            */
/* ------------------------------------------------------------------ */

let drawer = null;

export function initSettingsModal(actions) {
  drawer = document.getElementById('settings-modal');
  const scrim = document.getElementById('drawer-scrim');

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

  const open = () => {
    render();
    drawer.hidden = true;
    document.body.classList.add('settings-open');
    requestAnimationFrame(() => {
      drawer.hidden = false;
      scrim.hidden = false;
    });
  };

  const close = () => {
    document.body.classList.remove('settings-open');
    setTimeout(() => {
      drawer.hidden = true;
      scrim.hidden = true;
    }, 260);
  };

  const toggle = () => (document.body.classList.contains('settings-open') ? close() : open());

  document.getElementById('btn-settings').addEventListener('click', toggle);
  document.getElementById('btn-settings-close').addEventListener('click', close);
  scrim.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('settings-open')) close();
  });

  return {
    open,
    close,
    toggle,
    refresh: render,
    isOpen: () => document.body.classList.contains('settings-open'),
  };
}