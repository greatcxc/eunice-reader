"""
从两张 1254x1254 的插画生成 Windows 图标（应用图标 + .md 文件图标）。

两张图的差异决定了处理方式：
  A 读书女孩：画师已经在图里画了一圈黑色圆角蒙版（对角黑边约 12/200），
     且黑色一直连到画布边缘 —— 必须把黑角转成透明，否则图标四角是黑块。
  B MD 文档卡：整幅铺满奶油底色，没有蒙版，四角是实色 —— 需要自己套圆角。

输出：
  src-tauri/icons/app-source.png      1024  应用图标源
  src-tauri/icons/file-markdown-source.png 1024  .md 文件图标源
  src-tauri/icons/icon.ico / icon.png / 128x128.png / 128x128@2x.png / 32x32.png / 64x64.png
  src-tauri/icons/file-markdown.ico

用法：python scripts/make-icons.py
"""

import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, "src-tauri", "icons")

# 画师交付的原图（本次会话从对话附件取得）
SRC_APP = r"C:\Users\great\.dsh\attachments\v1\objects\a6\a69a1ec296ced87431c447be84c4c18160be4a96ad724f8f4bb4cc8745575c2d"
SRC_FILE = r"C:\Users\great\.dsh\attachments\v1\objects\c5\c53a2b028290a9aeb2282b9cd4dbc9941741021b7dd876e9efe46e36f4d976f9"

TARGET = 1024
# 与既有 icon-source.svg 的圆角比例一致（0.22 * 边长），保证两张图标观感统一
CORNER_RATIO = 0.22
# 判定「画进图里的黑蒙版」的阈值；奶油底最暗分量也在 230 以上，不会误伤
BLACK = 40


def rounded_mask(size: int, ratio: float) -> Image.Image:
    """超采样 4 倍再缩回来，得到边缘平滑的圆角矩形蒙版。"""
    ss = 4
    m = Image.new("L", (size * ss, size * ss), 0)
    d = ImageDraw.Draw(m)
    r = int(size * ss * ratio)
    d.rounded_rectangle([0, 0, size * ss - 1, size * ss - 1], radius=r, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def build(src: str, target: int, has_painted_mask: bool) -> Image.Image:
    if not os.path.exists(src):
        raise SystemExit(f"找不到源图: {src}")
    rgb = Image.open(src).convert("RGB").resize((target, target), Image.LANCZOS)
    out = rgb.convert("RGBA")

    corner = rounded_mask(target, CORNER_RATIO)

    if not has_painted_mask:
        out.putalpha(corner)
        return out

    # 画师的黑色蒙版只出现在四个角。
    # 关键：不能整幅图按亮度抠黑 —— 女孩的深色头发同样是近黑，
    # 全局抠会把整头头发变成透明（实测踩过这个坑）。
    # 所以只在「圆角矩形之外」的角落区域里按亮度抠黑，图片主体一律保留。
    lum = rgb.convert("L")
    alpha = Image.new("L", (target, target), 255)
    px_a = alpha.load()
    px_l = lum.load()
    px_c = corner.load()

    # 圆角半径之外的方块区域 = 纯角落
    r = int(target * CORNER_RATIO)
    boxes = [(0, 0, r, r), (target - r, 0, target, r), (0, target - r, r, target), (target - r, target - r, target, target)]
    for x0, y0, x1, y1 in boxes:
        for y in range(y0, y1):
            for x in range(x0, x1):
                if px_c[x, y] < 255:  # 位于圆角之外
                    px_a[x, y] = 0 if px_l[x, y] < BLACK else 255

    out.putalpha(alpha)
    return out


def main() -> int:
    os.makedirs(ICONS, exist_ok=True)

    app = build(SRC_APP, TARGET, has_painted_mask=True)
    fileicon = build(SRC_FILE, TARGET, has_painted_mask=False)

    app.save(os.path.join(ICONS, "app-source.png"))
    fileicon.save(os.path.join(ICONS, "file-markdown-source.png"))
    app.save(os.path.join(ICONS, "icon-source.png"))
    print(f"源图: {TARGET}x{TARGET} 圆角 {CORNER_RATIO:.0%}")

    # ── 应用图标 ──
    app.save(os.path.join(ICONS, "icon.png"))
    for size, name in [(32, "32x32.png"), (64, "64x64.png"), (128, "128x128.png"), (256, "128x128@2x.png")]:
        app.resize((size, size), Image.LANCZOS).save(os.path.join(ICONS, name))
        print(f"  {name}")

    # 多尺寸 ico：显式列出，避免依赖 Pillow 的默认档位
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    app.save(os.path.join(ICONS, "icon.ico"), sizes=[(s, s) for s in ico_sizes])
    print(f"  icon.ico  {ico_sizes}")

    # ── .md 文件图标 ──
    fileicon.save(os.path.join(ICONS, "file-markdown.png"))
    # 16px 是资源管理器列表视图的实际尺寸，必须进 ico
    fileicon.save(os.path.join(ICONS, "file-markdown.ico"), sizes=[(s, s) for s in ico_sizes])
    print(f"  file-markdown.ico  {ico_sizes}")

    # ── 校验 ──
    for f in ["icon.ico", "file-markdown.ico"]:
        p = os.path.join(ICONS, f)
        im = Image.open(p)
        print(f"校验 {f}: {im.size} {len(im.info.get('sizes', [])) or 'n/a'} 档")
    return 0


if __name__ == "__main__":
    sys.exit(main())
