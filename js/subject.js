/* Kde je na fotce zvíře – maska 32×32.
 * U zvířat v aplikaci je maska předpočítaná (data/masks.js), u fotek z internetu a vlastních fotek
 * ji v telefonu spočítá malý model U²-Net (models/u2netp.onnx) přes ONNX Runtime Web.
 * Model a knihovna se stáhnou až při prvním použití a pak zůstanou v telefonu.
 */
(function () {
  'use strict';

  const G = 32;
  const SIZE = 320;
  const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

  function decode(b64) {
    const bin = atob(b64);
    const bits = new Uint8Array(G * G);
    for (let i = 0; i < G * G; i++) bits[i] = (bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
    return bits;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Nepodařilo se načíst ' + src));
      document.head.appendChild(s);
    });
  }

  let sessionPromise = null;
  function session() {
    if (!sessionPromise) {
      sessionPromise = (async () => {
        if (!window.ort) await loadScript('vendor/ort/ort.wasm.min.js');
        const ort = window.ort;
        ort.env.wasm.wasmPaths = new URL('vendor/ort/', location.href).href;
        ort.env.wasm.numThreads = 1;
        return ort.InferenceSession.create(new URL('models/u2netp.onnx', location.href).href, { executionProviders: ['wasm'] });
      })();
      sessionPromise.catch(() => { sessionPromise = null; });
    }
    return sessionPromise;
  }

  /** Spočítá masku zvířete pro obrázek (musí jít číst – stejný původ nebo CORS). */
  async function detect(img) {
    const s = await session();
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, SIZE, SIZE);
    const px = x.getImageData(0, 0, SIZE, SIZE).data;
    let max = 1;
    for (let i = 0; i < px.length; i += 4) max = Math.max(max, px[i], px[i + 1], px[i + 2]);
    const N = SIZE * SIZE;
    const input = new Float32Array(3 * N);
    for (let i = 0; i < N; i++) {
      for (let ch = 0; ch < 3; ch++) input[ch * N + i] = (px[i * 4 + ch] / max - MEAN[ch]) / STD[ch];
    }
    const t = new window.ort.Tensor('float32', input, [1, 3, SIZE, SIZE]);
    const out = await s.run({ [s.inputNames[0]]: t });
    const d = out[s.outputNames[0]].data;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < N; i++) { if (d[i] < lo) lo = d[i]; if (d[i] > hi) hi = d[i]; }
    const range = Math.max(hi - lo, 1e-6);
    const cell = SIZE / G;
    const bits = new Uint8Array(G * G);
    for (let gy = 0; gy < G; gy++) {
      for (let gx = 0; gx < G; gx++) {
        let sum = 0;
        for (let yy = 0; yy < cell; yy++) for (let xx = 0; xx < cell; xx++) sum += d[(gy * cell + yy) * SIZE + gx * cell + xx];
        bits[gy * G + gx] = ((sum / (cell * cell)) - lo) / range > 0.5 ? 1 : 0;
      }
    }
    return bits;
  }

  /** Začne model stahovat dopředu (když se ví, že bude potřeba) */
  function warm() { session().catch(() => { }); }

  window.Subject = { G, decode, detect, warm };
})();
