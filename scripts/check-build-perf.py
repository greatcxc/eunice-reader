#!/usr/bin/env python3
"""
构建产物性能断言：把「冷启动只加载必要的东西」变成可执行的检查。

为什么需要它
------------
这个项目里最贵的一次性能回归是**肉眼看不见的**：vite.config.js 里手写的
manualChunks 把 dompurify 一起吸进了 mermaid 大块，于是入口为了拿一个小模块
而静态 import 了整个 4.85MB 的 mermaid chunk。产物一切「正常」——页面能开、
功能都对，只是每次冷启动都白白多解析/编译 109ms 的 JS（占首屏 JS 的 78%）。

这类问题只能从产物的引用关系上看出来，所以固化成断言：
  1. dist/index.html 的 modulepreload 不得预加载「按需库」
  2. 入口 chunk 不得静态 import「按需库」，也不得静态 import 超大 chunk
  3. 入口 chunk 与首屏 JS 总体积有预算
  4. 所有 url() / new URL(..., import.meta.url) 引用的资源必须真的存在
     （曾经文楷字体就是这样静默失效的：CSS 引用了没被产出的分片文件）

用法（必须在 npm run build 之后跑）：
    python scripts/check-build-perf.py
"""

import glob
import os
import re
import sys

# Windows 控制台默认是 GBK，直接 print 中文/符号会 UnicodeEncodeError。
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
ASSETS = os.path.join(DIST, 'assets')

# 入口 chunk 体积预算（KB）。全部按需分包之后实际约 300KB 上下；
# 留一点余量，但谁把大库塞回入口就会在这里炸出来。
ENTRY_BUDGET_KB = 420
# 首屏 JS 总量（入口 + modulepreload）预算（KB）
FIRST_LOAD_BUDGET_KB = 600
# 入口静态 import 的单个 chunk 上限（KB）：超过它的库必须走动态 import
STATIC_CHUNK_BUDGET_KB = 1024

# 只允许动态 import 的库（不得出现在预加载或入口静态引用里）
LAZY_ONLY = ('mermaid', 'katex', 'hljs', 'editor', 'wenkai')
# 允许出现在 modulepreload 里的 chunk（前缀匹配）
ALLOWED_PRELOAD = ('rolldown-runtime', 'index-', 'dompurify')

# new URL(`x.woff2`, import.meta.url) —— 构建后资源引用的主要形态
RE_NEW_URL = re.compile(r"""new URL\(\s*[`'"]([^`'"]+)[`'"]\s*,\s*import\.meta\.url""")
RE_URL_FUNC = re.compile(r"""url\(\s*[`'"]?([^`'")]+)[`'"]?\s*\)""")
# 只校验「看起来就是一个静态资源路径」的引用。
# 不这样过滤会把 SVG 滤镜字符串（url(#a-drop-shadow)、url(${i}#${t})）
# 当成资源引用，全是误报。
RE_ASSET_REF = re.compile(
    r'^[\w./-]+\.(?:woff2?|ttf|otf|eot|png|jpe?g|gif|webp|avif|svg|css|js|mjs|json|ico|wasm)$',
    re.IGNORECASE,
)


def read_text(path):
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        return f.read()


def kb(n):
    return n / 1024.0


