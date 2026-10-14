#!/usr/bin/env python3
"""
把内置 CJK 字体切成「常用 / 次常用 / 冷门」三层分片（unicode-range）。

为什么
------
浏览器是**按字形文件**加载的：一个 @font-face 没有 unicode-range，它就必须把
整个字体文件下完、解压、解析完才能画出第一个字。本项目内置的是完整字符集的
思源黑体，实测（真实 Chromium，scripts/qa 的方式）首屏仅 sans-400 一项就要
4077 KB / 137 ms，加粗体一共 8.12 MB、约 400ms —— 首开文档时中文字会先用
后备字体显示，等字体到了再整篇回流一次。

切成三层之后，首屏只取「常用」那一层（约 500 KB 量级），冷门层等真的遇到
生僻字再拉。字符覆盖**一点没少**：三层合起来 = 原字体 cmap，任何汉字仍由
内置字体渲染，不会掉进系统回退（这是本项目明确不肯妥协的点）。

分层依据
--------
scripts/data/cjk-tiers.json（由 Google Fonts 的 Noto Sans SC 分片表推导）。
那份表把 16k 码位分成 101 片，**从冷到热**排列：前面的片是「龃龅龆龇」这类
生僻字，最后几片是「三上下不与专业个为主之了…一中新日月有点的网」。
本脚本从最热的一端往回累积：
    常用层   ≈ 1200 个 CJK 码位 + ASCII/标点/全角（每篇文档都要）
    次常用层 ≈ 再 2000 个 CJK 码位
    冷门层   = 字体里剩下的全部码位

用法
----
    python scripts/slice-fonts.py                     # 全部字体
    python scripts/slice-fonts.py --only sans serif    # 只切指定几款
    python scripts/slice-fonts.py --from-css <path>    # 重新生成分层数据

产物
----
src/fonts/faces/<id>-<tier>.woff2 + <id>.css（自动生成，不要手改）
"""

import argparse
import json
import os
import re
import sys

from fontTools.ttLib import TTFont
from fontTools.subset import Options, Subsetter

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(ROOT, 'src', 'fonts')
OUT_DIR = os.path.join(FONT_DIR, 'faces')
TIERS_JSON = os.path.join(ROOT, 'scripts', 'data', 'cjk-tiers.json')

# (id, 源文件, CSS family, 字重, 中文名)
FACES = [
    ('sans-400', 'sans-400.woff2', 'Eunice Sans SC', 400, '思源黑体'),
    ('sans-700', 'sans-700.woff2', 'Eunice Sans SC', 700, '思源黑体 粗'),
    ('serif-400', 'serif-400.woff2', 'Eunice Serif SC', 400, '思源宋体'),
    ('serif-700', 'serif-700.woff2', 'Eunice Serif SC', 700, '思源宋体 粗'),
    ('swei-400', 'swei-gothic-400.woff2', 'Eunice Swei', 400, '狮尾圆体'),
    ('zhisong-400', 'zhisong-400.woff2', 'Eunice ZhiSong', 400, '霞鹜新致宋'),
    ('sarasa-400', 'sarasa-mono-400.woff2', 'Eunice Sarasa', 400, '更纱等宽'),
    ('glow-400', 'glow-sans-400.woff2', 'Eunice Glow', 400, '未来荧黑'),
]

TIERS = ('a', 'b', 'c')

# 每篇文档都会用到的码位：ASCII、常用标点、CJK 标点、全角形式、常用符号
ALWAYS = (
    list(range(0x20, 0x7F))
    + list(range(0xA0, 0x100))
    + list(range(0x2000, 0x2070))
    + list(range(0x20A0, 0x20C0))
    + list(range(0x2100, 0x2140))
    + list(range(0x2190, 0x21A0))
    + list(range(0x2200, 0x22A0))
    + list(range(0x2460, 0x2500))
    + list(range(0x25A0, 0x2600))
    + list(range(0x3000, 0x3040))
    + list(range(0x30A0, 0x3100))
    + list(range(0xFE30, 0xFE50))
    + list(range(0xFF00, 0xFFF0))
)

CJK_RANGES = ((0x3400, 0x4DBF), (0x4E00, 0x9FFF), (0xF900, 0xFAFF), (0x20000, 0x3FFFF))


def is_cjk(cp: int) -> bool:
    return any(a <= cp <= b for a, b in CJK_RANGES)


def parse_slice_css(text: str):
    """把 Google Fonts 的切片 CSS 解析成「从冷到热」的码位集合列表。"""
    out = []
    for block in re.findall(r'@font-face\s*\{(.*?)\}', text, re.S):
        m = re.search(r'unicode-range:\s*([^;]+);', block)
        if not m:
            continue
        cps = set()
        for r in re.finditer(r'U\+([0-9a-fA-F]+)(?:-([0-9a-fA-F]+))?', m.group(1)):
            a = int(r.group(1), 16)
            b = int(r.group(2) or r.group(1), 16)
            cps.update(range(a, b + 1))
        out.append(cps)
    return out


