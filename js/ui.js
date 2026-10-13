/* =========================================================================
   Arknight Card Battle — UI / interaction layer
   - reconciled rendering (nodes persist, so nothing re-animates needlessly)
   - head-to-head board with deck / discard piles
   - smooth attack, deploy, draw, damage animations
   ========================================================================= */
(function (global) {
  'use strict';

  const E = global.Engine;
  const C = global.Cards;

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => { const d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  const S = {
    mode: 'idle',      // idle | deploy | attack | skill | artTarget
    selHand: -1,
    selUnit: null,
    pending: null,
    busy: false,
    animating: false,
    overShown: false,
    started: false,
    abort: false,
    session: 0,
    logHidden: false,
    uidSeq: 0,
    handNodes: new Map(),
    me: 0,             // which player index is "me" (0 vs-AI, or 0/1 online)
    online: false      // true while playing against another browser
  };

  const P = () => E.state.players[S.me];
  const OPP = () => E.state.players[1 - S.me];
  const isMyTurn = () => E.state && !E.state.over && E.state.active === S.me;
  const setStatus = (m) => { $('statusLine').innerHTML = m; };

  // Ranged classes may be deployed to the BACK row (and the front too);
  // every other class is front-line only. The back row never blocks.
  const RANGED_CLS = ['Sniper', 'Caster', 'Medic', 'Supporter'];
  const isRangedCls = (cls) => RANGED_CLS.indexOf(cls) >= 0;

  function unitByUid(u) {
    for (const pl of E.state.players) {
      for (const f of pl.front) if (f && f.uid === u) return f;
      for (const b of pl.back) if (b && b.uid === u) return b;
    }
    return null;
  }
  function canActivate(u) {
    if (!u || !u.skill || u.skillUsed) return false;
    if (u.exhausted) return false;                      // already attacked this turn
    if (u.slept || u.silenced) return false;            // asleep / silenced operators cannot act
    const t = u.skill.type;
    if (t !== 'Active' && t !== 'Manual') return false;
    if (t === 'Active' && u.skill.cost && P().dp < u.skill.cost) return false;
    // the turn it is deployed, only a DP-granting ability may be used
    if (u.turnPlayed === E.state.turn && !(u.skill.effects || []).some(e => e.k === 'gainDP')) return false;
    if (isPureHealCard(u) && hpFull()) return false;   // nothing to heal
    if (E.isKillSkill(u.skill) && E.killLimitReached(P())) return false;   // instant-kill cap reached
    return true;
  }
  const canAttackNow = (u) => u && u.kind === 'operator' && !u.exhausted && !u.slept && isMyTurn();

  // A card (art or operator skill) whose only effect is healing cannot be used
  // while the Doctor's HP is already full.
  function isPureHealCard(card) {
    if (!card) return false;
    const eff = card.kind === 'art' ? card.effects : (card.skill && card.skill.effects);
    return !!(eff && eff.length) && eff.every(e => e.k === 'healPlayer');
  }
  function hpFull() { const p = P(); return p.hp >= (p.maxHp || E.START_HP); }

  // ============================================ command layer (local + online)
  // Every game-changing call goes through Cmd. Offline it simply calls the
  // engine. In an online match the acting client ALSO broadcasts the exact
  // same call, so the opponent's engine applies it identically (lock-step).
  const Cmd = {
    online: false,
    send: null,
    _emit(msg) { if (this.online && this.send) this.send(msg); },
    deploy(hand, row, slot) {
      const r = E.deployOperator(P(), hand, row, slot);
      if (r && r.ok !== false) this._emit({ op: 'deploy', actor: S.me, hand: hand, row: row, slot: slot });
      return r;
    },
    playArt(hand, slot) {
      const r = E.playArt(P(), hand, slot);
      if (r && r.ok !== false) this._emit({ op: 'playArt', actor: S.me, hand: hand, slot: slot });
      return r;
    },
    skill(unitUid, targetUid) {
      const u = unitByUid(unitUid);
      const target = targetUid ? unitByUid(targetUid) : null;
      const r = E.activateSkill(P(), u, target);
      if (r && r.ok !== false) this._emit({ op: 'skill', actor: S.me, unit: unitUid, targetUid: targetUid || null });
      return r;
    },
    location(targetUid) {
      const r = E.activateLocation(P(), targetUid ? unitByUid(targetUid) : null);
      if (r && r.ok !== false) this._emit({ op: 'location', actor: S.me, target: targetUid || null });
      return r;
    },
    resolve(effects, source, target) {
      E.resolveEffects(effects, source || null, target || null);
      this._emit({
        op: 'resolve', actor: S.me, effects: effects || [],
        sourceUid: source ? source.uid : null, targetUid: target ? target.uid : null
      });
    },
    attack(attackerUid, target) {
      const a = unitByUid(attackerUid);
      const r = E.attack(a, target);
      if (r && r.ok !== false) this._emit({ op: 'attack', actor: S.me, attacker: attackerUid, target: target });
      return r;
    },
    end() {
      E.endTurn();
      this._emit({ op: 'end', actor: S.me });
    },
    // Apply a command that arrived from the opponent.
    apply(msg) {
      if (!msg || !E.state) return;
      const actor = E.state.players[msg.actor];
      if (!actor) return;
      if (msg.op === 'deploy') E.deployOperator(actor, msg.hand, msg.row, msg.slot);
      else if (msg.op === 'playArt') E.playArt(actor, msg.hand, msg.slot);
      else if (msg.op === 'skill') E.activateSkill(actor, unitByUid(msg.unit), msg.targetUid ? unitByUid(msg.targetUid) : null);
      else if (msg.op === 'location') E.activateLocation(actor, msg.target ? unitByUid(msg.target) : null);
      else if (msg.op === 'resolve') E.resolveEffects(msg.effects, msg.sourceUid ? unitByUid(msg.sourceUid) : null, msg.targetUid ? unitByUid(msg.targetUid) : null);
      else if (msg.op === 'attack') E.attack(unitByUid(msg.attacker), msg.target);
      else if (msg.op === 'end') E.endTurn();
    }
  };

  // ===================================================================== render
  function render() {
    if (!E.state || S.animating) return;
    renderHud(OPP(), 'enemy');
    renderHud(P(), 'player');
    renderStageBuff();
    renderRows();
    renderHand();
    renderLog();
    renderTop();
    renderActionBar();
    renderHighlights();
    if (E.state.over && !S.overShown) { S.overShown = true; gameOver(); }
  }

  function renderTop() {
    const b = $('turnBanner');
    if (E.state.over) { b.textContent = E.state.winner === S.me ? 'VICTORY' : 'DEFEAT'; b.className = 'turn-banner'; }
    else if (E.state.active === S.me) { b.textContent = 'YOUR TURN · ' + (E.state.turn + 1); b.className = 'turn-banner you'; }
    else { b.textContent = (S.online ? 'OPPONENT' : 'ENEMY') + ' TURN · ' + (E.state.turn + 1); b.className = 'turn-banner ai'; }
    $('btnEnd').disabled = !isMyTurn() || S.busy;
  }

  function renderHud(pl, which) {
    const max = E.START_HP;
    $(which + 'HpVal').textContent = Math.max(0, pl.hp);
    $(which + 'HpBar').style.width = Math.max(0, Math.min(100, (pl.hp / max) * 100)) + '%';
    $(which + 'Dp').textContent = pl.dp;
    const kc = $(which + 'Kill'); if (kc) kc.textContent = (pl.killCount || 0) + '/' + E.KILL_LIMIT;
    $(which + 'Deck').textContent = pl.deck.length;
    $(which + 'Grave').textContent = pl.grave.length;
    // Location Active button (only on the local player's own HUD)
    const lb = $('locBtn');
    if (lb) {
      const loc = pl.location;
      const has = which === 'player' && loc && loc.active;
      lb.classList.toggle('hidden', !has);
      if (has) {
        const used = pl.locUsedTurn === E.state.turn;
        lb.disabled = !(isMyTurn() && !used && pl.dp >= loc.active.cost) || S.busy;
        lb.innerHTML = '◈ ' + esc(loc.name) + ' <span class="loc-cost">' + loc.active.cost + ' DP</span>';
        lb.title = loc.name + ' — Active (once per turn, ' + loc.active.cost + ' DP)\n' + loc.active.text + (used ? '\n(already used this turn)' : '');
      }
    }
  }

  // The arena (stage) buff is GLOBAL — the single buff shared by both players.
  // Its label lives on the battlefield midline.
  function renderStageBuff() {
    const sb = $('stageBuff');
    if (!sb) return;
    const ar = E.state.arena;
    sb.textContent = ar ? ('◆ STAGE · ' + ar.name + ' — ' + ar.text) : '';
    sb.title = sb.textContent;
  }

  // ---- rows (reconciled by slot index) — BOTH rows hold operators ----
  // Front (▲): any operator. Back (▼): ranged operators only (they do not block).
  function renderRows() {
    renderRow('playerFront', P(), 'front');
    renderRow('playerBack', P(), 'back');
    renderRow('enemyFront', OPP(), 'front');
    renderRow('enemyBack', OPP(), 'back');
    renderArts('playerArts', P());
    renderArts('enemyArts', OPP());
  }

  function renderRow(id, pl, row) {
    const wrap = $(id);
    if (!wrap) return;
    for (let i = 0; i < E.SLOTS; i++) {
      const u = pl[row][i];
      let cur = wrap.children[i];
      const curUid = cur && cur.dataset ? cur.dataset.uid : null;
      if (u && cur && curUid === u.uid) {
        updateUnitEl(cur, u);
      } else if (!u && cur && !curUid) {
        cur.dataset.slot = i; cur.dataset.row = row; cur.dataset.side = pl.idx;
      } else {
        const node = u ? makeUnitEl(u, pl) : makeSlotEl(i, row, pl);
        if (cur) wrap.replaceChild(node, cur); else wrap.appendChild(node);
      }
    }
    while (wrap.children.length > E.SLOTS) wrap.removeChild(wrap.lastChild);
  }

  // Field Arts live in a support zone BELOW the deck/discard piles, shown as
  // plain card images (no slot template). One zone per player.
  function renderArts(id, pl) {
    const wrap = $(id);
    if (!wrap) return;
    const next = new Map();
    pl.arts.forEach(a => {
      let node = wrap.querySelector('.art-tile[data-uid="' + a.uid + '"]');
      if (!node) node = makeArtTileEl(a);
      else updateArtTileEl(node, a);
      next.set(a.uid, node);
    });
    wrap.querySelectorAll('.art-tile').forEach(n => { if (!next.has(n.dataset.uid)) n.remove(); });
    pl.arts.forEach((a, idx) => {
      const n = next.get(a.uid);
      if (n && wrap.children[idx] !== n) wrap.insertBefore(n, wrap.children[idx] || null);
    });
  }

  function makeSlotEl(i, row, pl) {
    const s = el('div', 'slot empty');
    s.dataset.slot = i; s.dataset.row = row; s.dataset.side = pl.idx;
    s.appendChild(el('span', 'slot-tag', row === 'front' ? '▲' : '▼'));
    return s;
  }

  // ---- hover tips (short explanations) ----
  // Full (Lengkap) explanations are opt-in via the toggle next to the search
  // bar; default stays short. Read live from Menu settings.
  function detailFull() {
    try { return !!(global.Menu && global.Menu.getSettings && global.Menu.getSettings().detailFull); } catch (e) { return false; }
  }
  function unitTip(u) {
    let s = '<div class="tt-name">' + esc(u.name) + '</div>' +
      '<div class="tt-meta">' + u.cls + ' · ' + u.range + ' range</div>' +
      '<div class="tt-stats"><span class="a">⚔ ' + E.unitAtk(u) + '</span><span class="d">🛡 ' + E.unitDef(u) + '</span><span class="h">❤ ' + u.hp + '/' + u.maxHp + '</span><span class="c">◈ ' + u.cost + ' DP</span></div>';
    if (u.skill) s += '<div class="tt-skill"><span class="tt-type">' + esc(u.skill.type) + '</span> <b>' + esc(u.skill.name) + '</b><br>' + esc(u.skill.text) + '</div>';
    if (u.skill && global.Explain && detailFull()) s += global.Explain.tipExtra(u.skill.effects, u.skill.type, null);
    const st = [];
    if (u.exhausted) st.push('Exhausted');
    if (u.slept) st.push('Sleeping (' + (u.sleepTurns || 1) + ' turn' + ((u.sleepTurns || 1) > 1 ? 's' : '') + ')');
    if (u.silenced) st.push('Silenced (' + (u.silenceTurns || 1) + ' turn' + ((u.silenceTurns || 1) > 1 ? 's' : '') + ')');
    if (st.length) s += '<div class="tt-status">' + st.join(' · ') + '</div>';
    return s;
  }
  function cardTip(card) {
    if (card.kind === 'art') {
      return '<div class="tt-name">' + esc(card.name) + '</div>' +
        '<div class="tt-meta">' + (card.artType === 'Field' ? 'Field Arts · lasts ' + card.duration + ' turns' : 'Instant Arts') + ' · ' + card.cost + ' DP</div>' +
        '<div class="tt-skill">' + esc(card.text) + '</div>' +
        (global.Explain && detailFull() ? global.Explain.artTipExtra(card) : '');
    }
    const sk = card.skill || {};
    return '<div class="tt-name">' + esc(card.name) + '</div>' +
      '<div class="tt-meta">' + card.cls + ' · ' + card.range + ' range · ' + card.cost + ' DP</div>' +
      '<div class="tt-stats"><span class="a">⚔ ' + card.atk + '</span><span class="d">🛡 ' + card.def + '</span><span class="h">❤ ' + (card.hp || '') + '</span></div>' +
      '<div class="tt-skill"><span class="tt-type">' + esc(sk.type || '') + '</span> <b>' + esc(sk.name || '') + '</b><br>' + esc(sk.text || '') + '</div>' +
      (global.Explain && detailFull() ? global.Explain.opTipExtra(card) : '');
  }
  function unitTitle(u) {
    let t = u.name + ' — ' + u.cls + '\nATK ' + E.unitAtk(u) + ' / DEF ' + E.unitDef(u) + ' / HP ' + u.hp + '/' + u.maxHp + '  ·  ' + u.range + ' range';
    if (u.skill) t += '\n【' + u.skill.type + '】' + u.skill.name + ': ' + u.skill.text + (u.skill.cost ? '  (' + u.skill.cost + ' DP)' : '');
    return t;
  }
  function addBadges(container, u) {
    if (E._internal.hasPassive(u, 'taunt')) container.appendChild(el('span', 'badge taunt', 'TAUNT'));
    if (u.tempLong) container.appendChild(el('span', 'badge long', 'LONG'));
    if (u.slept) container.appendChild(el('span', 'badge sleep', '💤 SLEEP' + ((u.sleepTurns || 1) > 1 ? ' ' + u.sleepTurns : '')));
    if (u.silenced) container.appendChild(el('span', 'badge silence', 'SILENCE' + ((u.silenceTurns || 1) > 1 ? ' ' + u.silenceTurns : '')));
  }
  function makeUnitEl(u, pl) {
    const d = el('div', 'unit enter');
    const hpPct = Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100));
    d.dataset.uid = u.uid; d.dataset.owner = pl.idx;
    d.innerHTML =
      '<div class="art" style="background-image:url(\'' + (u.img || '') + '\')"></div>' +
      '<div class="fade"></div>' +
      '<div class="rangebar" style="background:' + (u.range === 'long' ? '#7ac36a' : u.range === 'medium' ? '#e0b34d' : '#6b7690') + '"></div>' +
      '<div class="uhpbar"><i style="width:' + hpPct + '%"></i></div>' +
      '<div class="cost">' + u.cost + '</div>' +
      '<div class="cls-ic" style="background-image:url(\'' + (u.icon || '') + '\')"></div>' +
      '<div class="cname">' + esc(u.name) + '</div>' +
      '<div class="stats"><span class="atk">' + E.unitAtk(u) + '</span><span class="hp">' + u.hp + '</span><span class="def">' + E.unitDef(u) + '</span></div>' +
      '<div class="badges"></div>';
    addBadges(d.querySelector('.badges'), u);
    if (u.exhausted) d.classList.add('exhausted');
    d.title = unitTitle(u);
    d.setAttribute('data-tip', unitTip(u));
    d.onclick = (ev) => { ev.stopPropagation(); onUnitClick(u, pl.idx); };
    return d;
  }
  function updateUnitEl(node, u) {
    const atk = node.querySelector('.atk'), def = node.querySelector('.def'), hp = node.querySelector('.hp');
    if (atk) atk.textContent = E.unitAtk(u);
    if (def) def.textContent = E.unitDef(u);
    if (hp) hp.textContent = u.hp;
    const bar = node.querySelector('.uhpbar i');
    if (bar) bar.style.width = Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100)) + '%';
    node.classList.toggle('exhausted', !!u.exhausted);
    const b = node.querySelector('.badges');
    if (b) { b.innerHTML = ''; addBadges(b, u); }
    node.title = unitTitle(u);
    node.setAttribute('data-tip', unitTip(u));
  }
  function makeArtTileEl(a) {
    const d = el('div', 'art-tile');
    d.dataset.uid = a.uid; d.dataset.owner = a.owner;
    if (a.img) d.style.backgroundImage = "url('" + a.img + "')";
    d.innerHTML = '<div class="at-dur">' + (a.duration || 0) + '</div>' +
      '<div class="at-name">' + esc(a.name) + '</div>';
    d.title = a.name + ': ' + a.text;
    d.setAttribute('data-tip', fieldArtTip(a));
    return d;
  }
  function updateArtTileEl(node, a) {
    const d = node.querySelector('.at-dur');
    if (d) d.textContent = a.duration || 0;
    node.classList.toggle('expiring', !!a.duration && a.duration <= 1);
    node.setAttribute('data-tip', fieldArtTip(a));
  }
  function fieldArtTip(a) {
    return '<div class="tt-name">' + esc(a.name) + '</div><div class="tt-meta">Field Arts · ' + (a.duration || 0) + ' turns left</div><div class="tt-skill">' + esc(a.text) + '</div>' +
      (global.Explain && detailFull() ? global.Explain.tipExtra(a.effects, 'Field', a.duration) : '');
  }

  // ---- hand (reconciled by card uid) ----
  function renderHand() {
    const wrap = $('hand');
    const pl = P();
    const next = new Map();
    const fresh = [];
    pl.hand.forEach((card, i) => {
      if (!card.uid) card.uid = 'h' + (++S.uidSeq);
      let node = S.handNodes.get(card.uid);
      if (!node) { node = makeHandCardEl(card, i); fresh.push(node); }
      else updateHandCardEl(node, card, i);
      next.set(card.uid, node);
    });
    S.handNodes.forEach((node, uid) => { if (!next.has(uid) && node.parentNode) node.parentNode.removeChild(node); });
    // Slot the nodes into order, moving only when the order really changed —
    // an unnecessary re-insert would restart the draw animation.
    pl.hand.forEach((card, idx) => {
      const n = next.get(card.uid);
      if (n && wrap.children[idx] !== n) wrap.insertBefore(n, wrap.children[idx] || null);
    });
    S.handNodes = next;
    fresh.forEach((node, k) => animateDraw(node, k, fresh.length));
  }

  // Draw animation: a newly drawn card flies out of the local deck pile.
  function animateDraw(node, order, total) {
    if (document.body.classList.contains('no-anim')) return;
    const deck = $('playerDeckPile');
    if (!deck) return;
    const d = deck.getBoundingClientRect();
    const c = node.getBoundingClientRect();
    if (!d.width || !c.width) return;
    node.style.setProperty('--draw-x', ((d.left + d.width / 2) - (c.left + c.width / 2)).toFixed(1) + 'px');
    node.style.setProperty('--draw-y', ((d.top + d.height / 2) - (c.top + c.height / 2)).toFixed(1) + 'px');
    node.classList.add('drawin');
    node.style.animationDelay = (total > 1 ? order * 75 : 0) + 'ms';   // opening hand deals in sequence
    node.addEventListener('animationend', () => {
      node.classList.remove('drawin');
      node.style.animationDelay = '';
      node.style.removeProperty('--draw-x');
      node.style.removeProperty('--draw-y');
    }, { once: true });
  }
  function handCardInner(card) {
    if (card.kind !== 'art') {
      return '<div class="art" style="background-image:url(\'' + (card.img || '') + '\')"></div>' +
        '<div class="fade"></div>' +
        '<div class="cost">' + card.cost + '</div>' +
        '<div class="cls-ic" style="background-image:url(\'' + (card.icon || '') + '\')"></div>' +
        '<div class="cname">' + esc(card.name) + '</div>' +
        '<div class="skill">' + esc(card.skill ? card.skill.name : '') + '</div>' +
        '<div class="stats"><span class="atk">' + card.atk + '</span><span class="hp">' + (card.hp || '') + '</span><span class="def">' + card.def + '</span></div>';
    }
    return '<div class="bgart"' + (card.img ? ' style="background-image:url(\'' + card.img + '\')"' : '') + '></div>' +
      '<div class="bgart-fade"></div>' +
      '<div class="cost">' + card.cost + '</div>' +
      '<div class="cname">' + esc(card.name) + '</div>' +
      '<div class="ctitle">' + (card.artType === 'Field' ? 'FIELD · ' + card.duration : 'INSTANT ARTS') + '</div>' +
      '<div class="fa-txt">' + esc(card.text) + '</div>';
  }
  function handCardTitle(card) {
    return card.name + (card.skill ? ' — ' + card.skill.text : (card.text ? ' — ' + card.text : '')) + '  [' + card.cost + ' DP]';
  }
  function makeHandCardEl(card, i) {
    const node = el('div', 'card' + (card.kind === 'art' ? ' art-card' : ''));
    node.dataset.uid = card.uid;
    node.innerHTML = handCardInner(card);
    node.title = handCardTitle(card);
    node.setAttribute('data-tip', cardTip(card));
    // look the index up by uid at click time, so a shifted hand never mis-targets
    node.onclick = (ev) => { ev.stopPropagation(); onHandClick(handIndexByUid(card.uid)); };
    applyHandCardState(node, card, i);
    return node;
  }
  function handIndexByUid(uid) { return P().hand.findIndex(c => c.uid === uid); }
  function updateHandCardEl(node, card, i) {
    node.classList.remove('deal');
    applyHandCardState(node, card, i);
    node.title = handCardTitle(card);
    node.setAttribute('data-tip', cardTip(card));
  }
  function applyHandCardState(node, card, i) {
    const pl = P();
    const killCap = card.kind === 'art' && E.isKillEffects(card.effects) && E.killLimitReached(pl);
    node.classList.toggle('unaffordable', pl.dp < card.cost);
    node.classList.toggle('disabled', !isMyTurn());
    node.classList.toggle('killcap', killCap);
    node.classList.toggle('unusable', (card.kind === 'art' && isPureHealCard(card) && hpFull()) || killCap);
    node.classList.toggle('selected', i === S.selHand);
  }

  function renderLog() {
    const l = $('log');
    l.innerHTML = E.state.log.map(m => '<div>' + esc(logForMe(m)) + '</div>').join('');
    l.scrollTop = l.scrollHeight;
  }

  // The engine writes log lines from player 0's point of view ("You"/"Enemy").
  // Player 1 (online guest) sees the opposite perspective, so swap it.
  function logForMe(m) {
    if (!(S.online && S.me === 1)) return m;
    if (m === 'You win!') return 'You lose.';
    if (m === 'You lose.') return 'You win!';
    return m
      .replace(/\bYour\b/g, '\u0002')
      .replace(/\bYou\b/g, '\u0001')
      .replace(/\bEnemy\b/g, 'You')
      .replace(/\u0002/g, "Opponent's")
      .replace(/\u0001/g, 'Opponent');
  }

  function renderHighlights() {
    document.querySelectorAll('.slot').forEach(s => s.classList.remove('hot', 'drop'));
    document.querySelectorAll('.unit').forEach(u => u.classList.remove('targetable', 'selected', 'can-atk', 'can-act'));
    $('enemyHud').classList.remove('targetable', 'blocked');
    const ehint = document.querySelector('#enemyHud .target-hint');
    if (ehint) ehint.textContent = E.boardHasBlocker(OPP()) ? '⛔ clear the front line' : '▶ strike here';

    const pl = P();
    if (S.mode === 'deploy') {
      const card = pl.hand[S.selHand];
      document.querySelectorAll('#playerFront .slot.empty').forEach(s => s.classList.add('drop', 'hot'));
      if (card && isRangedCls(card.cls)) document.querySelectorAll('#playerBack .slot.empty').forEach(s => s.classList.add('drop', 'hot'));
      setStatus('Deploy <b>' + esc(card ? card.name : '') + '</b> — click a Front tile' + (card && isRangedCls(card.cls) ? ' or a Back tile (ranged support).' : '.'));
    } else if (S.mode === 'attack') {
      const a = unitByUid(S.selUnit);
      document.querySelectorAll('#enemyFront .unit').forEach(u => u.classList.add('targetable'));
      if (E.boardHasBlocker(OPP())) {
        $('enemyHud').classList.add('blocked');
        setStatus('<b>' + esc(a ? a.name : '') + '</b> — the enemy front line is still standing. Clear every enemy front operator before you can strike the Doctor.');
      } else {
        document.querySelectorAll('#enemyBack .unit').forEach(u => u.classList.add('targetable'));
        $('enemyHud').classList.add('targetable');
        setStatus('<b>' + esc(a ? a.name : '') + '</b> — front line is clear! Strike an enemy operator or the enemy Doctor.');
      }
    } else if (S.mode === 'skill' || S.mode === 'artTarget') {
      document.querySelectorAll('#enemyFront .unit, #enemyBack .unit').forEach(n => {
        const u = unitByUid(n.dataset.uid);
        if (u && E._internal.hasPassive(u, 'untargetable')) return;   // Camouflage: cannot be targeted
        n.classList.add('targetable');
      });
      setStatus((S.pending && S.pending.label) || 'Choose an enemy operator to target.');
    } else {
      setStatus(isMyTurn() ? 'Your move — play cards, then attack and End Turn.  <kbd>E</kbd> ends turn.' : 'Enemy is thinking…');
    }

    if (isMyTurn() && S.mode === 'idle') {
      pl.front.concat(pl.back).forEach(u => {
        if (!u) return;
        const node = document.querySelector('.unit[data-uid="' + u.uid + '"]');
        if (!node) return;
        if (canAttackNow(u)) node.classList.add('can-atk');
        else if (canActivate(u)) node.classList.add('can-act');
      });
    }
    if (S.selUnit) {
      const n = document.querySelector('.unit[data-uid="' + S.selUnit + '"]');
      if (n) n.classList.add('selected');
    }
  }

  function renderActionBar() {
    const bar = $('actionBar');
    bar.innerHTML = '';
    if (!isMyTurn() || E.state.over) { bar.classList.add('hidden'); return; }
    if (S.mode === 'idle' && S.selUnit) {
      const u = unitByUid(S.selUnit);
      if (u) {
        bar.classList.remove('hidden');
        bar.appendChild(el('span', 'info', '<b>' + esc(u.name) + '</b> · ATK ' + E.unitAtk(u) + ' / DEF ' + E.unitDef(u) + ' / HP ' + u.hp + '/' + u.maxHp + ' · ' + u.range));
        if (canAttackNow(u)) {
          const b = el('button', 'btn primary', '⚔ Attack');
          b.onclick = () => {
            const O = OPP();
            // No enemy operator on the board → the attack auto-strikes the enemy
            // Doctor, so the player does not have to click the enemy HUD.
            if (!O.front.some(Boolean) && !O.back.some(Boolean)) { S.selUnit = u.uid; doAttack((a) => Cmd.attack(a.uid, 'player')); }
            else { S.mode = 'attack'; render(); }
          };
          bar.appendChild(b);
        }
        if (canActivate(u)) { const b = el('button', 'btn', '⚡ ' + esc(u.skill.name) + (u.skill.cost ? ' (' + u.skill.cost + ' DP)' : '')); b.onclick = () => useSkill(u); bar.appendChild(b); }
        const c = el('button', 'btn ghost', 'Cancel'); c.onclick = () => { S.selUnit = null; S.mode = 'idle'; render(); }; bar.appendChild(c);
        return;
      }
    }
    if (['deploy', 'attack', 'skill', 'artTarget'].indexOf(S.mode) >= 0) {
      bar.classList.remove('hidden');
      const c = el('button', 'btn ghost', '✕ Cancel'); c.onclick = cancel; bar.appendChild(c);
    } else bar.classList.add('hidden');
  }

  // ============================================================ animations
  function arenaXY(node) {
    const a = $('arena').getBoundingClientRect();
    const r = node.getBoundingClientRect();
    return { x: r.left - a.left + r.width / 2, y: r.top - a.top + r.height / 2 };
  }
  function floatText(node, text, cls) {
    if (!node) return;
    if (document.body.classList.contains('no-fx')) return;
    const p = arenaXY(node);
    const d = el('div', 'fx-dmg ' + (cls || ''), text);
    d.style.left = p.x + 'px'; d.style.top = p.y + 'px';
    $('fx').appendChild(d);
    setTimeout(() => d.remove(), 1000);
  }
  function flash(node) {
    if (!node) return;
    if (document.body.classList.contains('no-shake')) return;
    node.classList.remove('hit'); void node.offsetWidth; node.classList.add('hit');
    setTimeout(() => node.classList.remove('hit'), 420);
  }

  function playAttack(d, done) {
    S.animating = true;
    try { global.Sfx && global.Sfx.SFX.attack(); } catch (e) {}
    const attacker = document.querySelector('.unit[data-uid="' + d.attackerUid + '"]');
    const target = d.targetKind === 'player'
      ? (d.attackerOwner === 0 ? $('enemyHud') : $('playerHud'))
      : document.querySelector('.unit[data-uid="' + d.targetUid + '"]');
    const finish = () => { S.animating = false; render(); };
    if (!attacker || !target) { setTimeout(finish, 120); return; }

    const ar = arenaXY(attacker), tr = arenaXY(target);
    const dx = (tr.x - ar.x) * 0.55, dy = (tr.y - ar.y) * 0.55;
    attacker.style.transition = 'transform .16s cubic-bezier(.2,.9,.3,1)';
    attacker.style.zIndex = '45';
    attacker.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(1.06)';
    setTimeout(() => { attacker.style.transform = 'translate(0,0)'; }, 165);
    setTimeout(() => { attacker.style.transition = ''; attacker.style.zIndex = ''; }, 360);

    setTimeout(() => {
      try { global.Sfx && global.Sfx.SFX.hit(); } catch (e) {}
      ring(target, 'hit');
      if (d.targetKind === 'player') { flash(target); floatText(target, '-' + d.damage, ''); }
      else { flash(target); floatText(target, '⚔ ' + d.damage, 'clash'); }
      (d.killed || []).forEach(uid => { const n = document.querySelector('.unit[data-uid="' + uid + '"]'); if (n) n.classList.add('dying'); });
      if (d.killed && d.killed.length) { try { global.Sfx && global.Sfx.SFX.destroy(); } catch (e) {} }
    }, 150);

    setTimeout(finish, (d.killed && d.killed.length) ? 400 : 320);
  }
  function pulse(uid) {
    const n = document.querySelector('.unit[data-uid="' + uid + '"]');
    if (n) { n.classList.remove('pulse'); void n.offsetWidth; n.classList.add('pulse'); }
  }

  function animationsOff() { return document.body.classList.contains('no-anim'); }

  // A short-lived expanding ring centred on a board node (attack impact / skill cast).
  function ring(node, kind) {
    if (!node || animationsOff()) return;
    const p = arenaXY(node);
    const d = el('div', 'fx-ring ' + (kind || ''));
    d.style.left = p.x + 'px'; d.style.top = p.y + 'px';
    $('fx').appendChild(d);
    setTimeout(() => d.remove(), 620);
  }

  // Casting flash + floating ability name when an operator uses a skill.
  function playSkill(uid, name) {
    const n = document.querySelector('.unit[data-uid="' + uid + '"]');
    if (n) {
      if (!animationsOff()) { n.classList.remove('cast'); void n.offsetWidth; n.classList.add('cast'); }
      ring(n, 'skill');
      if (name) floatText(n, '✦ ' + name, 'skill');
    }
    pulse(uid);
  }

  // Destruction caused by abilities (battles are animated by playAttack instead).
  function playDestroy(d) {
    const n = document.querySelector('.unit[data-uid="' + d.uid + '"]');
    if (!n) { return; }                     // already gone from the DOM -> nothing to animate
    if (animationsOff()) { render(); return; }
    S.animating = true;                     // keep the dying card on screen while it plays
    n.classList.add('dying');
    floatText(n, '✖', 'clash');
    ring(n, 'death');
    try { global.Sfx && global.Sfx.SFX.destroy(); } catch (e) {}
    if (!S._destroyTimer) {
      S._destroyTimer = setTimeout(() => { S._destroyTimer = null; S.animating = false; render(); }, 380);
    }
  }

  // Playing an Arts card: a Field art flies in from the hand to its back tile,
  // an Instant art flares as an over-sized card over the middle of the arena.
  function playArtIn(d) {
    if (!d || animationsOff()) return;
    if (d.kind === 'field') {
      const n = document.querySelector('.art-tile[data-uid="' + d.uid + '"]');
      if (!n) return;
      const hb = $('hand') ? $('hand').getBoundingClientRect() : null;
      const nb = n.getBoundingClientRect();
      if (hb && nb.width) {
        n.style.setProperty('--art-x', ((hb.left + hb.width / 2) - (nb.left + nb.width / 2)).toFixed(1) + 'px');
        n.style.setProperty('--art-y', ((hb.top + hb.height / 2) - (nb.top + nb.height / 2)).toFixed(1) + 'px');
      }
      n.classList.remove('place'); void n.offsetWidth; n.classList.add('place');
      ring(n, 'skill');
      setTimeout(() => { n.classList.remove('place'); n.style.removeProperty('--art-x'); n.style.removeProperty('--art-y'); }, 540);
    } else {
      castArtGhost(d.name, d.img);
    }
  }
  function castArtGhost(name, img) {
    const fx = $('fx'); if (!fx) return;
    const a = $('arena').getBoundingClientRect();
    const g = el('div', 'fx-artcast');
    g.innerHTML = '<div class="fx-artcast-img"' + (img ? ' style="background-image:url(\'' + img + '\')"' : '') + '></div>' +
      '<div class="fx-artcast-name">✦ ' + esc(name) + '</div>';
    g.style.left = (a.width / 2) + 'px';
    g.style.top = (a.height / 2) + 'px';
    fx.appendChild(g);
    setTimeout(() => g.remove(), 740);
  }

  // ============================================================ interaction
  function cancel() { S.mode = 'idle'; S.selHand = -1; S.selUnit = null; S.pending = null; render(); }

  function onHandClick(index) {
    if (!isMyTurn() || S.busy) return;
    const pl = P();
    const card = pl.hand[index];
    if (!card) return;
    if (card.kind === 'art' && isPureHealCard(card) && hpFull()) {
      S.selHand = -1; render();
      setStatus('Darah sudah penuh (' + pl.hp + '/' + (pl.maxHp || E.START_HP) + ') — kartu heal tidak bisa dipakai.');
      return;
    }
    if (card.kind === 'art' && E.isKillEffects(card.effects) && E.killLimitReached(pl)) {
      S.selHand = -1; render();
      setStatus('Batas instant-kill tercapai (maks. ' + E.KILL_LIMIT + ' operator per match) — kartu ini sudah tidak bisa dipakai.');
      return;
    }
    if (S.selHand === index) return cancel();
    S.selHand = index; S.selUnit = null;
    if (card.kind === 'operator') {
      const ranged = isRangedCls(card.cls);
      const freeFront = pl.front.indexOf(null) !== -1;
      const freeBack = ranged && pl.back.indexOf(null) !== -1;
      if (!freeFront && !freeBack) { S.selHand = -1; render(); setStatus('No free tile for ' + esc(card.name) + '.'); return; }
      if (pl.dp < card.cost) { S.selHand = -1; render(); setStatus('Not enough DP for ' + esc(card.name) + ' (needs ' + card.cost + ').'); return; }
      S.mode = 'deploy'; render();
    } else {
      // Arts (Instant or Field) — Field arts go to the support zone automatically.
      if (pl.dp < card.cost) { S.selHand = -1; render(); setStatus('Not enough DP.'); return; }
      if (card.needsTarget) {
        S.mode = 'artTarget';
        S.pending = { artIndex: index, effects: card.effects, source: null, label: 'Choose a target for <b>' + esc(card.name) + '</b>.' };
        render();
      } else { Cmd.playArt(index, null); resetAfterAction(); }
    }
  }

  function onUnitClick(u, owner) {
    if (S.busy || S.animating) return;
    if (owner !== S.me) {
      if (S.mode === 'attack') { doAttack((attacker) => Cmd.attack(attacker.uid, u.uid)); }
      else if (S.mode === 'skill' || S.mode === 'artTarget') {
        if (E._internal.hasPassive(u, 'untargetable')) { setStatus('<b>' + esc(u.name) + '</b> cannot be targeted by enemy Arts or abilities.'); return; }
        resolvePendingTarget(u);
      }
      else setStatus('<b>' + esc(u.name) + '</b> · ' + u.cls + ' · ATK ' + E.unitAtk(u) + ' / DEF ' + E.unitDef(u) + ' / HP ' + u.hp + '/' + u.maxHp + ' · ' + u.range +
        (u.skill ? ' · 【' + u.skill.type + '】' + esc(u.skill.name) : ''));
      return;
    }
    if (!isMyTurn()) return;
    if (S.mode === 'attack') { S.selUnit = u.uid; render(); return; }
    if (S.mode !== 'idle') return;
    S.selUnit = (S.selUnit === u.uid) ? null : u.uid;
    render();
  }

  function onEnemyHudClick() {
    if (S.mode === 'attack') {
      if (E.boardHasBlocker(OPP())) { setStatus('The enemy front line is blocking — clear all enemy front operators before you can strike the Doctor.'); return; }
      doAttack((attacker) => Cmd.attack(attacker.uid, 'player'));
    }
    else if (S.mode === 'skill' || S.mode === 'artTarget') setStatus('That ability must target an enemy operator.');
  }

  function doAttack(fn) {
    const attacker = unitByUid(S.selUnit);
    S.mode = 'idle'; S.selUnit = null; S.pending = null;
    if (!attacker) { render(); return; }
    S.animating = true;                 // lock render until the animation finishes
    const r = fn(attacker);             // emits 'attack' synchronously -> onChange -> playAttack
    if (r && r.ok === false) { S.animating = false; setStatus(r.error); render(); }
  }

  function onSlotClick(slotIndex, row, side) {
    if (!isMyTurn() || S.busy) return;
    if (S.mode === 'deploy' && side === S.me) {
      const card = P().hand[S.selHand];
      if (!card) return;
      if (row === 'back' && !isRangedCls(card.cls)) { setStatus('Only ranged operators (Sniper/Caster/Medic/Supporter) may hold the back row.'); return; }
      const r = Cmd.deploy(S.selHand, row, slotIndex);
      if (r && r.ok === false) { setStatus(r.error); return; }
      if (r && r.needsTarget) {
        if (E.isKillSkill(r.needsTarget.skill) && E.killLimitReached(P())) {
          setStatus('Batas instant-kill tercapai (maks. ' + E.KILL_LIMIT + ' operator per match) — efek ini tidak aktif.');
          resetAfterAction(); return;
        }
        S.pending = { effects: r.effects, source: r.needsTarget, label: 'Choose an enemy operator to destroy.' };
        S.mode = 'skill'; S.selHand = -1; render(); return;
      }
      resetAfterAction();
    }
  }

  function useSkill(u) {
    if (!u.skill) return;
    if (u.skill.needsTarget) {
      // Remember this is a real ability use so the target click routes through
      // Cmd.skill -> activateSkill (marks it used / exhausted). Resolving the
      // effects directly would let a targeted ability be reused endlessly.
      S.pending = { skill: true, source: u, label: 'Choose a target for <b>' + esc(u.skill.name) + '</b>.' };
      S.mode = 'skill'; S.selUnit = null; render();
    } else {
      const r = Cmd.skill(u.uid, null);
      if (r && r.ok === false) setStatus(r.error); else resetAfterAction();
    }
  }

  function resolvePendingTarget(target) {
    const pend = S.pending; if (!pend) return;
    if (pend.artIndex != null) {
      const r = Cmd.playArt(pend.artIndex, null);
      if (r && r.ok === false) { setStatus(r.error); return cancel(); }
      Cmd.resolve(pend.effects, null, target);
    } else if (pend.skill) {
      const r = Cmd.skill(pend.source.uid, target ? target.uid : null);
      if (r && r.ok === false) { setStatus(r.error); return; }
    } else {
      Cmd.resolve(pend.effects, pend.source || null, target);
    }
    resetAfterAction();
  }

  function resetAfterAction() { S.mode = 'idle'; S.selHand = -1; S.selUnit = null; S.pending = null; render(); }

  // ============================================================ AI driver
  function runAITurn() {
    if (E.state.over || S.abort) return;
    const mySession = S.session;
    S.busy = true; render();
    // signature of the visible board state, used as a stall watchdog
    const sig = () => {
      const s = E.state, a = s.players[1], b = s.players[0];
      return [s.turn, a.dp, a.hp, b.hp, a.hand.length,
        a.front.filter(Boolean).length, a.back.filter(Boolean).length,
        b.front.filter(Boolean).length, b.back.filter(Boolean).length,
        a.arts.length, b.arts.length, s.log.length].join('|');
    };
    let lastSig = sig();
    let stalled = 0;
    const dead = () => S.abort || mySession !== S.session;
    const finishTurn = (delay) => setTimeout(() => {
      if (dead()) return;
      if (E.state.over) { S.busy = false; render(); return; }
      E.endTurn(); S.busy = false; render();
    }, delay);
    const tick = () => {
      if (dead()) return;
      if (E.state.over) { S.busy = false; render(); return; }
      let r;
      try {
        r = global.AI.step();
        render();
      } catch (err) {
        console.error('AI turn error:', err);   // never let one error freeze the game
        r = { done: true };
      }
      if (r && r.done) { finishTurn(520); return; }
      const now = sig();
      stalled = (now === lastSig) ? stalled + 1 : 0;
      lastSig = now;
      if (stalled >= 6) { finishTurn(300); return; }   // watchdog: no progress -> end turn
      setTimeout(tick, 640);
    };
    setTimeout(tick, 760);
  }
  function endTurn() {
    if (!isMyTurn() || S.busy) return;
    cancel();
    if (S.online) { Cmd.end(); render(); return; }   // opponent is a real player — no AI
    E.endTurn();
    render();
    if (E.state.over) return;
    runAITurn();
  }

  // ============================================================ overlays
  function goMenu() {
    if (S.online && global.Net) global.Net.leave();
    S.online = false; S.me = 0; Cmd.online = false; Cmd.send = null;
    S.abort = true;
    S.session++;
    S.busy = false;
    S.animating = false;
    $('overlay').classList.add('hidden');
    if (global.Tooltip) global.Tooltip.hide();
    if (global.Menu) { global.Menu.show(); global.Menu.render(); }
    else { $('app').classList.remove('hidden-screen'); }
  }

  function gameOver() {
    const card = $('overlayCard');
    const win = E.state.winner === S.me;
    try { global.Sfx && global.Sfx.SFX[win ? 'win' : 'lose'](); } catch (e) {}
    const againBtn = S.online ? '' : '<button id="btnAgain" class="btn primary">↻ Play Again</button>';
    card.innerHTML =
      '<h1 style="color:' + (win ? '#57c785' : '#e5484d') + '">' + (win ? 'MISSION COMPLETE' : 'OPERATION FAILED') + '</h1>' +
      '<div class="tagline">' + (win ? 'The enemy Doctor has fallen.' : 'Rhodes Island retreats… for now.') + '</div>' +
      '<p>' + (win ? 'Victory is yours. The landship sails on.' : 'Regroup, rebuild your squad, and try another deployment.') + '</p>' +
      '<div class="row-btns">' + againBtn + '<button id="btnMenu2" class="btn">☰ Main Menu</button></div>';
    $('overlay').classList.remove('hidden');
    if ($('btnAgain')) $('btnAgain').onclick = () => { $('overlay').classList.add('hidden'); startGame(); };
    $('btnMenu2').onclick = goMenu;
  }

  function showPause() {
    const card = $('overlayCard');
    const s = (global.Menu && global.Menu.getSettings) ? global.Menu.getSettings() : {};
    const vol = (s.volume != null ? s.volume : 0.7);
    const sw = (key) => '<button class="switch ' + (s[key] ? 'on' : '') + '" data-pk="' + key + '" aria-pressed="' + !!s[key] + '"><i></i></button>';
    const row = (key, title, desc) => '<div class="set-row"><div class="set-info"><b>' + title + '</b><span>' + desc + '</span></div>' + sw(key) + '</div>';
    card.innerHTML =
      '<h1>PAUSED</h1><div class="tagline">OPERATION SUSPENDED</div>' +
      '<div class="set-group">' +
        '<h3>⚙ Settings</h3>' +
        row('sound', 'Sound effects', 'Battle sounds for deploy, attacks and victory.') +
        '<div class="set-row slider-row"><div class="set-info"><b>Master volume</b><span>0 – 100%</span></div>' +
          '<input id="pauseVol" type="range" min="0" max="100" value="' + Math.round(vol * 100) + '"><span id="pauseVolVal" class="vol-val">' + Math.round(vol * 100) + '%</span></div>' +
        row('animations', 'Animations', 'Card draw, deploy pop, arts cast, attack lunges and destruction.') +
        row('dmgNumbers', 'Damage numbers', 'Floating damage / clash numbers on impact.') +
        row('shake', 'Screen shake', 'HUD shakes when the Doctor takes damage.') +
      '</div>' +
      '<div class="row-btns">' +
        '<button id="btnResume" class="btn primary">▶ Resume</button>' +
        '<button id="btnPauseHelp" class="btn">? Rules</button>' +
        '<button id="btnPauseMenu" class="btn">☰ Main Menu</button>' +
      '</div>' +
      '<p class="page-note" style="margin-top:10px">Returning to the Main Menu concedes the current battle.</p>';
    $('overlay').classList.remove('hidden');
    $('btnResume').onclick = () => { $('overlay').classList.add('hidden'); render(); };
    $('btnPauseHelp').onclick = showHelp;
    $('btnPauseMenu').onclick = goMenu;
    card.querySelectorAll('[data-pk]').forEach(b => {
      b.onclick = () => { const k = b.dataset.pk; if (global.Menu && global.Menu.toggleSetting) global.Menu.toggleSetting(k); showPause(); };
    });
    const pv = $('pauseVol');
    if (pv) pv.oninput = () => { const v = parseInt(pv.value, 10) || 0; $('pauseVolVal').textContent = v + '%'; if (global.Menu && global.Menu.setSetting) global.Menu.setSetting('volume', v / 100); };
  }

  function showHelp() {
    const card = $('overlayCard');
    card.innerHTML =
      '<h1>Rules Reference</h1><div class="tagline">THAT ARKNIGHTS CARD GAME (fan adaptation)</div>' +
      '<h2>Turn structure</h2><ul><li><b>Start:</b> +10 DP, draw 1.</li><li><b>Main:</b> play cards, activate abilities, attack (each Front operator once).</li><li><b>End:</b> end-of-turn effects, countdown −1, discard to 5, DP resets to 0.</li></ul>' +
      '<h2>Cards</h2><ul><li><b>Operators</b> — have ATK &amp; DEF; they block enemy attacks <b>from the front row only</b>.</li><li><b>Front row (▲)</b> — any operator. <b>Back row (▼)</b> — ranged operators only (Sniper, Caster, Medic, Supporter); the back row never blocks.</li><li><b>Instant Arts</b> — resolve immediately.</li><li><b>Field Arts</b> — a support zone under your deck/discard, lasts a few turns.</li><li><b>Locations</b> — one per player, permanent; some have an Active ability usable once per turn (costs DP).</li></ul>' +
      '<h2>Attack &amp; blocking</h2><ul><li>Only the <b>front row blocks</b>: while the enemy has any operator awake in the front row, you <b>cannot strike their Doctor</b>. Ranged operators in the back row do <b>not</b> block — clear the enemy front line and the Doctor is exposed.</li><li>A <b>back-row operator</b> can only be attacked once the enemy front line is empty.</li><li>Attacking a Doctor deals damage equal to the attacker\'s ATK (each Doctor has 30 HP).</li><li>Operator vs operator: the attacker deals <b>ATK − (target DEF ÷ 3, rounded down)</b> damage, at least 1, to the target\'s <b>HP</b>. Damage stays between turns; an operator is destroyed at 0 HP.</li><li>Each Operator has <b>15–30 HP</b> (tougher classes and rarer units last longer).</li><li>Heal effects stop at your max HP (30) — a healing card/ability cannot be used while your HP is already full.</li></ul>' +
      '<h2>Arena</h2><ul><li>Every match takes place on a random <b>Arena</b>. Its buff is the game\'s <b>only</b> buff and it is <b>global</b> — it applies to <b>both</b> players automatically (shown on the frontline).</li></ul>' +
      '<h2>Keywords</h2><ul><li><b>Taunt</b> — must be attacked first.</li><li><b>Sleep</b> — can\'t attack, block, or use its ability, but can still be attacked. Lasts 1 turn (up to 2).</li><li><b>Helidrop</b> — can attack the turn it is played.</li><li><b>Bounce</b> — return a card to hand.</li><li><b>Silence</b> — disables a card ability. Lasts 2 turns (up to 3).</li><li><b>Untargetable</b> — cannot be chosen as the target of enemy Arts or abilities (board-wide area effects and ordinary attacks still hit it).</li><li><b>Instant-kill</b> — <b>"Destroy"</b> effects (operator skills <i>and</i> Arts) destroy at most <b>3 enemy operators per player per match</b>. An area effect spends one of the three for <i>each</i> operator it destroys, so it stops once the allowance runs out. After that the option is hidden / marked LIMIT and can no longer be used.</li></ul>' +
      '<p style="color:#8b96ab">Tip: click your <b>DECK</b> / <b>DISCARD</b> piles to inspect them. <kbd>E</kbd> ends turn · <kbd>Esc</kbd> cancels · <kbd>L</kbd> toggles the log.</p>' +
      '<div class="row-btns"><button id="btnCloseHelp" class="btn primary">Close</button></div>';
    $('overlay').classList.remove('hidden');
    $('btnCloseHelp').onclick = () => $('overlay').classList.add('hidden');
  }

  function showPile(list, title) {
    const card = $('overlayCard');
    const items = list.length
      ? list.slice().reverse().map(c => '<div class="pile-item" data-tip="' + cardTip(c).replace(/"/g, '&quot;') + '"><b>' + esc(c.name) + '</b> <span>' + (c.kind === 'operator' ? '(Operator · ' + c.cls + ')' : '(Arts)') + '</span></div>').join('')
      : '<p class="empty-note">This pile is empty.</p>';
    card.innerHTML = '<h1>' + esc(title) + '</h1><div class="tagline">' + list.length + ' CARD' + (list.length === 1 ? '' : 'S') + '</div><div class="pile-grid">' + items + '</div>' +
      '<div class="row-btns"><button id="btnClosePile" class="btn primary">Close</button></div>';
    $('overlay').classList.remove('hidden');
    $('btnClosePile').onclick = () => $('overlay').classList.add('hidden');
  }

  function toggleLog(force) {
    S.logHidden = (force === undefined) ? !S.logHidden : force;
    $('logPanel').classList.toggle('collapsed', S.logHidden);
    $('btnLog').classList.toggle('on', !S.logHidden);
  }

  // Intro "coin flip" that announces which side takes the first turn.
  function showFirstTurnAnim() {
    if (!E.state) return;
    const fx = $('fx'); if (!fx) return;
    fx.querySelectorAll('.cointoss').forEach(n => { if (n.parentNode) n.parentNode.removeChild(n); });
    const youFirst = E.state.active === S.me;
    const label = youFirst ? 'YOU GO FIRST'
      : (S.online ? 'OPPONENT GOES FIRST' : 'ENEMY GOES FIRST');
    const box = el('div', 'cointoss');
    box.innerHTML =
      '<div class="ct-coin">\u25C8</div>' +
      '<div class="ct-cap">COIN FLIP</div>' +
      '<div class="ct-out ' + (youFirst ? 'you' : 'foe') + '">' + label + '</div>';
    fx.appendChild(box);
    setTimeout(() => { if (box.parentNode) box.parentNode.removeChild(box); }, 2100);
  }

  function startGame() {
    S.online = false; S.me = 0; Cmd.online = false; Cmd.send = null;   // local vs-AI match
    S.mode = 'idle'; S.selHand = -1; S.selUnit = null; S.pending = null;
    S.busy = false; S.animating = false; S.overShown = false; S.started = true; S.abort = false;
    S.session++;
    S.handNodes = new Map();
    $('hand').innerHTML = '';
    const opts = (global.Menu && global.Menu.startGameOptions) ? global.Menu.startGameOptions() : {};
    E.newGame(opts);
    const arena = E.state.arena;
    $('arena').style.backgroundImage = arena ? "url('assets/arenas/" + arena.id + ".png')" : '';
    render();
    showFirstTurnAnim();
    // The coin flip can hand the opening turn to the AI — let it act right away.
    if (!S.online && E.state && !E.state.over && E.state.active !== S.me) runAITurn();
  }

  function beginBattle() {
    // Guard: a battle can only start with a complete deck (exactly 20 cards).
    // If the deck is short/over, warn the player and stay in the menu.
    if (global.Menu && global.Menu.deckIssue) {
      const issue = global.Menu.deckIssue();
      if (issue) {
        if (global.Menu.toast) global.Menu.toast('⚠ Cannot start — ' + issue, 'warn');
        return;
      }
    }
    if (global.Menu && global.Menu.hide) global.Menu.hide();
    else { $('app').classList.remove('hidden-screen'); }
    startGame();
  }

  // Start an online match from the server's setup payload:
  //   { you: 0|1, seed, deck0, deck1 }
  function startOnline(payload) {
    S.me = (payload && payload.you === 1) ? 1 : 0;
    S.online = true;
    Cmd.online = true;
    Cmd.send = (msg) => { if (global.Net) global.Net.action(msg); };
    S.mode = 'idle'; S.selHand = -1; S.selUnit = null; S.pending = null;
    S.busy = false; S.animating = false; S.overShown = false; S.started = true; S.abort = false;
    S.session++;
    S.handNodes = new Map();
    $('hand').innerHTML = '';
    E.newGame({ deck: payload.deck0, deck1: payload.deck1, seed: payload.seed });
    const arena = E.state.arena;
    $('arena').style.backgroundImage = arena ? "url('assets/arenas/" + arena.id + ".png')" : '';
    render();
    showFirstTurnAnim();
  }

  // ============================================================ boot
  function boot() {
    if (global.Tooltip) global.Tooltip.init();

    // ---- online wiring ----
    if (global.Net) {
      global.Net.handlers.start = (m) => { if (global.Menu && global.Menu.hide) global.Menu.hide(); startOnline(m); };
      global.Net.handlers.action = (msg) => { try { Cmd.apply(msg); render(); } catch (e) { console.error('net action', e); } };
      global.Net.handlers.peerLeft = () => {
        if (!S.online) return;
        S.online = false; Cmd.online = false;
        const card = $('overlayCard');
        card.innerHTML =
          '<h1 style="color:#e5484d">OPPONENT LEFT</h1>' +
          '<div class="tagline">CONNECTION CLOSED</div>' +
          '<p>Your opponent disconnected, so the match has ended.</p>' +
          '<div class="row-btns"><button id="btnMenu2" class="btn primary">☰ Main Menu</button></div>';
        $('overlay').classList.remove('hidden');
        $('btnMenu2').onclick = () => { $('overlay').classList.add('hidden'); goMenu(); };
      };
    }

    E.onChange((evt, data) => {
      try {
        if (evt === 'attack' && data) playAttack(data);
        else if (evt === 'skill' && data) { try { global.Sfx && global.Sfx.SFX.play(); } catch (e) {} render(); playSkill(data.unitUid, data.name); }
        else if (evt === 'destroy' && data) { playDestroy(data); }
        else if (evt === 'deploy') { try { global.Sfx && global.Sfx.SFX.deploy(); } catch (e) {} render(); }
        else if (evt === 'playart' && data) { try { global.Sfx && global.Sfx.SFX.deploy(); } catch (e) {} render(); playArtIn(data); }
        else if (evt === 'startturn') { if (E.state.active === S.me) { try { global.Sfx && global.Sfx.SFX.turn(); } catch (e) {} } render(); }
        else render();
      } catch (e) { console.error(e); }
    });

    $('btnMenu').onclick = showPause;
    $('btnEnd').onclick = endTurn;
    const lbn = $('locBtn'); if (lbn) lbn.onclick = (e) => {
      e.stopPropagation();
      if (!isMyTurn() || S.busy) return;
      const r = Cmd.location();
      if (r && r.ok === false) { setStatus(r.error); return; }
      try { global.Sfx && global.Sfx.SFX.play(); } catch (er) {}
      render();
    };
    $('btnHelp').onclick = showHelp;
    $('btnLog').onclick = () => toggleLog();
    $('btnLogHide').onclick = () => toggleLog(true);
    $('enemyHud').onclick = onEnemyHudClick;
    $('playerHud').onclick = () => { if (['attack', 'skill', 'artTarget'].indexOf(S.mode) >= 0) setStatus('That action targets the enemy side.'); };
    $('enemyGravePile').onclick = (e) => { e.stopPropagation(); showPile(OPP().grave, 'Enemy Discard Pile'); };
    $('playerGravePile').onclick = (e) => { e.stopPropagation(); showPile(P().grave, 'Your Discard Pile'); };
    $('enemyDeckPile').onclick = (e) => { e.stopPropagation(); setStatus('Enemy deck: ' + OPP().deck.length + ' cards remaining.'); };
    $('playerDeckPile').onclick = (e) => { e.stopPropagation(); setStatus('Your deck: ' + P().deck.length + ' cards remaining.'); };

    $('arena').addEventListener('click', (e) => {
      const slot = e.target.closest('.slot');
      if (slot) { onSlotClick(parseInt(slot.dataset.slot, 10), slot.dataset.row, parseInt(slot.dataset.side, 10)); return; }
      if (!e.target.closest('.unit') && !e.target.closest('.hud') && !e.target.closest('.art-tile') && !e.target.closest('.pile') && !e.target.closest('.loc')) {
        if (S.mode !== 'idle') cancel();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') cancel();
      else if ((e.key === 'e' || e.key === 'E') && isMyTurn() && !S.busy) endTurn();
      else if (e.key === 'l' || e.key === 'L') toggleLog();
    });

    toggleLog(false);
    if (global.Menu && global.Menu.init) global.Menu.init();
    else { $('app').classList.remove('hidden-screen'); startGame(); }
  }

  global.Game = { start: beginBattle, startOnline, goMenu, help: showHelp, isOnline: () => S.online };

  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})(window);
