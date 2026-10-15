/**
 * 图标组件（Lucide Icons v1.56.0，ISC License）
 *
 * 全部图标在构建期内联进 JS，不产生任何网络请求；
 * 颜色走 currentColor，因此自动跟随应用明暗主题。
 */

import folderOpen from '../icons/folder-open.svg?raw';
import save from '../icons/save.svg?raw';
import saveAs from '../icons/hard-drive-download.svg?raw';
import eye from '../icons/eye.svg?raw';
import columns from '../icons/columns-2.svg?raw';
import codeXml from '../icons/code-xml.svg?raw';
import list from '../icons/list.svg?raw';
import settings from '../icons/settings.svg?raw';
import sun from '../icons/sun.svg?raw';
import moon from '../icons/moon.svg?raw';
import copy from '../icons/copy.svg?raw';
import close from '../icons/x.svg?raw';
import search from '../icons/search.svg?raw';
import fileText from '../icons/file-text.svg?raw';
import chevronRight from '../icons/chevron-right.svg?raw';
import bookOpen from '../icons/book-open.svg?raw';
import panelLeftClose from '../icons/panel-left-close.svg?raw';
import panelLeft from '../icons/panel-left.svg?raw';
import listTree from '../icons/list-tree.svg?raw';
import pencil from '../icons/pencil.svg?raw';
import check from '../icons/check.svg?raw';
import star from '../icons/star.svg?raw';
import printer from '../icons/printer.svg?raw';
import download from '../icons/download.svg?raw';
import externalLink from '../icons/external-link.svg?raw';
import pin from '../icons/pin.svg?raw';
import pinOff from '../icons/pin-off.svg?raw';
import plus from '../icons/plus.svg?raw';
import maximize from '../icons/maximize.svg?raw';
import minimize from '../icons/minimize.svg?raw';
import minus from '../icons/minus.svg?raw';
import square from '../icons/square.svg?raw';

const RAW = {
  'folder-open': folderOpen,
  save,
  'save-as': saveAs,
  eye,
  columns: columns,
  code: codeXml,
  list,
  settings,
  sun,
  moon,
  copy,
  x: close,
  search,
  'file-text': fileText,
  'chevron-right': chevronRight,
  'book-open': bookOpen,
  // panel-left 在 17px 下只是两条竖线，认不出是什么；
  // list-tree 有明确的层级线条，一眼就知道是目录/大纲
  'panel-left-close': panelLeftClose,
  'panel-left': listTree,
  pencil,
  check,
  star,
  printer,
  download,
  'external-link': externalLink,
  pin,
  'pin-off': pinOff,
  plus,
  maximize,
  minimize,
  minus,
  square,
};

/** 去掉 lucide 的注释头和根 <svg> 上的冗余属性，只留干净的 SVG 字符串 */
function clean(svg) {
  return svg
    .replace(/<!--[\s\S]*?-->/g, '')
    // 只清根 <svg> 上的 class / width / height，两点原因：
    //   1. 子元素（如 <rect width="18" height="18">）的宽高是图形本身 ——
    //      一起删掉就成 0×0 空壳，最大化（square）、还原（copy）、
    //      分屏（columns-2）、导出 PDF（printer）这些图标会整个消失；
    //   2. 必须用 \s+ 而不是 \s*，否则会从 stroke-width="2" 的中间
    //      匹配到 width="2"，留下一个残破的 stroke- 属性。
    .replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\s+(?:class|width|height)="[^"]*"/g, ''))
    .trim();
}

const CLEANED = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, clean(v)]));

/**
 * 生成图标 HTML。
 * @param {keyof typeof CLEANED} name
 * @param {number} size 像素
 * @param {string} cls 附加 class
 */
export function icon(name, size = 18, cls = '') {
  const svg = CLEANED[name];
  if (!svg) return '';
  return svg
    .replace('<svg', `<svg width="${size}" height="${size}" class="ic ${cls}"`)
    .replace('aria-hidden', 'data-ic');
}

export const ICON_NAMES = Object.keys(CLEANED);

/** 复制按钮用的小图标，供 DOMPurify 之后动态插入 */
export function copyIcon(size = 14) {
  return icon('copy', size);
}

/** 外链箭头标记 */
export function externalIcon(size = 12) {
  return icon('external-link', size);
}