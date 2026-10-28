#!/usr/bin/env python3
"""Pixel sanity checks on verification screenshots."""
from PIL import Image
import os

D = "/home/z/my-project/scripts"
CHECKS = [
    ("verify-28-login-final.png", "login", "light"),
    ("verify-02-dashboard-light.png", "dashboard", "light"),
    ("verify-07-conflict-detail-light.png", "conflict detail", "light"),
    ("verify-08-ai-analysis-light.png", "AI workflow", "light"),
    ("verify-18-dashboard-dark.png", "dashboard", "dark"),
    ("verify-25-mobile-drawer.png", "mobile drawer", "light"),
]

def stats(name, expect_theme):
    p = os.path.join(D, name)
    img = Image.open(p).convert("RGB").resize((320, 200))
    px = list(img.getdata())
    n = len(px)
    avg = tuple(sum(c[i] for c in px) / n for i in range(3))
    # luminance distribution
    lum = [0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in px]
    mean_l = sum(lum) / n
    uniq = len(set(px))
    # orange-ish pixels (brand hue presence) — r distinctly > b
    orange = sum(1 for r, g, b in px if r > 140 and r - b > 40 and g < r) / n
    whiteish = sum(1 for r, g, b in px if r > 230 and g > 230 and b > 230) / n
    ok_theme = mean_l > 150 if expect_theme == "light" else mean_l < 110
    return {
        "shot": name, "avg_rgb": [round(x) for x in avg],
        "mean_lum": round(mean_l, 1), "unique_colors": uniq,
        "orange_pct": round(orange * 100, 1), "white_pct": round(whiteish * 100, 1),
        "theme_ok": ok_theme,
        "not_blank": uniq > 1000,
    }

results = [stats(n, t) for n, _, t in CHECKS]
for r in results:
    print(r)

all_ok = all(r["theme_ok"] and r["not_blank"] for r in results)
print("ALL_VISUAL_CHECKS_PASS:", all_ok)
