"""
从更纱等宽（Sarasa Mono SC，OFL 1.1）子集化出一个「符号补齐层」。

── 为什么需要它 ──
用户要求「绝对不要出现字体 fallback」。实测所有开源中文字体：

    ✔ U+2714 / ✗ U+2717 / ✘ U+2718   只有 Sarasa Mono SC 齐备
    下 / 上标 ₀₋₉ ⁰⁻⁹                只有 Sarasa Mono SC 齐备

Noto Sans SC / Noto Serif SC 这类主力正文字体恰恰缺这几个码位，
现在靠 Windows 专有的 Segoe UI Symbol 兜底 —— 一旦离开 Windows 就是豆腐块。

── 做法 ──
把这几十个码位做成一个几 KB 的独立字体，插进每条字体栈的第二位。
于是「装饰字体 → 符号补齐层 → 思源 SC」三级兜底全部随包分发，
不再依赖任何系统字体，并且可以用 check-coverage.py 对并集做断言。

── 许可 ──
Sarasa 为 OFL 1.1，含 Adobe 的 Reserved Font Name 'Source'。
OFL 允许子集化与再分发，条件是不得使用保留字体名 —— 因此这里把
family 改名为 'Eunice Symbol Gap'，并随包附带完整 OFL 与版权声明。

用法：python scripts/make-symbol-gap.py
"""

import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, ".font-scout", "selected", "sarasa-mono-sc-regular.ttf")
OUT_DIR = os.path.join(ROOT, "src", "fonts")
OUT_NAME = "symbol-gap-400.woff2"
FAMILY = "Eunice Symbol Gap"

# 只收「确实缺」的码位，不夹带任何正文字符 —— 层越薄越好
CODEPOINTS = (
    list(range(0x2713, 0x2719))          # ✓ ✔ ✕ ✖ ✗ ✘
    + list(range(0x2605, 0x2607))        # ★ ☆
    + list(range(0x2080, 0x208A))        # ₀-₉
    + list(range(0x2070, 0x2071))        # ⁰
    + list(range(0x2074, 0x207A))        # ⁴-⁹
    + list(range(0x00B9, 0x00BA))        # ¹
    + list(range(0x00B2, 0x00B4))        # ² ³
    + list(range(0x2212, 0x2213))        # − 减号（数学排版常用）
    + list(range(0x00B1, 0x00B2))        # ±
)


def main() -> int:
    if not os.path.exists(SRC):
        raise SystemExit(f"找不到源字体: {SRC}\n（由 .font-scout 提供；缺失时请重新获取 Sarasa Mono SC）")

    os.makedirs(OUT_DIR, exist_ok=True)
    out_ttf = os.path.join(OUT_DIR, "_symbol-gap.tmp.ttf")
    out_woff2 = os.path.join(OUT_DIR, OUT_NAME)

    # 先把码位收窄到真正需要的范围，再交给 subsetter
    font = TTFont(SRC)
    available = set()
    for t in font["cmap"].tables:
        if t.isUnicode():
            available |= set(t.cmap.keys())
    wanted = sorted(set(CODEPOINTS) & available)
    missing = sorted(set(CODEPOINTS) - available)
    font.close()

    print(f"源字体: {os.path.basename(SRC)}")
    print(f"目标码位 {len(CODEPOINTS)} 个，其中源字体具备 {len(wanted)} 个")
    if missing:
        print("  源字体也缺（需另找来源）: " + " ".join(f"U+{c:04X}" for c in missing))

    unicodes = ",".join(f"U+{c:04X}" for c in wanted)
    subset.main([
        SRC,
        f"--unicodes={unicodes}",
        f"--output-file={out_ttf}",
        "--layout-features=*",
        "--name-IDs=*",
        "--notdef-outline",
        "--recalc-bounds",
        "--drop-tables+=DSIG",
        "--no-hinting",
    ])

    # 改名：OFL 禁止使用保留字体名，子集必须换名后再分发
    st = TTFont(out_ttf)
    for rec in st["name"].names:
        try:
            val = rec.toUnicode()
        except Exception:
            continue
        if rec.nameID in (1, 3, 4, 6, 16):
            new = FAMILY if rec.nameID in (1, 16) else (
                f"{FAMILY} Regular" if rec.nameID == 4 else (
                    f"{FAMILY}-Regular" if rec.nameID == 6 else val))
            rec.string = new
        elif rec.nameID in (5, 7, 8, 9, 10, 11, 12, 13, 14):
            rec.string = (
                "Subset of Sarasa Mono SC (OFL 1.1). "
                "Copyright (c) 2015-2025 Renzhi Li; portions Adobe (Reserved Font Name 'Source'), "
                "The Inter Project Authors, Google Inc. Renamed per OFL Reserved Font Name clause."
                if rec.nameID in (7, 8, 9, 10, 11, 12, 13, 14) else val)
    st.save(out_ttf)
    st.close()

    # 转 woff2（需要 brotli）
    from fontTools.ttLib import woff2

    woff2.compress(out_ttf, out_woff2)
    os.remove(out_ttf)

    size = os.path.getsize(out_woff2)
    print(f"输出: src/fonts/{OUT_NAME}  {size} bytes ({size/1024:.1f} KB)")

    # 立即验证产物：码位、family 名
    v = TTFont(out_woff2)
    cov = set()
    for t in v["cmap"].tables:
        if t.isUnicode():
            cov |= set(t.cmap.keys())
    fam = v["name"].getDebugName(1)
    v.close()
    print(f"校验: 码位 {len(cov)} 个，family = {fam!r}")
    still = [c for c in wanted if c not in cov]
    print("校验: 缺失码位 = " + ("无" if not still else " ".join(f"U+{c:04X}" for c in still)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