def build_tiers(css_text: str, hot_a: int = 1200, hot_b: int = 3200):
    """从最热的一端往回累积出三层码位集合。"""
    slices = parse_slice_css(css_text)
    if not slices:
        raise SystemExit('分层数据为空：CSS 里没有 unicode-range')

    a, b = set(), set()
    cum = 0
    for s in reversed(slices):  # 从最热（CSS 末尾）往最冷
        n = sum(1 for cp in s if is_cjk(cp))
        if cum < hot_a:
            a |= s
        elif cum < hot_b:
            b |= s
        else:
            break
        cum += n

    a |= set(ALWAYS)
    return a, b - a, cum


def load_tiers(from_css=None):
    if from_css:
        css = open(from_css, encoding='utf-8').read()
        a, b, cum = build_tiers(css)
        os.makedirs(os.path.dirname(TIERS_JSON), exist_ok=True)
        with open(TIERS_JSON, 'w', encoding='utf-8') as f:
            json.dump(
                {
                    'source': 'Google Fonts Noto Sans SC 切片表（冷→热 101 片）',
                    'tier_a': sorted(a),
                    'tier_b': sorted(b),
                    'hot_cjk_count': cum,
                },
                f,
            )
        print(f'已重新生成分层数据：{TIERS_JSON}')

    with open(TIERS_JSON, encoding='utf-8') as f:
        data = json.load(f)
    return set(data['tier_a']), set(data['tier_b'])


def to_ranges(cps):
    """把码位集合写成紧凑的 unicode-range 字符串。"""
    out = []
    start = prev = None
    for cp in sorted(cps):
        if start is None:
            start = prev = cp
        elif cp == prev + 1:
            prev = cp
        else:
            out.append(f'U+{start:X}' if start == prev else f'U+{start:X}-{prev:X}')
            start = prev = cp
    if start is not None:
        out.append(f'U+{start:X}' if start == prev else f'U+{start:X}-{prev:X}')
    return ','.join(out)


def subset_woff2(src_path, cps, out_path):
    opts = Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']       # 连字/替代字形等 OpenType 特性全保留
    opts.name_IDs = ['*']
    opts.name_languages = ['*']
    opts.notdef_outline = True
    opts.recalc_bounds = True
    opts.drop_tables = []

    font = TTFont(src_path)
    sub = Subsetter(options=opts)
    sub.populate(unicodes=cps)
    sub.subset(font)
    font.flavor = 'woff2'
    font.save(out_path)
    font.close()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', nargs='*', help='只处理 id 前缀匹配的字体（如 sans serif）')
    ap.add_argument('--from-css', help='用这份 Google Fonts CSS 重新生成分层数据')
    args = ap.parse_args()

    tier_a, tier_b = load_tiers(args.from_css)
    os.makedirs(OUT_DIR, exist_ok=True)

    print(f'常用层码位数: {len(tier_a)}   次常用层: {len(tier_b)}')
    print()
    print(f'{"字体":<16}{"源大小":>9}{"常用":>11}{"次常用":>11}{"冷门":>11}{"合计":>11}  码位校验')

    problems = []
    for fid, src_name, family, weight, label in FACES:
        if args.only and not any(fid.startswith(p) for p in args.only):
            continue

        src = os.path.join(FONT_DIR, src_name)
        if not os.path.exists(src):
            print(f'!! 缺少 {src_name}，跳过 {label}')
            continue

        font = TTFont(src)
        cmap = set()
        for t in font['cmap'].tables:
            if t.isUnicode():
                cmap |= set(t.cmap.keys())
        font.close()

        groups = {
            'a': cmap & tier_a,
            'b': cmap & tier_b,
            'c': cmap - tier_a - tier_b,
        }
        union = groups['a'] | groups['b'] | groups['c']

        sizes = {}
        rules = []
        for tier in TIERS:
            cps = groups[tier]
            if not cps:
                continue
            out_name = f'{fid}-{tier}.woff2'
            out_path = os.path.join(OUT_DIR, out_name)
            subset_woff2(src, cps, out_path)
            sizes[tier] = os.path.getsize(out_path)
            rules.append(
                "@font-face{font-family:'%s';font-style:normal;font-weight:%d;"
                "font-display:swap;src:url('./%s') format('woff2');unicode-range:%s}"
                % (family, weight, out_name, to_ranges(cps))
            )

        css_path = os.path.join(OUT_DIR, f'{fid}.css')
        with open(css_path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(f'/* 自动生成：python scripts/slice-fonts.py（{label}）—— 不要手改 */\n')
            f.write('\n'.join(rules) + '\n')

        ok = union == cmap
        if not ok:
            problems.append(f'{fid}: 分片覆盖 ≠ 原字体 cmap（差 {len(cmap ^ union)} 个码位）')

        src_kb = os.path.getsize(src) / 1024
        print(
            f'{label:<16}{src_kb:>8.0f}K'
            f'{sizes.get("a", 0) / 1024:>10.0f}K'
            f'{sizes.get("b", 0) / 1024:>10.0f}K'
            f'{sizes.get("c", 0) / 1024:>10.0f}K'
            f'{sum(sizes.values()) / 1024:>10.0f}K  {"OK" if ok else "不一致!"}'
        )

    print()
    if problems:
        print('[FAIL] 有问题：')
        for p in problems:
            print('  -', p)
        return 1
    print('[OK] 全部分片覆盖校验通过：三层并集 == 原字体 cmap')
    return 0


if __name__ == '__main__':
    sys.exit(main())
