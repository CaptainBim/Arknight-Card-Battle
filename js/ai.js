/* =========================================================================
   Arknight Card Battle — Heuristic AI (player index 1)
   Performs ONE action per call so the UI can pace it with a timer.
   ========================================================================= */
(function (global) {
  'use strict';

  const E = global.Engine;

  function enemiesOf(P) { return E.state.players[1 - P.idx]; }

  function enemyTargets(P) {
    const O = enemiesOf(P);
    // The enemy FRONT line shields their back row: while it stands, only front
    // operators are reachable. Once it is empty, back-row operators are fair game.
    const front = O.front.filter(u => u && !u.slept);
    let targets = front.length ? front : O.back.filter(u => u && !u.slept);
    const taunts = targets.filter(u => E._internal.hasPassive(u, 'taunt'));
    if (taunts.length) targets = taunts;
    return targets;
  }

  function bestDestroyTarget(P, maxDef) {
    const targets = enemyTargets(P).filter(u => maxDef == null || E.unitDef(u) <= maxDef);
    if (!targets.length) return null;
    // value a target by its ATK (threat) then DEF
    return targets.sort((a, b) => (E.unitAtk(b) * 10 + E.unitDef(b)) - (E.unitAtk(a) * 10 + E.unitDef(a)))[0];
  }

  function canHitPlayer(P, u) {
    // A unit may only strike the opposing Doctor when the enemy front line is
    // completely empty (same rule the human plays under).
    return !E.boardHasBlocker(enemiesOf(P));
  }

  function score(card) {
    // value a hand operator: prefer attackers and taunt walls
    let s = card.atk * 2 + card.def + (card.hp || 0) * 0.3;
    if (card.skill) {
      if ((card.skill.effects || []).some(e => e.k === 'taunt')) s += 4;
      if ((card.skill.effects || []).some(e => e.k === 'dmgPlayer')) s += 3;
      if ((card.skill.effects || []).some(e => e.k === 'gainDP')) s += 2;
    }
    s -= card.cost * 0.5;
    return s;
  }

  function step() {
    const st = E.state;
    if (!st || st.over) return { done: true, note: 'game over' };
    const P = st.players[1];
    const O = st.players[0];

    // -------- 1) Deploy the best affordable operator --------
    const RANGED = ['Sniper', 'Caster', 'Medic', 'Supporter'];
    if (P.front.indexOf(null) !== -1 || P.back.indexOf(null) !== -1) {
      const opts = P.hand
        .map((c, i) => ({ c, i }))
        .filter(x => x.c.kind === 'operator' && x.c.cost <= P.dp)
        .sort((a, b) => score(b.c) - score(a.c));
      for (const { c, i } of opts) {
        const isRanged = RANGED.indexOf(c.cls) >= 0;
        const fFree = P.front.indexOf(null);
        const bFree = P.back.indexOf(null);
        let row = 'front', slot = fFree;
        if (slot === -1) {                                   // front full
          if (isRanged && bFree !== -1) { row = 'back'; slot = bFree; } else continue;
        } else if (isRanged && P.front.filter(Boolean).length > 0 && bFree !== -1) {
          // Ranged support goes behind an existing front line.
          row = 'back'; slot = bFree;
        }
        const r = E.deployOperator(P, i, row, slot);
        if (r && r.ok === false) continue;   // card rejected -> try the next one
        if (r && r.needsTarget) {
          const t = bestDestroyTarget(P, (r.effects.find(e => e.k === 'destroyOperator') || {}).maxDef);
          if (t) E.resolveEffects(r.effects, r.needsTarget, t);
        }
        return { done: false, note: 'deploy ' + c.name };
      }
    }

    // -------- 2) Arts --------
    const playInstant = (idx, note) => {
      const r = E.playArt(P, idx, null);
      if (r && r.needsTarget) {
        const eff = r.effects || [];
        const maxDef = (eff.find(e => e.k === 'destroyOperator') || {}).maxDef;
        let t = bestDestroyTarget(P, maxDef);
        if (!t) t = enemyTargets(P).sort((a, b) => E.unitAtk(b) - E.unitAtk(a))[0] || null;
        if (t) E.resolveEffects(eff, null, t);
      }
      return (!r || r.ok !== false) ? { done: false, note: note } : null;
    };

    // removal instant with a valid target
    const remIdx = P.hand.findIndex(c => c.kind === 'art' && c.artType === 'Instant' && c.cost <= P.dp &&
      (c.effects || []).some(e => e.k === 'destroyOperator'));
    if (remIdx >= 0) {
      const maxDef = (P.hand[remIdx].effects.find(e => e.k === 'destroyOperator') || {}).maxDef;
      if (bestDestroyTarget(P, maxDef)) {
        const res = playInstant(remIdx, 'remove arts');
        if (res) return res;
      }
    }
    // direct-damage instant (Arts are not blocked by the front row)
    const dmgIdx = P.hand.findIndex(c => c.kind === 'art' && c.artType === 'Instant' && c.cost <= P.dp &&
      (c.effects || []).some(e => e.k === 'dmgPlayer'));
    if (dmgIdx >= 0) {
      const res = playInstant(dmgIdx, 'instant arts');
      if (res) return res;
    }
    // spare DP -> field arts (support zone, no tile needed)
    if (P.dp >= 6) {
      const artIdx = P.hand.findIndex(c => c.kind === 'art' && c.artType === 'Field' && c.cost <= P.dp);
      if (artIdx >= 0) {
        const r = E.playArt(P, artIdx, null);
        if (!r || r.ok !== false) return { done: false, note: 'field arts' };
      }
    }

    // -------- 3) Use an ability --------
    for (const u of P.front.concat(P.back)) {
      if (!u || u.slept || u.skillUsed || u.exhausted) continue;
      const s = u.skill;
      if (!s || (s.type !== 'Active' && s.type !== 'Manual')) continue;
      if (s.type === 'Active' && P.dp < (s.cost || 0)) continue;
      // the turn it is deployed, only a DP-granting ability may be used
      if (u.turnPlayed === st.turn && !(s.effects || []).some(e => e.k === 'gainDP')) continue;
      let target = null;
      if (s.needsTarget) {
        const needsDestroy = (s.effects || []).some(e => e.k === 'destroyOperator');
        const maxDef = (s.effects.find(e => e.k === 'destroyOperator') || {}).maxDef;
        const needsSleep = (s.effects || []).some(e => e.k === 'sleepTarget');
        const needsBounce = (s.effects || []).some(e => e.k === 'bounceTarget');
        if (needsDestroy) target = bestDestroyTarget(P, maxDef);
        else if (needsSleep || needsBounce) {
          const t = enemyTargets(P);
          target = t.sort((a, b) => E.unitAtk(b) - E.unitAtk(a))[0] || null;
        }
        if (!target) continue;
      }
      const r = E.activateSkill(P, u, target);
      if (r && r.ok) return { done: false, note: 'ability ' + u.name };
    }

    // -------- 4) Attack --------
    for (const u of P.front.concat(P.back)) {
      if (!u || u.exhausted || u.slept) continue;
      const targets = enemyTargets(P);
      const dmgTo = (t) => Math.max(1, E.unitAtk(u) - Math.floor(E.unitDef(t) / 3));
      // 1) secure a kill this hit
      const kill = targets
        .filter(t => dmgTo(t) >= t.hp)
        .sort((a, b) => (E.unitAtk(b) * 10 + E.unitDef(b)) - (E.unitAtk(a) * 10 + E.unitDef(a)))[0];
      if (kill) {
        const r = E.attack(u, kill.uid);
        if (r && r.ok) return { done: false, note: 'kill ' + kill.name };
      }

      // 2) strike the Doctor if the front line is clear
      if (canHitPlayer(P, u)) {
        const dmg = E.unitAtk(u);
        const r = E.attack(u, 'player');
        if (r && r.ok) return { done: false, note: 'face ' + dmg };
      }
      // 3) otherwise chip the biggest threat
      const chip = targets
        .sort((a, b) => (E.unitAtk(b) * 10 + E.unitDef(b)) - (E.unitAtk(a) * 10 + E.unitDef(a)))[0];
      if (chip) {
        const r = E.attack(u, chip.uid);
        if (r && r.ok) return { done: false, note: 'chip ' + chip.name };
      }
    }

    return { done: true, note: 'end turn' };
  }

  global.AI = { step };
})(window);
