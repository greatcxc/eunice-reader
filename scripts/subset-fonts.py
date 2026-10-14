"""
中文子集化：把 fontsource 的 chinese-simplified 子集再精简。

fontsource 的单字重已经只有约 1.1 MB，但它覆盖的是 GB18030 级别的
7000+ 汉字。实际文档里高频字远少于此，按 GB2312 6763 字 + 常用
标点/数字/拉丁字母再裁一次，通常能再省 40–50%。

用法:
    python scripts/subset-fonts.py
"""

import os
import sys
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODE_MODULES = os.path.join(ROOT, "node_modules")
OUT_DIR = os.path.join(ROOT, "src", "fonts")

# 源字体：fontsource 的中文子集（已含常用汉字）
SOURCES = [
    ("noto-sans-sc-400", r"@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff2"),
    ("noto-sans-sc-700", r"@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-700-normal.woff2"),
    ("noto-serif-sc-400", r"@fontsource/noto-serif-sc/files/noto-serif-sc-chinese-simplified-400-normal.woff2"),
    ("noto-serif-sc-700", r"@fontsource/noto-serif-sc/files/noto-serif-sc-chinese-simplified-700-normal.woff2"),
]


def build_charset():
    """
    字符集 = 常用汉字 + 标点 + 数字 + 拉丁 + 常用符号。

    汉字从 GB2312 编码空间枚举：Python 内置 gb2312 codec，
    不需要额外数据文件。
    """
    chars = set()

    # GB2312 全部汉字与符号（6763 汉字 + 682 全角符号）
    for code in range(0xA1A1, 0xFEFE):
        try:
            chars.add(bytes([code >> 8, code & 0xFF]).decode("gb2312"))
        except UnicodeDecodeError:
            continue

    # 数字、拉丁字母、常用中英文标点与符号
    extra = (
        "0123456789"
        "abcdefghijklmnopqrstuvwxyz"
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        " !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"
        "·—―、。〈〉《》「」『』【】〔〕！＂＃＄％＆＇（）"
        "＊＋，－．／０１２３４５６７８９：；＜＝＞？＠"
        "ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ"
        "￥￥€£¥©®™§¶†‡•‰′″←↑→↓↔"
        "℃℉±×÷≈≠≤≥∞∑√∫∂∆∏°µΩαβγδθλπσφω"
        "─━│┃┌┏┐┓└┗┘┛┠┨┯┰┱┲┳┴┵┶┷┸┹┺┻┼"
        "┴┸┸╭╮╯╰═║╔╗╚╝╠╣╦╩╬"
    )
    chars.update(extra)
    chars.update(chr(c) for c in range(0x2000, 0x206F))  # 通用标点
    chars.update(chr(c) for c in range(0x20A0, 0x20C0))  # 货币
    chars.update("年月日时分秒")

    # 去掉控制字符
    chars = {c for c in chars if c.isprintable() and c.strip() != ""}
    chars.add(" ")
    return "".join(sorted(chars))


def main():
    try:
        import brotli  # noqa: F401
        import fontTools
    except ImportError:
        print("ERROR: 需要 fontTools 和 brotli。运行: pip install fonttools brotli")
        return 1

    os.makedirs(OUT_DIR, exist_ok=True)
    charset = build_charset()
    print(f"charset: {len(charset)} chars")

    text_file = os.path.join(OUT_DIR, "_charset.txt")
    with open(text_file, "w", encoding="utf-8") as f:
        f.write(charset)

    total_in = 0
    total_out = 0

    for name, rel in SOURCES:
        src = os.path.join(NODE_MODULES, rel)
        if not os.path.exists(src):
            print(f"  SKIP {name}: source missing")
            continue

        dst = os.path.join(OUT_DIR, f"{name}.woff2")
        total_in += os.path.getsize(src)

        cmd = [
            sys.executable, "-m", "fontTools.subset", src,
            f"--text-file={text_file}",
            f"--output-file={dst}",
            "--flavor=woff2",
            "--layout-features=kern,liga,calt,ccmp,locl",
            "--no-hinting",
            "--desubroutinize",
            "--name-IDs=0,1,2,3,4,5,6",
            "--drop-tables+=DSIG",
        ]
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode != 0:
            print(f"  FAIL {name}: {result.stderr.decode('utf-8', 'ignore')[:200]}")
            continue

        size = os.path.getsize(dst)
        total_out += size
        ratio = size / os.path.getsize(src) * 100
        print(f"  {name}: {os.path.getsize(src)/1024:.0f} KB -> {size/1024:.0f} KB ({ratio:.0f}%)")

    os.remove(text_file)

    if total_out:
        print(f"\ntotal: {total_in/1024/1024:.2f} MB -> {total_out/1024/1024:.2f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())