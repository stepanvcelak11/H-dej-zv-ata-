"""Vygeneruje ikony aplikace: lupa, ve které jsou vidět zebří proužky."""
import math, os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 1024

def make(pad_frac=0.0, rounded=True):
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bg = Image.new("RGBA", (S, S))
    d = ImageDraw.Draw(bg)
    for y in range(S):  # přechod oranžová → zelená
        t = y / S
        c = tuple(int(a + (b - a) * t) for a, b in zip((240, 149, 79), (31, 77, 58)))
        d.line([(0, y), (S, y)], fill=c + (255,))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=230 if rounded else 0, fill=255)
    im.paste(bg, (0, 0), mask)

    k = 1 - pad_frac
    cx, cy, r = S * 0.44, S * 0.42, S * 0.27 * k
    cx = S / 2 + (cx - S / 2) * k
    cy = S / 2 + (cy - S / 2) * k
    # rukojeť
    ang = math.radians(45)
    hx0, hy0 = cx + math.cos(ang) * r * 0.95, cy + math.sin(ang) * r * 0.95
    hx1, hy1 = cx + math.cos(ang) * r * 2.05, cy + math.sin(ang) * r * 2.05
    dd = ImageDraw.Draw(im)
    dd.line([(hx0, hy0), (hx1, hy1)], fill=(40, 28, 18, 255), width=int(S * 0.11 * k))
    dd.ellipse([hx1 - S * .055 * k, hy1 - S * .055 * k, hx1 + S * .055 * k, hy1 + S * .055 * k], fill=(40, 28, 18, 255))
    # čočka se zebřími proužky
    lens = Image.new("RGBA", (S, S), (250, 247, 240, 255))
    ld = ImageDraw.Draw(lens)
    for i in range(-12, 14):
        x = i * S * 0.075
        pts = []
        for yy in range(0, S + 1, 16):
            pts.append((x + math.sin(yy / S * 6.0 + i * 0.4) * S * 0.035 + yy * 0.35, yy))
        right = [(px + S * 0.034, py) for px, py in reversed(pts)]
        ld.polygon(pts + right, fill=(25, 25, 25, 255))
    lmask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(lmask).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    im.paste(lens, (0, 0), lmask)
    # obruba a odlesk
    dd.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(40, 28, 18, 255), width=int(S * 0.05 * k))
    gl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(gl).arc([cx - r * .72, cy - r * .72, cx + r * .72, cy + r * .72], 200, 255, fill=(255, 255, 255, 170), width=int(S * 0.03 * k))
    im.alpha_composite(gl.filter(ImageFilter.GaussianBlur(2)))
    return im

base = make()
for size, name in [(192, "icon-192.png"), (512, "icon-512.png")]:
    base.resize((size, size), Image.LANCZOS).save(os.path.join(ROOT, "icons", name))
flat = make(rounded=False)
apple = Image.new("RGB", (S, S)); apple.paste(flat, (0, 0), flat)
apple.resize((180, 180), Image.LANCZOS).save(os.path.join(ROOT, "icons", "apple-touch-icon.png"))
mask = make(pad_frac=0.22, rounded=False)
mask.resize((512, 512), Image.LANCZOS).save(os.path.join(ROOT, "icons", "icon-maskable-512.png"))
print("ok")
