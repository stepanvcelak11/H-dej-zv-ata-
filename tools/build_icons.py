#!/usr/bin/env python3
"""Vloží do index.html SVG sprite s ikonami Lucide (ISC licence, viz licenses/Lucide-ISC.txt).

Použití:  npm pack lucide-static && tar xzf lucide-static-*.tgz
          python3 tools/build_icons.py package/icons
Ikony se vkládají mezi značky <!--ICONS--> a <!--/ICONS--> v index.html.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = """play sliders-horizontal calendar-days paw-print chart-column info wifi wifi-off download circle-check
circle-x smartphone chevron-left chevron-right x lightbulb flag send arrow-right heart users user timer globe
lock-open lock share-2 house rotate-ccw star zap award target flame sparkles search droplets grid-3x3
layout-grid hourglass puzzle blend dices trash-2 map-pin leaf trophy check circle-help book-open camera
microscope bird landmark crown medal circle-alert hand clock copy image eye-off""".split()

src = sys.argv[1]
out = []
for name in ICONS:
    svg = open(os.path.join(src, name + ".svg"), encoding="utf-8").read()
    inner = re.search(r"<svg[^>]*>(.*)</svg>", svg, re.S).group(1)
    inner = re.sub(r"\s+", " ", inner).strip()
    out.append(f'<symbol id="i-{name}" viewBox="0 0 24 24">{inner}</symbol>')
sprite = ('<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n'
          '<!-- Lucide icons, ISC License, https://lucide.dev -->\n' + "\n".join(out) + "\n</svg>")

path = os.path.join(ROOT, "index.html")
html = open(path, encoding="utf-8").read()
html = re.sub(r"<!--ICONS-->.*?<!--/ICONS-->", "<!--ICONS-->\n" + sprite.replace("\\", "\\\\") + "\n<!--/ICONS-->", html, flags=re.S)
open(path, "w", encoding="utf-8").write(html)
print(f"vloženo {len(ICONS)} ikon")
