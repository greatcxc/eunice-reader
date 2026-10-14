import('@vscode/markdown-it-katex').then((m) => {
  console.log('m.default typeof      :', typeof m.default);
  console.log('m.default keys       :', Object.keys(m.default || {}).join(', '));
  console.log('m.default.default    :', typeof m.default?.default);
  console.log('m["module.exports"]  :', typeof m['module.exports']);
  console.log('m["module.exports"].default:', typeof m['module.exports']?.default);
});