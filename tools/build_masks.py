#!/usr/bin/env python3
"""Spočítá pro každé zvíře masku „kde je na fotce zvíře“ (model U²-Net, Apache 2.0) a uloží ji
do data/masks.js jako mřížku 32×32 bitů (base64). Hra podle ní přibližuje jen na zvíře, ne na okolí.

Použití: python3 tools/build_masks.py <cesta k u2net.onnx>
(model: https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx)
"""
import base64, json, os, sys
import numpy as np
import onnxruntime as ort
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
G = 32
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def predict(sess, path):
    im = Image.open(path).convert('RGB')
    x = np.asarray(im.resize((320, 320), Image.LANCZOS), dtype=np.float32) / 255.0
    x = (x / max(x.max(), 1e-6) - MEAN) / STD
    x = x.transpose(2, 0, 1)[None].astype(np.float32)
    d = sess.run(None, {sess.get_inputs()[0].name: x})[0][0, 0]
    d = (d - d.min()) / max(d.max() - d.min(), 1e-6)
    return d


def to_bits(prob):
    small = np.asarray(Image.fromarray((prob * 255).astype(np.uint8)).resize((G, G), Image.BILINEAR)) / 255.0
    bits = (small > 0.5).astype(np.uint8).flatten()
    return base64.b64encode(np.packbits(bits).tobytes()).decode(), small


def main():
    sess = ort.InferenceSession(sys.argv[1], providers=['CPUExecutionProvider'])
    t = open(os.path.join(ROOT, 'data', 'animals.js'), encoding='utf-8').read()
    animals = json.loads(t[t.index('['):t.rindex(']') + 1])
    out = {}
    for n, a in enumerate(animals, 1):
        b64, small = to_bits(predict(sess, os.path.join(ROOT, a['img'])))
        cover = float((small > 0.5).mean())
        out[a['id']] = b64
        print(f'[{n}/{len(animals)}] {a["id"]}: zvíře zabírá {cover * 100:.0f} % fotky', flush=True)
    with open(os.path.join(ROOT, 'data', 'masks.js'), 'w', encoding='utf-8') as f:
        f.write('// Vygenerováno skriptem tools/build_masks.py – kde je na fotce zvíře (mřížka 32×32 bitů, base64).\n')
        f.write('window.DATA_MASKS = ')
        json.dump(out, f, separators=(',', ':'))
        f.write(';\n')


if __name__ == '__main__':
    main()
