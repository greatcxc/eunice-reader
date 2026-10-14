"""
构建产物体检：确认关键 CSS 没被压缩器吃掉。

起因是一个很难查的故障：源码里 `backdrop-filter` 和 `-webkit-backdrop-filter`
同时存在，Vite 默认的 esbuild 把它们当成同一属性的重复声明，
压缩时只保留了带前缀的那一条。而 WebView2 不认 `-webkit-backdrop-filter`，
于是 dev 模式（直接吃源码）毛玻璃正常，release 包里彻底失效 ——
两边表现不一致，排查时极易误判成「环境问题」。

这类问题只有对比源码与产物才能发现，所以固化成一个检查。

用法：npm run build 之后运行 python scripts/check-build-css.py
"""

import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist', 'assets')

# 属性名 -> 必须至少出现一次
MUST_SURVIVE = [
    'backdrop-filter',
    'color-mix(',
    'break-inside',
]

# 只应使用标准写法，不应再出现的前缀版本
FORBIDDEN = [
    '-webkit-backdrop-filter',
]


def main() -> int:
    files = [f for f in glob.glob(os.path.join(DIST, '*.css')) if 'katex' not in f]
    if not files:
        print('没有找到 dist/assets 下的应用 CSS，请先运行 npm run build')
        return 1

    css = ''.join(open(f, encoding='utf-8').read() for f in files)
    print('检查文件: %s' % ', '.join(os.path.basename(f) for f in files))

    problems = []

    for prop in MUST_SURVIVE:
        # (?<![-\w]) 排除 -webkit- 之类的前缀重复计数
        n = len(re.findall(re.escape(prop), css))
        if prop.endswith('('):
            n = css.count(prop)
        else:
            n = len(re.findall(r'(?<![-\w])' + re.escape(prop), css))
        print('  %-20s %d 处' % (prop, n))
        if n == 0:
            problems.append('产物里找不到 %s —— 可能被压缩器删掉了' % prop)

    for prop in FORBIDDEN:
        n = css.count(prop)
        print('  %-20s %d 处（应为 0）' % (prop, n))
        if n:
            problems.append('产物里仍有 %s —— WebView2 不认这个前缀写法' % prop)

    # 主题变量必须齐全：少一个就意味着某款主题会掉色
    for var in ['--paper', '--ink', '--accent', '--glass-panel', '--glass-blur']:
        n = css.count(var)
        if n == 0:
            problems.append('产物里找不到变量 %s' % var)

    if problems:
        print('\n发现 %d 个问题：' % len(problems))
        for p in problems:
            print('  - %s' % p)
        return 1

    print('\n全部通过。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
