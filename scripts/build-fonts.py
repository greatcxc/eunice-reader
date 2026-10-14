"""
把 .font-scout/selected/ 里选定的字体转成内置用的 woff2。

选定的 4 款（用户 2026-10-14 确认，均作正文字体平等列入）：
    狮尾圆体 Swei Gothic CJK SC   圆体 / 柔和无衬线
    霞鹜新致宋 Plus                老式衬线 / 书卷气   （IPA Font License 1.0）
    更纱等宽 Sarasa Mono SC        等宽中文
    未来荧黑 Glow Sans SC          标题 / 美术字

转换只用 fontTools，不依赖外部的 woff2_compress 可执行文件。
产物落在 src/fonts/，与既有的 sans/serif/inter 等同目录，保持接入方式一致。

用法：python scripts/build-fonts.py
"""

import os
import sys

from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, ".font-scout", "selected")
OUT_DIR = os.path.join(ROOT, "src", "fonts")

# (输出文件名, 源文件名, 说明)
FONTS = [
    ("swei-gothic-400.woff2", "SweiGothicCJKsc-Regular.ttf", "狮尾圆体"),
    ("zhisong-400.woff2", "LXGWNeoZhiSongPlus.ttf", "霞鹜新致宋 Plus"),
    ("sarasa-mono-400.woff2", "sarasa-mono-sc-regular.ttf", "更纱等宽 Sarasa Mono SC"),
    ("glow-sans-400.woff2", "GlowSansSC-Normal-Regular.otf", "未来荧黑 Glow Sans SC"),
]


def main() -> int:
    if not os.path.isdir(SRC_DIR):
        raise SystemExit(f"找不到 {SRC_DIR}（由 .font-scout 提供）")
    os.makedirs(OUT_DIR, exist_ok=True)

    total_before = 0
    total_after = 0

    for out_name, src_name, label in FONTS:
        src = os.path.join(SRC_DIR, src_name)
        if not os.path.exists(src):
            print(f"!! 缺失 {src_name}，跳过 {label}")
            continue

        dst = os.path.join(OUT_DIR, out_name)
        before = os.path.getsize(src)

        # 先写成临时文件再原子替换，避免中途失败留下半个字体。
        # fontTools 的 flavor='woff2' 走 brotli 压缩，不需要外部 woff2_compress。
        tmp = os.path.join(OUT_DIR, "_tmp.woff2")
        font = TTFont(src)
        font.flavor = "woff2"
        font.save(tmp)
        font.close()
        os.replace(tmp, dst)

        after = os.path.getsize(dst)
        total_before += before
        total_after += after

        # 校验：码位与体积
        v = TTFont(dst)
        cov = set()
        for t in v["cmap"].tables:
            if t.isUnicode():
                cov |= set(t.cmap.keys())
        fam = v["name"].getDebugName(1)
        v.close()

        print(
            f"{label:<22} {src_name:<32} "
            f"{before/1e6:6.1f}MB -> {after/1e6:5.1f}MB  "
            f"码位 {len(cov):>6}  family={fam!r}"
        )

    print(f"\n合计 {total_before/1e6:.1f}MB -> {total_after/1e6:.1f}MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
