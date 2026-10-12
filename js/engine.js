/* =========================================================================
   Arknight Card Battle — Game Engine
   Implements the TACG rules (see D:\THEGAME\TACG Rulebook.docx):
   front row operators, blocking, range, single-battle resolution,
   DP economy, countdown/duration, the ability types, card states.
   ========================================================================= */
(function (global) {
  'use strict';

  const SLOTS = 4;
  const START_HP = 30;
  const DP_PER_TURN = 10;
  const HAND_LIMIT = 5;

  // Fast-redeploy operators that can attack the turn they are played (Helidrop).
  const HELIDROP = ['siege', 'bagpipe', 'myrtle', 'texas', 'projektred', 'w',
    'cantabile', 'gravel', 'phantom', 'aak', 'texas2'];

  // Ranged classes may be deployed to the BACK row (and the front too).
  // Everyone else is front-line only. The back row does NOT block.
  const RANGED_CLASSES = ['Sniper', 'Caster', 'Medic', 'Supporter'];
  const isRanged = (card) => !!(card && RANGED_CLASSES.indexOf(card.cls) >= 0);

  // Instant-kill effects (destroyOperator / destroyFront) are capped: each
  // player may resolve at most KILL_LIMIT of them per match. Once the cap is
  // reached the option is no longer usable (the UI hides/dims it).
  const KILL_LIMIT = 3;
  const KILL_KINDS = { destroyOperator: 1, destroyFront: 1 };
  const isKillEffects = (effs) => !!(effs || []).some(e => e && KILL_KINDS[e.k]);
  const isKillSkill = (sk) => !!(sk && isKillEffects(sk.effects));
  const killLimitReached = (P) => !!P && (P.killCount || 0) >= KILL_LIMIT;

  // All operators currently on a player's board (front + back).
  const boardUnits = (P) => P.front.concat(P.back).filter(Boolean);

  let uidCounter = 1;
  const uid = (p) => p + '_' + (uidCounter++);

  let state = null;
  let listeners = [];

  function emit(evt, data) { listeners.forEach(fn => fn(evt, data)); }

  // ------------------------------------------------------------------ units
  function makeUnit(card, owner, row) {
    const arenaHp = (state && state.arena && state.arena.effects && state.arena.effects.hp) || 0;
    const maxHp = (card.hp || 18) + arenaHp;
    return {
      uid: uid(card.slug),
      kind: 'operator',
      cardId: card.slug,
      name: card.name,
      cls: card.cls,
      rar: card.rar,
      baseAtk: card.atk,
      baseDef: card.def,
      hp: maxHp,
      maxHp: maxHp,
      atkMod: 0,
      defMod: 0,
      range: card.range,
      tempLong: false,
      cost: card.cost,
      img: card.img,
      color: card.color,
      icon: card.icon,
      faction: card.faction,
      skill: card.skill,
      skillUsed: false,   // Manual (once) / Active (once per turn)
      exhausted: false,   // attacked this turn
      slept: false,
      sleepTurns: 0,      // remaining of the owner's turns spent asleep (standard 1, max 2)
      silenced: false,
      silenceTurns: 0,    // remaining of the owner's turns silenced (standard 2, max 3)
      selfDestruct: false,
      owner: owner,
      row: row === 'back' ? 'back' : 'front',
      turnPlayed: state ? state.turn : 0
    };
  }

  function makeFieldArt(card, owner) {
    return {
      uid: uid(card.id),
      kind: 'art',
      cardId: card.id,
      name: card.name,
      cost: card.cost,
      text: card.text,
      effects: card.effects,
      duration: card.duration || 0,
      maxDuration: card.duration || 0,
      img: card.img,
      owner: owner
    };
  }

  // ------------------------------------------------------------- stat math
  function hasPassive(unit, key) {
    if (!unit || !unit.skill || unit.silenced) return false;
    return (unit.skill.effects || []).some(e => e.k === key);
  }
  function passiveValue(unit, key) {
    if (!unit || !unit.skill || unit.silenced) return 0;
    let v = 0;
    (unit.skill.effects || []).forEach(e => { if (e.k === key) v += (e.v || 0); });
    return v;
  }

  function unitAtk(unit, st) {
    let a = unit.baseAtk + unit.atkMod;
    a += passiveValue(unit, 'buffAtkSelf');            // own passive
    const P = st.players[unit.owner], O = st.players[1 - unit.owner];
    P.front.forEach(f => { if (f) a += passiveValue(f, 'buffAtkAll'); });
    P.arts.forEach(b => { (b.effects || []).forEach(e => { if (e.k === 'buffAtkAll') a += e.v; }); });
    if (P.location) (P.location.effects || []).forEach(e => { if (e.k === 'buffAtkAll') a += e.v; });
    if (st.arena && st.arena.effects) a += (st.arena.effects.atk || 0);   // shared arena buff
    return Math.max(0, a);
  }
  function unitDef(unit, st) {
    let d = unit.baseDef + unit.defMod;
    d += passiveValue(unit, 'buffDefSelf');
    const P = st.players[unit.owner];
    P.front.forEach(f => { if (f) d += passiveValue(f, 'buffDefAll'); });
    P.arts.forEach(b => { (b.effects || []).forEach(e => { if (e.k === 'buffDefAll') d += e.v; }); });
    if (st.arena && st.arena.effects) d += (st.arena.effects.def || 0);   // shared arena buff
    return Math.max(0, d);
  }
  function unitRange(unit) { return unit.tempLong ? 'long' : unit.range; }

  // ------------------------------------------------------------------ setup
  // Deterministic RNG (mulberry32). Online matches run the SAME engine on both
  // devices from the same seed, so every shuffle and the arena draw must be
  // reproducible. With no seed we fall back to Math.random (normal vs-AI game).
  let rng = Math.random;
  function setSeed(seed) {
    if (seed == null) { rng = Math.random; return; }
    let a = seed >>> 0;
    rng = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  function buildDeck(operators, arts) {
    const deck = [];
    operators.forEach(op => deck.push({ kind: 'operator', ...Cards.operatorCard(op) }));
    arts.forEach(a => deck.push({ kind: 'art', ...Cards.artById(a) }));
    return shuffle(deck);
  }

  // entries: [{kind:'operator', slug}, {kind:'art', id}]
  function buildFromEntries(entries) {
    const deck = [];
    (entries || []).forEach(e => {
      if (!e) return;
      if (e.kind === 'operator') { const c = Cards.operatorCard(e.slug); if (c) deck.push({ kind: 'operator', ...c }); }
      else if (e.kind === 'art') { const a = Cards.artById(e.id); if (a) deck.push({ kind: 'art', ...a }); }
    });
    return shuffle(deck);
  }

  function newGame(opts) {
    opts = opts || {};
    setSeed(opts.seed != null ? opts.seed : null);   // online: same seed on both clients
    // A deck is 20 cards TOTAL (any mix of Operators and Arts; each Art up to 2 copies).
    const DECK_SIZE = 20;
    const artPool = Cards.ARTS.map(a => a.id);

    // Build a random 20-card deck: 3 Arts x2 copies (6) + 14 Operators.
    function makeDeck() {
      const ids = shuffle(artPool.slice()).slice(0, 3);
      const arts = [];
      ids.forEach(id => { arts.push(id); arts.push(id); });
      const ops = shuffle(Cards.OPERATORS.slice()).slice(0, DECK_SIZE - arts.length).map(o => o.slug);
      return buildDeck(ops, arts);
    }

    const locPool = shuffle(Cards.LOCATIONS.map(l => l.id));

    // The arena is drawn at random (or chosen by the caller). Its buff is
    // SHARED: it applies to BOTH players.
    const arena = (opts.arena && Cards.arenaById(opts.arena))
      || Cards.ARENAS[Math.floor(rng() * Cards.ARENAS.length)];

    const p0deck = (opts.deck && opts.deck.length)
      ? buildFromEntries(opts.deck)
      : makeDeck();
    const p1deck = (opts.deck1 && opts.deck1.length)
      ? buildFromEntries(opts.deck1)
      : makeDeck();

    // Locations are drawn at random every match (one per player).
    const p0locId = locPool[0];
    const aiLocId = locPool[1] || locPool[0];

    // Coin flip for who takes the very first turn. Drawn from the same seeded
    // RNG (after arena/locations) so online clients stay perfectly in sync.
    const firstIdx = rng() < 0.5 ? 0 : 1;

    state = {
      turn: 0,
      active: firstIdx,
      over: false,
      winner: null,
      arena: arena,
      log: [],
      players: [
        {
          idx: 0, isAI: false, hp: START_HP, maxHp: START_HP, dp: 0, locUsedTurn: -1, killCount: 0,
          deck: p0deck, hand: [], grave: [],
          front: new Array(SLOTS).fill(null), back: new Array(SLOTS).fill(null), arts: [],
          location: Cards.locationById(p0locId)
        },
        {
          idx: 1, isAI: true, hp: START_HP, maxHp: START_HP, dp: 0, locUsedTurn: -1, killCount: 0,
          deck: p1deck, hand: [], grave: [],
          front: new Array(SLOTS).fill(null), back: new Array(SLOTS).fill(null), arts: [],
          location: Cards.locationById(aiLocId)
        }
      ]
    };

    state.players.forEach(P => { for (let i = 0; i < 5; i++) drawCard(P); });

    log('The battle begins. Deploy your Operators and break the enemy Doctor.');
    log('Arena: ' + arena.name + ' — ' + arena.text);
    log(firstIdx === 0 ? 'You go first.' : 'The enemy goes first.');
    emit('newgame');
    startTurn(true); // player 1, first turn (no draw)
    return state;
  }

  // ------------------------------------------------------------------ misc
  function drawCard(P) {
    if (!P.deck.length) {
      log((P.idx === 0 ? 'You are' : 'Enemy is') + ' out of cards and takes 1 fatigue damage.');
      P.hp -= 1;
      if (P.hp <= 0) { P.hp = 0; state.over = true; state.winner = 1 - P.idx; emit('gameover'); }
      return null;
    }
    const card = P.deck.pop();
    P.hand.push(card);
    return card;
  }
  function log(msg) { state.log.push(msg); if (state.log.length > 200) state.log.shift(); }

  function opponentOf(P) { return state.players[1 - P.idx]; }
  function activePlayer() { return state.players[state.active]; }

  function boardHasBlocker(P) {
    return P.front.some(u => u && !u.slept);
  }

  function findUnitOnBoard(u) {
    for (const P of state.players) {
      for (const f of P.front) if (f && f.uid === u) return f;
      for (const b of P.back) if (b && b.uid === u) return b;
      for (const a of P.arts) if (a && a.uid === u) return a;
    }
    return null;
  }

  // -------------------------------------------------------------- turn flow
  function startTurn(isFirst) {
    const P = activePlayer();
    P.dp += DP_PER_TURN;
    // dpStart passives
    P.front.forEach(f => { if (f) P.dp += passiveValue(f, 'dpStart'); });
    P.back.forEach(f => { if (f) P.dp += passiveValue(f, 'dpStart'); });
    if (P.location) (P.location.effects || []).forEach(e => { if (e.k === 'dpStart') P.dp += e.v; });
    if (state.arena && state.arena.effects && state.arena.effects.dp) P.dp += state.arena.effects.dp;   // shared arena buff

    const skipDraw = isFirst && state.turn === 0;
    if (!skipDraw) for (let i = 0; i < 1; i++) drawCard(P);

    // reset per-turn unit flags for the active player
    P.front.forEach(f => { if (f) { f.exhausted = false; f.skillUsed = false; } });
    P.back.forEach(f => { if (f) { f.exhausted = false; f.skillUsed = false; } });

    log('— ' + (P.idx === 0 ? 'Your' : 'Enemy') + ' turn ' + (state.turn + 1) + '. +' + DP_PER_TURN + ' DP, drew 1.');
    emit('startturn');
  }

  function endTurn() {
    if (state.over) return;
    const P = activePlayer();

    // end of turn autos (operators on the board + field arts)
    boardUnits(P).forEach(u => {
      if (u.slept || u.silenced) return;   // asleep / silenced operators cannot act
      if (u.skill && u.skill.type === 'Auto') resolveEffects(u.skill.effects, u, null);
    });
    P.arts.forEach(b => {
      if (b && b.sourceTurn !== state.turn) resolveEffects(b.effects, null, null);
    });
    // self-destruct
    boardUnits(P).forEach(f => { if (f.selfDestruct) destroyUnit(f, 'self-destruct'); });

    // countdown on field arts (they live in the support zone, not on the board)
    P.arts.slice().forEach(b => {
      // The turn a Field Art is cast does not count toward its duration, so a
      // "lasts 3 turns" art resolves 3 times instead of 2.
      if (b.sourceTurn === state.turn) return;
      if (b.duration > 0) {
        b.duration -= 1;
        if (b.duration <= 0) {
          P.grave.push(b);
          const idx = P.arts.indexOf(b);
          if (idx >= 0) P.arts.splice(idx, 1);
          log(b.name + ' expired.');
        }
      }
    });

    // discard to hand limit
    while (P.hand.length > HAND_LIMIT) {
      const c = P.hand.shift();
      P.grave.push(c);
    }

    // clear temporary buffs, then tick down status debuffs (sleep / silence)
    // at the end of the affected player's own turn
    boardUnits(P).forEach(f => {
      f.tempLong = false; f.atkMod = 0; f.defMod = 0;
      if (f.sleepTurns > 0) { f.sleepTurns -= 1; if (f.sleepTurns <= 0) { f.sleepTurns = 0; f.slept = false; log(f.name + ' wakes up.'); } }
      if (f.silenceTurns > 0) { f.silenceTurns -= 1; if (f.silenceTurns <= 0) { f.silenceTurns = 0; f.silenced = false; log(f.name + ' can use skills again.'); } }
    });

    // reset DP
    P.dp = 0;

    if (state.over) return;
    state.turn += 1;
    state.active = 1 - state.active;
    emit('turndone');
    startTurn(false);
  }

  // ------------------------------------------------------------- deployment
  // A card that ONLY heals cannot be used while HP is already full.
  function isPureHeal(effects) {
    return !!(effects && effects.length) && effects.every(e => e.k === 'healPlayer');
  }

  function canDeploy(P, card) {
    if (!card) return false;
    if (card.kind === 'operator') {
      if (P.dp < card.cost) return false;
      if (P.front.indexOf(null) !== -1) return true;
      return isRanged(card) && P.back.indexOf(null) !== -1;
    }
    if (card.kind === 'art') return P.dp >= card.cost;   // Field arts use the support zone (no tile)
    return false;
  }

  function deployOperator(P, handIndex, row, slot) {
    const card = P.hand[handIndex];
    if (!card || card.kind !== 'operator') return fail('Not an Operator.');
    if (P.dp < card.cost) return fail('Not enough DP.');
    row = row === 'back' ? 'back' : 'front';
    if (row === 'back' && !isRanged(card)) return fail('Only ranged operators (Sniper/Caster/Medic/Supporter) may hold the back row.');
    const line = row === 'back' ? P.back : P.front;
    if (slot == null || line[slot] !== null) return fail('No free ' + (row === 'back' ? 'back' : 'front') + ' tile.');
    P.dp -= card.cost;
    P.hand.splice(handIndex, 1);
    const u = makeUnit(card, P.idx, row);
    u.turnPlayed = state.turn;
    u.exhausted = !HELIDROP.includes(u.cardId); // deployment sickness unless Helidrop
    line[slot] = u;
    log((P.idx === 0 ? 'You deploy ' : 'Enemy deploys ') + u.name + ' — ' + row + ' row (ATK ' + u.baseAtk + '/DEF ' + u.baseDef + ').');
    triggerInstant(u);
    if (u.skill && u.skill.needsTarget && u.skill.type === 'Instant') {
      // needs a target decided by caller; expose pending
      return { needsTarget: u, effects: u.skill.effects, ready: false };
    }
    emit('deploy');
    return { ok: true };
  }

  function playArt(P, handIndex, slot) {
    const card = P.hand[handIndex];
    if (!card || card.kind !== 'art') return fail('Not an Arts card.');
    if (P.dp < card.cost) return fail('Not enough DP.');
    if (isPureHeal(card.effects) && P.hp >= (P.maxHp || START_HP)) return fail('HP is already full.');
    if (card.artType === 'Field') { // Field — goes to the support zone (no board tile)
      P.dp -= card.cost;
      P.hand.splice(handIndex, 1);
      const a = makeFieldArt(card, P.idx);
      a.sourceTurn = state.turn;
      P.arts.push(a);
      log((P.idx === 0 ? 'You deploy field arts ' : 'Enemy deploys ') + a.name + '.');
      emit('playart', { kind: 'field', owner: P.idx, uid: a.uid, name: a.name });
      return { ok: true };
    } else {
      // Instant
      P.dp -= card.cost;
      P.hand.splice(handIndex, 1);
      P.grave.push(card);
      log((P.idx === 0 ? 'You cast ' : 'Enemy casts ') + card.name + '.');
      emit('playart', { kind: 'instant', owner: P.idx, name: card.name, img: card.img });
      if (card.needsTarget) return { needsTarget: card, effects: card.effects, fromArt: true };
      resolveEffects(card.effects, null, null);
      return { ok: true };
    }
  }

  function triggerInstant(u) {
    if (u.skill && u.skill.type === 'Instant' && !u.skill.needsTarget) {
      resolveEffects(u.skill.effects, u, null);
    }
  }

  // -------------------------------------------------------------- abilities
  function activateSkill(P, unit, target) {
    if (!unit || !unit.skill) return fail('No ability.');
    const t = unit.skill.type;
    if (t !== 'Active' && t !== 'Manual') return fail('This ability cannot be activated.');
    if (unit.slept) return fail(unit.name + ' is asleep and cannot use abilities.');
    if (unit.silenced) return fail(unit.name + ' is silenced and cannot use abilities.');
    if (unit.skillUsed) return fail('Ability already used this turn.');
    if (unit.exhausted) return fail('This operator already acted this turn.');
    // On the turn it is deployed, only a DP-granting ability may be used.
    if (unit.turnPlayed === state.turn && !(unit.skill.effects || []).some(e => e.k === 'gainDP')) {
      return fail('This operator can only use a DP ability the turn it is deployed.');
    }
    if (t === 'Active' && unit.skill.cost && P.dp < unit.skill.cost) return fail('Not enough DP.');
    if (unit.skill.needsTarget && !target) return fail('Choose a target.');
    if (isPureHeal(unit.skill.effects) && P.hp >= (P.maxHp || START_HP)) return fail('HP is already full.');

    if (t === 'Active') P.dp -= (unit.skill.cost || 0);
    unit.skillUsed = true;
    unit.exhausted = true;   // using an ability counts as the operator's action this turn
    log((P.idx === 0 ? 'You activate ' : 'Enemy activates ') + unit.name + ' — ' + unit.skill.name + '.');
    resolveEffects(unit.skill.effects, unit, target);
    emit('skill', { unitUid: unit.uid, name: unit.skill.name });
    return { ok: true };
  }

  // Locations — an Active ability may be used once per turn and costs DP.
  function activateLocation(P, target) {
    if (!P) P = activePlayer();
    const loc = P.location;
    if (!loc || !loc.active) return fail('This Location has no Active ability.');
    if (state.over) return fail('The game is over.');
    if (state.active !== P.idx) return fail('Not your turn.');
    if (P.locUsedTurn === state.turn) return fail('Location ability already used this turn.');
    if (P.dp < loc.active.cost) return fail('Not enough DP for ' + loc.name + '.');
    if (loc.active.needsTarget && !target) return fail('Choose a target.');
    P.dp -= loc.active.cost;
    P.locUsedTurn = state.turn;
    log((P.idx === 0 ? 'You use ' : 'Enemy uses ') + loc.name + ' — ' + loc.active.text);
    resolveEffects(loc.active.effects || [], null, target || null);
    emit('location', { owner: P.idx, name: loc.name, text: loc.active.text });
    return { ok: true };
  }

  function resolveEffects(effects, source, target) {
    (effects || []).forEach(e => {
      switch (e.k) {
        case 'dmgPlayer': {
          const O = source ? opponentOf(state.players[source.owner]) : opponentOf(activePlayer());
          damagePlayer(O, e.v);
          break;
        }
        case 'healPlayer': {
          const P = source ? state.players[source.owner] : activePlayer();
          const before = P.hp;
          P.hp = Math.min(P.maxHp || START_HP, P.hp + e.v);   // never heal past max HP
          log((P.idx === 0 ? 'You heal ' : 'Enemy heals ') + (P.hp - before) + ' HP.');
          break;
        }
        case 'gainDP': {
          const P = source ? state.players[source.owner] : activePlayer();
          P.dp += e.v;
          break;
        }
        case 'draw': {
          const P = source ? state.players[source.owner] : activePlayer();
          for (let i = 0; i < e.v; i++) drawCard(P);
          break;
        }
        case 'destroyOperator': {
          const KP = source ? state.players[source.owner] : activePlayer();
          if (killLimitReached(KP)) { log('Instant-kill limit reached (' + KILL_LIMIT + '/match) — ' + (source ? source.name : 'the effect') + ' fizzles.'); break; }
          if (!target || target.kind !== 'operator') break;
          if (e.maxDef != null && unitDef(target, state) > e.maxDef) break;
          destroyUnit(target, 'ability');
          KP.killCount = (KP.killCount || 0) + 1;
          break;
        }
        case 'destroyFront': {
          const O = source ? opponentOf(state.players[source.owner]) : opponentOf(activePlayer());
          const KP = source ? state.players[source.owner] : activePlayer();
          if (killLimitReached(KP)) { log('Instant-kill limit reached (' + KILL_LIMIT + '/match) — ' + (source ? source.name : 'the effect') + ' fizzles.'); break; }
          const before = O.front.filter(Boolean).length;
          O.front.slice().forEach(u => { if (u && unitDef(u, state) <= e.maxDef) destroyUnit(u, 'ability'); });
          if (O.front.filter(Boolean).length < before) KP.killCount = (KP.killCount || 0) + 1;
          break;
        }
        case 'bounceTarget': {
          if (!target || target.kind !== 'operator') break;
          const O = state.players[target.owner];
          const line = target.row === 'back' ? O.back : O.front;
          const idx = line.indexOf(target);
          if (idx >= 0) { line[idx] = null; O.hand.push({ kind: 'operator', ...Cards.operatorCard(target.cardId) }); log(target.name + ' is bounced back to hand.'); }
          break;
        }
        case 'buffAtkSelf': if (source) source.atkMod += e.v; break;
        case 'buffDefSelf': if (source) source.defMod += e.v; break;
        case 'buffDefAll': { const P = source ? state.players[source.owner] : activePlayer(); boardUnits(P).forEach(f => { f.defMod += e.v; }); break; }
        // Sleep: standard 1 turn, hard cap 2 turns.
        case 'sleepTarget': if (target) {
          const st = Math.min(Math.max(e.v || 1, 1), 2);
          target.slept = true;
          target.sleepTurns = Math.max(target.sleepTurns || 0, st);   // a stronger sleep overrides a weaker one
          log(target.name + ' falls asleep for ' + target.sleepTurns + ' turn' + (target.sleepTurns > 1 ? 's' : '') + '.');
        } break;
        // Other debuffs (e.g. Silence): standard 2 turns, hard cap 3 turns.
        case 'silenceTarget': if (target) {
          const st = Math.min(Math.max(e.v || 2, 1), 3);
          target.silenced = true;
          target.silenceTurns = Math.max(target.silenceTurns || 0, st);
          log(target.name + ' is silenced for ' + target.silenceTurns + ' turn' + (target.silenceTurns > 1 ? 's' : '') + '.');
        } break;
        case 'returnFromGrave': {
          const P = source ? state.players[source.owner] : activePlayer();
          for (let i = P.grave.length - 1; i >= 0; i--) {
            if (P.grave[i].kind === 'operator') { P.hand.push(P.grave.splice(i, 1)[0]); break; }
          }
          break;
        }
        case 'graveToHand': {
          const P = source ? state.players[source.owner] : activePlayer();
          const n = e.v || 1;
          for (let i = 0; i < n; i++) {
            const pool = P.grave.filter(c => !e.kind || e.kind === 'any' || c.kind === e.kind);
            if (!pool.length) break;
            const pick = pool[Math.floor(rng() * pool.length)];
            P.grave.splice(P.grave.indexOf(pick), 1);
            P.hand.push(pick);
            log((P.idx === 0 ? 'You return ' : 'Enemy returns ') + pick.name + ' from the discard pile.');
          }
          break;
        }
        case 'shuffleOppHand': {
          const O = source ? opponentOf(state.players[source.owner]) : opponentOf(activePlayer());
          const had = O.hand.length;
          while (O.hand.length) O.deck.push(O.hand.pop());
          shuffle(O.deck);
          const n = (e.v != null) ? Math.min(e.v, had) : had;
          for (let i = 0; i < n; i++) drawCard(O);
          log('The enemy hand is shuffled back into their deck and redrawn' + (e.v != null ? ' (' + n + ' cards).' : '.'));
          break;
        }
        case 'shuffleOwnHand': {
          const P = source ? state.players[source.owner] : activePlayer();
          const had = P.hand.length;
          while (P.hand.length) P.deck.push(P.hand.pop());
          shuffle(P.deck);
          const n = had + (e.v || 0);
          for (let i = 0; i < n; i++) drawCard(P);
          log((P.idx === 0 ? 'You shuffle your hand back and redraw ' : 'Enemy shuffles their hand and redraws ') + n + '.');
          break;
        }
        case 'selfDestructEnd': if (source) source.selfDestruct = true; break;
        case 'tempLongRange': if (source) source.tempLong = true; break;
        default: break;
      }
      if (state.over) return;
    });
  }

  // --------------------------------------------------------------- combat
  function canAttackUnit(u) {
    return u && u.kind === 'operator' && !u.exhausted && !u.slept && state.active === u.owner;
  }

  function attack(attacker, targetUid) {
    const P = state.players[attacker.owner];
    const O = opponentOf(P);
    if (!canAttackUnit(attacker)) return fail('This operator cannot attack.');

    if (targetUid === 'player') {
      // The FRONT line must be cleared first: an operator may only strike the
      // opposing Doctor once the opponent's front row is empty. The back row
      // never blocks, so ranged operators there do not protect the Doctor.
      if (boardHasBlocker(O)) return fail('The enemy front line is blocking — clear all enemy front operators first.');
      const dmg = unitAtk(attacker, state);
      attacker.exhausted = true;
      log(attacker.name + ' strikes the ' + (O.idx === 0 ? 'player' : 'enemy') + ' for ' + dmg + '.');
      damagePlayer(O, dmg);
      emit('attack', { attackerUid: attacker.uid, attackerOwner: attacker.owner, targetKind: 'player', damage: dmg, killed: [] });
      return { ok: true };
    }

    const defender = findUnitOnBoard(targetUid);
    if (!defender || defender.owner === attacker.owner) return fail('Invalid target.');

    // The back row is shielded by the front line: you may only strike a
    // back-row operator once the enemy front line has been cleared.
    if (defender.kind === 'operator' && defender.row === 'back' && boardHasBlocker(O)) {
      return fail('The enemy front line shields the back row — clear the front operators first.');
    }

    // Taunt: must attack a taunt operator first if one exists (in the reachable line)
    const line = (defender.kind === 'operator' && defender.row === 'back') ? O.back : O.front;
    const taunts = line.filter(u => u && hasPassive(u, 'taunt'));
    if (taunts.length && !hasPassive(defender, 'taunt')) return fail('You must attack the Taunting operator first.');

    attacker.exhausted = true;
    const a = unitAtk(attacker, state);
    const d = unitDef(defender, state);
    // HP combat: damage = ATK minus armour (DEF/3), never below 1. Damage is
    // dealt to the defender's HP and persists between turns; a unit dies at 0 HP.
    const dmg = Math.max(1, a - Math.floor(d / 3));
    defender.hp -= dmg;
    if (defender.hp < 0) defender.hp = 0;
    log(attacker.name + ' (' + a + ' ATK vs ' + d + ' DEF) hits ' + defender.name +
      ' for ' + dmg + ' (HP ' + defender.hp + '/' + defender.maxHp + ').');
    const killed = [];
    if (defender.hp <= 0) { destroyUnit(defender, 'battle'); killed.push(defender.uid); }
    emit('attack', { attackerUid: attacker.uid, targetUid: defender.uid, targetKind: 'unit', damage: dmg, killed, defenderUid: defender.uid, defenderHp: defender.hp });
    return { ok: true };
  }

  function destroyUnit(u, reason) {
    const P = state.players[u.owner];
    if (u.kind === 'operator') {
      const line = u.row === 'back' ? P.back : P.front;
      const idx = line.indexOf(u);
      if (idx >= 0) { line[idx] = null; P.grave.push({ kind: 'operator', ...Cards.operatorCard(u.cardId) }); }
      log(u.name + ' is destroyed' + (reason ? ' (' + reason + ')' : '') + '.');
      if (reason !== 'battle') emit('destroy', { uid: u.uid, name: u.name, owner: u.owner });
    } else {
      const idx = P.arts.indexOf(u);
      if (idx >= 0) { P.arts.splice(idx, 1); P.grave.push(u); }
    }
  }

  function damagePlayer(P, amount) {
    if (amount < 0) amount = 0;
    P.hp -= amount;
    log((P.idx === 0 ? 'You take ' : 'Enemy takes ') + amount + ' damage (HP ' + Math.max(0, P.hp) + ').');
    if (P.hp <= 0) { P.hp = 0; state.over = true; state.winner = 1 - P.idx; log((state.winner === 0 ? 'You win!' : 'You lose.')); emit('gameover'); }
  }

  function fail(msg) { return { ok: false, error: msg }; }

  global.Engine = {
    SLOTS, START_HP, DP_PER_TURN, HAND_LIMIT, KILL_LIMIT,
    newGame,
    get state() { return state; },
    get active() { return activePlayer(); },
    activePlayer, opponentOf,
    drawCard, unitAtk: (u) => unitAtk(u, state), unitDef: (u) => unitDef(u, state), unitRange,
    boardHasBlocker,
    isKillSkill, isKillEffects, killLimitReached,
    canDeploy, deployOperator, playArt, activateSkill, activateLocation, attack, endTurn,
    destroyUnit, damagePlayer, resolveEffects,
    onChange: (fn) => { listeners.push(fn); },
    _internal: { makeUnit, makeFieldArt, hasPassive, passiveValue }
  };
})(window);
