"""
主题系统一致性体检。

背景：曾经出现过「换了主题但看着没变化」的故障，根因有两类 ——
  1. 注册表里登记了 id，但 theme.css 里没有对应的 [data-theme-doc='id'] 规则
  2. light/dark 外壳把正文颜色 override 掉了

这里只做能静态判定的部分：1、3（分类是否为空）、4（id/标签重复）。
第 2 类必须在真实渲染里查，见 scripts/smoke-test.mjs 与目检。

用法：python scripts/check-themes.py
"""

import io
import os
import re
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSS = os.path.join(ROOT, 'src', 'styles', 'theme.css')
JS = os.path.join(ROOT, 'src', 'lib', 'doc-themes.js')

css = io.open(CSS, encoding='utf-8').read()
js = io.open(JS, encoding='utf-8').read()

defined = set(re.findall(r"\[data-theme-doc='([a-z0-9_-]+)'\]", css))

reg = js[js.index('export const DOC_THEMES'):js.index('export const DOC_THEME_BY_ID')]
ids = re.findall(r"id: '([a-z0-9_-]+)'", reg)
groups = re.findall(r"group: '([a-z0-9_-]+)'", reg)
darks = re.findall(r'dark: (true|false)', reg)
labels = re.findall(r"label: '([^']+)'", reg)

tabs = js[js.index('export const DOC_THEME_TABS'):]
tab_ids = re.findall(r"id: '([a-z0-9_-]+)'", tabs)
tab_labels = re.findall(r"label: '([^']+)'", tabs)

problems = []

print('主题总数: %d' % len(ids))

missing = [i for i in ids if i not in defined]
extra = [i for i in defined if i not in ids]
if missing:
    problems.append('有 id 但 CSS 缺定义（换主题会看不出变化）: %s' % missing)
if extra:
    problems.append('CSS 有定义但注册表没有（选不到）: %s' % extra)

gcount = Counter(groups)
dup_id = [k for k, v in Counter(ids).items() if v > 1]
dup_label = [k for k, v in Counter(labels).items() if v > 1]
if dup_id:
    problems.append('重复 id: %s' % dup_id)
if dup_label:
    problems.append('重复标签名: %s' % dup_label)

empty = []
for tid, tl in zip(tab_ids, tab_labels):
    if tid == 'all':
        continue
    if tid == 'light':
        n = darks.count('false')
    elif tid == 'dark':
        n = darks.count('true')
    else:
        n = gcount.get(tid, 0)
    if n == 0:
        empty.append('%s(%s)' % (tl, tid))
if empty:
    problems.append('空分类: %s' % empty)

print('分组: %s' % dict(gcount))
print('浅色 %d / 深色 %d' % (darks.count('false'), darks.count('true')))
print('分类标签页: %s' % list(zip(tab_labels, tab_ids)))

if problems:
    print('\n发现 %d 个问题：' % len(problems))
    for p in problems:
        print('  - %s' % p)
    sys.exit(1)

print('\n全部通过。')
