/**
 * 渲染烟雾测试：不启动 GUI，直接验证 markdown-it 装配是否正确。
 *   node scripts/smoke-test.mjs
 * 覆盖本项目依赖的每一种扩展语法，任何一条不生效都会让这里失败。
 */

import { renderMarkdown, ensureRenderers } from '../src/markdown/index.js';

const cases = [
  ['标题', '# 一级标题', /<h1[^>]*>/],
  ['标题锚点 id', '## 二级标题', /<h2[^>]*id="[^"]+"/],
  // permalink 刻意关掉了：标题后面不该再跟一个「#」（见 markdown/index.js）
  ['标题不带 # 锚点', '## 二级标题', (h) => !h.includes('mr-anchor') && !/>#<\/h2>/.test(h)],
  ['标题不带 # 锚点（一级）', '# 一级标题', (h) => !h.includes('mr-anchor') && !/>#<\/h1>/.test(h)],
  ['粗体', '**加粗**', /<strong>加粗<\/strong>/],
  ['斜体', '*倾斜*', /<em>倾斜<\/em>/],
  // markdown-it 按 GFM 规范输出 <s>（不是 HTML5 的 <del>）
  ['删除线', '~~删除~~', /<s>删除<\/s>/],
  ['无序列表', '- 甲\n- 乙', /<ul>/],
  ['有序列表', '1. 甲\n2. 乙', /<ol>/],
  ['任务列表未完成', '- [ ] 待办', /type="checkbox"/],
  ['任务列表已完成', '- [x] 完成', /checked/],
  ['表格', '| a | b |\n|:--|--:|\n| 1 | 2 |', /<table>/],
  ['表格对齐', '| a | b |\n|:--|--:|\n| 1 | 2 |', /style="text-align:right"/],
  ['围栏代码块', '```js\nconst a=1\n```', /class="hljs"/],
  ['代码语言标记', '```python\nprint(1)\n```', /data-lang="python"/],
  ['行内代码', '`code`', /<code>code<\/code>/],
  ['引用', '> 引用内容', /<blockquote>/],
  ['嵌套引用', '> 外层\n>\n> > 内层', /<blockquote>[\s\S]*<blockquote>/],
  ['外链', '[GitHub](https://github.com)', /target="_blank"/],
  ['脚注引用', '正文[^1]\n\n[^1]: 脚注说明', /class="footnote-ref"/],
  ['脚注区块', '正文[^1]\n\n[^1]: 脚注说明', /class="footnotes"/],
  ['Emoji', ':rocket: 发射', /🚀/],
  ['自动链接', '访问 https://example.com 看看', /<a href="https:\/\/example\.com"/],
  ['行内公式', '公式 $a^2+b^2=c^2$', /class="katex"/],
  ['块级公式', '$$\nE = mc^2\n$$', /class="katex-display"/],
  ['Mermaid 占位', '```mermaid\ngraph TD;\nA-->B;\n```', /data-mermaid-source/],
  // 图表是块级内容，必须跳过 markdown-it 的 <pre><code> 包装：
  // 塞进行内 code 里是非法嵌套，还会继承代码块样式（导出 PDF 时 print.css
  // 会给 `.markdown-body pre` 加边框与底色，每个图表都被套一圈灰框）。
  ['Mermaid 不被代码块包裹', '```mermaid\ngraph TD;\nA-->B;\n```', (h) => !/<pre|<code/.test(h) && /^<div class="mr-mermaid"/.test(h.trim())],
  ['Mermaid 源码仍转义', '```mermaid\ngraph TD\nA["<img src=x>"]\n```', /&lt;img src=x&gt;/],
  ['提示块 note', ':::note\n内容\n:::', /mr-callout-note/],
  ['提示块 tip', ':::tip\n内容\n:::', /mr-callout-tip/],
  ['提示块 warning', ':::warning\n内容\n:::', /mr-callout-warning/],
  ['分隔线', '---', /<hr/],
  ['内嵌 HTML', '<details><summary>点我</summary>内容</details>', /<details>/],
  ['图片', '![图](./a.png)', /<img/],
  // Front Matter 应被剥离，正文正常渲染，且 --- 不残留成 hr
  ['Front Matter 剥离', '---\ntitle: 测试\n---\n\n正文内容', /<p>正文内容<\/p>/],
  ['Front Matter 不残留分隔线', '---\ntitle: 测试\n---\n\n正文内容', (h) => !/<hr/.test(h)],
];

let pass = 0;
const failed = [];

// 公式（katex）与代码高亮（highlight.js）现在是按需加载的：
// 先声明本次要用到它们，renderMarkdown 才会走完整管线，否则代码块只会被转义。
await ensureRenderers('```js\ncode\n```\n\n$a^2+b^2=c^2$');

for (const [name, input, expect] of cases) {
  let html = '';
  try {
    html = renderMarkdown(input);
  } catch (err) {
    failed.push([name, `抛出异常: ${err.message}`]);
    continue;
  }
  // 断言可以是正则，也可以是自定义判断函数
  const ok = typeof expect === 'function' ? Boolean(expect(html)) : expect.test(html);
  if (ok) pass++;
  else failed.push([name, `断言未满足 ${expect}\n      实际: ${html.slice(0, 160).replace(/\n/g, ' ')}`]);
}

console.log(`\n渲染烟雾测试：${pass}/${cases.length} 通过`);
if (failed.length) {
  console.log('\n失败项：');
  for (const [name, why] of failed) console.log(`  ✗ ${name} —— ${why}`);
  process.exit(1);
}
console.log('全部通过。');