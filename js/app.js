/* Hádej zvířata – hlavní logika hry */
(function () {
  'use strict';

  const VERSION = '1.0.0';
  const IMG_CACHE = 'hz-img-v1';

  // ------------------------------------------------------------ pomocné
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('hz.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('hz.' + k, JSON.stringify(v)); } catch (e) { /* nic */ } },
  };
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const withTimeout = (p, ms) => Promise.race([p, sleep(ms).then(() => { throw new Error('timeout'); })]);

  let toastTimer;
  function toast(msg, ms = 2600, onClick) {
    const t = $('#toast');
    t.innerHTML = msg;
    t.classList.remove('hidden');
    t.onclick = onClick || (() => t.classList.add('hidden'));
    clearTimeout(toastTimer);
    if (ms) toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
  }

  // ------------------------------------------------------------ data
  const ANIMALS = (window.DATA_ANIMALS || []).map(a => ({ ...a, theme: 'animals' }));
  const LANDMARKS = (window.DATA_LANDMARKS || []).map(l => ({ ...l, theme: 'landmarks' }));
  const ALL_ITEMS = [...ANIMALS, ...LANDMARKS];
  const BY_ID = new Map(ALL_ITEMS.map(i => [i.id, i]));

  const OTHER = ['pavoukovec', 'měkkýš', 'korýš', 'bezobratlý'];
  const GROUPS = [
    { v: 'savec', label: '🦁 Savci' }, { v: 'pták', label: '🐦 Ptáci' }, { v: 'plaz', label: '🦎 Plazi' },
    { v: 'obojživelník', label: '🐸 Obojživelníci' }, { v: 'ryba', label: '🐟 Ryby' }, { v: 'hmyz', label: '🐞 Hmyz' },
    { v: 'ostatní', label: '🦀 Pavouci, korýši a další' },
  ];
  const CONTINENTS = [
    { v: 'Evropa', label: '🏰 Evropa' }, { v: 'Asie', label: '🏯 Asie' }, { v: 'Afrika', label: '🐪 Afrika' },
    { v: 'Amerika', label: '🗽 Amerika' }, { v: 'Austrálie', label: '🦘 Austrálie a Oceánie' },
  ];
  const GROUP_TEXT = {
    savec: 'savec', pták: 'pták', plaz: 'plaz', obojživelník: 'obojživelník', ryba: 'ryba', hmyz: 'hmyz',
    pavoukovec: 'pavoukovec (příbuzný pavouků)', měkkýš: 'měkkýš', korýš: 'korýš', bezobratlý: 'bezobratlý živočich',
  };
  const DIET_TEXT = {
    b: 'Živí se hlavně rostlinami.', m: 'Živí se hlavně jinými živočichy.', v: 'Je to všežravec.',
    f: 'Potravu si filtruje z vody.',
  };
  const groupOf = it => OTHER.includes(it.group) ? 'ostatní' : it.group;

  // ------------------------------------------------------------ nastavení
  const DEFAULTS = {
    theme: 'animals', mode: 'zoom', diff: 1, groups: GROUPS.map(g => g.v), continents: CONTINENTS.map(c => c.v),
    players: 1, names: ['', ''], rounds: 10, online: true, ease: true, timer: false, precise: false,
  };
  let settings = { ...DEFAULTS, ...store.get('settings', {}) };
  const saveSettings = () => store.set('settings', settings);

  // ------------------------------------------------------------ navigace
  function show(id) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    if (id === 'home') renderHome();
    if (id === 'setup') renderSetup();
    if (id === 'collection') renderCollection();
    if (id === 'stats') renderStats();
    if (id === 'about') renderAbout();
    window.scrollTo(0, 0);
  }
  $$('[data-go]').forEach(b => b.addEventListener('click', () => show(b.dataset.go)));

  // ------------------------------------------------------------ domovská obrazovka
  function summaryText(s) {
    const theme = { animals: 'Zvířata', landmarks: 'Místa', both: 'Zvířata i místa' }[s.theme];
    const r = s.rounds ? `${s.rounds} kol` : 'nekonečno';
    return `${theme} · ${Distort.MODES[s.mode].icon} ${Distort.MODES[s.mode].label} · ${Distort.DIFFICULTY[s.diff].label} · ${r}` +
      (s.precise && s.theme !== 'landmarks' ? ' · 🔬 s druhem' : '') + (s.players === 2 ? ' · 👥 ve dvou' : '');
  }
  function renderHome() {
    $('#quickSummary').textContent = summaryText(settings);
    const d = store.get('daily', {})[todayKey()];
    $('#dailyBadge').textContent = d ? `✓ ${d.score} b.` : 'nová';
    $('#dailyBadge').classList.toggle('done', !!d);
    updateNet();
  }

  function updateNet() {
    const on = Online.isOnline();
    $('#netStatus').textContent = on ? '🌐 Online' : '✈️ Offline';
    $('#netStatus').classList.toggle('off', !on);
  }
  window.addEventListener('online', updateNet);
  window.addEventListener('offline', updateNet);

  // ------------------------------------------------------------ nastavení hry
  let previewImg = null, previewState = null;

  function seg(el, value, onPick) {
    $$(el + ' button').forEach(b => {
      b.classList.toggle('on', String(b.dataset.v) === String(value));
      b.onclick = () => { onPick(b.dataset.v); };
    });
  }

  function chips(el, all, selected, onChange) {
    const box = $(el);
    box.innerHTML = '';
    all.forEach(g => {
      const b = document.createElement('button');
      b.textContent = g.label;
      b.className = selected.includes(g.v) ? 'on' : '';
      b.onclick = () => {
        let next = selected.includes(g.v) ? selected.filter(x => x !== g.v) : [...selected, g.v];
        if (!next.length) { toast('Aspoň jedna skupina musí zůstat zapnutá.'); return; }
        onChange(next);
      };
      box.appendChild(b);
    });
  }

  function renderSetup() {
    seg('#optTheme', settings.theme, v => { settings.theme = v; saveSettings(); renderSetup(); });

    const modes = $('#optMode');
    modes.innerHTML = '';
    Object.entries(Distort.MODES).forEach(([k, m]) => {
      const b = document.createElement('button');
      b.className = 'mode' + (settings.mode === k ? ' on' : '');
      b.innerHTML = `<span class="mi">${m.icon}</span><span>${m.label}</span>`;
      b.onclick = () => { settings.mode = k; saveSettings(); renderSetup(); };
      modes.appendChild(b);
    });
    $('#modeDesc').textContent = Distort.MODES[settings.mode].desc;

    const diff = $('#optDiff');
    diff.innerHTML = '';
    Distort.DIFFICULTY.forEach((d, i) => {
      const b = document.createElement('button');
      b.dataset.v = i;
      b.textContent = d.label;
      diff.appendChild(b);
    });
    seg('#optDiff', settings.diff, v => { settings.diff = +v; saveSettings(); renderSetup(); });
    $('#diffDesc').textContent = `Body ×${String(Distort.DIFFICULTY[settings.diff].mult).replace('.', ',')}`;

    seg('#optPrecise', settings.precise ? 1 : 0, v => { settings.precise = v === '1'; saveSettings(); renderSetup(); });
    $('#preciseDesc').innerHTML = settings.precise
      ? 'Musíš napsat celý název i s druhem, např. <b>sojka obecná</b> nebo <b>orel skalní</b>. Body ×1,25.'
      : 'Stačí poznat, o jaké zvíře jde, např. <b>sojka</b> nebo <b>orel</b>. Druh („obecná“, „skalní“) psát nemusíš.';
    $('#fieldPrecise').classList.toggle('hidden', settings.theme === 'landmarks');
    $('#fieldGroups').classList.toggle('hidden', settings.theme === 'landmarks');
    $('#fieldContinents').classList.toggle('hidden', settings.theme === 'animals');
    chips('#optGroups', GROUPS, settings.groups, v => { settings.groups = v; saveSettings(); renderSetup(); });
    chips('#optContinents', CONTINENTS, settings.continents, v => { settings.continents = v; saveSettings(); renderSetup(); });

    seg('#optPlayers', settings.players, v => { settings.players = +v; saveSettings(); renderSetup(); });
    $('#playerNames').classList.toggle('hidden', settings.players !== 2);
    $('#p1name').value = settings.names[0] || '';
    $('#p2name').value = settings.names[1] || '';

    seg('#optRounds', settings.rounds, v => { settings.rounds = +v; saveSettings(); renderSetup(); });
    $('#roundsSub').textContent = settings.players === 2 && settings.rounds ? '(pro každého hráče)' : '';

    $('#optOnline').checked = settings.online;
    $('#optEase').checked = settings.ease;
    $('#optTimer').checked = settings.timer;

    const n = offlinePool(settings).length;
    $('#btnStart').textContent = n ? '▶ Začít hru' : '⚠️ Žádné obrázky pro tento výběr';
    drawPreview();
  }

  ['#p1name', '#p2name'].forEach((sel, i) => $(sel).addEventListener('input', e => {
    settings.names[i] = e.target.value.trim(); saveSettings();
  }));
  $('#optOnline').addEventListener('change', e => { settings.online = e.target.checked; saveSettings(); });
  $('#optEase').addEventListener('change', e => { settings.ease = e.target.checked; saveSettings(); drawPreview(); });
  $('#optTimer').addEventListener('change', e => { settings.timer = e.target.checked; saveSettings(); });

  function drawPreview(newImage) {
    const pool = offlinePool(settings);
    const canvas = $('#previewCanvas');
    if (!pool.length) { canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); return; }
    const go = () => {
      const mode = settings.mode === 'random' ? 'random' : settings.mode;
      previewState = Distort.createState(mode, settings.diff, (Math.random() * 1e9) | 0);
      previewState.ease = settings.ease;
      if (previewState.mode === 'reveal') previewState.startedAt = performance.now() - 6000;
      Distort.render(canvas, previewImg, previewState);
    };
    if (!previewImg || newImage || !pool.some(p => p.img && previewImg.dataset.src === p.img)) {
      const it = pick(pool);
      loadImage(it.img).then(img => { img.dataset.src = it.img; previewImg = img; go(); }).catch(() => { });
    } else go();
  }
  $('#previewCanvas').addEventListener('click', () => drawPreview(true));

  // ------------------------------------------------------------ výběr položek
  function matchesFilter(it, s) {
    if (it.theme === 'animals') return s.theme !== 'landmarks' && s.groups.includes(groupOf(it));
    if (it.theme === 'landmarks') {
      if (s.theme === 'animals') return false;
      return s.continents.some(c => (it.continent || '').includes(c));
    }
    return false;
  }
  // fotky z internetu (místa z Wikimedia), které už jsou uložené v telefonu
  const readyRemote = new Set();
  const isRemote = it => /^https?:/.test(it.img);
  const usable = it => !isRemote(it) || Online.isOnline() || readyRemote.has(it.img);
  const offlinePool = s => ALL_ITEMS.filter(it => it.img && !it.online && matchesFilter(it, s) && usable(it));
  const onlineLandmarks = s => LANDMARKS.filter(it => it.online && matchesFilter(it, s));

  function pickOffline(s, used) {
    const pool = offlinePool(s);
    const recent = new Set(store.get('recent', []));
    const col = store.get('collection', {});
    let cands = pool.filter(i => !used.has(i.id) && !recent.has(i.id));
    if (!cands.length) cands = pool.filter(i => !used.has(i.id));
    if (!cands.length) cands = pool;
    // nesbíraná mají dvojnásobnou šanci
    const weighted = [];
    cands.forEach(i => { weighted.push(i); if (!col[i.id]) weighted.push(i); });
    return pick(weighted);
  }

  function rememberRecent(id) {
    const r = store.get('recent', []).filter(x => x !== id);
    r.push(id);
    const max = Math.max(10, Math.floor(offlinePool(settings).length * 0.6));
    store.set('recent', r.slice(-max));
  }

  function loadImage(src, ms = 15000) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      const t = setTimeout(() => { img.src = ''; reject(new Error('timeout')); }, ms);
      img.onload = () => { clearTimeout(t); resolve(img); };
      img.onerror = () => { clearTimeout(t); reject(new Error('img error')); };
      img.src = src;
    });
  }

  /** Připraví další kolo: vybere položku a načte obrázek (a online nápovědy). */
  async function prepareItem(s, used, forced) {
    if (forced) {
      const img = await loadImage(forced.img);
      return { item: forced, img, detail: null };
    }
    const online = s.online && Online.isOnline();
    let theme = s.theme === 'both' ? (Math.random() < 0.5 ? 'animals' : 'landmarks') : s.theme;
    const local = { ...s, theme };
    if (!offlinePool(local).length) local.theme = s.theme;

    if (online && Math.random() < 0.5) {
      try {
        if (local.theme === 'landmarks' || (local.theme === 'both' && Math.random() < 0.5)) {
          const cands = onlineLandmarks(local).filter(i => !used.has(i.id));
          if (cands.length) {
            const it = { ...pick(cands) };
            const w = await withTimeout(Online.landmarkImage(it), 9000);
            if (w) {
              it.img = w.img; it.csTitle = w.cs;
              it.credit = 'Wikimedia Commons'; it.license = 'CC / volné dílo';
              it.source = 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(w.file || '');
              const img = await loadImage(it.img, 12000);
              return { item: it, img, detail: null };
            }
          }
        } else {
          const exclude = new Set([...ANIMALS.map(a => a.sci.toLowerCase()), ...used]);
          const it = await withTimeout(Online.randomAnimal(local.groups, exclude), 12000);
          if (it) {
            const [img, detail] = await Promise.all([
              loadImage(it.img, 12000),
              withTimeout(Online.animalDetail(it.inat), 8000).catch(() => null),
            ]);
            return { item: it, img, detail };
          }
        }
      } catch (e) {
        console.warn('Online položka selhala, beru offline', e);
      }
    }
    for (let i = 0; i < 4; i++) {
      const it = pickOffline(local, used);
      try {
        const img = await loadImage(it.img);
        return { item: it, img, detail: null };
      } catch (e) { used.add(it.id); }
    }
    throw new Error('Nepodařilo se načíst obrázek');
  }

  // ------------------------------------------------------------ nápovědy
  function letterPattern(name) {
    const words = name.trim().split(/\s+/);
    const count = name.replace(/[\s\-]/g, '').length;
    const pat = words.map((w, i) => [...w].map((c, j) => (i === 0 && j === 0) ? c.toUpperCase() : (c === '-' ? '-' : '_')).join(' ')).join('   ');
    return `Začíná na „${name.charAt(0).toUpperCase()}“: <span class="pattern">${esc(pat)}</span> (${count} písmen)`;
  }

  function buildHints(item, detail) {
    const h = [];
    if (item.theme === 'animals') {
      h.push(item.group === 'savec' ? 'Je to savec.' : 'Není to savec.');
      if (item.online) {
        if (item.group !== 'savec') h.push(`Je to ${GROUP_TEXT[item.group] || 'živočich'}.`);
        if (detail && detail.order) h.push(`Patří do řádu: ${detail.order}.`);
        if (detail && detail.family) h.push(`Čeleď: ${detail.family}.`);
        if (item.en) h.push(`Anglicky se mu říká „${item.en}“.`);
      } else {
        h.push((item.group !== 'savec' ? `Je to ${GROUP_TEXT[item.group]}. ` : '') + (DIET_TEXT[item.diet] || ''));
        h.push(`Kde žije: ${item.region}.`);
        h.push(item.hint);
      }
    } else {
      h.push(item.kind === 'příroda' ? 'Je to přírodní místo.' : 'Je to stavba, kterou postavili lidé.');
      h.push(`Kontinent: ${item.continent}.`);
      h.push(`Země: ${item.country}.`);
      h.push(item.hint);
    }
    h.push(letterPattern(item.name));
    return h;
  }

  // ------------------------------------------------------------ hra
  let game = null;
  let round = null;
  let rafId = 0, timerId = 0;

  function newGame(s, opts = {}) {
    const names = s.players === 2
      ? [s.names[0] || 'Hráč 1', s.names[1] || 'Hráč 2']
      : [s.names[0] || 'Ty'];
    game = {
      s: { ...s },
      daily: opts.daily || null,
      players: names.map(n => ({ name: n, score: 0, ok: 0 })),
      turn: 0,
      total: s.rounds ? s.rounds * names.length : Infinity,
      used: new Set(),
      history: [],
      next: null,
      queue: opts.queue || null,
    };
    show('game');
    nextTurn();
  }

  function queueNext() {
    if (!game) return;
    const idx = game.turn + 1;
    if (idx >= game.total) { game.next = null; return; }
    const forced = game.queue ? game.queue[idx] : null;
    game.next = prepareItem(game.s, game.used, forced).catch(e => e);
  }

  async function nextTurn() {
    if (!game) return;
    if (game.turn >= game.total) { endGame(); return; }
    const player = game.players[game.turn % game.players.length];

    if (game.players.length > 1) {
      $('#turnName').textContent = player.name;
      $('#turnScore').textContent = game.players.map(p => `${p.name}: ${p.score}`).join('  ·  ');
      $('#turnOverlay').classList.remove('hidden');
      await new Promise(r => { $('#btnTurnGo').onclick = r; });
      $('#turnOverlay').classList.add('hidden');
    }

    $('#loading').classList.remove('hidden');
    $('#feedback').textContent = '';
    $('#feedback').className = 'feedback';
    $('#hintList').innerHTML = '';
    let prepared = game.next;
    game.next = null;
    if (!prepared) {
      const forced = game.queue ? game.queue[game.turn] : null;
      prepared = prepareItem(game.s, game.used, forced).catch(e => e);
    }
    let res = await prepared;
    if (!game) return;
    if (res instanceof Error) {
      // zkusí to ještě jednou offline
      res = await prepareItem({ ...game.s, online: false }, game.used).catch(e => e);
      if (res instanceof Error) {
        $('#loading').classList.add('hidden');
        toast('Nepodařilo se načíst obrázek. 😕');
        quitToHome();
        return;
      }
    }
    if (!game) return;
    game.used.add(res.item.id);
    if (res.item.sci) game.used.add(res.item.sci.toLowerCase());
    startRound(res, player);
    queueNext();
  }

  function startRound({ item, img, detail }, player) {
    const seed = game.daily ? (game.daily.seed * 31 + game.turn) : (Math.random() * 1e9) | 0;
    const mode = game.daily ? game.daily.mode : game.s.mode;
    const st = Distort.createState(mode, game.s.diff, seed);
    st.ease = game.s.ease;
    round = {
      item, img, detail, player, st,
      attempts: 3, hints: buildHints(item, detail), hintsUsed: 0, closeUsed: false,
      started: Date.now(), done: false, timeLeft: game.s.timer ? 60 : null,
    };
    $('#loading').classList.add('hidden');
    $('#modeTag').textContent = `${Distort.MODES[st.mode].icon} ${Distort.MODES[st.mode].label}`;
    $('#sourceTag').classList.toggle('hidden', !item.online);
    updateGameUI();
    draw();
    cancelAnimationFrame(rafId);
    if (st.mode === 'reveal') {
      let last = 0;
      const loop = t => {
        if (!round || round.done) return;
        if (t - last > 150) { draw(); last = t; }
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
    }
    clearInterval(timerId);
    $('#timer').classList.toggle('hidden', !round.timeLeft);
    if (round.timeLeft) {
      $('#timer').textContent = round.timeLeft;
      timerId = setInterval(() => {
        if (!round || round.done) { clearInterval(timerId); return; }
        round.timeLeft--;
        $('#timer').textContent = round.timeLeft;
        $('#timer').classList.toggle('warn', round.timeLeft <= 10);
        if (round.timeLeft <= 0) { clearInterval(timerId); finishRound(false, '⏰ Čas vypršel!'); }
      }, 1000);
    }
    const input = $('#guessInput');
    input.value = '';
    input.placeholder = item.theme === 'landmarks' ? 'Co je to za místo?' : 'Co je to za zvíře?';
    // na mobilu klávesnice nevyskakuje hned, aby byl vidět obrázek
    if (window.matchMedia('(pointer: fine)').matches) input.focus();
  }

  function draw() {
    if (!round) return;
    round.info = Distort.render($('#gameCanvas'), round.img, round.st);
  }

  function updateGameUI() {
    const g = game, r = round;
    const per = g.players.length;
    const roundNo = Math.floor(g.turn / per) + 1;
    const totalR = g.total === Infinity ? '∞' : g.total / per;
    $('#roundInfo').textContent = g.daily ? `Denní výzva ${roundNo}/${totalR}` : `Kolo ${roundNo}/${totalR}`;
    $('#playerInfo').textContent = per > 1 ? `👤 ${r.player.name}` : '';
    $('#scoreInfo').textContent = r.player.score;
    $('#attempts').innerHTML = [0, 1, 2].map(i => `<span class="dot ${i < r.attempts ? 'on' : ''}"></span>`).join('') +
      `<span class="att-label">${r.attempts} ${r.attempts === 1 ? 'pokus' : 'pokusy'}</span>`;
    const left = r.hints.length - r.hintsUsed;
    $('#btnHint').disabled = left <= 0 || r.done;
    $('#hintCost').textContent = left > 0 ? `(−15 b. · zbývá ${left})` : '(žádná další)';
  }

  function showHint() {
    if (!round || round.done || round.hintsUsed >= round.hints.length) return;
    const li = document.createElement('li');
    li.innerHTML = `💡 ${round.hints[round.hintsUsed]}`;
    $('#hintList').appendChild(li);
    round.hintsUsed++;
    updateGameUI();
    li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  $('#btnHint').addEventListener('click', showHint);

  function feedback(msg, cls) {
    const f = $('#feedback');
    f.innerHTML = msg;
    f.className = 'feedback ' + (cls || '');
    void f.offsetWidth;
    f.classList.add('pop');
  }

  $('#guessForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!round || round.done) return;
    const input = $('#guessInput');
    const guess = input.value.trim();
    if (!guess) { input.focus(); return; }
    const res = Match.check(guess, round.item, { strict: game.s.precise });
    if (res === 'correct') { finishRound(true); return; }
    if (res === 'close' && !round.closeUsed) {
      round.closeUsed = true;
      feedback(game.s.precise && round.item.theme === 'animals'
        ? '🤏 Skoro! Správné zvíře, ale napiš i druh. <small>(pokus se nepočítá)</small>'
        : '🤏 Skoro! Zkus to upřesnit. <small>(pokus se nepočítá)</small>', 'close');
      input.select();
      return;
    }
    round.attempts--;
    Distort.onMiss(round.st);
    draw();
    $('#canvasWrap').classList.remove('shake'); void $('#canvasWrap').offsetWidth; $('#canvasWrap').classList.add('shake');
    if (navigator.vibrate) navigator.vibrate(60);
    if (round.attempts <= 0) { finishRound(false); return; }
    const other = Match.findItem(guess, ALL_ITEMS);
    const msg = other && other.id !== round.item.id ? `❌ Není to ${esc(other.name)}.` : `❌ „${esc(guess)}“ to není.`;
    feedback(msg + (round.st.ease ? ' Obrázek je teď o kousek lehčí.' : ''), 'wrong');
    input.value = '';
    updateGameUI();
  });

  $('#btnGiveUp').addEventListener('click', () => { if (round && !round.done) finishRound(false); });

  function calcPoints(ok) {
    if (!ok) return 0;
    const usedAttempts = 3 - round.attempts; // 0, 1, 2
    let p = [100, 60, 35][usedAttempts] - 15 * round.hintsUsed;
    p = Math.max(10, p);
    p *= Distort.DIFFICULTY[round.st.difficulty].mult;
    if (game.s.precise && round.item.theme === 'animals') p *= 1.25;
    if (round.st.mode === 'reveal' && round.info && round.info.revealed != null) p *= 1 + (1 - round.info.revealed);
    if (round.timeLeft != null) p *= 1 + round.timeLeft / 120;
    return Math.round(p);
  }

  function finishRound(ok, reason) {
    if (!round || round.done) return;
    round.done = true;
    cancelAnimationFrame(rafId);
    clearInterval(timerId);
    const pts = calcPoints(ok);
    round.player.score += pts;
    if (ok) round.player.ok++;
    const it = round.item;
    const entry = { item: it, ok, pts, player: round.player.name, tries: 3 - round.attempts + (ok ? 1 : 0), hints: round.hintsUsed, mode: round.st.mode };
    game.history.push(entry);
    recordStats(entry);
    if (!it.online) rememberRecent(it.id);
    if (ok) addToCollection(it);
    if (ok && navigator.vibrate) navigator.vibrate([30, 40, 30]);

    // výsledek
    $('#resultHead').innerHTML = ok
      ? `<span class="ok">✅ Správně!</span>`
      : `<span class="bad">${reason || '❌ Tentokrát ne.'} Bylo to:</span>`;
    Distort.renderFull($('#resultCanvas'), round.img);
    $('#resultName').textContent = cap(it.name);
    $('#resultSci').innerHTML = it.sci ? `<i>${esc(it.sci)}</i>` : esc(it.country || '');
    $('#resultPoints').textContent = ok ? `+${pts} bodů` : '0 bodů';
    $('#resultPoints').className = 'points ' + (ok ? 'ok' : 'bad');
    const factEl = $('#resultFact');
    factEl.textContent = it.hint || '';
    loadFact(it, round.detail).then(f => { if (f && $('#resultName').textContent === cap(it.name)) factEl.textContent = f; });
    $('#resultCredit').innerHTML = creditHtml(it);
    const last = game.turn + 1 >= game.total;
    $('#btnNext').textContent = last ? 'Výsledky ›' : 'Další ›';
    $('#resultOverlay').classList.remove('hidden');
    $('#resultOverlay .sheet').scrollTop = 0;
    document.activeElement && document.activeElement.blur();
    updateGameUI();
  }

  async function loadFact(it, detail) {
    if (!Online.isOnline()) return '';
    try {
      if (it.theme === 'animals' && it.inat) {
        const d = detail || await withTimeout(Online.animalDetail(it.inat), 7000);
        return d && d.fact;
      }
      if (it.theme === 'landmarks') {
        let cs = it.csTitle;
        if (!cs) { const w = await withTimeout(Online.landmarkImage(it), 7000); cs = w && w.cs; }
        return await withTimeout(Online.wikiFact(cs), 7000);
      }
    } catch (e) { /* bez zajímavosti */ }
    return '';
  }

  function creditHtml(it) {
    if (!it.credit) return '';
    const lic = it.license ? ` · ${esc(String(it.license).toUpperCase())}` : '';
    const src = it.source ? ` · <a href="${esc(it.source)}" target="_blank" rel="noopener">zdroj</a>` : '';
    return `📷 ${esc(it.credit)}${lic}${src}`;
  }

  $('#btnNext').addEventListener('click', () => {
    $('#resultOverlay').classList.add('hidden');
    if (!game) return;
    game.turn++;
    nextTurn();
  });

  function quitToHome() {
    cancelAnimationFrame(rafId);
    clearInterval(timerId);
    game = null; round = null;
    $$('.overlay').forEach(o => o.classList.add('hidden'));
    show('home');
  }

  $('#btnQuit').addEventListener('click', () => {
    if (!game) return show('home');
    if (game.history.length && !game.daily) {
      if (confirm('Ukončit hru a ukázat výsledky?')) { if (round) round.done = true; endGame(); }
    } else if (confirm('Opravdu ukončit hru?')) {
      quitToHome();
    }
  });

  function endGame() {
    cancelAnimationFrame(rafId);
    clearInterval(timerId);
    const g = game;
    if (!g) return;
    const stats = store.get('stats', {});
    stats.games = (stats.games || 0) + 1;
    stats.best = Math.max(stats.best || 0, ...g.players.map(p => p.score));
    store.set('stats', stats);

    const ps = [...g.players].sort((a, b) => b.score - a.score);
    let title = 'Konec hry';
    if (g.players.length > 1) title = ps[0].score === ps[1].score ? '🤝 Remíza!' : `🏆 Vyhrává ${ps[0].name}!`;
    else {
      const ok = g.history.filter(h => h.ok).length;
      title = ok === g.history.length && ok ? '🌟 Bez chyby!' : `Uhodnuto ${ok} z ${g.history.length}`;
    }
    if (g.daily) title = '📅 Denní výzva hotová';
    $('#endTitle').textContent = title;
    $('#endScores').innerHTML = g.players.map(p =>
      `<div class="end-score"><span>${esc(p.name)}</span><b>${p.score}</b><small>${p.ok} uhodnuto</small></div>`).join('');
    $('#endList').innerHTML = g.history.map(h =>
      `<li class="${h.ok ? 'ok' : 'bad'}"><span>${h.ok ? '✅' : '❌'} ${esc(cap(h.item.name))}</span>` +
      `<span>${g.players.length > 1 ? esc(h.player) + ' · ' : ''}${h.pts} b.</span></li>`).join('');

    $('#endShare').classList.toggle('hidden', !g.daily);
    if (g.daily) {
      const marks = g.history.map(h => !h.ok ? '🟥' : h.tries === 1 && !h.hints ? '🟩' : '🟨').join('');
      const score = g.players[0].score;
      const d = new Date();
      const text = `Hádej zvířata 📅 ${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}\n` +
        `${Distort.MODES[g.daily.mode].icon} ${Distort.MODES[g.daily.mode].label}\n${marks}  ${score} b.`;
      const all = store.get('daily', {});
      all[todayKey()] = { score, marks, text };
      store.set('daily', all);
      $('#shareText').textContent = text;
    }
    game = null; round = null;
    $('#endOverlay').classList.remove('hidden');
  }

  $('#btnEndHome').addEventListener('click', () => { $('#endOverlay').classList.add('hidden'); show('home'); });
  $('#btnAgain').addEventListener('click', () => {
    $('#endOverlay').classList.add('hidden');
    if ($('#endShare').classList.contains('hidden')) newGame(settings);
    else show('home');
  });
  $('#btnShare').addEventListener('click', async () => {
    const text = $('#shareText').textContent;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast('Zkopírováno do schránky 📋'); }
    } catch (e) { /* zrušeno */ }
  });

  $('#btnQuick').addEventListener('click', () => startWith(settings));
  $('#btnStart').addEventListener('click', () => startWith(settings));

  function startWith(s) {
    if (!offlinePool(s).length) { toast('Pro tento výběr nejsou žádné obrázky. Uprav skupiny.'); show('setup'); return; }
    newGame(s);
  }

  // ------------------------------------------------------------ denní výzva
  $('#btnDaily').addEventListener('click', () => {
    const key = todayKey();
    const done = store.get('daily', {})[key];
    if (done) {
      $('#endTitle').textContent = '📅 Dnešní výzvu už máš';
      $('#endScores').innerHTML = `<div class="end-score"><span>Výsledek</span><b>${done.score}</b><small>${done.marks}</small></div>`;
      $('#endList').innerHTML = '<li>Zítra tu bude nová. 🦓</li>';
      $('#shareText').textContent = done.text || '';
      $('#endShare').classList.remove('hidden');
      $('#endOverlay').classList.remove('hidden');
      return;
    }
    const seed = +key.replace(/-/g, '');
    const rand = Distort.rng(seed);
    const pool = ANIMALS.filter(a => a.img);
    const order = Distort.shuffled(pool.length, rand);
    const queue = order.slice(0, 5).map(i => pool[i]);
    const modes = Distort.PLAYABLE;
    const mode = modes[Math.floor(rand() * modes.length)];
    const s = { ...settings, theme: 'animals', mode, diff: 1, players: 1, rounds: 5, online: false, ease: true, timer: false, precise: false, groups: GROUPS.map(g => g.v) };
    newGame(s, { daily: { seed, mode }, queue });
  });

  // ------------------------------------------------------------ statistiky a sbírka
  function recordStats(e) {
    const st = store.get('stats', {});
    st.rounds = (st.rounds || 0) + 1;
    st.correct = (st.correct || 0) + (e.ok ? 1 : 0);
    st.points = (st.points || 0) + e.pts;
    st.hints = (st.hints || 0) + e.hints;
    st.streak = e.ok ? (st.streak || 0) + 1 : 0;
    st.bestStreak = Math.max(st.bestStreak || 0, st.streak);
    st.firstTry = (st.firstTry || 0) + (e.ok && e.tries === 1 ? 1 : 0);
    st.byMode = st.byMode || {};
    const m = st.byMode[e.mode] = st.byMode[e.mode] || { r: 0, c: 0 };
    m.r++; if (e.ok) m.c++;
    st.items = st.items || {};
    const it = st.items[e.item.id] = st.items[e.item.id] || { r: 0, c: 0, n: e.item.name };
    it.r++; if (e.ok) it.c++;
    store.set('stats', st);
  }

  function addToCollection(it) {
    const col = store.get('collection', {});
    const prev = col[it.id];
    col[it.id] = prev ? { ...prev, n: (prev.n || 1) + 1 } : {
      d: todayKey(), n: 1,
      ...(it.online ? { name: it.name, sci: it.sci, img: it.img, thumb: it.thumb || it.img, credit: it.credit, license: it.license, source: it.source, theme: it.theme } : {}),
    };
    store.set('collection', col);
  }

  let colTab = 'animals';
  $$('#colTabs button').forEach(b => b.addEventListener('click', () => { colTab = b.dataset.v; renderCollection(); }));

  function renderCollection() {
    $$('#colTabs button').forEach(b => b.classList.toggle('on', b.dataset.v === colTab));
    const col = store.get('collection', {});
    const grid = $('#colGrid');
    grid.innerHTML = '';
    let list, have;
    if (colTab === 'online') {
      list = Object.entries(col).filter(([id]) => !BY_ID.has(id)).map(([id, c]) => ({ id, ...c, online: true }));
      have = list.length;
      $('#colProgress').innerHTML = have
        ? `🌐 Z internetu jsi uhodl/a už <b>${have}</b> ${have === 1 ? 'položku' : have < 5 ? 'položky' : 'položek'}.`
        : 'Zatím nic. Zapni v nastavení „Hledat i z internetu“.';
    } else {
      list = ALL_ITEMS.filter(i => i.theme === colTab && i.img && !i.online);
      have = list.filter(i => col[i.id]).length;
      const pct = list.length ? Math.round(have / list.length * 100) : 0;
      $('#colProgress').innerHTML = `<div class="bar"><span style="width:${pct}%"></span></div><b>${have}</b> / ${list.length} objeveno`;
    }
    const frag = document.createDocumentFragment();
    list.forEach(it => {
      const got = colTab === 'online' || col[it.id];
      const d = document.createElement('button');
      d.className = 'col-item' + (got ? '' : ' locked');
      if (got) {
        const src = it.thumb || it.img;
        d.innerHTML = `<img loading="lazy" src="${esc(src)}" alt=""><span>${esc(cap(it.name))}</span>`;
        d.onclick = () => openDetail(it, col[it.id]);
      } else {
        d.innerHTML = `<div class="q">?</div><span>${'•'.repeat(Math.min(8, it.name.length))}</span>`;
        d.onclick = () => toast('Tohle zvíře nebo místo ještě musíš uhodnout. 😉');
      }
      frag.appendChild(d);
    });
    grid.appendChild(frag);
  }

  function openDetail(it, c) {
    $('#detailImg').src = it.img;
    $('#detailName').textContent = cap(it.name);
    $('#detailSci').innerHTML = it.sci ? `<i>${esc(it.sci)}</i>` : esc(it.country || '');
    const info = [];
    if (it.region) info.push(`🌍 ${esc(it.region)}`);
    if (it.hint) info.push(esc(it.hint));
    if (c) info.push(`Uhodnuto ${c.n}× · poprvé ${c.d.split('-').reverse().join('. ')}`);
    $('#detailInfo').innerHTML = info.join('<br>');
    $('#detailCredit').innerHTML = creditHtml(it);
    $('#detailOverlay').classList.remove('hidden');
  }
  $('#btnDetailClose').addEventListener('click', () => $('#detailOverlay').classList.add('hidden'));

  function renderStats() {
    const st = store.get('stats', {});
    const col = store.get('collection', {});
    const r = st.rounds || 0, c = st.correct || 0;
    const acc = r ? Math.round(c / r * 100) : 0;
    const tile = (v, l) => `<div class="tile"><b>${v}</b><span>${l}</span></div>`;
    let html = `<div class="tiles">
      ${tile(st.games || 0, 'odehraných her')}
      ${tile(r, 'kol')}
      ${tile(acc + ' %', 'úspěšnost')}
      ${tile(st.bestStreak || 0, 'nejdelší série')}
      ${tile(st.firstTry || 0, 'na 1. pokus')}
      ${tile(st.best || 0, 'nejlepší hra (b.)')}
      ${tile(st.points || 0, 'bodů celkem')}
      ${tile(Object.keys(col).length, 've sbírce')}
    </div>`;
    const modes = Object.entries(st.byMode || {});
    if (modes.length) {
      html += '<h3>Úspěšnost podle režimu</h3><div class="bars">' + modes.map(([m, v]) => {
        const p = Math.round(v.c / v.r * 100);
        return `<div class="barrow"><span>${Distort.MODES[m] ? Distort.MODES[m].icon + ' ' + Distort.MODES[m].label : m}</span><div class="bar"><span style="width:${p}%"></span></div><b>${p} %</b></div>`;
      }).join('') + '</div>';
    }
    const hard = Object.values(st.items || {}).filter(i => i.r - i.c > 0).sort((a, b) => (b.r - b.c) - (a.r - a.c)).slice(0, 8);
    if (hard.length) {
      html += '<h3>Nejvíc tě potrápilo</h3><ul class="hard">' +
        hard.map(i => `<li><span>${esc(cap(i.n))}</span><small>${i.r - i.c}× neuhodnuto</small></li>`).join('') + '</ul>';
    }
    if (!r) html += '<p class="empty">Zatím žádné hry. Hurá do hraní! 🦓</p>';
    $('#statsBody').innerHTML = html;
  }

  function renderAbout() {
    $('#versionInfo').textContent = `Verze ${VERSION} · ${ANIMALS.length} zvířat a ${LANDMARKS.length} míst offline + tisíce zvířat online`;
    const box = $('#creditsList');
    if (box.dataset.done) return;
    box.dataset.done = 1;
    const det = document.createElement('details');
    det.innerHTML = '<summary>Seznam autorů všech offline fotek</summary><ul>' +
      ALL_ITEMS.filter(i => i.img && i.credit).map(i =>
        `<li><b>${esc(cap(i.name))}</b>: ${esc(i.credit)} (${esc(String(i.license).toUpperCase())}) <a href="${esc(i.source)}" target="_blank" rel="noopener">zdroj</a></li>`).join('') + '</ul>';
    box.appendChild(det);
  }

  $('#btnReset').addEventListener('click', () => {
    if (!confirm('Opravdu smazat sbírku, statistiky a denní výzvy?')) return;
    ['stats', 'collection', 'daily', 'recent'].forEach(k => localStorage.removeItem('hz.' + k));
    toast('Smazáno.');
  });

  // ------------------------------------------------------------ offline: stažení obrázků
  async function precacheImages() {
    const pill = $('#offlineStatus');
    if (!('caches' in window)) { pill.textContent = ''; return; }
    // fotky v aplikaci i fotky míst z Wikimedia Commons (ty se stáhnou do telefonu při prvním spuštění)
    const urls = [...new Set(ALL_ITEMS.filter(i => i.img && !i.online).map(i => new URL(i.img, location.href).href))];
    const cache = await caches.open(IMG_CACHE);
    const have = new Set((await cache.keys()).map(r => r.url));
    have.forEach(u => readyRemote.add(u));
    let missing = urls.filter(u => !have.has(u));
    const total = urls.length;
    const update = () => {
      const done = total - missing.length;
      pill.textContent = done >= total ? `📦 Offline připraveno (${total})` : `📥 Stahuji pro offline ${done}/${total}`;
      pill.classList.toggle('ready', done >= total);
    };
    update();
    if (!missing.length || !Online.isOnline()) return;
    const queue = missing.slice();
    const worker = async () => {
      while (queue.length) {
        const u = queue.shift();
        try {
          const sameOrigin = new URL(u).origin === location.origin;
          await cache.add(new Request(u, { mode: sameOrigin ? 'same-origin' : 'cors', credentials: 'omit' }));
          missing = missing.filter(x => x !== u);
          readyRemote.add(u);
          update();
        } catch (e) { /* zkusí příště */ }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    update();
  }

  // ------------------------------------------------------------ PWA: service worker a instalace
  let deferredPrompt = null;
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    $('#btnInstall').classList.remove('hidden');
  });
  if (!isStandalone()) $('#btnInstall').classList.remove('hidden');
  $('#btnInstall').addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      $('#btnInstall').classList.add('hidden');
      return;
    }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    toast(ios
      ? 'V Safari klepni na <b>Sdílet</b> (čtvereček se šipkou) a pak na <b>Přidat na plochu</b>.'
      : 'V menu prohlížeče (⋮) zvol <b>Přidat na plochu</b> nebo <b>Nainstalovat aplikaci</b>.', 8000);
  });
  window.addEventListener('appinstalled', () => $('#btnInstall').classList.add('hidden'));

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('✨ Je k dispozici nová verze. Klepni sem pro obnovení.', 0, () => nw.postMessage('skipWaiting'));
          }
        });
      });
    }).catch(e => console.warn('SW', e));
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
  }

  // zabránit zoomu dvojklepnutím na iOS při rychlém klikání
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });

  // ------------------------------------------------------------ start
  show('home');
  precacheImages().catch(() => { });
  window.addEventListener('online', () => precacheImages().catch(() => { }));
})();