def main() -> int:
    problems = []
    notes = []

    index_html = os.path.join(DIST, 'index.html')
    if not os.path.exists(index_html):
        print('!! 找不到 dist/index.html —— 先跑 npm run build')
        return 1
    html = read_text(index_html)

    entry_match = re.search(r'src="\./assets/([^"]+\.js)"', html)
    if not entry_match:
        print('!! dist/index.html 里找不到入口 script')
        return 1
    entry_name = entry_match.group(1)
    entry_path = os.path.join(ASSETS, entry_name)
    entry_text = read_text(entry_path)

    # ---- 1. modulepreload 不得预加载按需库 -------------------------------
    preloads = re.findall(r'<link rel="modulepreload"[^>]*href="\./assets/([^"]+)"', html)
    for name in preloads:
        if not name.startswith(ALLOWED_PRELOAD):
            problems.append(f'modulepreload 预加载了非首屏 chunk: {name}')
        for lazy in LAZY_ONLY:
            if lazy in name:
                problems.append(f'modulepreload 预加载了按需库 {lazy}: {name}')

    # ---- 2. 样式表：katex 必须按需 ---------------------------------------
    css_links = re.findall(r'<link rel="stylesheet"[^>]*href="\./assets/([^"]+)"', html)
    for name in css_links:
        if 'katex' in name:
            problems.append(f'katex 样式表仍在首屏 <head> 里阻塞渲染: {name}')

    # ---- 3. 入口静态 import 的检查 ---------------------------------------
    head = entry_text[:6000]
    static_targets = set(re.findall(r'from"\./([^"]+)"', head)) | set(
        re.findall(r'import"\./([^"]+)"', head)
    )
    for name in sorted(static_targets):
        target = os.path.join(ASSETS, name)
        for lazy in LAZY_ONLY:
            if lazy in name:
                problems.append(f'入口静态 import 了按需库 {lazy}: {name}')
        if os.path.exists(target):
            size_kb = kb(os.path.getsize(target))
            if size_kb > STATIC_CHUNK_BUDGET_KB:
                problems.append(
                    f'入口静态 import 了 {size_kb:.0f}KB 的 chunk（上限 {STATIC_CHUNK_BUDGET_KB}KB）: {name}'
                )

    # ---- 4. 体积预算 -----------------------------------------------------
    entry_kb = kb(os.path.getsize(entry_path))
    if entry_kb > ENTRY_BUDGET_KB:
        problems.append(f'入口 chunk {entry_kb:.0f}KB 超出预算 {ENTRY_BUDGET_KB}KB')

    first_load_kb = entry_kb + sum(
        kb(os.path.getsize(os.path.join(ASSETS, n)))
        for n in preloads
        if os.path.exists(os.path.join(ASSETS, n))
    )
    if first_load_kb > FIRST_LOAD_BUDGET_KB:
        problems.append(f'首屏 JS 合计 {first_load_kb:.0f}KB 超出预算 {FIRST_LOAD_BUDGET_KB}KB')

    # ---- 5. 资源引用完整性 ----------------------------------------------
    checked_refs = 0
    for path in glob.glob(os.path.join(ASSETS, '*.js')) + glob.glob(os.path.join(ASSETS, '*.css')):
        text = read_text(path)
        base = os.path.dirname(path)
        refs = RE_NEW_URL.findall(text) + [m.strip() for m in RE_URL_FUNC.findall(text)]
        for ref in refs:
            if not ref or ref.startswith(('data:', 'http:', 'https:', '#', '//')):
                continue
            if ref.startswith('/'):
                continue
            if not RE_ASSET_REF.match(ref):
                continue  # 动态拼接 / SVG 滤镜 / 片段引用，不是资源文件
            checked_refs += 1
            target = os.path.normpath(os.path.join(base, ref))
            if not os.path.exists(target):
                problems.append(f'{os.path.basename(path)} 引用了不存在的资源: {ref}')

    # ---- 报告 ------------------------------------------------------------
    print('构建产物性能检查')
    print('-' * 62)
    print(f'入口 chunk            {entry_name}  {entry_kb:8.1f} KB')
    print(f'首屏 modulepreload    {len(preloads)} 个  {first_load_kb - entry_kb:8.1f} KB')
    print(f'首屏 JS 合计                          {first_load_kb:8.1f} KB'
          f'  (预算 {FIRST_LOAD_BUDGET_KB} KB)')
    print(f'资源引用检查          {checked_refs} 条')
    for n in notes:
        print(f'  · {n}')

    # 顺手报告「按需库」各自的体积，便于观察回归
    lazy_report = []
    for path in glob.glob(os.path.join(ASSETS, '*.js')):
        name = os.path.basename(path)
        if any(lazy in name for lazy in ('mermaid', 'katex', 'hljs', 'editor', 'wenkai')):
            lazy_report.append((kb(os.path.getsize(path)), name))
    lazy_report.sort(reverse=True)
    if lazy_report:
        print('按需加载（不进首屏）:')
        for size, name in lazy_report[:6]:
            print(f'    {size:8.1f} KB  {name}')
        if len(lazy_report) > 6:
            print(f'    … 另有 {len(lazy_report) - 6} 个分片')

    if problems:
        print('\n[FAIL] 未通过：')
        for p in problems:
            print(f'  - {p}')
        return 1

    print('\n[OK] 全部通过：冷启动没有背上按需库，资源引用完整。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
