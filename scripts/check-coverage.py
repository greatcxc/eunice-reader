"""
字体覆盖度实测：检查每个字体文件实际包含哪些字符，并断言每条字体栈**整体**无缺口。

选字体时最容易踩的坑是「看起来能显示，碰上某个符号就缺字」。
与其相信字体作者的说明，不如直接读 cmap 表量一遍。

── 为什么要按「字体栈」而不是按「单个字体」判 ──
浏览器是按单个字符逐级回退的，所以真正决定「会不会掉进系统字体」的是
整条栈的**并集**，不是某一个字体。项目承诺任何字符都不依赖系统字体，
因此关键断言是：每条栈的并集必须覆盖全部探针类别。

用法:
    python scripts/check-coverage.py            # 逐字体明细 + 字体栈断言
    python scripts/check-coverage.py --stacks    # 只看字体栈断言
"""

import os
import sys
import glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(ROOT, "src", "fonts")

# 必须覆盖的字符类别 —— 缺任何一类都会在文档里露出「豆腐块」
PROBES = {
    "ASCII 英文": "The quick brown fox jumps over lazy dog",
    "数字符号": "0123456789 +-*/=<>%#@&",
    "中文常用": "中文正文排版阅读器设置选项",
    "中文标点": "，。！？；：（）【】《》“”‘’——",
    "西文标点": ".,;:!?()[]{}\"'",
    "破折号省略号": "—–…",
    "数学符号": "≈≠≤≥∞∑√∫±×÷",
    "希腊字母": "αβγδθλπσφωΔΩ",
    "箭头": "←↑→↓↔⇒⇔",
    "常用符号": "§¶©®™°※†‡•‰′″",
    "全角符号": "！＂＃＄％＆＇（）＊＋，－．／：；＜＝＞？＠",
    "上下标": "₀₁₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹",
    "emoji": "★☆♥✓✔✗✘→",
}

# 家族名 -> 提供该家族的字体文件（子集化家族可能由多个文件拼成）
FAMILY_FILES = {
    "Eunice Sans SC": ["sans-400.woff2", "sans-700.woff2"],
    "Eunice Serif SC": ["serif-400.woff2", "serif-700.woff2"],
    "Eunice Inter": ["inter-400.woff2", "inter-700.woff2"],
    "Eunice Garamond": ["garamond-400.woff2"],
    "Eunice Mono": ["mono-400.woff2"],
    "Eunice Symbol Gap": ["symbol-gap-400.woff2"],
    "Eunice Swei": ["swei-gothic-400.woff2"],
    "Eunice ZhiSong": ["zhisong-400.woff2"],
    "Eunice Sarasa": ["sarasa-mono-400.woff2"],
    "Eunice Glow": ["glow-sans-400.woff2"],
}

# 与 src/lib/fonts.js 的 FONT_PRESETS 一一对应。
# TAIL 里的系统字体不参与断言 —— 它们正是要被取代的兜底项。
# 「系统字体」预设刻意排除：它就是「用系统字体」这个选项本身。
STACKS = {
    "思源黑体（默认）": ["Eunice Sans SC"],
    "思源宋体": ["Eunice Serif SC"],
    "霞鹜文楷": ["Eunice Sans SC"],  # 文楷为分片按需加载，兜底按思源黑体计
    "Inter + 思源黑体": ["Eunice Inter", "Eunice Sans SC"],
    "Garamond + 思源宋体": ["Eunice Garamond", "Eunice Serif SC"],
    "JetBrains Mono + 思源黑体": ["Eunice Mono", "Eunice Sans SC"],
    "狮尾圆体": ["Eunice Swei", "Eunice Sans SC"],
    "霞鹜新致宋": ["Eunice ZhiSong", "Eunice Serif SC"],
    "更纱等宽": ["Eunice Sarasa"],
    "未来荧黑": ["Eunice Glow", "Eunice Sans SC"],
}


def read_codepoints(path):
    from fontTools.ttLib import TTFont

    font = TTFont(path, fontNumber=0)
    covered = set()
    try:
        for table in font["cmap"].tables:
            if table.isUnicode():
                covered |= set(table.cmap.keys())
    finally:
        font.close()
    return covered


def main():
    # 探针输出含中日韩与箭头，Windows 控制台默认 GBK 会抛 UnicodeEncodeError
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except AttributeError:
        pass

    try:
        import fontTools  # noqa: F401
    except ImportError:
        print("ERROR: 需要 fontTools。运行: pip install fonttools brotli")
        return 1

    only_stacks = "--stacks" in sys.argv
    failed = False

    # 递归扫：文楷按 unicode-range 分片放在子目录里
    files = sorted(
        p for p in glob.glob(os.path.join(FONT_DIR, "**", "*.woff2"), recursive=True)
    )
    if not files:
        print(f"no fonts found in {FONT_DIR}")
        return 1

    covers = {}
    if not only_stacks:
        for path in files:
            name = os.path.basename(path)
            try:
                covered = read_codepoints(path)
            except Exception as exc:
                print(f"\n{name}\n  CANNOT READ: {exc}")
                continue
            covers[name] = covered
            print(f"\n{name}")
            print(f"  codepoints: {len(covered)}")
            missing_total = 0
            for category, probe in PROBES.items():
                missing = [c for c in probe if ord(c) not in covered]
                missing_total += len(missing)
                if missing:
                    short = "".join(missing[:12])
                    more = f" (+{len(missing)-12})" if len(missing) > 12 else ""
                    print(f"  MISS {category:<12} {short}{more}")
                else:
                    print(f"  ok   {category}")
            if missing_total == 0:
                print("  => 全覆盖，无缺字风险")

    # ── 关键断言：每条字体栈的并集必须覆盖全部类别 ──
    print("\n" + "=" * 62)
    print("字体栈并集断言（决定「会不会掉进系统字体」的真正指标）")
    print("=" * 62)

    for stack_name, families in STACKS.items():
        union = set()
        detail = []
        for fam in families:
            for fn in FAMILY_FILES.get(fam, []):
                p = os.path.join(FONT_DIR, fn)
                if not os.path.exists(p):
                    print(f"  ! {stack_name}: 缺少文件 {fn}")
                    continue
                union |= covers.get(fn) or read_codepoints(p)
            detail.append(fam)
        # 每条栈尾部都挂了符号补齐层
        for fn in FAMILY_FILES["Eunice Symbol Gap"]:
            p = os.path.join(FONT_DIR, fn)
            if os.path.exists(p):
                union |= covers.get(fn) or read_codepoints(p)

        gaps = {}
        for category, probe in PROBES.items():
            bad = [c for c in probe if ord(c) not in union]
            if bad:
                gaps[category] = "".join(bad)

        status = "✅ 无缺口" if not gaps else "❌ 有缺口"
        print(f"\n{status}  {stack_name}")
        print(f"         栈: {' → '.join(detail)} → Eunice Symbol Gap")
        print(f"         并集码位: {len(union)}")
        for category, bad in gaps.items():
            print(f"         缺 {category}: {bad}")
        if gaps:
            failed = True

    print("\n" + "=" * 62)
    if failed:
        print("结论：有字体栈存在缺口 —— 这些字符会掉进系统字体（违反项目承诺）")
        return 1
    print("结论：全部字体栈并集无缺口，任何字符都不依赖系统字体。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
