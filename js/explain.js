/* =========================================================================
   Arknight Card Battle — Shared "Penjelasan lengkap" (full explanation)
   Turns a card's raw effects into a human explanation with exact numbers and
   durations (how much ATK/DEF, how many turns a buff/debuff lasts, ...).
   Used by the menu (Deck Builder + Card Database) AND the battle UI so every
   card shows the exact same complete breakdown.
   ========================================================================= */
(function (global) {
  'use strict';

  const C = global.Cards;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  // Instant-kill effects are capped per player per match (see engine KILL_LIMIT).
  // The cap counts OPERATORS destroyed, so an area effect that kills several
  // operators uses up several of the allowance at once.
  const killCapNote = () => ' (dibatasi: maks. ' + ((global.Engine && global.Engine.KILL_LIMIT) || 3) + ' operator bisa dihancurkan lewat instant-kill per pemain per match — efek area menghabiskan jatah sebanyak jumlah operator yang hancur).';

  function durSuffix(type, duration) {
    if (type === 'Passive') return ' (pasif — selalu aktif selama kartu ini ada di lapangan)';
    if (type === 'Auto') return ' (otomatis di akhir tiap turn-mu)';
    if (type === 'Field') return ' (selama Field Art ini aktif: ' + duration + ' turn)';
    return ' (sampai akhir turn)';
  }

  function effectText(e, type, duration) {
    switch (e.k) {
      case 'dmgPlayer': return 'Beri ' + e.v + ' damage langsung ke Doctor musuh.';
      case 'healPlayer': return 'Pulihkan ' + e.v + ' HP ke dirimu sendiri (maksimal 30 HP; kalau HP-mu penuh kartu ini tidak bisa dipakai).';
      case 'gainDP': return 'Dapat ' + e.v + ' DP.';
      case 'draw': return 'Tarik ' + e.v + ' kartu dari deck.';
      case 'destroyOperator': return 'Hancurkan 1 operator musuh' + (e.maxDef != null ? ' dengan DEF ≤ ' + e.maxDef : ' apa pun') + '.' + killCapNote();
      case 'destroyFront': return 'Hancurkan SEMUA operator musuh di baris depan yang DEF-nya ≤ ' + e.maxDef + ' (tiap operator yang hancur memakai 1 jatah instant-kill).' + killCapNote();
      case 'bounceTarget': return 'Kembalikan 1 operator musuh ke tangan pemiliknya (keluar dari lapangan).';
      case 'buffAtkSelf': return 'Operator ini mendapat +' + e.v + ' ATK' + durSuffix(type, duration) + '.';
      case 'buffDefSelf': return 'Operator ini mendapat +' + e.v + ' DEF' + durSuffix(type, duration) + '.';
      case 'buffDefAll': return 'SEMUA operator milikmu mendapat +' + e.v + ' DEF' + durSuffix(type, duration) + '.';
      case 'buffAtkAll': return 'SEMUA operator milikmu mendapat +' + e.v + ' ATK' + durSuffix(type, duration) + '.';
      case 'sleepTarget': return 'Tidurkan 1 operator musuh selama ' + (e.v || 1) + ' turn (maksimal 2 turn). Operator yang tidur tidak bisa menyerang, tidak bisa jadi penyerang/penahan, skill-nya mati, dan countdown-nya berhenti.';
      case 'silenceTarget': return 'Bungkam (silence) 1 operator musuh selama ' + (e.v || 2) + ' turn (maksimal 3 turn) — skill operator itu jadi nonaktif.';
      case 'returnFromGrave': return 'Ambil 1 operator dari buangan (discard) kembali ke tanganmu.';
      case 'graveToHand': return 'Ambil ' + (e.v || 1) + ' kartu' + (e.kind && e.kind !== 'any' ? ' tipe ' + e.kind : '') + ' acak dari buangan ke tanganmu.';
      case 'shuffleOppHand': return 'Kocok seluruh tangan musuh kembali ke deck' + (e.v != null ? ', lalu musuh menarik ' + e.v + ' kartu' : ', lalu musuh menarik ulang kartu sebanyak yang tadi') + '.';
      case 'shuffleOwnHand': return 'Kocok seluruh tanganmu kembali ke deck, lalu tarik ulang kartu sebanyak tanganmu tadi' + (e.v ? ' + ' + e.v : '') + '.';
      case 'selfDestructEnd': return 'Operator ini hancur sendiri di akhir turn-mu.';
      case 'tempLongRange': return 'Operator ini mendapat range jauh (Long) sampai akhir turn.';
      case 'taunt': return 'Taunt — musuh WAJIB menghancurkan operator ini lebih dulu sebelum bisa menyerang target lain.';
      case 'untargetable': return 'Operator ini tidak bisa dijadikan target Arts maupun skill musuh (serangan biasa dan efek area tetap bisa mengenainya).';
      case 'dpStart': return 'Di awal tiap turn-mu, dapat ' + e.v + ' DP tambahan.';
      default: return null;
    }
  }

  function effLines(effects, type, duration) {
    return (effects || []).map(e => effectText(e, type, duration)).filter(Boolean);
  }
  function effListHtml(effects, type, duration) {
    const lines = effLines(effects, type, duration);
    return lines.length
      ? '<ul class="cd-list">' + lines.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul>'
      : '<p class="cd-none">Efek khusus tanpa angka — baca teks kartu di atas.</p>';
  }

  // ---- inline block used by the Card Database (always visible) ----
  function blockFromEffs(effects, type, duration) {
    return '<div class="cd-detail-h">ⓘ Penjelasan lengkap</div>' + effListHtml(effects, type, duration);
  }
  function opExtra(op) {
    const sk = op.skill || {};
    return blockFromEffs(sk.effects, sk.type || 'Passive', null);
  }
  function artExtra(a) {
    return blockFromEffs(a.effects, a.artType === 'Field' ? 'Field' : 'Instant', a.duration);
  }
  function locExtra(l) {
    let html = '';
    const pe = (l.effects || []).filter(e => effectText(e, 'Passive', null));
    if (pe.length) html += '<div class="cd-detail-h">ⓘ Penjelasan lengkap (Passive)</div>' + effListHtml(pe, 'Passive', null);
    if (l.active) html += '<div class="cd-detail-h">ⓘ Penjelasan lengkap (Active)</div>' + effListHtml(l.active.effects, 'Active', null);
    return html;
  }

  // ---- tooltip fragment: the complete breakdown appended to a short tip ----
  function tipExtra(effects, type, duration) {
    const lines = effLines(effects, type, duration);
    if (!lines.length) return '';
    return '<div class="tt-full-h">ⓘ Penjelasan lengkap</div><ul class="tt-full">' + lines.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul>';
  }
  function opTipExtra(op) { const sk = (op && op.skill) || {}; return tipExtra(sk.effects, sk.type || 'Passive', null); }
  function artTipExtra(a) { return tipExtra(a && a.effects, (a && a.artType === 'Field') ? 'Field' : 'Instant', a && a.duration); }

  global.Explain = { durSuffix, effectText, effLines, effListHtml, opExtra, artExtra, locExtra, tipExtra, opTipExtra, artTipExtra };
})(window);
