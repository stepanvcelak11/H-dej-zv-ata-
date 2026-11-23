/* Hádej zvířata – hlavní logika hry */
(function () {
  'use strict';

  const VERSION = '1.3.1';
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
  const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const withTimeout = (p, ms) => Promise.race([p, sleep(ms).then(() => { throw new Error('timeout'); })]);
  /** SVG ikona ze spritu v index.html */
  const I = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const PLAYER_COLORS = ['var(--p1)', 'var(--p2)'];
  const plural = (n, one, few, many) => n === 1 ? one : (n >= 2 && n <= 4 ? few : many);

  let toastTimer;
  function toast(msg, ms = 2600, onClick, icon = 'info') {
    const t = $('#toast');
    t.innerHTML = (icon ? I(icon) : '') + `<span>${msg}</span>`;
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
  const MASKS = window.DATA_MASKS || {};
  const maskOf = id => (MASKS[id] ? Subject.decode(MASKS[id]) : null);
  /** Maska zvířete spočítaná v telefonu (fotky z internetu, vlastní fotky); když to nejde, null */
  async function detectMask(img, ms) {
    try { return await withTimeout(Subject.detect(img), ms); } catch (e) { console.warn('Maska zvířete se nespočítala', e); return null; }
  }
  const PACKS = window.PACKS || { animals: [{ id: 'all' }], landmarks: [{ id: 'all' }] };
  const packOf = (theme, id) => (PACKS[theme] || []).find(p => p.id === id) || PACKS[theme][0];

  const OTHER = ['pavoukovec', 'měkkýš', 'korýš', 'bezobratlý'];
  // u každé volby je fotka typického zástupce
  const GROUPS = [
    { v: 'savec', label: 'Savci', img: 'lev' }, { v: 'pták', label: 'Ptáci', img: 'ara-arakanga' },
    { v: 'plaz', label: 'Plazi', img: 'chameleon-jemensky' }, { v: 'obojživelník', label: 'Obojživelníci', img: 'listovnice-cervenooka' },
    { v: 'ryba', label: 'Ryby', img: 'klaun-ockaty' }, { v: 'hmyz', label: 'Hmyz', img: 'slunecko-sedmitecne' },
    { v: 'ostatní', label: 'Pavouci, korýši a další', img: 'chobotnice-pobrezni' },
  ];
  const CONTINENTS = [
    { v: 'Evropa', label: 'Evropa', img: 'eiffelova-vez' }, { v: 'Asie', label: 'Asie', img: 'tadz-mahal' },
    { v: 'Afrika', label: 'Afrika', img: 'velka-pyramida-v-gize' }, { v: 'Amerika', label: 'Amerika', img: 'socha-svobody' },
    { v: 'Austrálie', label: 'Austrálie a Oceánie', img: 'opera-v-sydney' },
  ];
  const THEMES = [
    { v: 'animals', label: 'Zvířata', imgs: ['zebra-stepni'] },
    { v: 'landmarks', label: 'Místa', imgs: ['koloseum'] },
    { v: 'both', label: 'Obojí', imgs: ['levhart', 'velka-cinska-zed'] },
    { v: 'photos', label: 'Naše fotky', imgs: [] },
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
  const imgOf = id => (BY_ID.get(id) || {}).img || '';

  // ------------------------------------------------------------ nastavení
  const DEFAULTS = {
    theme: 'animals', mode: 'zoom', diff: 1, groups: GROUPS.map(g => g.v), continents: CONTINENTS.map(c => c.v),
    players: 1, names: ['', ''], rounds: 10, online: true, ease: true, timer: false, answer: 'loose',
    packA: 'all', packL: 'all',
  };
  let settings = { ...DEFAULTS, ...store.get('settings', {}) };
  if (settings.precise !== undefined) { if (settings.precise) settings.answer = 'precise'; delete settings.precise; }
  // více způsobů zkreslení najednou (dřív jen jeden režim)
  if (!Array.isArray(settings.modes) || !settings.modes.length) {
    settings.modes = settings.mode === 'random' || !settings.mode ? (settings.mode ? Distort.PLAYABLE.slice() : ['zoom']) : [settings.mode];
  }
  settings.modes = settings.modes.filter(m => Distort.PLAYABLE.includes(m));
  if (!settings.modes.length) settings.modes = ['zoom'];
  delete settings.mode;
  const saveSettings = () => store.set('settings', settings);
  const isDuel = s => s.players === 'duel';

  // vlastní fotky (načtené z IndexedDB)
  let photoList = [];
  async function refreshPhotos() {
    try { photoList = await Photos.all(); } catch (e) { photoList = []; }
    return photoList;
  }

  // ------------------------------------------------------------ navigace
  function show(id) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    if (id === 'home') renderHome();
    if (id === 'setup') { renderSetup(); refreshPhotos().then(() => { if ($('#setup').classList.contains('active')) renderSetup(); }); }
    if (id === 'collection') renderCollection();
    if (id === 'stats') renderStats();
    if (id === 'about') renderAbout();
    if (id === 'photos') renderPhotos();
    window.scrollTo(0, 0);
  }
  $$('[data-go]').forEach(b => b.addEventListener('click', () => show(b.dataset.go)));

  // ------------------------------------------------------------ domovská obrazovka
  function summaryHtml(s) {
    const theme = {
      animals: ['paw-print', 'Zvířata'], landmarks: ['landmark', 'Místa'], both: ['globe', 'Zvířata i místa'], photos: ['images', 'Naše fotky'],
    }[s.theme] || ['paw-print', 'Zvířata'];
    const ms = s.modes || ['zoom'];
    const m = ms.length === 1 ? Distort.MODES[ms[0]] : { icon: 'dices', label: `${ms.length} ${plural(ms.length, 'zkreslení', 'zkreslení', 'zkreslení')} na střídačku` };
    const tags = [[theme[0], theme[1]]];
    if (s.theme === 'animals' && s.packA !== 'all') tags[0][1] = packOf('animals', s.packA).label;
    if (s.theme === 'landmarks' && s.packL !== 'all') tags[0][1] = packOf('landmarks', s.packL).label;
    tags.push([m.icon, m.label], ['target', Distort.DIFFICULTY[s.diff].label], ['flag', s.rounds ? `${s.rounds} kol` : 'bez konce']);
    if (s.theme !== 'photos' && s.answer === 'choice') tags.push(['list-checks', 'ze 4 možností']);
    if (s.theme !== 'photos' && s.answer === 'precise' && s.theme !== 'landmarks') tags.push(['microscope', 's druhem']);
    if (s.players === 2) tags.push(['repeat', 'střídání']);
    if (isDuel(s)) tags.push(['swords', 'souboj']);
    return tags.map(([ic, t]) => `<span>${I(ic)}${esc(t)}</span>`).join('');
  }

  let heroTimer = 0;
  function heroNext() {
    const img = $('#heroImg');
    const pool = ANIMALS.filter(a => a.img && !/^https?:/.test(a.img));
    if (!pool.length || !img) return;
    const it = pick(pool);
    img.classList.remove('ready');
    img.onload = () => {
      img.style.setProperty('--ox', `${35 + Math.random() * 30}%`);
      img.style.setProperty('--oy', `${35 + Math.random() * 30}%`);
      img.style.animation = 'none'; void img.offsetWidth; img.style.animation = '';
      img.classList.add('ready');
    };
    img.src = it.img;
    clearTimeout(heroTimer);
    heroTimer = setTimeout(() => { if ($('#home').classList.contains('active')) heroNext(); }, 11000);
  }

  function renderHome() {
    $('#quickSummary').innerHTML = summaryHtml(settings);
    const d = store.get('daily', {})[todayKey()];
    const db = $('#dailyBadge');
    db.textContent = d ? `Hotovo · ${d.score} b.` : 'Nová výzva!';
    db.className = 'tile-s ' + (d ? 'done' : 'new');
    const col = store.get('collection', {});
    const total = ALL_ITEMS.filter(i => i.img && !i.online).length;
    const have = ALL_ITEMS.filter(i => col[i.id]).length;
    $('#colBadge').textContent = `${have} z ${total} objeveno`;
    const st = store.get('stats', {});
    $('#statsBadge').textContent = st.rounds ? `${Math.round((st.correct || 0) / st.rounds * 100)} % uhodnuto` : 'zatím prázdné';
    updateNet();
    heroNext();
    refreshPhotos().then(list => {
      $('#photosBadge').textContent = list.length
        ? `${list.length} ${plural(list.length, 'fotka', 'fotky', 'fotek')} · hádejte svoje vlastní fotky`
        : 'Nahrajte svoje fotky a hádejte je';
      $('#photoStack').innerHTML = list.length
        ? list.slice(0, 3).map(p => `<img src="${Photos.thumbUrl(p)}" alt="">`).join('')
        : `<span class="ps-empty">${I('image-plus')}</span>`;
    });
  }

  function updateNet() {
    const on = Online.isOnline();
    $('#netStatus').innerHTML = on ? `${I('wifi')}Online` : `${I('wifi-off')}Offline`;
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
      b.innerHTML = `<img src="${esc(imgOf(g.img))}" alt="" loading="lazy">${esc(g.label)}${I('check')}`;
      b.className = 'pchip' + (selected.includes(g.v) ? ' on' : '');
      b.onclick = () => {
        let next = selected.includes(g.v) ? selected.filter(x => x !== g.v) : [...selected, g.v];
        if (!next.length) { toast('Aspoň jedna skupina musí zůstat zapnutá.'); return; }
        onChange(next);
      };
      box.appendChild(b);
    });
  }

  function renderSetup() {
    const s = settings;
    const photosTheme = s.theme === 'photos';

    // témata
    const themes = $('#optTheme');
    themes.innerHTML = '';
    THEMES.forEach(t => {
      const b = document.createElement('button');
      b.className = 'theme' + (s.theme === t.v ? ' on' : '');
      let imgs = t.imgs.map(id => `<img src="${esc(imgOf(id))}" alt="">`).join('');
      if (t.v === 'photos') {
        imgs = photoList.length
          ? photoList.slice(0, 2).map(p => `<img src="${Photos.thumbUrl(p)}" alt="">`).join('')
          : `<span class="theme-ph">${I('images')}</span>`;
      }
      b.innerHTML = `<span class="ti">${imgs}</span><b>${t.label}</b><span class="check">${I('check')}</span>`;
      b.onclick = () => { settings.theme = t.v; saveSettings(); renderSetup(); };
      themes.appendChild(b);
    });

    // balíčky
    const packTheme = s.theme === 'animals' ? 'animals' : s.theme === 'landmarks' ? 'landmarks' : null;
    $('#fieldPack').classList.toggle('hidden', !packTheme);
    if (packTheme) {
      const key = packTheme === 'animals' ? 'packA' : 'packL';
      const box = $('#optPack');
      const scroll = box.scrollLeft;
      box.innerHTML = '';
      PACKS[packTheme].forEach(p => {
        const n = ALL_ITEMS.filter(it => it.theme === packTheme && it.img && inPack(it, packTheme, p.id)).length;
        const b = document.createElement('button');
        b.className = 'pack' + (s[key] === p.id ? ' on' : '');
        b.innerHTML = `<span class="pk-img"><img src="${esc(imgOf(p.img))}" alt=""><span class="pk-n">${n}</span></span>` +
          `<span class="pk-t"><b>${esc(p.label)}</b><small>${esc(p.desc || '')}</small></span>`;
        b.onclick = () => { settings[key] = p.id; saveSettings(); renderSetup(); };
        box.appendChild(b);
      });
      const on = box.querySelector('.pack.on');
      // při prvním zobrazení posunout na vybraný balíček, jinak zachovat polohu
      box.scrollLeft = scroll || (on ? Math.max(0, on.offsetLeft - 16) : 0);
    }

    $('#fieldPhotos').classList.toggle('hidden', !photosTheme);
    $('#photosCount').textContent = `${photoList.length} ${plural(photoList.length, 'fotka', 'fotky', 'fotek')}`;

    // režimy
    const modes = $('#optMode');
    modes.innerHTML = '';
    const allOn = Distort.PLAYABLE.every(k => s.modes.includes(k));
    [...Distort.PLAYABLE, 'all'].forEach(k => {
      const isAll = k === 'all';
      const on = isAll ? allOn : s.modes.includes(k);
      const b = document.createElement('button');
      b.className = 'mode' + (on ? ' on' : '');
      b.dataset.mode = k;
      b.setAttribute('aria-pressed', on);
      b.innerHTML = (isAll ? `<div class="mode-dice">${I('dices')}</div>` : '<canvas width="160" height="160"></canvas>') +
        `<span>${isAll ? 'Všechny' : Distort.MODES[k].label}</span><i class="mode-check">${I('check')}</i>`;
      b.onclick = () => {
        if (isAll) settings.modes = allOn ? [settings.modes[0] || 'zoom'] : Distort.PLAYABLE.slice();
        else if (on && settings.modes.length === 1) { toast('Aspoň jeden způsob zkreslení musí zůstat zapnutý.'); return; }
        else settings.modes = on ? settings.modes.filter(x => x !== k) : Distort.PLAYABLE.filter(x => x === k || settings.modes.includes(x));
        saveSettings(); renderSetup();
      };
      modes.appendChild(b);
    });
    $('#modeDesc').innerHTML = s.modes.length === 1
      ? esc(Distort.MODES[s.modes[0]].desc)
      : `Každé kolo náhodně jeden z vybraných: <b>${s.modes.map(k => Distort.MODES[k].label).join(', ')}</b>.`;
    $('#modesCount').textContent = `${s.modes.length} z ${Distort.PLAYABLE.length}`;

    const diff = $('#optDiff');
    diff.innerHTML = '';
    Distort.DIFFICULTY.forEach((d, i) => {
      const b = document.createElement('button');
      b.dataset.v = i;
      b.innerHTML = `<span class="lvl">${[0, 1, 2, 3].map(j => `<i class="${j <= i ? 'f' : ''}"></i>`).join('')}</span>${d.label}`;
      diff.appendChild(b);
    });
    seg('#optDiff', s.diff, v => { settings.diff = +v; saveSettings(); renderSetup(); });
    $('#diffDesc').textContent = `Body ×${String(Distort.DIFFICULTY[s.diff].mult).replace('.', ',')}`;

    // odpovídání
    $('#fieldAnswer').classList.toggle('hidden', photosTheme);
    const onlyPlaces = s.theme === 'landmarks';
    $('#ansPrecise').classList.toggle('hidden', onlyPlaces);
    $('#optAnswer').classList.toggle('two', onlyPlaces);
    if (onlyPlaces && s.answer === 'precise') settings.answer = 'loose';
    $('#ansLooseLabel').textContent = onlyPlaces ? 'Napsat název' : s.theme === 'both' ? 'Napsat' : 'Napsat zvíře';
    $('#ansLooseSub').innerHTML = onlyPlaces ? '„Koloseum“' : 'stačí „sojka“';
    seg('#optAnswer', settings.answer, v => { settings.answer = v; saveSettings(); renderSetup(); });

    // skupiny / kontinenty (jen bez balíčku)
    $('#fieldGroups').classList.toggle('hidden', !(s.theme === 'both' || (s.theme === 'animals' && s.packA === 'all')));
    $('#fieldContinents').classList.toggle('hidden', !(s.theme === 'both' || (s.theme === 'landmarks' && s.packL === 'all')));
    chips('#optGroups', GROUPS, s.groups, v => { settings.groups = v; saveSettings(); renderSetup(); });
    chips('#optContinents', CONTINENTS, s.continents, v => { settings.continents = v; saveSettings(); renderSetup(); });
    $('#groupsCount').textContent = `${s.groups.length} z ${GROUPS.length}`;
    $('#contCount').textContent = `${s.continents.length} z ${CONTINENTS.length}`;

    // hráči
    seg('#optPlayers', s.players, v => { settings.players = v === 'duel' ? 'duel' : +v; saveSettings(); renderSetup(); });
    $('#playerNames').classList.toggle('hidden', s.players === 1);
    $('#playersDesc').innerHTML = {
      1: 'Hraješ sám nebo sama.',
      2: 'Střídáte se: každý dostane svůj obrázek a telefon si předáváte.',
      duel: 'Oba vidíte stejný obrázek. Kdo první zmáčkne <b>Vím!</b>, odpovídá. Když se splete, má šanci ten druhý.',
    }[s.players] || '';
    $('#p1name').value = s.names[0] || '';
    $('#p2name').value = s.names[1] || '';

    seg('#optRounds', s.rounds, v => { settings.rounds = +v; saveSettings(); renderSetup(); });
    $('#roundsSub').textContent = s.players === 2 && s.rounds ? 'pro každého hráče' : '';

    $('#rowOnline').classList.toggle('hidden', !onlineAllowed(s));
    $('#optOnline').checked = s.online;
    $('#optEase').checked = s.ease;
    $('#optTimer').checked = s.timer;

    const n = photosTheme ? photoList.length : offlinePool(s).length;
    $('#btnStart').innerHTML = n
      ? `${I('play')}<span>Začít hru · ${n} ${photosTheme ? plural(n, 'fotka', 'fotky', 'fotek') : 'obrázků'}</span>`
      : (photosTheme ? `${I('image-plus')}<span>Nejdřív přidejte fotky</span>` : `${I('circle-alert')}<span>Pro tento výběr nic není</span>`);
    $('#btnStart').disabled = !n && !photosTheme;
    drawPreview();
  }

  ['#p1name', '#p2name'].forEach((sel, i) => $(sel).addEventListener('input', e => {
    settings.names[i] = e.target.value.trim(); saveSettings();
  }));
  $('#optOnline').addEventListener('change', e => { settings.online = e.target.checked; saveSettings(); });
  $('#optEase').addEventListener('change', e => { settings.ease = e.target.checked; saveSettings(); drawPreview(); });
  $('#optTimer').addEventListener('change', e => { settings.timer = e.target.checked; saveSettings(); });

  function previewSource() {
    if (settings.theme === 'photos' && photoList.length) {
      const p = pick(photoList);
      return { src: Photos.url(p), cx: p.cx, cy: p.cy };
    }
    const pool = offlinePool({ ...settings, theme: settings.theme === 'photos' ? 'animals' : settings.theme });
    if (!pool.length) return null;
    const it = pick(pool);
    return { src: it.img, id: it.id };
  }

  function drawPreview(newImage) {
    const canvas = $('#previewCanvas');
    const go = () => {
      const mode = pick(settings.modes);
      const seed = (Math.random() * 1e9) | 0;
      const fix = st => {
        if (previewImg.dataset.cx && !(+previewImg.dataset.cx === 0.5 && +previewImg.dataset.cy === 0.5)) { st.cx = +previewImg.dataset.cx; st.cy = +previewImg.dataset.cy; }
        else if (!Distort.focusMask(previewImg, st, maskOf(previewImg.dataset.id))) Distort.focusDetail(previewImg, st);
        if (st.mode === 'reveal') st.startedAt = performance.now() - 7000;
        return st;
      };
      previewState = fix(Distort.createState(mode, settings.diff, seed));
      previewState.ease = settings.ease;
      Distort.render(canvas, previewImg, previewState);
      // malé živé náhledy u každého režimu
      $$('#optMode .mode canvas').forEach(c => {
        Distort.render(c, previewImg, fix(Distort.createState(c.closest('.mode').dataset.mode, settings.diff, seed)));
      });
    };
    const wantPhotos = settings.theme === 'photos' && photoList.length > 0;
    const isPhotoImg = !!previewImg && previewImg.dataset.photo === '1';
    if (!previewImg || newImage || wantPhotos !== isPhotoImg) {
      const src = previewSource();
      if (!src) { canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); return; }
      loadImage(src.src).then(img => {
        img.dataset.photo = wantPhotos ? '1' : '0';
        if (src.cx != null) { img.dataset.cx = src.cx; img.dataset.cy = src.cy; }
        if (src.id) img.dataset.id = src.id;
        previewImg = img; go();
      }).catch(() => { });
    } else go();
  }
  $('#previewCanvas').addEventListener('click', () => drawPreview(true));
  $('#btnPreviewNext').addEventListener('click', () => drawPreview(true));

  // ------------------------------------------------------------ výběr položek
  function inPack(it, theme, packId) {
    if (!packId || packId === 'all') return true;
    const p = packOf(theme, packId);
    if (p.ids) return p.ids.includes(it.id);
    if (p.test) return p.test(it);
    return true;
  }
  function matchesFilter(it, s) {
    if (it.theme === 'animals') {
      if (s.theme === 'landmarks' || s.theme === 'photos') return false;
      if (s.theme === 'animals' && s.packA !== 'all') return inPack(it, 'animals', s.packA);
      return s.groups.includes(groupOf(it));
    }
    if (it.theme === 'landmarks') {
      if (s.theme === 'animals' || s.theme === 'photos') return false;
      if (s.theme === 'landmarks' && s.packL !== 'all') return inPack(it, 'landmarks', s.packL);
      return s.continents.some(c => (it.continent || '').includes(c));
    }
    return false;
  }
  /** Online zvířata jdou přidat jen bez balíčku, nebo u balíčku s místem (Česká příroda) */
  function onlineAllowed(s) {
    if (s.theme === 'landmarks' || s.theme === 'photos') return false;
    if (s.theme === 'animals' && s.packA !== 'all') return !!packOf('animals', s.packA).inatPlace;
    return true;
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

  function rememberRecent(id, key = 'recent', size) {
    const r = store.get(key, []).filter(x => x !== id);
    r.push(id);
    const max = size || Math.max(10, Math.floor(offlinePool(settings).length * 0.6));
    store.set(key, r.slice(-max));
  }

  /** Je obrázek prázdný (jedna barva) – třeba chybová stránka místo fotky? */
  function looksBlank(img) {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 12;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0, 12, 12);
      const d = x.getImageData(0, 0, 12, 12).data;
      let min = 255, max = 0;
      for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; if (v < min) min = v; if (v > max) max = v; }
      return max - min < 6;
    } catch (e) { return false; }
  }

  function loadImage(src, ms = 15000) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      const remote = /^https?:/.test(src);
      if (remote) img.crossOrigin = 'anonymous';
      const t = setTimeout(() => { img.src = ''; reject(new Error('timeout')); }, ms);
      img.onload = () => {
        clearTimeout(t);
        if (!img.naturalWidth || (remote && looksBlank(img))) reject(new Error('prázdný obrázek'));
        else resolve(img);
      };
      img.onerror = () => { clearTimeout(t); reject(new Error('img error')); };
      img.src = src;
    });
  }

  /** Načte fotku položky; u Wikimedie zkusí při chybě menší náhled */
  async function loadItemImage(src, ms) {
    try { return await loadImage(src, ms); } catch (e) {
      if (/\/960px-/.test(src)) return loadImage(src.replace('/960px-', '/500px-'), ms);
      throw e;
    }
  }

  function photoItem(p) {
    return {
      id: p.id, theme: 'photos', photo: true,
      name: p.caption ? p.caption : 'Naše fotka', caption: p.caption || '',
      img: Photos.url(p), thumb: Photos.thumbUrl(p), cx: p.cx, cy: p.cy,
    };
  }

  /** Připraví další kolo: vybere položku a načte obrázek (a online nápovědy). */
  async function prepareItem(s, used, forced) {
    if (forced) {
      const img = await loadImage(forced.img);
      return { item: forced, img, detail: null, mask: maskOf(forced.id) };
    }
    if (s.theme === 'photos') {
      const list = photoList.filter(p => !used.has(p.id));
      if (!list.length) throw new Error('Došly fotky');
      const recent = new Set(store.get('recentPhotos', []));
      const fresh = list.filter(p => !recent.has(p.id));
      const p = pick(fresh.length ? fresh : list);
      used.add(p.id); // ať další připravované kolo nevezme stejnou fotku
      const it = photoItem(p);
      const img = await loadImage(it.img);
      // když u fotky nikdo nevybral bod přiblížení, zkusí najít, kde je hlavní objekt
      const manual = !(it.cx === 0.5 && it.cy === 0.5);
      const mask = manual ? null : await detectMask(img, 9000);
      return { item: it, img, detail: null, mask };
    }
    const online = s.online && onlineAllowed(s) && Online.isOnline();
    let theme = s.theme === 'both' ? (Math.random() < 0.5 ? 'animals' : 'landmarks') : s.theme;
    const local = { ...s, theme };
    if (!offlinePool(local).length) local.theme = s.theme;

    if (online && local.theme === 'animals' && Math.random() < 0.5) {
      try {
        const exclude = new Set([...ANIMALS.map(a => a.sci.toLowerCase()), ...used]);
        const place = s.theme === 'animals' && s.packA !== 'all' ? packOf('animals', s.packA).inatPlace : null;
        const groups = place ? null : local.groups;
        const it = await withTimeout(Online.randomAnimal(groups, exclude, place), 12000);
        if (it) {
          const [img, detail] = await Promise.all([
            loadItemImage(it.img, 12000).catch(() => loadImage(it.thumb, 10000)),
            withTimeout(Online.animalDetail(it.inat), 8000).catch(() => null),
          ]);
          // kde je na fotce zvíře – ať přiblížení ukazuje zvíře, ne okolí
          const mask = await detectMask(img, 9000);
          return { item: it, img, detail, mask };
        }
      } catch (e) {
        console.warn('Online položka selhala, beru offline', e);
      }
    }
    for (let i = 0; i < 4; i++) {
      const it = pickOffline(local, used);
      try {
        const img = await loadItemImage(it.img);
        return { item: it, img, detail: null, mask: maskOf(it.id) };
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
    const canMap = item.inat && Online.isOnline();
    const mapHint = text => ({ map: item.inat, text });
    if (item.theme === 'animals') {
      h.push(item.group === 'savec' ? 'Je to savec.' : 'Není to savec.');
      if (item.online) {
        if (item.group !== 'savec') h.push(`Je to ${GROUP_TEXT[item.group] || 'živočich'}.`);
        if (canMap) h.push(mapHint('Kde ho lidé pozorovali:'));
        if (detail && detail.order) h.push(`Patří do řádu: ${detail.order}.`);
        if (detail && detail.family) h.push(`Čeleď: ${detail.family}.`);
        if (item.en) h.push(`Anglicky se mu říká „${item.en}“.`);
      } else {
        h.push((item.group !== 'savec' ? `Je to ${GROUP_TEXT[item.group]}. ` : '') + (DIET_TEXT[item.diet] || ''));
        h.push(canMap ? mapHint(`Kde žije: ${item.region}.`) : `Kde žije: ${item.region}.`);
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

  function hintHtml(h) {
    if (typeof h === 'string') return h;
    const tiles = Online.mapTiles(h.map).map(t =>
      `<img class="hm-tile" style="left:${t.x * 50}%;top:${t.y * 50}%" src="${t.src}" alt="" onerror="this.remove()">`).join('');
    return `${esc(h.text)}<span class="hint-map"><span class="hm-inner"><img class="hm-base" src="img/world.svg" alt="">${tiles}</span></span>` +
      `<small class="hm-note">Oranžová místa = kde ho lidé vyfotili (iNaturalist)</small>`;
  }

  // ------------------------------------------------------------ hra
  let game = null;
  let round = null;
  let rafId = 0, timerId = 0;

  function newGame(s, opts = {}) {
    const duel = isDuel(s);
    const names = s.players === 1
      ? [s.names[0] || 'Ty']
      : [s.names[0] || 'Hráč 1', s.names[1] || 'Hráč 2'];
    let total = s.rounds ? s.rounds * (duel ? 1 : names.length) : Infinity;
    if (s.theme === 'photos') total = Math.min(total, photoList.length);
    game = {
      s: { ...s },
      duel,
      photos: s.theme === 'photos',
      daily: opts.daily || null,
      players: names.map(n => ({ name: n, score: 0, ok: 0 })),
      turn: 0,
      total,
      used: new Set(),
      history: [],
      next: null,
      queue: opts.queue || null,
    };
    $('#game').classList.toggle('duel', duel);
    // model na hledání zvířete na fotce se stáhne dopředu, když bude potřeba
    if ((s.theme === 'photos') || (s.online && onlineAllowed(s) && Online.isOnline())) Subject.warm();
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

  async function nextTurn(skipped) {
    if (!game) return;
    if (game.turn >= game.total) { endGame(); return; }
    const player = game.duel ? null : game.players[game.turn % game.players.length];

    if (game.players.length > 1 && !game.duel && !skipped) {
      const pi = game.turn % game.players.length;
      $('#turnName').textContent = player.name;
      $('#turnAvatar').textContent = player.name.charAt(0).toUpperCase();
      $('#turnAvatar').style.background = PLAYER_COLORS[pi];
      $('#turnScore').innerHTML = game.players.map((p, i) =>
        `<div><span><i class="pdot" style="background:${PLAYER_COLORS[i]}"></i>${esc(p.name)}</span><b>${p.score}</b></div>`).join('');
      $('#turnOverlay').classList.remove('hidden');
      await new Promise(r => { $('#btnTurnGo').onclick = r; });
      $('#turnOverlay').classList.add('hidden');
    }

    $('#loading').classList.remove('hidden');
    $('#feedback').textContent = '';
    $('#feedback').className = 'feedback';
    $('#hintList').innerHTML = '';
    $('#choices').innerHTML = '';
    let prepared = game.next;
    game.next = null;
    if (!prepared) {
      const forced = game.queue ? game.queue[game.turn] : null;
      prepared = prepareItem(game.s, game.used, forced).catch(e => e);
    }
    let res = await prepared;
    if (!game) return;
    if (res instanceof Error && !game.photos) {
      // zkusí to ještě jednou offline
      res = await prepareItem({ ...game.s, online: false }, game.used).catch(e => e);
    }
    if (!game) return;
    if (res instanceof Error) {
      $('#loading').classList.add('hidden');
      if (game.history.length) { endGame(); return; }
      toast('Nepodařilo se načíst obrázek.', 3000, null, 'circle-alert');
      quitToHome();
      return;
    }
    game.used.add(res.item.id);
    if (res.item.sci) game.used.add(res.item.sci.toLowerCase());
    startRound(res, player);
    queueNext();
  }

  function makeChoices(item) {
    const all = (item.theme === 'landmarks' ? LANDMARKS : ANIMALS).filter(x => x.img && x.name !== item.name);
    // přednostně ze stejného výběru (balíčku), aby nebyla odpověď moc jasná
    const inGame = offlinePool({ ...game.s, theme: item.theme }).filter(x => x.name !== item.name);
    const pool = inGame.length >= 3 ? inGame : all;
    const same = shuffle(pool.filter(x => item.theme === 'animals' ? groupOf(x) === groupOf(item) : x.kind === item.kind));
    const names = new Set([item.name.toLowerCase()]);
    const out = [];
    const take = list => { for (const x of list) { if (out.length >= 3) break; if (!names.has(x.name.toLowerCase())) { names.add(x.name.toLowerCase()); out.push(x.name); } } };
    take(same.slice(0, 2));
    take(shuffle(pool));
    return shuffle([item.name, ...out]);
  }

  function startRound({ item, img, detail, mask }, player) {
    const seed = game.daily ? (game.daily.seed * 31 + game.turn) : (Math.random() * 1e9) | 0;
    const mode = game.daily ? game.daily.mode : pick(game.s.modes);
    const st = Distort.createState(mode, game.s.diff, seed);
    st.ease = game.photos ? true : game.s.ease;
    // u vlastní fotky s ručně vybraným bodem přiblížení ho použít, jinak najít místo s nejvíc detaily
    if (item.photo && !(item.cx === 0.5 && item.cy === 0.5)) { st.cx = item.cx; st.cy = item.cy; }
    else if (!Distort.focusMask(img, st, mask)) Distort.focusDetail(img, st);
    const choice = !game.photos && game.s.answer === 'choice';
    round = {
      item, img, detail, player, st,
      attempts: 3, hints: game.photos ? [] : buildHints(item, detail), hintsUsed: 0,
      started: Date.now(), done: false, timeLeft: game.s.timer ? 60 : null,
      choice, choices: choice ? makeChoices(item) : null,
      active: null, locked: new Set(), closeBy: new Set(), steps: 0,
    };
    $('#loading').classList.add('hidden');
    $('#modeTag').innerHTML = `${I(Distort.MODES[st.mode].icon)}${Distort.MODES[st.mode].label}`;
    $('#sourceTag').classList.toggle('hidden', !item.online);
    renderChoices();
    layoutControls();
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
      $('#timer').innerHTML = `${I('timer')}${round.timeLeft}`;
      $('#timer').classList.remove('warn');
      timerId = setInterval(() => {
        if (!round || round.done) { clearInterval(timerId); return; }
        round.timeLeft--;
        $('#timer').innerHTML = `${I('timer')}${round.timeLeft}`;
        $('#timer').classList.toggle('warn', round.timeLeft <= 10);
        if (round.timeLeft <= 0) { clearInterval(timerId); finishRound(false, 'Čas vypršel!'); }
      }, 1000);
    }
    const input = $('#guessInput');
    input.value = '';
    input.placeholder = item.theme === 'landmarks' ? 'Co je to za místo?' : 'Co je to za zvíře?';
    // na mobilu klávesnice nevyskakuje hned, aby byl vidět obrázek
    if (!game.duel && !round.choice && !game.photos && window.matchMedia('(pointer: fine)').matches) input.focus();
  }

  function renderChoices() {
    const box = $('#choices');
    box.innerHTML = '';
    if (!round.choice) return;
    round.choices.forEach(n => {
      const b = document.createElement('button');
      b.className = 'choice';
      b.type = 'button';
      b.textContent = cap(n);
      b.onclick = () => answer(n, b);
      box.appendChild(b);
    });
  }

  /** Které ovládací prvky jsou vidět (psaní, možnosti, bzučáky, fotky) */
  function layoutControls() {
    const r = round, g = game;
    const answering = !g.duel || r.active !== null;
    $('#photoCtrl').classList.toggle('hidden', !g.photos);
    $('#buzzers').classList.toggle('hidden', !g.duel || g.photos || r.active !== null || r.done);
    $('#guessForm').classList.toggle('hidden', g.photos || r.choice || !answering);
    $('#choices').classList.toggle('hidden', g.photos || !r.choice || !answering);
    $('#gameActions').classList.toggle('hidden', g.photos);
    $('#btnGiveUp').innerHTML = g.duel ? `${I('ban')}Nikdo neví` : `${I('flag')}Nevím`;
    $('#duelStatus').classList.toggle('hidden', !g.duel);
    $('#answering').classList.toggle('hidden', !g.duel || r.active === null);
    if (g.duel && r.active !== null) {
      const p = g.players[r.active];
      $('#answering').style.setProperty('--pc', PLAYER_COLORS[r.active]);
      $('#answering').innerHTML = `<span class="av">${esc(p.name.charAt(0).toUpperCase())}</span>` +
        `<span>Odpovídá <b>${esc(p.name)}</b></span><button type="button" class="link-btn" id="btnCancelBuzz">zrušit</button>`;
      $('#btnCancelBuzz').onclick = () => { round.active = null; layoutControls(); };
    }
    if (g.duel) {
      $$('#buzzers .buzz').forEach(b => {
        const i = +b.dataset.p;
        b.querySelector('.bz-name').textContent = g.players[i].name;
        const locked = r.locked.has(i);
        b.disabled = locked;
        b.querySelector('b').textContent = locked ? 'Vedle' : 'Vím!';
      });
    }
  }

  $$('#buzzers .buzz').forEach(b => b.addEventListener('click', () => {
    if (!round || round.done || !game.duel || round.active !== null) return;
    const i = +b.dataset.p;
    if (round.locked.has(i)) return;
    round.active = i;
    if (navigator.vibrate) navigator.vibrate(40);
    $('#feedback').textContent = '';
    $('#feedback').className = 'feedback';
    layoutControls();
    if (!round.choice) { const inp = $('#guessInput'); inp.value = ''; inp.focus(); }
  }));

  function draw() {
    if (!round) return;
    round.info = Distort.render($('#gameCanvas'), round.img, round.st);
  }

  function updateGameUI() {
    const g = game, r = round;
    const per = g.duel ? 1 : g.players.length;
    const roundNo = Math.floor(g.turn / per) + 1;
    const totalR = g.total === Infinity ? '∞' : Math.ceil(g.total / per);
    $('#roundInfo').textContent = g.daily ? `Denní výzva · ${roundNo} z ${totalR}` : `Kolo ${roundNo}` + (g.total === Infinity ? '' : ` z ${totalR}`);
    $('#roundProgress').style.width = g.total === Infinity ? '100%' : `${Math.round((g.turn + (r.done ? 1 : 0)) / g.total * 100)}%`;
    const pi = r.player ? g.players.indexOf(r.player) : -1;
    $('#playerInfo').classList.toggle('hidden', g.duel || g.players.length < 2);
    $('#playerInfo').innerHTML = r.player && g.players.length > 1 ? `<span class="av" style="background:${PLAYER_COLORS[pi]}">${esc(r.player.name.charAt(0).toUpperCase())}</span>Hraje ${esc(r.player.name)}` : '';
    $('.game-top .score').classList.toggle('hidden', g.duel);
    if (!g.duel) {
      const sc = $('#scoreInfo');
      if (sc.textContent !== String(r.player.score)) {
        sc.textContent = r.player.score;
        sc.parentElement.classList.remove('bump'); void sc.offsetWidth; sc.parentElement.classList.add('bump');
      }
    } else {
      $('#duelStatus').innerHTML = g.players.map((p, i) =>
        `<div class="ds ${r.locked.has(i) ? 'locked' : ''}" style="--pc:${PLAYER_COLORS[i]}"><span class="av">${esc(p.name.charAt(0).toUpperCase())}</span>` +
        `<span class="ds-n">${esc(p.name)}</span><b>${p.score}</b></div>`).join('<span class="vs">vs</span>');
    }
    const showHearts = !g.duel && !g.photos;
    $('#attempts').classList.toggle('hidden', !showHearts);
    if (showHearts) {
      const prev = $('#attempts').dataset.n;
      $('#attempts').innerHTML = [0, 1, 2].map(i =>
        `<svg class="i fill ${i < r.attempts ? '' : 'lost'} ${prev && i === r.attempts && +prev > r.attempts ? 'lose' : ''}" aria-hidden="true"><use href="#i-heart"/></svg>`).join('');
      $('#attempts').dataset.n = r.attempts;
      $('#attempts').setAttribute('aria-label', `Zbývající pokusy: ${r.attempts}`);
    }
    const left = r.hints.length - r.hintsUsed;
    $('#btnHint').disabled = left <= 0 || r.done;
    $('#hintCost').textContent = left > 0 ? `−15 b.` : 'došly';
    if (g.photos) {
      const steps = PHOTO_POINTS.length - 1;
      $('#btnMore').disabled = r.steps >= steps || r.done;
      $('#moreCost').textContent = r.steps >= steps ? 'víc nejde' : `pak za ${photoPoints(r.steps + 1)} b.`;
    }
  }

  function showHint() {
    if (!round || round.done || round.hintsUsed >= round.hints.length) return;
    const li = document.createElement('li');
    li.innerHTML = `<span class="hn">${round.hintsUsed + 1}</span><span class="ht">${hintHtml(round.hints[round.hintsUsed])}</span>`;
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
    answer(guess);
  });

  /** Vyhodnotí odpověď (napsanou nebo vybranou z možností) */
  function answer(guess, btn) {
    if (!round || round.done) return;
    if (game.duel && round.active === null) return;
    const input = $('#guessInput');
    const res = btn
      ? (guess === round.item.name ? 'correct' : 'wrong')
      : Match.check(guess, round.item, { strict: game.s.answer === 'precise' });
    if (res === 'correct') {
      if (btn) btn.classList.add('right');
      finishRound(true);
      return;
    }
    const who = game.duel ? round.active : 0;
    if (res === 'close' && !round.closeBy.has(who)) {
      round.closeBy.add(who);
      feedback(game.s.answer === 'precise' && round.item.theme === 'animals'
        ? `${I('hand')}<span>Skoro! Správné zvíře, ale napiš i druh. <small>Pokus se nepočítá.</small></span>`
        : `${I('hand')}<span>Skoro! Zkus to upřesnit. <small>Pokus se nepočítá.</small></span>`, 'close');
      input.select();
      return;
    }
    if (btn) { btn.classList.add('wrong'); btn.disabled = true; }
    Distort.onMiss(round.st);
    draw();
    $('#canvasWrap').classList.remove('shake'); void $('#canvasWrap').offsetWidth; $('#canvasWrap').classList.add('shake');
    if (navigator.vibrate) navigator.vibrate(60);
    const other = btn ? null : Match.findItem(guess, ALL_ITEMS);
    const what = other && other.id !== round.item.id ? `Není to ${esc(other.name)}.` : `„${esc(btn ? cap(guess) : guess)}“ to není.`;
    input.value = '';

    if (game.duel) {
      round.locked.add(round.active);
      const missed = game.players[round.active].name;
      round.active = null;
      if (round.locked.size >= game.players.length) { finishRound(false); return; }
      const nextP = game.players.find((p, i) => !round.locked.has(i));
      if (document.activeElement) document.activeElement.blur();
      feedback(`${I('circle-x')}<span>${esc(missed)}: ${what} <small>Teď může ${esc(nextP.name)}!</small></span>`, 'wrong');
      layoutControls();
      updateGameUI();
      return;
    }
    round.attempts--;
    if (round.attempts <= 0) { finishRound(false); return; }
    feedback(`${I('circle-x')}<span>${what}${round.st.ease ? ' <small>Obrázek je teď o kousek lehčí.</small>' : ''}</span>`, 'wrong');
    updateGameUI();
  }

  $('#btnGiveUp').addEventListener('click', () => { if (round && !round.done) finishRound(false); });

  /** Jiný obrázek – když se fotka nenačte nebo je nepoužitelná. Kolo se nepočítá. */
  $('#btnSkip').addEventListener('click', () => {
    if (!game || (round && round.done)) return;
    if (round) round.done = true;
    cancelAnimationFrame(rafId);
    clearInterval(timerId);
    if (game.photos && game.total > game.turn + 1) game.total--; // fotka se přeskočí, kol bude o jedno méně
    else if (game.photos) { endGame(); return; }
    toast('Kolo se nepočítá, dávám jiný obrázek.', 2000, null, 'dices');
    nextTurn(true);
  });

  // vlastní fotky: postupné odkrývání a odhalení
  const PHOTO_POINTS = [100, 70, 45, 25, 10];
  const photoPoints = steps => Math.round(PHOTO_POINTS[Math.min(steps, PHOTO_POINTS.length - 1)] * Distort.DIFFICULTY[round.st.difficulty].mult);
  $('#btnMore').addEventListener('click', () => {
    if (!round || round.done || !game.photos || round.steps >= PHOTO_POINTS.length - 1) return;
    round.steps++;
    Distort.onMiss(round.st);
    draw();
    updateGameUI();
  });
  $('#btnReveal').addEventListener('click', () => { if (round && !round.done) finishRound(null); });

  function calcPoints(ok) {
    if (!ok) return 0;
    let p;
    if (game.duel) p = [100, 60][Math.min(1, round.locked.size)];
    else p = [100, 60, 35][3 - round.attempts];
    p = Math.max(10, p - 15 * round.hintsUsed);
    p *= Distort.DIFFICULTY[round.st.difficulty].mult;
    if (game.s.answer === 'precise' && round.item.theme === 'animals') p *= 1.25;
    if (game.s.answer === 'choice') p *= 0.5;
    if (round.st.mode === 'reveal' && round.info && round.info.revealed != null) p *= 1 + (1 - round.info.revealed);
    if (round.timeLeft != null) p *= 1 + round.timeLeft / 120;
    return Math.round(p);
  }

  /** Konec kola. ok = true/false, u vlastních fotek null (rozhodnou hráči). */
  function finishRound(ok, reason) {
    if (!round || round.done) return;
    round.done = true;
    cancelAnimationFrame(rafId);
    clearInterval(timerId);
    const it = round.item;
    const winnerIdx = game.duel ? round.active : null;
    round.active = null;
    layoutControls();

    if (it.photo) {
      showPhotoResult(reason);
      return;
    }

    const pts = calcPoints(ok);
    const winner = game.duel ? (ok ? game.players[winnerIdx] : null) : round.player;
    if (winner) { winner.score += pts; if (ok) winner.ok++; }
    const entry = {
      item: it, ok, pts, player: winner && (ok || !game.duel) ? winner.name : '—',
      tries: game.duel ? round.locked.size + 1 : 3 - round.attempts + (ok ? 1 : 0), hints: round.hintsUsed, mode: round.st.mode,
    };
    game.history.push(entry);
    recordStats(entry);
    if (!it.online) rememberRecent(it.id);
    if (ok) addToCollection(it);
    if (ok && navigator.vibrate) navigator.vibrate([30, 40, 30]);

    const rh = $('#resultHead');
    rh.className = 'result-head ' + (ok ? 'ok' : 'bad');
    if (ok && game.duel) rh.innerHTML = `${I('trophy')}Bod pro ${esc(winner.name)}!`;
    else if (ok) rh.innerHTML = `${I('circle-check')}${round.attempts === 3 && !round.hintsUsed ? 'Na první dobrou!' : 'Správně!'}`;
    else rh.innerHTML = `${I(reason ? 'clock' : 'circle-x')}${reason || (game.duel ? 'Nikdo to nedal' : 'Tentokrát ne')} · bylo to:`;
    Distort.renderFull($('#resultCanvas'), round.img);
    $('#resultName').textContent = cap(it.name);
    $('#resultSci').innerHTML = it.sci ? `<i>${esc(it.sci)}</i>` : `${esc(it.country || '')}`;
    $('#resultSci').classList.remove('hidden');
    $('#resultPoints').textContent = ok ? `+${pts} b.` : '0 b.';
    $('#resultPoints').className = 'points-badge' + (ok ? '' : ' zero');
    const factEl = $('#resultFact');
    factEl.textContent = it.hint || '';
    $('#resultFactBox').classList.toggle('hidden', !it.hint);
    loadFact(it, round.detail).then(f => {
      if (f && $('#resultName').textContent === cap(it.name)) { factEl.textContent = f; $('#resultFactBox').classList.remove('hidden'); }
    });
    $('#resultCredit').innerHTML = creditHtml(it);
    $('#judge').classList.add('hidden');
    $('#btnNext').classList.remove('hidden');
    const last = game.turn + 1 >= game.total;
    $('#btnNext').innerHTML = `<span>${last ? 'Výsledky' : 'Další'}</span>${I(last ? 'trophy' : 'arrow-right')}`;
    openResult();
    updateGameUI();
  }

  function openResult() {
    $('#resultOverlay').classList.remove('hidden');
    $('#resultOverlay .sheet').scrollTop = 0;
    if (document.activeElement) document.activeElement.blur();
  }

  /** Výsledek u vlastní fotky – hráči sami řeknou, kdo to uhodl */
  function showPhotoResult(reason) {
    const it = round.item;
    const pts = photoPoints(round.steps);
    const rh = $('#resultHead');
    rh.className = 'result-head photo';
    rh.innerHTML = `${I(reason ? 'clock' : 'images')}${reason ? reason + ' · ' : ''}Co to bylo?`;
    Distort.renderFull($('#resultCanvas'), round.img);
    $('#resultName').textContent = it.caption ? it.caption : 'Naše fotka';
    $('#resultSci').classList.add('hidden');
    $('#resultPoints').className = 'points-badge';
    $('#resultPoints').textContent = `za ${pts} b.`;
    $('#resultFactBox').classList.add('hidden');
    $('#resultCredit').innerHTML = '';
    $('#btnNext').classList.add('hidden');
    const judge = $('#judge');
    judge.classList.remove('hidden');
    const btn = (label, cls, onClick, color) => {
      const b = document.createElement('button');
      b.className = 'btn ' + cls;
      if (color) b.style.setProperty('--pc', color);
      b.innerHTML = label;
      b.onclick = onClick;
      return b;
    };
    const q = game.duel ? 'Kdo to uhodl?' : game.players.length > 1 ? `Uhodl/a to <b>${esc(round.player.name)}</b>?` : 'Uhodl/a jsi to?';
    judge.innerHTML = `<p class="judge-q">${q}</p>`;
    const row = document.createElement('div');
    row.className = 'judge-row' + (game.duel ? ' three' : '');
    const done = winner => () => photoJudged(winner, pts);
    if (game.duel) {
      game.players.forEach((p, i) => row.appendChild(btn(`${I('trophy')}${esc(p.name)}`, 'pbtn', done(p), PLAYER_COLORS[i])));
      row.appendChild(btn(`${I('ban')}Nikdo`, 'soft', done(null)));
    } else {
      row.appendChild(btn(`${I('circle-x')}Ne`, 'soft', done(null)));
      row.appendChild(btn(`${I('circle-check')}Ano, +${pts} b.`, 'primary', done(round.player)));
    }
    judge.appendChild(row);
    openResult();
    updateGameUI();
  }

  function photoJudged(winner, pts) {
    if (!game) return;
    if (winner) { winner.score += pts; winner.ok++; }
    game.history.push({ item: round.item, ok: !!winner, pts: winner ? pts : 0, player: winner ? winner.name : '—', tries: round.steps + 1, hints: 0, mode: round.st.mode });
    rememberRecent(round.item.id, 'recentPhotos', Math.max(3, Math.floor(photoList.length * 0.6)));
    if (winner && navigator.vibrate) navigator.vibrate([30, 40, 30]);
    goNext();
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
    return `${I('camera')}<span>${esc(it.credit)}${lic}${src}</span>`;
  }

  function goNext() {
    $('#resultOverlay').classList.add('hidden');
    if (!game) return;
    game.turn++;
    nextTurn();
  }
  $('#btnNext').addEventListener('click', goNext);

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
    if (!g.photos) {
      const stats = store.get('stats', {});
      stats.games = (stats.games || 0) + 1;
      stats.best = Math.max(stats.best || 0, ...g.players.map(p => p.score));
      store.set('stats', stats);
    }

    const ps = [...g.players].sort((a, b) => b.score - a.score);
    let title = 'Konec hry', icon = 'flag';
    const tie = g.players.length > 1 && ps[0].score === ps[1].score;
    if (g.players.length > 1) { title = tie ? 'Remíza!' : `Vyhrává ${ps[0].name}!`; icon = tie ? 'users' : 'trophy'; }
    else {
      const ok = g.history.filter(h => h.ok).length;
      if (ok === g.history.length && ok) { title = 'Bez jediné chyby!'; icon = 'trophy'; }
      else { title = `Uhodnuto ${ok} z ${g.history.length}`; icon = ok ? 'medal' : 'flag'; }
    }
    if (g.daily) { title = 'Denní výzva hotová'; icon = 'calendar-days'; }
    $('#endTitle').textContent = title;
    $('#endIcon').innerHTML = I(icon);
    const best = Math.max(...g.players.map(p => p.score));
    $('#endScores').innerHTML = g.players.map((p, i) => {
      const win = g.players.length > 1 && !tie && p.score === best;
      return `<div class="end-score${win ? ' win' : ''}">${win ? `<span class="crown">${I('crown')}</span>` : ''}` +
        `<span>${g.players.length > 1 ? `<i class="pdot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${PLAYER_COLORS[i]};margin-right:6px"></i>` : ''}${esc(p.name)}</span>` +
        `<b>${p.score}</b><small>${p.ok} uhodnuto</small></div>`;
    }).join('');
    $('#endList').innerHTML = g.history.map(h =>
      `<li class="${h.ok ? 'ok' : 'bad'}">${I(h.ok ? 'circle-check' : 'circle-x')}<img class="thumb" src="${esc(h.item.thumb || h.item.img)}" alt="">` +
      `<span class="nm">${esc(cap(h.item.name))}${g.players.length > 1 && h.player !== '—' ? ` <small class="muted">· ${esc(h.player)}</small>` : ''}</span>` +
      `<span class="pt">${h.pts} b.</span></li>`).join('');

    $('#endShare').classList.toggle('hidden', !g.daily);
    if (g.daily) {
      const marks = g.history.map(h => !h.ok ? '🟥' : h.tries === 1 && !h.hints ? '🟩' : '🟨').join('');
      const score = g.players[0].score;
      const d = new Date();
      const text = `Hádej zvířata · denní výzva ${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}\n` +
        `Režim: ${Distort.MODES[g.daily.mode].label}\n${marks}  ${score} b.`;
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
    if ($('#endShare').classList.contains('hidden')) startWith(settings);
    else show('home');
  });
  $('#btnShare').addEventListener('click', async () => {
    const text = $('#shareText').textContent;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast('Zkopírováno do schránky', 2600, null, 'copy'); }
    } catch (e) { /* zrušeno */ }
  });

  $('#btnQuick').addEventListener('click', () => startWith(settings));
  $('#btnStart').addEventListener('click', () => startWith(settings));
  $('#btnPlayPhotos').addEventListener('click', () => {
    settings.theme = 'photos'; saveSettings();
    startWith(settings);
  });

  async function startWith(s) {
    if (s.theme === 'photos') {
      await refreshPhotos();
      if (!photoList.length) { toast('Nejdřív přidejte nějaké fotky.', 3000, null, 'image-plus'); show('photos'); return; }
      newGame(s);
      return;
    }
    if (!offlinePool(s).length) { toast('Pro tento výběr nejsou žádné obrázky. Uprav skupiny.', 3000, null, 'circle-alert'); show('setup'); return; }
    newGame(s);
  }

  // ------------------------------------------------------------ denní výzva
  $('#btnDaily').addEventListener('click', () => {
    const key = todayKey();
    const done = store.get('daily', {})[key];
    if (done) {
      $('#endTitle').textContent = 'Dnešní výzvu už máš';
      $('#endIcon').innerHTML = I('calendar-days');
      $('#endScores').innerHTML = `<div class="end-score"><span>Tvůj výsledek</span><b>${done.score}</b><small>${done.marks}</small></div>`;
      $('#endList').innerHTML = `<li>${I('clock')}<span class="nm">Zítra tu bude nová výzva.</span></li>`;
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
    const s = { ...settings, theme: 'animals', packA: 'all', modes: [mode], diff: 1, players: 1, rounds: 5, online: false, ease: true, timer: false, answer: 'loose', groups: GROUPS.map(g => g.v) };
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
        ? `<span><b>${have}</b> ${plural(have, 'zvíře', 'zvířata', 'zvířat')} uhodnutých z internetu</span>`
        : `<span>Zatím nic. Zapni v nastavení „Zvířata i z internetu“ a hraj s připojením.</span>`;
    } else {
      list = ALL_ITEMS.filter(i => i.theme === colTab && i.img && !i.online);
      have = list.filter(i => col[i.id]).length;
      const pct = list.length ? Math.round(have / list.length * 100) : 0;
      $('#colProgress').innerHTML = `<span><b>${have}</b> z ${list.length} objeveno · ${pct} %</span><div class="bar"><span style="width:${pct}%"></span></div>`;
    }
    const frag = document.createDocumentFragment();
    list.forEach(it => {
      const got = colTab === 'online' || col[it.id];
      const d = document.createElement('button');
      d.className = 'col-item' + (got ? '' : ' locked');
      if (got) {
        const src = it.thumb || it.img;
        d.innerHTML = `<div class="ph"><img loading="lazy" src="${esc(src)}" alt=""></div><span>${esc(cap(it.name))}</span>`;
        d.onclick = () => openDetail(it, col[it.id]);
      } else {
        d.innerHTML = `<div class="ph"><img loading="lazy" src="${esc(it.img)}" alt=""></div><div class="lock">${I('lock')}</div>` +
          `<span>${'•'.repeat(Math.min(7, it.name.length))}</span>`;
        d.onclick = () => toast('Tohle ještě musíš uhodnout ve hře.', 2600, null, 'lock');
      }
      frag.appendChild(d);
    });
    grid.appendChild(frag);
    if (!list.length) grid.innerHTML = `<div class="empty" style="grid-column:1/-1">${I('globe')}Tady se objeví zvířata, která uhodneš z internetu.</div>`;
  }

  function openDetail(it, c) {
    $('#detailImg').src = it.img;
    $('#detailName').textContent = cap(it.name);
    $('#detailSci').innerHTML = it.sci ? `<i>${esc(it.sci)}</i>` : esc(it.country || '');
    const info = [];
    if (it.region) info.push(['map-pin', esc(it.region)]);
    if (it.country) info.push(['map-pin', `${esc(it.country)} · ${esc(it.continent || '')}`]);
    if (it.hint) info.push(['book-open', esc(it.hint)]);
    if (c) info.push(['trophy', `Uhodnuto ${c.n}× · poprvé ${c.d.split('-').reverse().map(Number).join('. ')}`]);
    $('#detailInfo').innerHTML = info.map(([ic, t]) => `<div>${I(ic)}<span>${t}</span></div>`).join('');
    $('#detailCredit').innerHTML = creditHtml(it);
    $('#detailOverlay').classList.remove('hidden');
  }
  $('#btnDetailClose').addEventListener('click', () => $('#detailOverlay').classList.add('hidden'));

  function renderStats() {
    const st = store.get('stats', {});
    const col = store.get('collection', {});
    const r = st.rounds || 0, c = st.correct || 0;
    const acc = r ? Math.round(c / r * 100) : 0;
    const tile = (ic, cls, v, l) => `<div class="tile"><span class="tile-ic ${cls}">${I(ic)}</span><b>${v}</b><span>${l}</span></div>`;
    let html = `<div class="tiles">
      ${tile('target', 'green', acc + ' %', 'úspěšnost')}
      ${tile('flame', '', st.bestStreak || 0, 'nejdelší série')}
      ${tile('zap', 'blue', st.firstTry || 0, 'na první pokus')}
      ${tile('award', 'violet', st.best || 0, 'nejlepší hra (body)')}
      ${tile('flag', 'green', st.games || 0, 'odehraných her')}
      ${tile('image', 'blue', r, 'odehraných kol')}
      ${tile('star', '', st.points || 0, 'bodů celkem')}
      ${tile('paw-print', 'violet', Object.keys(col).length, 've sbírce')}
    </div>`;
    const modes = Object.entries(st.byMode || {});
    if (modes.length) {
      html += '<section class="card"><h3 class="card-h">Úspěšnost podle režimu</h3><div class="bars">' + modes.map(([m, v]) => {
        const p = Math.round(v.c / v.r * 100);
        const M = Distort.MODES[m];
        return `<div class="barrow"><span>${M ? I(M.icon) + M.label : m}</span><div class="bar"><span style="width:${p}%"></span></div><b>${p} %</b></div>`;
      }).join('') + '</div></section>';
    }
    const hard = Object.values(st.items || {}).filter(i => i.r - i.c > 0).sort((a, b) => (b.r - b.c) - (a.r - a.c)).slice(0, 8);
    if (hard.length) {
      html += '<section class="card"><h3 class="card-h">Nejvíc tě potrápilo</h3><ul class="hard">' +
        hard.map(i => `<li><span>${esc(cap(i.n))}</span><small>${i.r - i.c}× neuhodnuto</small></li>`).join('') + '</ul></section>';
    }
    if (!r) html = `<div class="empty">${I('chart-column')}Zatím žádné hry. Zahraj si a statistiky se tu objeví.</div>`;
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
    if (!confirm('Opravdu smazat sbírku, statistiky a denní výzvy? (Vaše fotky zůstanou.)')) return;
    ['stats', 'collection', 'daily', 'recent'].forEach(k => localStorage.removeItem('hz.' + k));
    toast('Smazáno.', 2600, null, 'check');
  });

  // ------------------------------------------------------------ naše fotky
  async function renderPhotos() {
    await refreshPhotos();
    const grid = $('#photoGrid');
    grid.innerHTML = '';
    $('#btnPlayPhotos').disabled = !photoList.length;
    $('#photoTip').classList.toggle('hidden', !photoList.length);
    photoList.forEach(p => {
      const d = document.createElement('button');
      d.className = 'col-item photo-item';
      d.innerHTML = `<div class="ph"><img loading="lazy" src="${Photos.thumbUrl(p)}" alt=""></div>` +
        `<span class="${p.caption ? '' : 'nocap'}">${p.caption ? esc(p.caption) : `${I('pencil')} přidat popis`}</span>`;
      d.onclick = () => openPhotoEdit(p);
      grid.appendChild(d);
    });
    if (!photoList.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1">${I('image-plus')}Zatím tu nic není. Klepněte na „Přidat fotky“ a vyberte pár společných fotek.</div>`;
    }
  }

  $('#photoInput').addEventListener('change', async e => {
    // některé telefony posílají fotky bez typu souboru – bereme vše, co vypadá jako obrázek nebo nemá typ
    const files = Array.from(e.target.files || []).filter(f => !f.type || /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp|gif|avif)$/i.test(f.name));
    e.target.value = '';
    if (!files.length) { toast('Nevybrali jste žádné fotky.', 3000, null, 'circle-alert'); return; }
    const prog = $('#photoProgress');
    prog.classList.remove('hidden');
    $('#btnPlayPhotos').disabled = true;
    let done = 0;
    const fail = { format: 0, memory: 0, storage: 0, other: 0 };
    const upd = () => {
      const pct = Math.round(done / files.length * 100);
      prog.innerHTML = `<span>Ukládám fotky… <b>${done}</b> z ${files.length}</span><div class="bar"><span style="width:${pct}%"></span></div>`;
    };
    upd();
    for (const f of files) {
      try {
        await Photos.addFile(f);
      } catch (err) {
        const k = err && err.message in fail ? err.message : 'other';
        fail[k]++;
        console.warn('Fotku se nepodařilo přidat', f.name, f.type, err);
        if (k === 'storage') break; // došlo místo – další by taky selhaly
      }
      done++; upd();
      if (done % 10 === 0) renderPhotos();
      await sleep(30); // nechat telefon uvolnit paměť
    }
    prog.classList.add('hidden');
    Photos.persist();
    await renderPhotos();
    const failed = fail.format + fail.memory + fail.storage + fail.other;
    const ok = done - failed;
    if (!failed) {
      toast(`Přidáno ${ok} ${plural(ok, 'fotka', 'fotky', 'fotek')}.`, 3000, null, 'check');
    } else {
      const why = [];
      if (fail.format) why.push(`${fail.format}× neznámý formát (např. HEIC – v iPhonu nastavte Fotoaparát → Formáty → Nejkompatibilnější)`);
      if (fail.memory) why.push(`${fail.memory}× nedostatek paměti (zkuste je přidat po menších skupinách)`);
      if (fail.storage) why.push('v telefonu došlo místo pro aplikaci');
      if (fail.other) why.push(`${fail.other}× jiná chyba`);
      toast(`Přidáno ${ok} z ${files.length}. Nepovedlo se: ${why.join('; ')}.`, 12000, null, 'circle-alert');
    }
  });

  let editing = null;
  function openPhotoEdit(p) {
    editing = { ...p };
    $('#editImg').src = Photos.url(p);
    $('#editCaption').value = p.caption || '';
    placeDot();
    $('#photoEdit').classList.remove('hidden');
  }
  function placeDot() {
    $('#focusDot').style.left = `${editing.cx * 100}%`;
    $('#focusDot').style.top = `${editing.cy * 100}%`;
  }
  $('#focusWrap').addEventListener('click', e => {
    if (!editing) return;
    const r = $('#editImg').getBoundingClientRect();
    editing.cx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    editing.cy = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    placeDot();
  });
  $('#btnPhotoSave').addEventListener('click', async () => {
    if (!editing) return;
    editing.caption = $('#editCaption').value.trim();
    await Photos.put(editing);
    editing = null;
    $('#photoEdit').classList.add('hidden');
    renderPhotos();
  });
  $('#btnPhotoDelete').addEventListener('click', async () => {
    if (!editing || !confirm('Smazat tuto fotku ze hry? (V galerii telefonu zůstane.)')) return;
    await Photos.remove(editing.id);
    editing = null;
    $('#photoEdit').classList.add('hidden');
    renderPhotos();
  });
  $('#photoEdit').addEventListener('click', e => { if (e.target.id === 'photoEdit') $('#btnPhotoSave').click(); });

  // ------------------------------------------------------------ offline: stažení obrázků
  async function precacheImages() {
    const pill = $('#offlineStatus');
    if (!('caches' in window)) { pill.innerHTML = ''; return; }
    // fotky v aplikaci i fotky míst z Wikimedia Commons (ty se stáhnou do telefonu při prvním spuštění)
    const urls = [...new Set(ALL_ITEMS.filter(i => i.img && !i.online).map(i => new URL(i.img, location.href).href))];
    const cache = await caches.open(IMG_CACHE);
    const have = new Set((await cache.keys()).map(r => r.url));
    have.forEach(u => readyRemote.add(u));
    let missing = urls.filter(u => !have.has(u));
    const total = urls.length;
    const update = () => {
      const done = total - missing.length;
      const ready = done >= total;
      pill.innerHTML = ready
        ? `${I('circle-check')}<span>Připraveno i bez internetu · ${total} fotek</span>`
        : `${I('download')}<span>Ukládám fotky do telefonu</span><div class="bar"><span style="width:${Math.round(done / total * 100)}%"></span></div><span>${done}/${total}</span>`;
      pill.classList.toggle('loading-state', !ready);
    };
    update();
    if (!missing.length || !Online.isOnline()) return;
    const local = missing.filter(u => new URL(u).origin === location.origin);
    const remote = missing.filter(u => new URL(u).origin !== location.origin);
    const add = async (u, sameOrigin) => {
      await cache.add(new Request(u, { mode: sameOrigin ? 'same-origin' : 'cors', credentials: 'omit' }));
      missing = missing.filter(x => x !== u);
      readyRemote.add(u);
      update();
    };
    const localWorker = async () => { while (local.length) { const u = local.shift(); try { await add(u, true); } catch (e) { /* příště */ } } };
    // fotky z Wikimedie po jedné a s pauzou, ať server nezačne odmítat; po opakovaném odmítnutí to zkusí při dalším spuštění
    const remoteWorker = async () => {
      let fails = 0;
      while (remote.length && fails < 4) {
        const u = remote.shift();
        try { await add(u, false); fails = 0; } catch (e) { fails++; await sleep(2500 * fails); }
        await sleep(350);
      }
    };
    await Promise.all([localWorker(), localWorker(), localWorker(), remoteWorker()]);
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
      : 'V menu prohlížeče (⋮) zvol <b>Přidat na plochu</b> nebo <b>Nainstalovat aplikaci</b>.', 8000, null, 'smartphone');
  });
  window.addEventListener('appinstalled', () => $('#btnInstall').classList.add('hidden'));

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Je k dispozici nová verze. Klepni sem pro obnovení.', 0, () => nw.postMessage('skipWaiting'), 'sparkles');
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
