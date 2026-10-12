/* =========================================================================
   Arknight Card Battle — Front-end menu
   Screens: Play (home) · Deck Builder · Card Database · Settings
   Persists the player's deck and settings to localStorage.
   ========================================================================= */
(function (global) {
  'use strict';

  const C = global.Cards;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  // escape only double quotes so HTML tags inside a data-tip attribute survive
  const attr = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;');

  const LS_DECK = 'acb.deck.v3';
  const LS_SET = 'acb.settings.v1';

  const LIMITS = { total: 20, artPerMax: 2 };
  const CLASS_ORDER = ['Vanguard', 'Guard', 'Defender', 'Sniper', 'Caster', 'Medic', 'Supporter', 'Specialist'];
  const VANGUARD_SLUGS = C.OPERATORS.filter(o => o.cls === 'Vanguard').map(o => o.slug);

  const DEFAULT_DECK = {
    operators: ['siege', 'texas', 'silverash', 'blaze', 'hoshiguma', 'saria', 'exusiai', 'schwarz',
      'eyjafjalla', 'ceobe', 'nightingale', 'angelina', 'skadi', 'mountain'],
    arts: ['arts_surge', 'arts_surge', 'arts_medicdrone', 'arts_medicdrone', 'arts_barrage', 'arts_barrage']
  };
  const DEFAULT_SETTINGS = { sound: true, volume: 0.7, music: false, animations: true, dmgNumbers: true, shake: true, detailFull: false };

  const clone = (o) => JSON.parse(JSON.stringify(o));

  let deck = loadDeck();
  let settings = loadSettings();
  const state = { screen: 'home', deckFilter: 'All', codexTab: 'operators', codexFilter: 'All', roomCode: null, onlineMsg: '', deckSearch: '', codexSearch: '' };

  function loadDeck() {
    try {
      const d = JSON.parse(localStorage.getItem(LS_DECK));
      if (d && Array.isArray(d.operators) && Array.isArray(d.arts)) return { operators: d.operators, arts: d.arts };
    } catch (e) {}
    return clone(DEFAULT_DECK);
  }
  function saveDeck() { try { localStorage.setItem(LS_DECK, JSON.stringify(deck)); } catch (e) {} }
  function loadSettings() {
    try { const s = JSON.parse(localStorage.getItem(LS_SET)); if (s) return Object.assign(clone(DEFAULT_SETTINGS), s); } catch (e) {}
    return clone(DEFAULT_SETTINGS);
  }
  function saveSettings() { try { localStorage.setItem(LS_SET, JSON.stringify(settings)); } catch (e) {} }

  function applyGraphics() {
    document.body.classList.toggle('no-anim', settings.animations === false);
    document.body.classList.toggle('no-fx', settings.dmgNumbers === false);
    document.body.classList.toggle('no-shake', settings.shake === false);
  }

  // ---------------------------------------------------------------- helpers
  const opBySlug = (s) => C.operatorBySlug(s);
  const locName = (id) => { const l = C.locationById(id); return l ? l.name : '—'; };
  const rangeLabel = (r) => r === 'long' ? 'Long' : r === 'medium' ? 'Medium' : 'Short';
  const stars = (n) => '★'.repeat(n || 0);
  function entries() {
    const list = [];
    deck.operators.forEach(s => list.push({ kind: 'operator', slug: s }));
    deck.arts.forEach(id => list.push({ kind: 'art', id }));
    return list;
  }

  function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function randomDeck() {
    // Total always 20 cards. Arts are brought MOSTLY AS PAIRS: 3..7 distinct
    // Arts, each with 2 copies — except exactly one of them stays a single, so
    // most cards come in 2s without every Art being an identical double.
    const n = 3 + Math.floor(Math.random() * 5);                    // 3..7 distinct Arts
    const picks = shuffleArr(C.ARTS.map(a => a.id)).slice(0, n);
    const singleIdx = Math.floor(Math.random() * n);               // which Art stays x1
    const arts = [];
    picks.forEach((id, i) => { arts.push(id); if (i !== singleIdx) arts.push(id); });
    const opsNeeded = LIMITS.total - arts.length;

    // Vanguards are the opening plays, so the roll is weighted towards them:
    // usually 1–3, sometimes 0, and now and then a swarm of 4–5.
    let vang;
    const r = Math.random();
    if (r < 0.08) vang = 0;                                             // 8%  → none
    else if (r < 0.30) vang = 4 + Math.floor(Math.random() * 2);        // 22% → many (4–5)
    else vang = 1 + Math.floor(Math.random() * 3);                      // 70% → 1–3
    vang = Math.min(vang, opsNeeded, VANGUARD_SLUGS.length);

    const vanguardPicks = shuffleArr(VANGUARD_SLUGS.slice()).slice(0, vang);
    const others = shuffleArr(C.OPERATORS.filter(o => o.cls !== 'Vanguard').map(o => o.slug));
    const operators = vanguardPicks.concat(others.slice(0, opsNeeded - vanguardPicks.length));
    return { operators: operators, arts: arts };
  }

  // ---------------------------------------------------------------- search
  // Free-text search across names, skill text and effect keywords so people
  // can look up things like "buff", "debuff", "sleep", "heal", "destroy" ...
  const SEARCH_EFFECT_TAGS = {
    dmgPlayer: 'damage dmg serang attack burn direct',
    healPlayer: 'heal sembuh pemulihan darah hp medic regen',
    gainDP: 'dp resource ramp gear energi',
    draw: 'draw tarik kartu cycle advantage',
    destroyOperator: 'destroy hancur bunuh kill remove single target',
    destroyFront: 'destroy hancur wipe aoe area clear sweep',
    bounceTarget: 'bounce kembalikan return hand pantul paih',
    buffAtkSelf: 'buff atk strength serang damage naik',
    buffDefSelf: 'buff def defense tahan armor naik',
    buffDefAll: 'buff def defense team aura',
    buffAtkAll: 'buff atk strength team aura lord',
    sleepTarget: 'sleep tidur stun freeze debuff control',
    silenceTarget: 'silence bungkam disable mute debuff control',
    returnFromGrave: 'revive recur grave discard ambil buangan',
    graveToHand: 'revive recur grave discard ambil buangan',
    shuffleOppHand: 'shuffle kocok hand mill disrupt deck',
    shuffleOwnHand: 'shuffle kocok hand redraw cycle deck',
    selfDestructEnd: 'self destruct hancur suicide sekali pakai',
    tempLongRange: 'range long jauh sniper',
    taunt: 'taunt tank provoke penjaga',
    untargetable: 'untargetable kebal stealth immune target',
    dpStart: 'dp resource ramp start awal'
  };
  const BUFF_KINDS = { buffAtkSelf: 1, buffDefSelf: 1, buffAtkAll: 1, buffDefAll: 1, gainDP: 1, draw: 1, healPlayer: 1, dpStart: 1 };
  const DEBUFF_KINDS = { sleepTarget: 1, silenceTarget: 1, destroyOperator: 1, destroyFront: 1, bounceTarget: 1 };

  function searchBlob(kind, obj) {
    const parts = [];
    const effs = [];
    if (kind === 'op') {
      const sk = obj.skill || {};
      parts.push(obj.name, obj.cls, obj.nation, C.NATION_NAME[obj.nation] || '', rangeLabel(obj.range), 'operator kartu');
      parts.push(sk.name, sk.type, sk.text, 'skill');
      if (sk.needsTarget) parts.push('target sasaran');
      (sk.effects || []).forEach(e => effs.push(e.k));
    } else if (kind === 'loc') {
      parts.push(obj.name, 'location lokasi');
      if (obj.text) parts.push(obj.text);
      if (obj.desc) parts.push(obj.desc);
      if (obj.active) { parts.push(obj.active.text, 'active aktif'); (obj.active.effects || []).forEach(e => effs.push(e.k)); }
      (obj.effects || []).forEach(e => effs.push(e.k));
    } else {
      parts.push(obj.name, obj.artType, obj.text, obj.id, 'arts art kartu');
      (obj.effects || []).forEach(e => effs.push(e.k));
    }
    effs.forEach(k => { parts.push(k); parts.push(SEARCH_EFFECT_TAGS[k] || ''); });
    if (effs.some(k => BUFF_KINDS[k])) parts.push('buff');
    if (effs.some(k => DEBUFF_KINDS[k])) parts.push('debuff');
    return parts.filter(Boolean).join(' ').toLowerCase().replace(/\s+/g, ' ');
  }
  const searchAttr = (kind, obj) => ' data-search="' + attr(searchBlob(kind, obj)) + '"';

  function searchTokens(q) { return String(q || '').toLowerCase().split(/\s+/).filter(Boolean); }

  // Toggle .hidden on already-rendered items (no re-render → keeps input focus).
  function applySearch(rootSel, itemSel, q, emptyId, countId) {
    const toks = searchTokens(q);
    let shown = 0;
    document.querySelectorAll(rootSel + ' ' + itemSel).forEach(el => {
      const blob = el.getAttribute('data-search') || '';
      const hit = toks.every(t => blob.indexOf(t) !== -1);
      el.classList.toggle('hidden', !hit);
      if (hit) shown++;
    });
    const em = $(emptyId);
    if (em) em.classList.toggle('hidden', shown > 0);
    const cn = $(countId);
    if (cn) cn.textContent = toks.length ? (shown + ' hasil') : '';
    return shown;
  }
  function applyDeckSearch() {
    const q = state.deckSearch || '';
    const a = applySearch('#menuScreen .dtile-grid.ops', '.dtile', q, 'deckOpsEmpty', null);
    const b = applySearch('#menuScreen .dtile-grid.arts', '.dtile', q, 'deckArtsEmpty', null);
    const cn = $('deckSearchCount'); if (cn) cn.textContent = q.trim() ? ((a + b) + ' hasil') : '';
  }
  function applyCodexSearch() {
    applySearch('#menuScreen .codex-grid', '.codex', state.codexSearch || '', 'codexEmpty', 'codexSearchCount');
  }

  function searchBar(id, act, value, ph) {
    const full = settings.detailFull === true;
    return '<div class="search-row">' +
      '<div class="searchbar">' +
        '<span class="sb-ico">🔍</span>' +
        '<input id="' + id + '" class="search-input" type="text" autocomplete="off" spellcheck="false" data-act="' + act + '" placeholder="' + esc(ph) + '" value="' + esc(value || '') + '">' +
        '<span class="sb-count" id="' + id + 'Count"></span>' +
        '<button class="sb-clear" type="button" data-act="' + act + 'Clear" title="Bersihkan">✕</button>' +
      '</div>' +
      '<button class="sb-toggle ' + (full ? 'on' : '') + '" type="button" data-act="detailToggle" title="Info kartu: ' + (full ? 'Lengkap' : 'Singkat') + ' — klik untuk ubah">' + (full ? 'ⓘ Lengkap' : 'ⓘ Singkat') + '</button>' +
    '</div>';
  }

  // short hover explanations (ⓘ Penjelasan lengkap appended from explain.js)
  function tipOp(op) {
    const sk = op.skill || {};
    return '<div class="tt-name">' + esc(op.name) + '</div>' +
      '<div class="tt-meta">' + op.cls + ' · ' + esc(C.NATION_NAME[op.nation] || 'Independent') + ' · ' + rangeLabel(op.range) + ' range</div>' +
      '<div class="tt-stats"><span class="a">⚔ ' + op.atk + '</span><span class="d">🛡 ' + op.def + '</span><span class="h">❤ ' + C.operatorHp(op) + '</span><span class="c">◈ ' + op.cost + ' DP</span></div>' +
      '<div class="tt-skill"><span class="tt-type">' + esc(sk.type || '') + '</span> <b>' + esc(sk.name || '') + '</b><br>' + esc(sk.text || '') + '</div>' +
      (settings.detailFull ? global.Explain.opTipExtra(op) : '');
  }
  function tipArt(a) {
    return '<div class="tt-name">' + esc(a.name) + '</div>' +
      '<div class="tt-meta">' + (a.artType === 'Field' ? 'Field Arts · lasts ' + a.duration + ' turns' : 'Instant Arts') + ' · ' + a.cost + ' DP</div>' +
      '<div class="tt-skill">' + esc(a.text) + '</div>' +
      (settings.detailFull ? global.Explain.artTipExtra(a) : '');
  }
  function tipLoc(l) {
    return '<div class="tt-name">◈ ' + esc(l.name) + '</div>' +
      '<div class="tt-meta">Location · permanent</div>' +
      '<div class="tt-skill">' + esc(l.text || (l.active ? 'Active (' + l.active.cost + ' DP): ' + l.active.text : '')) + '</div>';
  }

  // ------------------------------------------------- card detail (ⓘ button)
  // The explanation text itself lives in js/explain.js, so the battle UI can
  // render the exact same complete breakdown.
  function detailList(effects, type, duration) {
    return global.Explain.effListHtml(effects, type, duration);
  }
  function detailOp(op) {
    const sk = op.skill || {};
    const type = sk.type || 'Passive';
    return '' +
      '<div class="cd-head">' +
        '<div class="cd-art" style="background-image:url(\'assets/characters/' + op.slug + '.png\')"></div>' +
        '<div class="cd-title">' +
          '<div class="cd-name"><img class="ci" src="' + C.CLASS_ICON[op.cls] + '" alt="">' + esc(op.name) + '</div>' +
          '<div class="cd-sub">' + op.cls + ' · ' + esc(C.NATION_NAME[op.nation] || 'Independent') + ' · ' + rangeLabel(op.range) + ' range · ◈ ' + op.cost + ' DP</div>' +
          '<div class="cd-stats"><span class="a">⚔ ' + op.atk + ' ATK</span><span class="d">🛡 ' + op.def + ' DEF</span><span class="h">❤ ' + C.operatorHp(op) + ' HP</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="cd-sec"><span class="ctype ' + type + '">' + type + '</span> <b>' + esc(sk.name || '—') + '</b>' +
        (sk.cost != null ? ' <span class="cd-chip">◈ ' + sk.cost + ' DP</span>' : '') +
        (sk.needsTarget ? ' <span class="cd-chip target">butuh target</span>' : '') + '</div>' +
      (sk.text ? '<p class="cd-short"><b>Ringkas:</b> ' + esc(sk.text) + '</p>' : '') +
      '<div class="cd-detail-h">ⓘ Penjelasan lengkap</div>' +
      detailList(sk.effects, type, null);
  }
  function detailArt(a) {
    const type = a.artType === 'Field' ? 'Field' : 'Instant';
    return '' +
      '<div class="cd-head">' +
        '<div class="cd-art art" style="background-image:url(\'' + (a.img || '') + '\')"></div>' +
        '<div class="cd-title">' +
          '<div class="cd-name">' + esc(a.name) + '</div>' +
          '<div class="cd-sub">' + (type === 'Field' ? 'Field Art · bertahan ' + a.duration + ' turn' : 'Instant Art · efek langsung') + ' · ◈ ' + a.cost + ' DP</div>' +
        '</div>' +
      '</div>' +
      '<div class="cd-sec"><span class="ctype ' + type + '">' + type + '</span> <b>' + esc(a.name) + '</b></div>' +
      (a.text ? '<p class="cd-short"><b>Ringkas:</b> ' + esc(a.text) + '</p>' : '') +
      '<div class="cd-detail-h">ⓘ Penjelasan lengkap</div>' +
      detailList(a.effects, type, a.duration);
  }

  function showDetail(html) {
    let el = $('cardDetail');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cardDetail';
      el.className = 'cd-overlay';
      document.body.appendChild(el);
      el.addEventListener('click', (ev) => {
        const c = ev.target.closest ? ev.target.closest('.cd-close') : null;
        if (ev.target === el || c) hideDetail();
      });
    }
    el.innerHTML = '<div class="cd-box"><button class="cd-close" title="Tutup">✕</button>' + html + '</div>';
    el.classList.remove('show');
    void el.offsetWidth;      // force reflow so the fade-in replays
    el.classList.add('show');
  }
  function hideDetail() {
    const el = $('cardDetail');
    if (el) el.classList.remove('show');
  }

  function deckIssue() {
    const total = deck.operators.length + deck.arts.length;
    if (total < LIMITS.total) return 'Pick ' + LIMITS.total + ' cards total (' + total + '/' + LIMITS.total + ').';
    if (total > LIMITS.total) return 'Too many cards (' + total + '/' + LIMITS.total + ').';
    return null;
  }

  const artCount = (id) => deck.arts.filter(x => x === id).length;
  function artCounts() {
    const map = {};
    deck.arts.forEach(id => { map[id] = (map[id] || 0) + 1; });
    return map;
  }

  // "Cards in deck" summary shown at the top of the Deck Builder.
  // Each tile shows the card's photo; clicking it returns the card to the pool.
  function deckRoster() {
    const opItems = deck.operators.map(s => {
      const o = opBySlug(s);
      const tip = o ? attr(tipOp(o)) : '';
      return '<button class="rcard" data-act="dropOp" data-slug="' + s + '" title="Return ' + esc(o ? o.name : s) + ' to the pool" data-tip="' + tip + '">' +
        '<span class="rcard-img" style="background-image:url(\'assets/characters/' + s + '.png\')"></span>' +
        '<span class="rcard-fade"></span>' +
        '<span class="rcard-name">' + esc(o ? o.name : s) + '</span>' +
        '<span class="rcard-x">✕</span>' +
      '</button>';
    }).join('');
    const counts = artCounts();
    const artItems = Object.keys(counts).map(id => {
      const a = C.artById(id);
      const tip = a ? attr(tipArt(a)) : '';
      return '<button class="rcard art" data-act="dropArt" data-id="' + id + '" title="Return ' + esc(a ? a.name : id) + ' to the pool" data-tip="' + tip + '">' +
        '<span class="rcard-img art-img"' + (a && a.img ? ' style="background-image:url(\'' + a.img + '\')"' : '') + '></span>' +
        '<span class="rcard-fade"></span>' +
        '<span class="rcard-tag">' + (a && a.artType === 'Field' ? 'FIELD' : 'INSTANT') + '</span>' +
        '<span class="rcard-name">' + esc(a ? a.name : id) + (counts[id] > 1 ? ' <span class="rc">×' + counts[id] + '</span>' : '') + '</span>' +
        '<span class="rcard-x">✕</span>' +
      '</button>';
    }).join('');
    return '' +
      '<div class="deck-roster">' +
        '<div class="roster-head">📋 Cards in deck <span class="muted">' +
          (deck.operators.length + deck.arts.length) + ' / ' + LIMITS.total +
          ' · ' + deck.operators.length + ' Operators · ' + deck.arts.length + ' Arts · click a card to return it</span></div>' +
        '<div class="roster-cols">' +
          '<div class="roster-col"><h4>Operators (' + deck.operators.length + ')</h4>' +
            (opItems ? '<div class="roster-list">' + opItems + '</div>' : '<p class="muted">— none —</p>') + '</div>' +
          '<div class="roster-col"><h4>Arts (' + deck.arts.length + ')</h4>' +
            (artItems ? '<div class="roster-list">' + artItems + '</div>' : '<p class="muted">— none —</p>') + '</div>' +
        '</div>' +
      '</div>';
  }

  // ---------------------------------------------------------------- home
  function screenHome() {
    const issue = deckIssue();
    return '' +
      '<div class="hero">' +
        '<div class="hero-kicker">RHODES ISLAND · FAN TCG</div>' +
        '<h1 class="hero-title">ARKNIGHT<br><span>CARD BATTLE</span></h1>' +
        '<p class="hero-desc">A digital duel inspired by <b>That Arknights Card Game</b>. Build your deck, deploy Operators to the front line (melee) and back line (ranged support), and break the enemy Doctor before they break you.</p>' +
        '<div class="hero-stats">' +
          '<div><b>' + (deck.operators.length + deck.arts.length) + '/' + LIMITS.total + '</b><span>Cards</span></div>' +
          '<div><b>' + deck.operators.length + '</b><span>Operators</span></div>' +
          '<div><b>' + deck.arts.length + '</b><span>Arts</span></div>' +
          '<div><b>🎲 Random</b><span>Location</span></div>' +
        '</div>' +
        '<button class="mbtn primary xl' + (issue ? ' warnbtn' : '') + '" data-act="play" title="' + (issue ? esc(issue) : 'Start the battle') + '">▶ START BATTLE</button>' +
        (issue ? '<div class="hero-warn">⚠ ' + esc(issue) + ' — open <b>Deck Card</b> to fix.</div>'
               : '<div class="hero-hint">Random arena &amp; Location each match · your saved deck is used</div>') +
      '</div>';
  }

  // ---------------------------------------------------------------- online
  function screenOnline() {
    const total = deck.operators.length + deck.arts.length;
    const issue = deckIssue();
    let inner;
    if (state.roomCode) {
      const link = location.origin + location.pathname + '?room=' + state.roomCode;
      inner =
        '<div class="online-card">' +
          '<div class="online-label">ROOM CODE</div>' +
          '<div class="online-code">' + esc(state.roomCode) + '</div>' +
          '<p class="muted">Bagikan kode ini ke temanmu — dia membuka situs ini, pilih <b>Online</b>, lalu masukkan kodenya.</p>' +
          '<div class="online-link"><code>' + esc(link) + '</code><button class="mbtn ghost" data-act="ocopy">📋 Salin link</button></div>' +
          '<div class="online-wait"><span class="spinner"></span> Menunggu lawan bergabung…</div>' +
          '<button class="mbtn ghost" data-act="ocancel">✕ Batal</button>' +
        '</div>';
    } else {
      const dis = issue ? ' warnbtn' : '';
      inner =
        '<div class="online-card">' +
          '<button class="mbtn primary xl' + dis + '" data-act="ocreate">➕ Buat Room</button>' +
          '<div class="online-or">atau</div>' +
          '<div class="online-join">' +
            '<input id="roomInput" class="room-input" maxlength="4" placeholder="KODE" autocomplete="off" value="' + esc(state.quickRoom || '') + '">' +
            '<button class="mbtn' + dis + '" data-act="ojoin">🔗 Gabung</button>' +
          '</div>' +
          (issue
            ? '<p class="hero-warn">⚠ ' + esc(issue) + ' — perbaiki deckmu dulu di <b>Deck Card</b>.</p>'
            : '<p class="muted">Deck-mu (' + total + ' kartu) yang akan dipakai.</p>') +
          '<p class="muted">Main berdua dari 2 HP/laptop lewat internet: satu orang <b>buat room</b>, yang lain <b>gabung</b> pakai kodenya.</p>' +
        '</div>';
    }
    return '<div class="page"><div class="page-head"><h2>Online · 2 Pemain</h2></div>' +
      inner +
      (state.onlineMsg ? '<div class="online-msg">' + esc(state.onlineMsg) + '</div>' : '') +
      '</div>';
  }

  // ---------------------------------------------------------------- deck
  function deckTileOp(op) {
    const on = deck.operators.includes(op.slug);
    return '' +
      '<button class="dtile ' + (on ? 'sel' : '') + '" data-act="op" data-slug="' + op.slug + '"' + searchAttr('op', op) + ' title="' + esc(op.name) + '" data-tip="' + attr(tipOp(op)) + '">' +
        '<span class="dtile-art" style="background-image:url(\'assets/characters/' + op.slug + '.png\')"></span>' +
        '<span class="dtile-fade"></span>' +
        '<span class="dtile-cost">' + op.cost + '</span>' +
        '<span class="dtile-cls" style="background-image:url(\'' + C.CLASS_ICON[op.cls] + '\')"></span>' +
        '<span class="dtile-name">' + esc(op.name) + '</span>' +
        '<span class="dtile-stats"><b class="a">' + op.atk + '</b><b class="h">' + C.operatorHp(op) + '</b><b class="d">' + op.def + '</b></span>' +
        (on ? '<span class="dtile-check">✓</span>' : '') +
        '<span class="dtile-info" data-act="infoOp" data-slug="' + op.slug + '" data-tip="Klik untuk penjelasan lengkap skill">i</span>' +
      '</button>';
  }
  function deckTileArt(a) {
    const n = artCount(a.id);
    const on = n > 0;
    return '' +
      '<button class="dtile art ' + (on ? 'sel' : '') + '" data-act="art" data-id="' + a.id + '"' + searchAttr('art', a) + ' title="' + esc(a.name) + '" data-tip="' + attr(tipArt(a)) + '">' +
        '<span class="dtile-art" style="background-image:url(\'' + (a.img || '') + '\')"></span>' +
        '<span class="dtile-fade"></span>' +
        '<span class="dtile-cost">' + a.cost + '</span>' +
        (on ? '<span class="dtile-count">×' + n + '</span>' : '') +
        '<span class="dtile-name lt">' + esc(a.name) + '</span>' +
        '<span class="dtile-type">' + (a.artType === 'Field' ? 'FIELD · ' + a.duration : 'INSTANT') + '</span>' +
        '<span class="dtile-text">' + esc(a.text) + '</span>' +
        (on ? '<span class="dtile-check">✓</span>' : '') +
        '<span class="dtile-info" data-act="infoArt" data-id="' + a.id + '" data-tip="Klik untuk penjelasan lengkap">i</span>' +
      '</button>';
  }
  function screenDeck() {
    const cls = ['All'].concat(CLASS_ORDER);
    const filterBar = cls.map(c => '<button class="chip ' + (state.deckFilter === c ? 'on' : '') + '" data-act="dfilter" data-cls="' + c + '">' + c + '</button>').join('');
    const ops = C.OPERATORS.filter(o => state.deckFilter === 'All' || o.cls === state.deckFilter);
    const issue = deckIssue();
    return '' +
      '<div class="page">' +
        '<div class="page-head">' +
          '<h2>Deck Builder</h2>' +
          '<div class="counts"><span class="' + (deck.operators.length + deck.arts.length === LIMITS.total ? 'ok' : 'bad') + '">Cards ' + (deck.operators.length + deck.arts.length) + '/' + LIMITS.total + '</span></div>' +
        '</div>' +
        deckRoster() +
        searchBar('deckSearch', 'dsearch', state.deckSearch, 'Cari card / skill / buff / debuff / heal / sleep…') +
        '<div class="sec-head">Operators <div class="chips">' + filterBar + '</div></div>' +
        '<div class="dtile-grid ops">' + ops.map(deckTileOp).join('') + '</div>' +
        '<p class="no-results hidden" id="deckOpsEmpty">Tidak ada operator yang cocok.</p>' +
        '<div class="sec-head">Arts</div>' +
        '<div class="dtile-grid arts">' + C.ARTS.map(deckTileArt).join('') + '</div>' +
        '<p class="no-results hidden" id="deckArtsEmpty">Tidak ada Art yang cocok.</p>' +
        '<div class="deck-bar">' +
          '<div class="deck-msg ' + (issue ? 'bad' : 'ok') + '">' + (issue ? '⚠ ' + esc(issue) : '✓ Deck is ready') + '</div>' +
          '<div class="deck-btns">' +
            '<button class="mbtn ghost" data-act="dreset">↺ Default</button>' +
            '<button class="mbtn ghost" data-act="drandom">🎲 Random</button>' +
            '<button class="mbtn ghost" data-act="dclear">Clear</button>' +
            '<button class="mbtn" data-act="dsave">💾 Save</button>' +
            '<button class="mbtn primary' + (issue ? ' warnbtn' : '') + '" data-act="play" title="' + (issue ? esc(issue) : 'Start the battle') + '">▶ Play</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  // ---------------------------------------------------------------- codex
  function codexOp(op) {
    const sk = op.skill || {};
    return '' +
      '<div class="codex card-op"' + searchAttr('op', op) + '>' +
        '<div class="codex-art" style="background-image:url(\'assets/characters/' + op.slug + '.png\')">' +
          '<span class="codex-cost">' + op.cost + '</span>' +
          '<span class="codex-rar">' + stars(op.rar) + '</span>' +
        '</div>' +
        '<div class="codex-body">' +
          '<div class="codex-name"><img class="ci" src="' + C.CLASS_ICON[op.cls] + '" alt="">' + esc(op.name) + '</div>' +
          '<div class="codex-meta">' + op.cls + ' · ' + esc(C.NATION_NAME[op.nation] || 'Independent') + ' · ' + rangeLabel(op.range) + ' range</div>' +
          '<div class="codex-stats"><span class="a">⚔ ' + op.atk + ' ATK</span><span class="d">🛡 ' + op.def + ' DEF</span><span class="h">❤ ' + C.operatorHp(op) + ' HP</span></div>' +
          '<div class="codex-skill"><span class="ctype ' + sk.type + '">' + (sk.type || '—') + '</span> <b>' + esc(sk.name || '') + '</b><br>' + esc(sk.text || '') + '</div>' +
          (settings.detailFull ? global.Explain.opExtra(op) : '') +
        '</div>' +
      '</div>';
  }
  function codexArt(a) {
    return '' +
      '<div class="codex card-art"' + searchAttr('art', a) + '>' +
        '<div class="codex-arthead">' +
          '<img src="' + (a.img || '') + '" alt="">' +
          '<span class="codex-cost">' + a.cost + '</span>' +
        '</div>' +
        '<div class="codex-banner ' + (a.artType === 'Field' ? 'field' : 'instant') + '">' + (a.artType === 'Field' ? 'FIELD ARTS · ⌛ ' + a.duration : 'INSTANT ARTS') + '</div>' +
        '<div class="codex-name">' + esc(a.name) + '</div>' +
        '<div class="codex-meta">Cost ' + a.cost + ' DP</div>' +
        '<div class="codex-skill">' + esc(a.text) + '</div>' +
        (settings.detailFull ? global.Explain.artExtra(a) : '') +
      '</div>';
  }
  function codexLoc(l) {
    let body = '';
    if (l.text) body += '<div class="codex-skill"><span class="ctype Passive">Passive</span><br>' + esc(l.text) + '</div>';
    if (l.active) body += '<div class="codex-skill"><span class="ctype Active">Active</span> <b>' + l.active.cost + ' DP</b> · once per turn<br>' + esc(l.active.text) + '</div>';
    if (l.desc) body += '<div class="codex-desc">' + esc(l.desc) + '</div>';
    return '' +
      '<div class="codex card-loc"' + searchAttr('loc', l) + '>' +
        '<div class="codex-banner loc">LOCATION · PERMANENT</div>' +
        '<div class="codex-name">◈ ' + esc(l.name) + '</div>' +
        body +
        (settings.detailFull ? global.Explain.locExtra(l) : '') +
      '</div>';
  }
  function screenCards() {
    const tabs = [['operators', 'Operators'], ['arts', 'Arts'], ['locations', 'Locations']];
    const tabBar = tabs.map(t => '<button class="chip ' + (state.codexTab === t[0] ? 'on' : '') + '" data-act="ctab" data-tab="' + t[0] + '">' + t[1] + '</button>').join('');
    let body = '';
    if (state.codexTab === 'operators') {
      const cls = ['All'].concat(CLASS_ORDER);
      const filterBar = cls.map(c => '<button class="chip ' + (state.codexFilter === c ? 'on' : '') + '" data-act="cfilter" data-cls="' + c + '">' + c + '</button>').join('');
      const ops = C.OPERATORS.filter(o => state.codexFilter === 'All' || o.cls === state.codexFilter);
      body = '<div class="chips wrap">' + filterBar + '</div><div class="codex-grid">' + ops.map(codexOp).join('') + '</div>';
    } else if (state.codexTab === 'arts') {
      body = '<p class="page-note">Instant Arts resolve the moment they are played. Field Arts go to your support zone (under the deck/discard piles) and last for their countdown.</p><div class="codex-grid">' + C.ARTS.map(codexArt).join('') + '</div>';
    } else {
      body = '<p class="page-note">One Location is assigned to each player at random at the start of every match. It is <b>permanent</b> and works for the whole game. A Location may grant a Passive effect and/or an Active ability usable once per turn (costs DP).</p><div class="codex-grid">' + C.LOCATIONS.map(codexLoc).join('') + '</div>';
    }
    return '' +
      '<div class="page">' +
        '<div class="page-head"><h2>Card Database</h2><div class="chips">' + tabBar + '</div></div>' +
        searchBar('codexSearch', 'csearch', state.codexSearch, 'Cari card / skill / buff / debuff / heal / sleep…') +
        body +
        '<p class="no-results hidden" id="codexEmpty">Tidak ada kartu yang cocok.</p>' +
      '</div>';
  }

  // ---------------------------------------------------------------- settings
  function toggleRow(key, title, desc) {
    const on = !!settings[key];
    return '' +
      '<div class="set-row">' +
        '<div class="set-info"><b>' + title + '</b><span>' + desc + '</span></div>' +
        '<button class="switch ' + (on ? 'on' : '') + '" data-act="toggle" data-key="' + key + '" aria-pressed="' + on + '"><i></i></button>' +
      '</div>';
  }
  function screenSettings() {
    return '' +
      '<div class="page">' +
        '<div class="page-head"><h2>Settings</h2></div>' +
        '<div class="set-group">' +
          '<h3>🔊 Sound</h3>' +
          toggleRow('sound', 'Sound effects', 'Battle sounds for deploy, attacks and victory.') +
          '<div class="set-row slider-row"><div class="set-info"><b>Master volume</b><span>0 – 100%</span></div>' +
            '<input id="volSlider" type="range" min="0" max="100" value="' + Math.round(settings.volume * 100) + '" data-act="volume"><span id="volVal" class="vol-val">' + Math.round(settings.volume * 100) + '%</span></div>' +
          toggleRow('music', 'Ambient music', 'A soft background drone inspired by the landship.') +
        '</div>' +
        '<div class="set-group">' +
          '<h3>🎞️ Graphics</h3>' +
          toggleRow('animations', 'Animations', 'Card deal, deploy pop, attack lunges and destruction.') +
          toggleRow('dmgNumbers', 'Damage numbers', 'Floating damage / clash numbers on impact.') +
          toggleRow('shake', 'Screen shake', 'HUD shakes when the Doctor takes damage.') +
        '</div>' +
        '<p class="page-note">Settings are saved automatically on this device.</p>' +
      '</div>';
  }

  // ---------------------------------------------------------------- render
  function renderMenu() {
    const nav = document.querySelectorAll('#menuNav .nav-btn');
    nav.forEach(b => b.classList.toggle('active', b.dataset.screen === state.screen));
    const screen = $('menuScreen');
    let html = '';
    if (state.screen === 'home') html = screenHome();
    else if (state.screen === 'online') html = screenOnline();
    else if (state.screen === 'deck') html = screenDeck();
    else if (state.screen === 'cards') html = screenCards();
    else if (state.screen === 'settings') html = screenSettings();
    screen.innerHTML = html;
    screen.scrollTop = 0;
    document.body.classList.toggle('menu-open', true);
    if (state.screen === 'deck') applyDeckSearch();
    else if (state.screen === 'cards') applyCodexSearch();
  }

  function go(screen) { hideDetail(); state.screen = screen; global.Sfx.SFX.click(); renderMenu(); }

  // ---------------------------------------------------------------- actions
  function onAction(act, t) {
    switch (act) {
      case 'play': {
        const issue = deckIssue();
        if (issue) { toast('⚠ Deck not ready — ' + issue, 'warn'); global.Sfx.SFX.click(); return; }
        saveDeck();
        global.Sfx.SFX.click();
        if (global.Game && global.Game.start) global.Game.start();
        break;
      }
      case 'ocreate': {
        const issue = deckIssue();
        if (issue) { toast('⚠ Deck not ready — ' + issue, 'warn'); return; }
        if (!global.Net) { toast('Online tidak tersedia di build ini.', 'warn'); return; }
        state.onlineMsg = 'Menghubungkan ke server…'; global.Sfx.SFX.click(); renderMenu();
        global.Net.create(entries());
        break;
      }
      case 'ojoin': {
        const issue = deckIssue();
        if (issue) { toast('⚠ Deck not ready — ' + issue, 'warn'); return; }
        const inp = $('roomInput');
        const code = inp ? String(inp.value || '').trim().toUpperCase() : '';
        if (!code) { toast('Masukkan kode room dulu.', 'warn'); return; }
        if (!global.Net) { toast('Online tidak tersedia di build ini.', 'warn'); return; }
        state.onlineMsg = 'Menghubungkan ke server…'; global.Sfx.SFX.click(); renderMenu();
        global.Net.join(code, entries());
        break;
      }
      case 'ocancel': {
        if (global.Net) global.Net.leave();
        state.roomCode = null; state.onlineMsg = ''; global.Sfx.SFX.click(); renderMenu();
        break;
      }
      case 'ocopy': {
        const link = location.origin + location.pathname + '?room=' + state.roomCode;
        try { if (navigator.clipboard) navigator.clipboard.writeText(link); } catch (e) {}
        toast('Link disalin ✓');
        break;
      }
      case 'op': {
        const slug = t.dataset.slug;
        const i = deck.operators.indexOf(slug);
        if (i >= 0) deck.operators.splice(i, 1);
        else if (deck.operators.length + deck.arts.length >= LIMITS.total) { toast('Deck is full (' + LIMITS.total + ' cards).'); return; }
        else deck.operators.push(slug);
        global.Sfx.SFX.click();
        renderMenu();
        break;
      }
      case 'art': {
        const id = t.dataset.id;
        const n = deck.arts.filter(x => x === id).length;
        const total = deck.operators.length + deck.arts.length;
        if (n >= LIMITS.artPerMax) deck.arts = deck.arts.filter(x => x !== id); // cycle: ×2 -> none
        else if (total >= LIMITS.total) { toast('Deck is full (' + LIMITS.total + ' cards).'); return; }
        else deck.arts.push(id);
        global.Sfx.SFX.click();
        renderMenu();
        break;
      }
      case 'dropOp': {
        const slug = t.dataset.slug;
        const i = deck.operators.indexOf(slug);
        if (i >= 0) deck.operators.splice(i, 1);
        global.Sfx.SFX.click();
        renderMenu();
        break;
      }
      case 'dropArt': {
        const id = t.dataset.id;
        const i = deck.arts.indexOf(id);
        if (i >= 0) deck.arts.splice(i, 1);
        global.Sfx.SFX.click();
        renderMenu();
        break;
      }
      case 'dfilter': state.deckFilter = t.dataset.cls; renderMenu(); break;
      case 'ctab': state.codexTab = t.dataset.tab; global.Sfx.SFX.click(); renderMenu(); break;
      case 'cfilter': state.codexFilter = t.dataset.cls; renderMenu(); break;
      case 'dsearchClear': state.deckSearch = ''; { const i = $('deckSearch'); if (i) i.value = ''; } applyDeckSearch(); break;
      case 'csearchClear': state.codexSearch = ''; { const i = $('codexSearch'); if (i) i.value = ''; } applyCodexSearch(); break;
      case 'infoOp': {
        const o = opBySlug(t.dataset.slug);
        if (o) { global.Sfx.SFX.click(); showDetail(detailOp(o)); }
        break;
      }
      case 'infoArt': {
        const a = C.artById(t.dataset.id);
        if (a) { global.Sfx.SFX.click(); showDetail(detailArt(a)); }
        break;
      }
      case 'dsave':
        if (deckIssue()) { toast(deckIssue()); return; }
        saveDeck(); toast('Deck saved ✓'); global.Sfx.SFX.click(); break;
      case 'dreset': deck = clone(DEFAULT_DECK); saveDeck(); global.Sfx.SFX.click(); renderMenu(); break;
      case 'drandom': deck = randomDeck(); saveDeck(); global.Sfx.SFX.click(); toast('Random deck generated 🎲'); renderMenu(); break;
      case 'dclear': deck = { operators: [], arts: [] }; saveDeck(); global.Sfx.SFX.click(); renderMenu(); break;
      case 'detailToggle': settings.detailFull = !settings.detailFull; saveSettings(); global.Sfx.SFX.click(); renderMenu(); break;
      case 'toggle': {
        const key = t.dataset.key;
        settings[key] = !settings[key];
        saveSettings(); applyGraphics();
        if (key === 'sound') global.Sfx.apply(settings);
        if (key === 'music') global.Sfx.apply(settings);
        global.Sfx.SFX.click();
        renderMenu();
        break;
      }
    }
  }

  let toastTimer = null;
  function toast(msg, kind) {
    let el = $('menuToast');
    if (!el) { el = document.createElement('div'); el.id = 'menuToast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.toggle('warn', kind === 'warn');
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  // ---------------------------------------------------------------- init
  function show() { $('menu').classList.remove('hidden-screen'); $('app').classList.add('hidden-screen'); document.body.classList.add('menu-open'); }
  function hide() { $('menu').classList.add('hidden-screen'); $('app').classList.remove('hidden-screen'); document.body.classList.remove('menu-open'); }

  function init() {
    applyGraphics();
    try { global.Sfx.apply(settings); } catch (e) {}

    document.querySelectorAll('#menuNav .nav-btn').forEach(b => {
      b.addEventListener('click', () => go(b.dataset.screen));
    });

    $('menuScreen').addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]');
      if (!t || t.disabled) return;
      const act = t.dataset.act;
      if (act === 'volume') return; // handled on input
      onAction(act, t);
    });
    $('menuScreen').addEventListener('input', (e) => {
      const t = e.target.closest('[data-act="volume"]');
      if (t) {
        settings.volume = parseInt(t.value, 10) / 100;
        const vv = $('volVal'); if (vv) vv.textContent = t.value + '%';
        global.Sfx.setVolume(settings.volume);
        saveSettings();
        return;
      }
      const ds = e.target.closest('[data-act="dsearch"]');
      if (ds) { state.deckSearch = ds.value; applyDeckSearch(); return; }
      const cs = e.target.closest('[data-act="csearch"]');
      if (cs) { state.codexSearch = cs.value; applyCodexSearch(); return; }
    });

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideDetail(); });

    if (global.Net) {
      global.Net.handlers.room = (code) => { state.roomCode = code; state.onlineMsg = ''; try { global.Sfx.SFX.click(); } catch (e) {} renderMenu(); };
      global.Net.handlers.error = (msg) => { state.roomCode = null; state.onlineMsg = '⚠ ' + msg; try { global.Sfx.SFX.click(); } catch (e) {} renderMenu(); };
    }

    // ?room=CODE  -> open the Online screen with the code prefilled
    let startScreen = 'home';
    try {
      const r = new URLSearchParams(location.search).get('room');
      if (r) { state.quickRoom = r.toUpperCase().slice(0, 4); startScreen = 'online'; }
    } catch (e) {}

    state.screen = startScreen;
    show();
    renderMenu();
  }

  global.Menu = {
    init, show, hide,
    render: renderMenu,
    getSettings: () => settings,
    setSetting: (key, val) => {
      settings[key] = val;
      saveSettings();
      applyGraphics();
      if (key === 'sound' || key === 'music') { try { global.Sfx.apply(settings); } catch (e) {} }
      if (key === 'volume') { try { global.Sfx.setVolume(val); } catch (e) {} }
    },
    toggleSetting: (key) => {
      settings[key] = !settings[key];
      saveSettings();
      applyGraphics();
      if (key === 'sound' || key === 'music') { try { global.Sfx.apply(settings); } catch (e) {} }
    },
    startGameOptions: () => ({ deck: entries() }),
    deckIssue: () => deckIssue(),
    toast: (msg, kind) => toast(msg, kind),
    deckSize: () => deck.operators.length + deck.arts.length,
    LIMITS: LIMITS,
    _deck: () => deck
  };
})(window);
