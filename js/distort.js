/* Zkreslení obrázku pro hádání.
 * Každý režim kreslí do čtvercového canvasu podle "síly" s (0 = skoro nic, 1 = maximum).
 */
(function () {
  'use strict';

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // deterministický generátor náhody (aby se obraz při překreslení neměnil)
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  function shuffled(n, rand) {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const MODES = {
    zoom:    { label: 'Přiblížení', icon: '🔍', desc: 'Uvidíš jen malý výřez, třeba jen proužky nebo skvrny.' },
    blur:    { label: 'Rozmazání', icon: '🌫️', desc: 'Celý obrázek, ale hodně rozmazaný.' },
    pixel:   { label: 'Pixely', icon: '🟪', desc: 'Obrázek složený z velkých čtverečků.' },
    tiles:   { label: 'Okénka', icon: '⬛', desc: 'Část políček je zakrytá černou.' },
    reveal:  { label: 'Odkrývání', icon: '⏳', desc: 'Políčka se postupně odkrývají. Čím dřív uhodneš, tím víc bodů.' },
    shuffle: { label: 'Puzzle', icon: '🧩', desc: 'Obrázek je rozstříhaný a přeházený.' },
    mix:     { label: 'Mix', icon: '🌀', desc: 'Přiblížení a rozmazání najednou. Pro experty.' },
    random:  { label: 'Náhodně', icon: '🎲', desc: 'Každé kolo jiný režim.' },
  };
  const PLAYABLE = ['zoom', 'blur', 'pixel', 'tiles', 'reveal', 'shuffle', 'mix'];

  const DIFFICULTY = [
    { label: 'Lehká', base: 0.5, mult: 1 },
    { label: 'Střední', base: 0.7, mult: 1.5 },
    { label: 'Těžká', base: 0.86, mult: 2 },
    { label: 'Extrémní', base: 1, mult: 3 },
  ];

  /** Vytvoří stav pro jedno kolo. */
  function createState(mode, difficulty, seed) {
    if (mode === 'random') {
      mode = PLAYABLE[Math.floor(rng(seed * 7 + 3)() * PLAYABLE.length)];
    }
    const rand = rng(seed);
    return {
      mode,
      difficulty,
      seed,
      // střed výřezu – většinou je zvíře uprostřed fotky
      cx: lerp(0.3, 0.7, rand()),
      cy: lerp(0.32, 0.68, rand()),
      perm: null,
      misses: 0,
      ease: true,
      startedAt: performance.now(),
      revealDuration: 0,
      finished: false,
    };
  }

  /** Aktuální síla zkreslení 0..1 */
  function strength(st) {
    const base = DIFFICULTY[st.difficulty].base;
    const k = st.ease ? Math.pow(0.68, st.misses) : 1;
    return clamp(base * k, 0, 1);
  }

  // vyřízne ze zdrojového obrázku čtverec (cover) a vrátí obdélník ve zdroji
  function squareRect(img) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const side = Math.min(w, h);
    return { x: (w - side) / 2, y: (h - side) / 2, w: side, h: side, iw: w, ih: h };
  }

  function zoomRect(img, st, s) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const frac = lerp(0.62, 0.085, s); // podíl kratší strany
    const side = Math.min(w, h) * frac;
    let x = st.cx * w - side / 2, y = st.cy * h - side / 2;
    x = clamp(x, 0, w - side); y = clamp(y, 0, h - side);
    return { x, y, w: side, h: side };
  }

  const scratch = document.createElement('canvas');
  const scratch2 = document.createElement('canvas');

  function drawBlurred(ctx, img, r, size, s) {
    // rozmazání přes zmenšení a zvětšení (funguje ve všech prohlížečích, i v Safari)
    const small = Math.max(3, Math.round(lerp(70, 5, s)));
    scratch.width = small; scratch.height = small;
    const c = scratch.getContext('2d');
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, small, small);
    const mid = Math.min(size, small * 4);
    scratch2.width = mid; scratch2.height = mid;
    const c2 = scratch2.getContext('2d');
    c2.imageSmoothingEnabled = true; c2.imageSmoothingQuality = 'high';
    c2.drawImage(scratch, 0, 0, mid, mid);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(scratch2, 0, 0, size, size);
  }

  function drawPixel(ctx, img, r, size, blocks) {
    scratch.width = blocks; scratch.height = blocks;
    const c = scratch.getContext('2d');
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'medium';
    c.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, blocks, blocks);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scratch, 0, 0, blocks, blocks, 0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
  }

  function coverTiles(ctx, size, grid, visibleCount, st, color) {
    if (!st.perm || st.perm.length !== grid * grid) st.perm = shuffled(grid * grid, rng(st.seed + 11));
    const cell = size / grid;
    ctx.fillStyle = color;
    for (let k = visibleCount; k < st.perm.length; k++) {
      const i = st.perm[k];
      const gx = i % grid, gy = Math.floor(i / grid);
      ctx.fillRect(Math.floor(gx * cell), Math.floor(gy * cell), Math.ceil(cell) + 1, Math.ceil(cell) + 1);
    }
  }

  /**
   * Vykreslí obrázek. Vrací případně info (např. podíl odkrytí u režimu reveal).
   */
  function render(canvas, img, st, now) {
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, size, size);
    const s = strength(st);
    const sq = squareRect(img);
    const info = {};

    switch (st.mode) {
      case 'zoom': {
        const r = zoomRect(img, st, s);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, size, size);
        break;
      }
      case 'blur':
        drawBlurred(ctx, img, sq, size, s);
        break;
      case 'pixel': {
        const blocks = Math.max(4, Math.round(lerp(42, 6, s)));
        drawPixel(ctx, img, sq, size, blocks);
        break;
      }
      case 'tiles': {
        ctx.drawImage(img, sq.x, sq.y, sq.w, sq.h, 0, 0, size, size);
        const grid = 10;
        const visible = Math.round(grid * grid * lerp(0.62, 0.1, s));
        coverTiles(ctx, size, grid, visible, st, '#0b0b0b');
        break;
      }
      case 'reveal': {
        ctx.drawImage(img, sq.x, sq.y, sq.w, sq.h, 0, 0, size, size);
        const grid = 8;
        const total = grid * grid;
        const dur = st.revealDuration || (st.revealDuration = lerp(22, 50, DIFFICULTY[st.difficulty].base) * 1000);
        const elapsed = (now || performance.now()) - st.startedAt;
        // každá chyba odkryje pár políček navíc
        const start = Math.round(total * lerp(0.08, 0.02, s)) + st.misses * 4;
        const frac = clamp(elapsed / dur, 0, 1);
        const visible = st.finished ? total : clamp(start + Math.floor(frac * (total - start)), 0, total);
        coverTiles(ctx, size, grid, visible, st, '#0b0b0b');
        info.revealed = visible / total;
        break;
      }
      case 'shuffle': {
        const grid = Math.round(lerp(3, 7, s));
        const total = grid * grid;
        if (!st.shuffle || st.shuffle.grid !== grid) {
          let p = shuffled(total, rng(st.seed + 5));
          // ať není žádný kousek na svém místě (pokud to jde)
          for (let i = 0; i < total; i++) if (p[i] === i) { const j = (i + 1) % total; [p[i], p[j]] = [p[j], p[i]]; }
          st.shuffle = { grid, perm: p };
        }
        const cell = size / grid, src = sq.w / grid;
        const p = st.shuffle.perm;
        for (let i = 0; i < total; i++) {
          const from = p[i];
          const sx = sq.x + (from % grid) * src, sy = sq.y + Math.floor(from / grid) * src;
          const dx = (i % grid) * cell, dy = Math.floor(i / grid) * cell;
          ctx.drawImage(img, sx, sy, src, src, Math.floor(dx), Math.floor(dy), Math.ceil(cell), Math.ceil(cell));
        }
        ctx.strokeStyle = 'rgba(0,0,0,.55)';
        ctx.lineWidth = Math.max(1, size / 300);
        for (let i = 1; i < grid; i++) {
          ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, size); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(size, i * cell); ctx.stroke();
        }
        break;
      }
      case 'mix': {
        const r = zoomRect(img, st, s * 0.75);
        drawBlurred(ctx, img, r, size, s * 0.55);
        break;
      }
      default:
        ctx.drawImage(img, sq.x, sq.y, sq.w, sq.h, 0, 0, size, size);
    }
    return info;
  }

  /** Celý obrázek (na konci kola) – vejde se celý, okraje rozmazané pozadí */
  function renderFull(canvas, img) {
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const sq = squareRect(img);
    drawBlurred(ctx, img, sq, size, 0.75);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(0, 0, size, size);
    const scale = Math.min(size / sq.iw, size / sq.ih);
    const w = sq.iw * scale, h = sq.ih * scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  }

  /** Náhled "puzzle" – po chybě opraví několik dílků na správné místo */
  function onMiss(st) {
    st.misses++;
    if (st.mode === 'shuffle' && st.shuffle && st.ease) {
      // přepočítá se mřížka podle nové síly (menší = lehčí), nic dalšího netřeba
      st.shuffle = null;
    }
  }

  window.Distort = { MODES, PLAYABLE, DIFFICULTY, createState, render, renderFull, onMiss, strength, rng, shuffled };
})();
