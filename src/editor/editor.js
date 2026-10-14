/**
 * 编辑器：CodeMirror 6（开源，MIT）。
 * 只负责「写」这一件事，渲染全部交给预览区。
 */

import { EditorView, keymap, drawSelection, highlightActiveLine, lineNumbers, highlightSpecialChars, rectangularSelection, crosshairCursor } from '@codemirror/view';
import { EditorState, Compartment, StateField, StateEffect } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle, syntaxTree } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { tags as t } from '@lezer/highlight';

/* ------------------------------------------------------------------ */
/* 主题                                                                */
/* ------------------------------------------------------------------ */

function buildTheme(dark) {
  const fg = dark ? '#e6edf3' : '#1f2328';
  const bg = dark ? '#0d1117' : '#ffffff';
  const sel = dark ? 'rgba(56,139,253,0.35)' : 'rgba(9,105,218,0.20)';
  const cursor = dark ? '#4493f8' : '#0969da';
  const gutterFg = dark ? '#6e7681' : '#818b98';
  const activeLine = dark ? 'rgba(255,255,255,0.04)' : 'rgba(31,35,40,0.045)';

  return EditorView.theme(
    {
      '&': { color: fg, backgroundColor: bg, height: '100%' },
      '.cm-content': { caretColor: cursor, fontFamily: 'inherit' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: cursor },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: sel },
      '.cm-gutters': {
        backgroundColor: bg,
        color: gutterFg,
        border: 'none',
        borderRight: '1px solid ' + (dark ? '#21262d' : '#e4e8ed'),
      },
      '.cm-activeLine': { backgroundColor: activeLine },
      '.cm-activeLineGutter': { backgroundColor: activeLine, color: fg },
      '.cm-selectionMatch': { backgroundColor: dark ? 'rgba(68,147,248,0.22)' : 'rgba(9,105,218,0.14)' },
      '.cm-cursor, .cm-dropCursor': { borderLeftWidth: '2px' },
      '.cm-tooltip': {
        border: '1px solid ' + (dark ? '#30363d' : '#d0d7de'),
        backgroundColor: bg,
        color: fg,
      },
    },
    { dark },
  );
}

/** 语法着色：跟随 CodeMirror 官方 highlight style 的常见 token 配色 */
function buildHighlightStyle(dark) {
  const c = dark
    ? {
        keyword: '#ff7b72', string: '#a5d6ff', comment: '#8b949e', name: '#79c0ff',
        number: '#ffa657', heading: '#d2a8ff', link: '#a5d6ff', meta: '#8b949e',
        emphasis: '#e6edf3', strong: '#e6edf3', monospace: '#a5d6ff',
      }
    : {
        keyword: '#cf222e', string: '#0a3069', comment: '#6e7781', name: '#0550ae',
        number: '#953800', heading: '#8250df', link: '#0969da', meta: '#6e7781',
        emphasis: '#1f2328', strong: '#1f2328', monospace: '#0a3069',
      };

  return HighlightStyle.define([
    { tag: [t.keyword, t.modifier, t.operatorKeyword], color: c.keyword },
    { tag: [t.string, t.special(t.string), t.regexp], color: c.string },
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: c.comment, fontStyle: 'italic' },
    { tag: [t.variableName, t.function(t.variableName), t.labelName], color: c.name },
    { tag: [t.number, t.integer, t.float, t.bool, t.null], color: c.number },
    { tag: [t.strong], fontWeight: 'bold', color: c.strong },
    { tag: [t.emphasis], fontStyle: 'italic', color: c.emphasis },
    { tag: [t.heading, t.heading1, t.heading2, t.heading3], color: c.heading, fontWeight: 'bold' },
    { tag: [t.link, t.url], color: c.link },
    { tag: [t.processingInstruction, t.meta, t.annotation], color: c.meta },
    { tag: [t.contentSeparator], color: c.number, fontWeight: 'bold' },
    { tag: [t.quote], color: c.comment, fontStyle: 'italic' },
    { tag: [t.monospace], color: c.monospace },
    { tag: t.invalid, color: '#f85149' },
  ]);
}

/* ------------------------------------------------------------------ */
/* 脏标记                                                              */
/* ------------------------------------------------------------------ */

const setCleanEffect = StateEffect.define();

const cleanField = StateField.define({
  create: () => true,
  update(value, tr) {
    if (tr.docChanged) return false;
    for (const e of tr.effects) if (e.is(setCleanEffect)) return true;
    return value;
  },
});

/* ------------------------------------------------------------------ */
/* 创建                                                                */
/* ------------------------------------------------------------------ */

/**
 * @param {HTMLElement} host 挂载点
 * @param {{onChange?:()=>void, onCursor?:(line:number,col:number)=>void, onSave?:()=>void}} handlers
 */
export function createEditor(host, handlers = {}) {
  const themeCompartment = new Compartment();
  const highlightCompartment = new Compartment();

  const state = EditorState.create({
    doc: '',
    extensions: [
      // CodeMirror 官方基础套件：行号、搜索、历史、括号补全、缩进…
      history(),
      drawSelection(),
      highlightSpecialChars(),
      highlightSelectionMatches(),
      rectangularSelection(),
      crosshairCursor(),
      lineNumbers(),
      highlightActiveLine(),
      closeBrackets(),
      markdown({ base: markdownLanguage, codeLanguages: [] }),
      keymap.of([
        { key: 'Mod-s', run: () => (handlers.onSave?.(), true) },
        indentWithTab,
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...completionKeymap,
      ]),
      themeCompartment.of(buildTheme(false)),
      highlightCompartment.of(syntaxHighlighting(buildHighlightStyle(false))),
      cleanField,
      EditorView.lineWrapping,
      EditorView.updateListener.of((u) => {
        // 刻意**不**在这里做 doc.toString()：那会在每次击键都复制一整份文档
        // （5MB 文档实测 1.7ms/次，还有随之而来的 GC 压力）。需要文本的消费方
        // （渲染防抖、字数统计）到自己真正要用的那一刻再取一次。
        if (u.docChanged) handlers.onChange?.();
        if (u.selectionSet || u.docChanged) {
          const pos = u.state.selection.main.head;
          const line = u.state.doc.lineAt(pos);
          handlers.onCursor?.(line.number, pos - line.from + 1);
        }
      }),
    ],
  });

  const view = new EditorView({ state, parent: host });

  return {
    getValue: () => view.state.doc.toString(),
    /** 行数：阅读模式下拿不到编辑器，所以状态栏两边都得能算 */
    lineCount: () => view.state.doc.lines,
    setValue(text) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        effects: setCleanEffect.of(null),
      });
    },
    /** 切换主题时不重建编辑器，保留撤销历史和光标位置 */
    setDark(dark) {
      view.dispatch({
        effects: [
          themeCompartment.reconfigure(buildTheme(dark)),
          highlightCompartment.reconfigure(syntaxHighlighting(buildHighlightStyle(dark))),
        ],
      });
    },
    markClean() {
      view.dispatch({ effects: setCleanEffect.of(null) });
    },
    isClean: () => view.state.field(cleanField),
    focus: () => view.focus(),
    scrollTo: (pos) => view.dispatch({ selection: { anchor: pos }, scrollIntoView: true }),
    // 字数统计已移到调用方（main.js 的 text-stats）：它不该挂在编辑器上，
    // 因为阅读模式下根本没有编辑器实例，而统计同样需要工作。
    destroy: () => view.destroy(),
  };
}