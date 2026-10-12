/* =========================================================================
   Arknight Card Battle — Card Database
   Operator stats are derived from the official in-game values (see tools/).
   Scaling: ATK = round(gameAtk/110) 1-10, DEF = round(gameDef/90) 0-10,
            Cost = round(deployCost/3) 1-10.
   Skills are themed on each Operator's real kit and mapped onto the
   That Arknights Card Game (TACG) ability types: Instant / Manual / Active /
   Auto / Passive. See the rulebook in D:\THEGAME.
   ========================================================================= */
(function (global) {
  'use strict';

  const CLASS_COLOR = {
    Vanguard:   '#e0b34d',
    Guard:      '#d95757',
    Defender:   '#4d8fd9',
    Sniper:     '#7ac36a',
    Caster:     '#b06fd6',
    Medic:      '#5fd0c0',
    Supporter:  '#d67fb0',
    Specialist: '#9a9a9a'
  };

  const CLASS_ICON = {
    Vanguard:   'assets/ui/class_vanguard.png',
    Guard:      'assets/ui/class_guard.png',
    Defender:   'assets/ui/class_defender.png',
    Sniper:     'assets/ui/class_sniper.png',
    Caster:     'assets/ui/class_caster.png',
    Medic:      'assets/ui/class_medic.png',
    Supporter:  'assets/ui/class_supporter.png',
    Specialist: 'assets/ui/class_specialist.png'
  };

  // Durability ("darah"): class-based HP, kept within 15-30.
  // Higher rarity operators are a little tougher.
  const CLASS_HP = {
    Vanguard: 18, Guard: 22, Defender: 28, Sniper: 16,
    Caster: 15, Medic: 16, Supporter: 16, Specialist: 18
  };
  const operatorHp = (o) => Math.max(15, Math.min(30, (CLASS_HP[o.cls] || 18) + Math.max(0, (o.rar || 4) - 4)));

  // range: short = cannot hit the enemy player while any blocker stands
  //        medium = may hit the player through blockers at half ATK (rounded up)
  //        long   = may always hit the player at full ATK
  const OPERATORS = [
    // ---------------- Vanguards ----------------
    { slug:'siege', name:'Siege', cls:'Vanguard', rar:6, atk:5, def:4, cost:4, range:'short', nation:'victoria',
      skill:{ name:'Skull Crusher', type:'Active', cost:1, text:'Deal 2 damage to the enemy player, then gain 2 DP.',
              effects:[{k:'dmgPlayer',v:2},{k:'gainDP',v:2}] } },
    { slug:'bagpipe', name:'Bagpipe', cls:'Vanguard', rar:6, atk:5, def:4, cost:4, range:'short', nation:'victoria',
      skill:{ name:'Charge β', type:'Instant', text:'When deployed, gain 4 DP.', effects:[{k:'gainDP',v:4}] } },
    { slug:'myrtle', name:'Myrtle', cls:'Vanguard', rar:4, atk:5, def:3, cost:3, range:'short', nation:'rhodes',
      skill:{ name:'Support β', type:'Instant', text:'When deployed, gain 5 DP.', effects:[{k:'gainDP',v:5}] } },
    { slug:'texas', name:'Texas', cls:'Vanguard', rar:5, atk:5, def:4, cost:4, range:'short', nation:'lungmen',
      skill:{ name:'Sword Rain α', type:'Manual', text:'Once: deal 2 damage to the enemy player and Sleep one enemy operator.',
              effects:[{k:'dmgPlayer',v:2},{k:'sleepTarget'}], needsTarget:true } },

    // ---------------- Guards ----------------
    { slug:'silverash', name:'SilverAsh', cls:'Guard', rar:6, atk:6, def:4, cost:6, range:'short', nation:'kjerag',
      skill:{ name:'Truesilver Slash', type:'Active', cost:3, text:'Deal 5 damage to the enemy player.', effects:[{k:'dmgPlayer',v:5}] } },
    { slug:'blaze', name:'Blaze', cls:'Guard', rar:6, atk:7, def:4, cost:7, range:'short', nation:'rhodes',
      skill:{ name:'Chainsaw Extension', type:'Passive', text:'This operator has +2 ATK.', effects:[{k:'buffAtkSelf',v:2}] } },
    { slug:'chen', name:"Ch'en", cls:'Guard', rar:6, atk:6, def:4, cost:6, range:'short', nation:'lungmen',
      skill:{ name:'Chi Xiao', type:'Active', cost:2, text:'Destroy one enemy operator with DEF 4 or less.',
              effects:[{k:'destroyOperator',maxDef:4}], needsTarget:true } },
    { slug:'surtr', name:'Surtr', cls:'Guard', rar:6, atk:6, def:5, cost:6, range:'short', nation:'rhodes',
      skill:{ name:'Twilight', type:'Active', cost:4, text:'Deal 6 damage to the enemy player. Destroy this operator at the end of the turn.',
              effects:[{k:'dmgPlayer',v:6},{k:'selfDestructEnd'}] } },

    // ---------------- Defenders ----------------
    { slug:'hoshiguma', name:'Hoshiguma', cls:'Defender', rar:6, atk:4, def:8, cost:6, range:'short', nation:'lungmen',
      skill:{ name:'Thorns', type:'Passive', text:'Taunt — this operator must be attacked before non-Taunt targets.',
              effects:[{k:'taunt'}] } },
    { slug:'saria', name:'Saria', cls:'Defender', rar:6, atk:4, def:7, cost:6, range:'short', nation:'columbia',
      skill:{ name:'Calcification', type:'Active', cost:2, text:'Heal 4 HP to yourself.', effects:[{k:'healPlayer',v:4}] } },
    { slug:'nian', name:'Nian', cls:'Defender', rar:6, atk:6, def:8, cost:6, range:'short', nation:'yan',
      skill:{ name:'Wild Eruption', type:'Passive', text:'Taunt — this operator must be attacked before non-Taunt targets.',
              effects:[{k:'taunt'}] } },
    { slug:'mudrock', name:'Mudrock', cls:'Defender', rar:6, atk:8, def:7, cost:10, range:'short', nation:'rhodes',
      skill:{ name:'Bloodline of Desecrated Earth', type:'Active', cost:2, text:'This operator gets +3 ATK this turn.',
              effects:[{k:'buffAtkSelf',v:3}] } },

    // ---------------- Snipers ----------------
    { slug:'exusiai', name:'Exusiai', cls:'Sniper', rar:6, atk:5, def:2, cost:4, range:'long', nation:'lungmen',
      skill:{ name:"I'll Believe", type:'Active', cost:2, text:'Deal 2 damage to the enemy player, twice.',
              effects:[{k:'dmgPlayer',v:2},{k:'dmgPlayer',v:2}] } },
    { slug:'schwarz', name:'Schwarz', cls:'Sniper', rar:6, atk:8, def:3, cost:5, range:'long', nation:'columbia',
      skill:{ name:'Roar', type:'Active', cost:2, text:'Destroy one enemy operator.',
              effects:[{k:'destroyOperator'}], needsTarget:true } },
    { slug:'rosmontis', name:'Rosmontis', cls:'Sniper', rar:6, atk:6, def:3, cost:8, range:'long', nation:'rhodes',
      skill:{ name:'Heart of the Night', type:'Auto', text:'At the end of your turn, deal 3 damage to the enemy player.',
              effects:[{k:'dmgPlayer',v:3}] } },
    { slug:'w', name:'W', cls:'Sniper', rar:6, atk:8, def:1, cost:8, range:'long', nation:null,
      skill:{ name:'Wraith', type:'Instant', text:'When deployed, deal 3 damage to the enemy player.', effects:[{k:'dmgPlayer',v:3}] } },

    // ---------------- Casters ----------------
    { slug:'eyjafjalla', name:'Eyjafjalla', cls:'Caster', rar:6, atk:6, def:1, cost:6, range:'medium', nation:'leithanien',
      skill:{ name:'Pyroclasm', type:'Active', cost:3, text:'Deal 4 damage to the enemy player.', effects:[{k:'dmgPlayer',v:4}] } },
    { slug:'ceobe', name:'Ceobe', cls:'Caster', rar:6, atk:6, def:1, cost:6, range:'medium', nation:'rhodes',
      skill:{ name:'Arson', type:'Active', cost:2, text:'Deal 3 damage to the enemy player.', effects:[{k:'dmgPlayer',v:3}] } },
    { slug:'amiya', name:'Amiya', cls:'Caster', rar:5, atk:6, def:1, cost:6, range:'medium', nation:'rhodes',
      skill:{ name:'Chimera', type:'Active', cost:3, text:'This operator gets +3 ATK and Long range this turn.',
              effects:[{k:'buffAtkSelf',v:3},{k:'tempLongRange'}] } },
    { slug:'ifrit', name:'Ifrit', cls:'Caster', rar:6, atk:8, def:1, cost:10, range:'medium', nation:'columbia',
      skill:{ name:'Scorched Earth', type:'Instant', text:'Destroy all enemy operators with DEF 3 or less.',
              effects:[{k:'destroyFront',maxDef:3}] } },

    // ---------------- Medics ----------------
    { slug:'nightingale', name:'Nightingale', cls:'Medic', rar:6, atk:3, def:2, cost:5, range:'medium', nation:null,
      skill:{ name:'Cage', type:'Active', cost:2, text:'Heal 3 HP to yourself.', effects:[{k:'healPlayer',v:3}] } },
    { slug:'shining', name:'Shining', cls:'Medic', rar:6, atk:5, def:2, cost:6, range:'medium', nation:null,
      skill:{ name:'White Cube', type:'Passive', text:'All friendly operators get +1 DEF.', effects:[{k:'buffDefAll',v:1}] } },
    { slug:'warfarin', name:'Warfarin', cls:'Medic', rar:5, atk:5, def:1, cost:6, range:'medium', nation:'rhodes',
      skill:{ name:'Astreus', type:'Manual', text:'Once: return a friendly operator from the graveyard to your hand.',
              effects:[{k:'returnFromGrave'}] } },
    { slug:'ptilopsis', name:'Ptilopsis', cls:'Medic', rar:5, atk:3, def:2, cost:5, range:'medium', nation:'columbia',
      skill:{ name:'Skill Aura', type:'Passive', text:'At the start of your turn, gain 2 DP.', effects:[{k:'dpStart',v:2}] } },

    // ---------------- Supporters ----------------
    { slug:'angelina', name:'Angelina', cls:'Supporter', rar:6, atk:5, def:1, cost:5, range:'medium', nation:'siracusa',
      skill:{ name:'Arcane Staff', type:'Active', cost:2, text:'Deal 2 damage to the enemy player and Sleep one enemy operator.',
              effects:[{k:'dmgPlayer',v:2},{k:'sleepTarget'}], needsTarget:true } },
    { slug:'suzuran', name:'Suzuran', cls:'Supporter', rar:6, atk:5, def:1, cost:5, range:'medium', nation:'siracusa',
      skill:{ name:'Foxfire', type:'Active', cost:2, text:'Sleep one enemy operator.',
              effects:[{k:'sleepTarget'}], needsTarget:true } },
    { slug:'magallan', name:'Magallan', cls:'Supporter', rar:6, atk:4, def:2, cost:3, range:'medium', nation:'columbia',
      skill:{ name:'Drone Support', type:'Active', cost:1, text:'Deal 1 damage to the enemy player, twice.',
              effects:[{k:'dmgPlayer',v:1},{k:'dmgPlayer',v:1}] } },
    { slug:'gnosis', name:'Gnosis', cls:'Supporter', rar:6, atk:4, def:1, cost:4, range:'medium', nation:'kjerag',
      skill:{ name:'Frost Nova', type:'Active', cost:2, text:'Sleep one enemy operator and deal 2 damage to the enemy player.',
              effects:[{k:'sleepTarget'},{k:'dmgPlayer',v:2}], needsTarget:true } },

    // ---------------- Specialists ----------------
    { slug:'manticore', name:'Manticore', cls:'Specialist', rar:5, atk:7, def:4, cost:6, range:'short', nation:'sargon',
      skill:{ name:'Camouflage', type:'Passive', text:'This operator has +2 DEF and cannot be targeted by enemy Arts.',
              effects:[{k:'buffDefSelf',v:2},{k:'untargetable'}] } },
    { slug:'weedy', name:'Weedy', cls:'Specialist', rar:6, atk:6, def:4, cost:6, range:'short', nation:'rhodes',
      skill:{ name:'Water Cannon', type:'Manual', text:"Once: Bounce one enemy operator back to the opponent's hand.",
              effects:[{k:'bounceTarget'}], needsTarget:true } },
    { slug:'projektred', name:'Projekt Red', cls:'Specialist', rar:5, atk:5, def:3, cost:2, range:'short', nation:'rhodes',
      skill:{ name:'Wolfpack', type:'Instant', text:'When deployed, destroy one enemy operator with DEF 3 or less.',
              effects:[{k:'destroyOperator',maxDef:3}], needsTarget:true } },
    { slug:'ethan', name:'Ethan', cls:'Specialist', rar:4, atk:7, def:4, cost:6, range:'short', nation:'rhodes',
      skill:{ name:'Entrap', type:'Passive', text:'This operator has +2 ATK.', effects:[{k:'buffAtkSelf',v:2}] } },

    // =====================================================================
    // Extended roster (added batch 2)
    // =====================================================================
    // ---------------- Vanguards ----------------
    { slug:'grani', name:'Grani', cls:'Vanguard', rar:5, atk:5, def:4, cost:5, range:'short', nation:'kazimierz',
      skill:{ name:'Ready to Go!', type:'Instant', text:'When deployed, gain 4 DP.', effects:[{k:'gainDP',v:4}] } },
    { slug:'elysium', name:'Elysium', cls:'Vanguard', rar:5, atk:5, def:4, cost:4, range:'short', nation:'rhodes',
      skill:{ name:'Coordinated Suppression', type:'Active', cost:1, text:'Deal 1 damage to the enemy player, then draw 1 card.',
              effects:[{k:'dmgPlayer',v:1},{k:'draw',v:1}] } },
    { slug:'reed', name:'Reed', cls:'Vanguard', rar:5, atk:5, def:4, cost:4, range:'short', nation:'victoria',
      skill:{ name:'Blazing Feathers', type:'Passive', text:'This operator has +2 ATK.', effects:[{k:'buffAtkSelf',v:2}] } },
    { slug:'cantabile', name:'Cantabile', cls:'Vanguard', rar:5, atk:5, def:3, cost:3, range:'short', nation:'laterano',
      skill:{ name:'Encore Performance', type:'Instant', text:'When deployed, gain 5 DP.', effects:[{k:'gainDP',v:5}] } },

    // ---------------- Guards ----------------
    { slug:'skadi', name:'Skadi', cls:'Guard', rar:6, atk:9, def:3, cost:6, range:'short', nation:'egir',
      skill:{ name:'Tidal Elegy', type:'Active', cost:3, text:'Deal 5 damage to the enemy player.', effects:[{k:'dmgPlayer',v:5}] } },
    { slug:'mountain', name:'Mountain', cls:'Guard', rar:6, atk:5, def:4, cost:4, range:'short', nation:'columbia',
      skill:{ name:'Soaring Fists', type:'Passive', text:'This operator has +1 ATK and +1 DEF.', effects:[{k:'buffAtkSelf',v:1},{k:'buffDefSelf',v:1}] } },
    { slug:'thorns', name:'Thorns', cls:'Guard', rar:6, atk:6, def:4, cost:7, range:'short', nation:'iberia',
      skill:{ name:'Destreza', type:'Passive', text:'This operator has +2 ATK.', effects:[{k:'buffAtkSelf',v:2}] } },
    { slug:'lappland', name:'Lappland', cls:'Guard', rar:5, atk:6, def:4, cost:6, range:'short', nation:'siracusa',
      skill:{ name:'Wolf Spirit', type:'Active', cost:2, text:'Silence one enemy operator (its ability stops working).',
              effects:[{k:'silenceTarget'}], needsTarget:true } },

    // ---------------- Defenders ----------------
    { slug:'blemishine', name:'Blemishine', cls:'Defender', rar:6, atk:4, def:6, cost:7, range:'short', nation:'kazimierz',
      skill:{ name:'Deterrent', type:'Active', cost:2, text:'Heal 3 HP to yourself.', effects:[{k:'healPlayer',v:3}] } },
    { slug:'eunectes', name:'Eunectes', cls:'Defender', rar:6, atk:9, def:7, cost:10, range:'short', nation:'sargon',
      skill:{ name:'Death Roll', type:'Active', cost:3, text:'Deal 5 damage to the enemy player.', effects:[{k:'dmgPlayer',v:5}] } },
    { slug:'nearl', name:'Nearl', cls:'Defender', rar:5, atk:4, def:6, cost:7, range:'short', nation:'kazimierz',
      skill:{ name:'Guardian', type:'Passive', text:'Taunt — this operator must be attacked before non-Taunt targets.',
              effects:[{k:'taunt'}] } },
    { slug:'liskarm', name:'Liskarm', cls:'Defender', rar:5, atk:4, def:8, cost:7, range:'short', nation:'blacksteel',
      skill:{ name:'Counter Charge', type:'Active', cost:2, text:'Deal 2 damage to the enemy player and gain 2 DP.',
              effects:[{k:'dmgPlayer',v:2},{k:'gainDP',v:2}] } },

    // ---------------- Snipers ----------------
    { slug:'greythroat', name:'GreyThroat', cls:'Sniper', rar:5, atk:5, def:2, cost:4, range:'long', nation:'rhodes',
      skill:{ name:'Feather Storm', type:'Active', cost:2, text:'Deal 2 damage to the enemy player, twice.',
              effects:[{k:'dmgPlayer',v:2},{k:'dmgPlayer',v:2}] } },
    { slug:'bluepoison', name:'Blue Poison', cls:'Sniper', rar:5, atk:5, def:1, cost:4, range:'long', nation:'rhodes',
      skill:{ name:'Neurotoxin', type:'Active', cost:2, text:'Deal 2 damage to the enemy player and Sleep one enemy operator.',
              effects:[{k:'dmgPlayer',v:2},{k:'sleepTarget'}], needsTarget:true } },
    { slug:'archetto', name:'Archetto', cls:'Sniper', rar:6, atk:5, def:2, cost:5, range:'long', nation:'laterano',
      skill:{ name:'Rapid Fire', type:'Active', cost:2, text:'Deal 3 damage to the enemy player.', effects:[{k:'dmgPlayer',v:3}] } },
    { slug:'platinum', name:'Platinum', cls:'Sniper', rar:5, atk:5, def:2, cost:4, range:'long', nation:'kazimierz',
      skill:{ name:'Piercing Shot', type:'Active', cost:3, text:'Destroy one enemy operator with DEF 5 or less.',
              effects:[{k:'destroyOperator',maxDef:5}], needsTarget:true } },

    // ---------------- Casters ----------------
    { slug:'mostima', name:'Mostima', cls:'Caster', rar:6, atk:8, def:1, cost:10, range:'medium', nation:'laterano',
      skill:{ name:'Time Stop', type:'Active', cost:3, text:'Deal 2 damage to the enemy player and Sleep one enemy operator for 2 turns.',
              effects:[{k:'dmgPlayer',v:2},{k:'sleepTarget',v:2}], needsTarget:true } },
    { slug:'goldenglow', name:'Goldenglow', cls:'Caster', rar:6, atk:4, def:1, cost:7, range:'long', nation:'victoria',
      skill:{ name:'Nanoflare', type:'Active', cost:3, text:'Deal 4 damage to the enemy player.', effects:[{k:'dmgPlayer',v:4}] } },
    { slug:'dusk', name:'Dusk', cls:'Caster', rar:6, atk:8, def:1, cost:10, range:'medium', nation:'yan',
      skill:{ name:'Freeling', type:'Active', cost:4, text:'Destroy all enemy operators with DEF 3 or less.',
              effects:[{k:'destroyFront',maxDef:3}] } },
    { slug:'carnelian', name:'Carnelian', cls:'Caster', rar:6, atk:8, def:3, cost:8, range:'medium', nation:'sargon',
      skill:{ name:'Rite of Oblivion', type:'Active', cost:3, text:'Deal 4 damage to the enemy player.', effects:[{k:'dmgPlayer',v:4}] } },

    // ---------------- Medics ----------------
    { slug:'kaltsit', name:"Kal'tsit", cls:'Medic', rar:6, atk:4, def:2, cost:7, range:'medium', nation:'rhodes',
      skill:{ name:'Mon3tr', type:'Active', cost:3, text:'Destroy one enemy operator with DEF 5 or less.',
              effects:[{k:'destroyOperator',maxDef:5}], needsTarget:true } },
    { slug:'whisperain', name:'Whisperain', cls:'Medic', rar:5, atk:4, def:1, cost:7, range:'medium', nation:'iberia',
      skill:{ name:'Colic Therapy', type:'Active', cost:2, text:'Heal 4 HP to yourself.', effects:[{k:'healPlayer',v:4}] } },
    { slug:'breeze', name:'Breeze', cls:'Medic', rar:5, atk:3, def:2, cost:6, range:'medium', nation:'rhodes',
      skill:{ name:'Tranquilizing', type:'Active', cost:2, text:'Heal 3 HP to yourself and give all friendly operators +1 DEF.',
              effects:[{k:'healPlayer',v:3},{k:'buffDefAll',v:1}] } },
    { slug:'silence', name:'Silence', cls:'Medic', rar:5, atk:4, def:2, cost:6, range:'medium', nation:'rhodes',
      skill:{ name:'Healing Drone', type:'Active', cost:2, text:'Heal 3 HP to yourself.', effects:[{k:'healPlayer',v:3}] } },

    // ---------------- Supporters ----------------
    { slug:'sora', name:'Sora', cls:'Supporter', rar:5, atk:3, def:3, cost:2, range:'medium', nation:'penguin',
      skill:{ name:'Hymn of the Dawn', type:'Active', cost:1, text:'Sleep one enemy operator.',
              effects:[{k:'sleepTarget'}], needsTarget:true } },
    { slug:'pramanix', name:'Pramanix', cls:'Supporter', rar:5, atk:4, def:1, cost:4, range:'medium', nation:'kjerag',
      skill:{ name:'Frostbind', type:'Active', cost:2, text:'Deal 2 damage to the enemy player and Silence one enemy operator.',
              effects:[{k:'dmgPlayer',v:2},{k:'silenceTarget'}], needsTarget:true } },
    { slug:'shamare', name:'Shamare', cls:'Supporter', rar:5, atk:4, def:1, cost:4, range:'medium', nation:'siracusa',
      skill:{ name:'Malediction', type:'Active', cost:2, text:'Deal 2 damage to the enemy player and Sleep one enemy operator.',
              effects:[{k:'dmgPlayer',v:2},{k:'sleepTarget'}], needsTarget:true } },
    { slug:'scene', name:'Scene', cls:'Supporter', rar:5, atk:4, def:2, cost:4, range:'medium', nation:'rhodes',
      skill:{ name:'Hologram', type:'Active', cost:2, text:'Draw 2 cards.', effects:[{k:'draw',v:2}] } },

    // ---------------- Specialists ----------------
    { slug:'gravel', name:'Gravel', cls:'Specialist', rar:4, atk:4, def:4, cost:3, range:'short', nation:'kazimierz',
      skill:{ name:'Shield', type:'Active', cost:1, text:'This operator gets +3 DEF this turn.', effects:[{k:'buffDefSelf',v:3}] } },
    { slug:'cliffheart', name:'Cliffheart', cls:'Specialist', rar:5, atk:7, def:4, cost:4, range:'short', nation:'kjerag',
      skill:{ name:'Chain Hook', type:'Manual', text:"Once: Bounce one enemy operator back to the opponent's hand.",
              effects:[{k:'bounceTarget'}], needsTarget:true } },
    { slug:'aak', name:'Aak', cls:'Specialist', rar:6, atk:6, def:2, cost:4, range:'short', nation:'lungmen',
      skill:{ name:'Durian Special', type:'Active', cost:2, text:'This operator gets +3 ATK this turn.', effects:[{k:'buffAtkSelf',v:3}] } },
    { slug:'phantom', name:'Phantom', cls:'Specialist', rar:6, atk:5, def:4, cost:3, range:'short', nation:'victoria',
      skill:{ name:'Night Raid', type:'Instant', text:'When deployed, destroy one enemy operator with DEF 3 or less.',
              effects:[{k:'destroyOperator',maxDef:3}], needsTarget:true } },

    // ---------------- Extended roster (batch 3) ----------------
    { slug:'saga', name:'Saga', cls:'Vanguard', rar:6, atk:6, def:4, cost:5, range:'short', nation:'higashi',
      skill:{ name:'Supreme Art: Originium Blade', type:'Active', cost:2, text:'Deal 3 damage to the enemy player.', effects:[{k:'dmgPlayer',v:3}] } },
    { slug:'ines', name:'Ines', cls:'Vanguard', rar:6, atk:6, def:5, cost:5, range:'short', nation:'rhodes',
      skill:{ name:'Shadowveil', type:'Instant', text:'When deployed, Silence one enemy operator.', effects:[{k:'silenceTarget'}], needsTarget:true } },
    { slug:'flametail', name:'Flametail', cls:'Vanguard', rar:6, atk:7, def:4, cost:5, range:'short', nation:'kazimierz',
      skill:{ name:'Flameheart', type:'Active', cost:2, text:'Deal 2 damage to the enemy player and gain 2 DP.', effects:[{k:'dmgPlayer',v:2},{k:'gainDP',v:2}] } },
    { slug:'blacknight', name:'Blacknight', cls:'Vanguard', rar:5, atk:5, def:4, cost:4, range:'short', nation:'sargon',
      skill:{ name:'Shadow Pact', type:'Instant', text:'When deployed, gain 4 DP.', effects:[{k:'gainDP',v:4}] } },
    { slug:'mlynar', name:'Młynar', cls:'Guard', rar:6, atk:7, def:5, cost:7, range:'short', nation:'kazimierz',
      skill:{ name:'Unshaken', type:'Passive', text:'This operator has +2 ATK.', effects:[{k:'buffAtkSelf',v:2}] } },
    { slug:'irene', name:'Irene', cls:'Guard', rar:6, atk:6, def:4, cost:6, range:'short', nation:'iberia',
      skill:{ name:'Glorious Judgement', type:'Active', cost:3, text:'Destroy one enemy operator with DEF 5 or less.',
              effects:[{k:'destroyOperator',maxDef:5}], needsTarget:true } },
    { slug:'chongyue', name:'Chongyue', cls:'Guard', rar:6, atk:6, def:4, cost:6, range:'short', nation:'yan',
      skill:{ name:'Nian Beast', type:'Active', cost:3, text:'Deal 4 damage to the enemy player.', effects:[{k:'dmgPlayer',v:4}] } },
    { slug:'nearl2', name:'Nearl the Radiant', cls:'Guard', rar:6, atk:7, def:5, cost:7, range:'short', nation:'kazimierz',
      skill:{ name:'Radiant Lance', type:'Active', cost:3, text:'Destroy one enemy operator with DEF 4 or less.',
              effects:[{k:'destroyOperator',maxDef:4}], needsTarget:true } },
    { slug:'horn', name:'Horn', cls:'Defender', rar:6, atk:5, def:8, cost:7, range:'medium', nation:'victoria',
      skill:{ name:'Hold the Line', type:'Passive', text:'Taunt.', effects:[{k:'taunt'}] } },
    { slug:'gladiia', name:'Gladiia', cls:'Defender', rar:6, atk:6, def:7, cost:6, range:'short', nation:'egir',
      skill:{ name:"Seaborn's Tide", type:'Active', cost:2, text:'Deal 3 damage to the enemy player and heal 2 HP.',
              effects:[{k:'dmgPlayer',v:3},{k:'healPlayer',v:2}] } },
    { slug:'fartooth', name:'Fartooth', cls:'Sniper', rar:6, atk:7, def:2, cost:6, range:'long', nation:'laterano',
      skill:{ name:'Silencer', type:'Active', cost:2, text:'Destroy one enemy operator with DEF 3 or less.',
              effects:[{k:'destroyOperator',maxDef:3}], needsTarget:true } },
    { slug:'chen2', name:"Ch'en the Holungday", cls:'Sniper', rar:6, atk:6, def:3, cost:7, range:'long', nation:'lungmen',
      skill:{ name:'Bloodlines', type:'Active', cost:3, text:'Deal 3 damage to the enemy player twice.',
              effects:[{k:'dmgPlayer',v:3},{k:'dmgPlayer',v:3}] } },
    { slug:'meteorite', name:'Meteorite', cls:'Sniper', rar:5, atk:6, def:2, cost:4, range:'long', nation:'rhodes',
      skill:{ name:'Blast Shell', type:'Active', cost:2, text:'Deal 2 damage to the enemy player and Sleep one enemy operator.',
              effects:[{k:'dmgPlayer',v:2},{k:'sleepTarget'}], needsTarget:true } },
    { slug:'logos', name:'Logos', cls:'Caster', rar:6, atk:7, def:1, cost:8, range:'long', nation:'rhodes',
      skill:{ name:'Sanguine Seal', type:'Active', cost:3, text:'Destroy all enemy operators with DEF 2 or less.',
              effects:[{k:'destroyFront',maxDef:2}] } },
    { slug:'lava2', name:'Lava the Purgatory', cls:'Caster', rar:5, atk:6, def:1, cost:6, range:'long', nation:'rhodes',
      skill:{ name:'Ignite', type:'Active', cost:2, text:'Deal 3 damage to the enemy player.', effects:[{k:'dmgPlayer',v:3}] } },
    { slug:'lumen', name:'Lumen', cls:'Medic', rar:6, atk:4, def:2, cost:6, range:'medium', nation:'iberia',
      skill:{ name:'Cleanse', type:'Active', cost:2, text:'Heal 5 HP to yourself.', effects:[{k:'healPlayer',v:5}] } },
    { slug:'tuye', name:'Tuye', cls:'Medic', rar:5, atk:4, def:2, cost:5, range:'medium', nation:'sargon',
      skill:{ name:'Oasis', type:'Active', cost:2, text:'Heal 4 HP to yourself.', effects:[{k:'healPlayer',v:4}] } },
    { slug:'ling', name:'Ling', cls:'Supporter', rar:6, atk:5, def:2, cost:6, range:'medium', nation:'yan',
      skill:{ name:'Dragon Domain', type:'Active', cost:3, text:'Deal 2 damage to the enemy player and Sleep one enemy operator for 2 turns.',
              effects:[{k:'dmgPlayer',v:2},{k:'sleepTarget',v:2}], needsTarget:true } },
    { slug:'skadi2', name:'Skadi the Corrupting Heart', cls:'Supporter', rar:6, atk:5, def:3, cost:7, range:'medium', nation:'egir',
      skill:{ name:'Abyssal Dirge', type:'Passive', text:'All friendly operators get +1 ATK.', effects:[{k:'buffAtkAll',v:1}] } },
    { slug:'texas2', name:'Texas the Omertosa', cls:'Specialist', rar:6, atk:7, def:4, cost:6, range:'short', nation:'lungmen',
      skill:{ name:'Sword Rain \u03b2', type:'Instant', text:'When deployed, destroy one enemy operator with DEF 4 or less.',
              effects:[{k:'destroyOperator',maxDef:4}], needsTarget:true } }
  ];

  // ---------------------------------------------------------------------------
  // Arts
  // ---------------------------------------------------------------------------
  const ARTS = [
    { id:'arts_surge', name:'Originium Surge', artType:'Instant', cost:3, img:'assets/arts/arts_surge.png',
      text:'Deal 3 damage to the enemy player.', effects:[{k:'dmgPlayer',v:3}] },
    { id:'arts_frostnova', name:'Frost Nova', artType:'Instant', cost:3, img:'assets/arts/arts_frostnova.png',
      text:'Sleep one enemy operator.', effects:[{k:'sleepTarget'}], needsTarget:true },
    { id:'arts_blazingsun', name:'Blazing Sun', artType:'Instant', cost:4, img:'assets/arts/arts_blazingsun.png',
      text:'Destroy one enemy operator with DEF 5 or less.', effects:[{k:'destroyOperator',maxDef:5}], needsTarget:true },
    { id:'arts_medicdrone', name:'Medic Drone', artType:'Instant', cost:2, img:'assets/arts/arts_medicdrone.png',
      text:'Heal 8 HP to yourself.', effects:[{k:'healPlayer',v:8}] },
    { id:'arts_reinforce', name:'Reinforcement', artType:'Instant', cost:2, img:'assets/arts/arts_reinforce.png',
      text:'Draw 2 cards.', effects:[{k:'draw',v:2}] },
    { id:'arts_barrage', name:'Suppression Barrage', artType:'Instant', cost:3, img:'assets/arts/arts_barrage.png',
      text:'Deal 2 damage to the enemy player and Sleep one enemy operator.',
      effects:[{k:'dmgPlayer',v:2},{k:'sleepTarget'}], needsTarget:true },
    { id:'arts_airstrike', name:'Air Strike', artType:'Field', cost:3, duration:3, img:'assets/arts/arts_airstrike.png',
      text:'At the end of your turn, deal 2 damage to the enemy player.', effects:[{k:'dmgPlayer',v:2}] },
    { id:'arts_chrono', name:'Chrono Field', artType:'Field', cost:4, duration:4, img:'assets/arts/arts_chrono.png',
      text:'All friendly operators get +2 DEF.', effects:[{k:'buffDefAll',v:2}] },
    { id:'arts_overload', name:'Originium Overload', artType:'Instant', cost:5, img:'assets/arts/arts_overload.png',
      text:'Destroy one enemy operator.', effects:[{k:'destroyOperator'}], needsTarget:true },
    { id:'arts_healbeacon', name:'Healing Beacon', artType:'Instant', cost:3, img:'assets/arts/arts_healbeacon.png',
      text:'Heal 12 HP to yourself.', effects:[{k:'healPlayer',v:12}] },
    { id:'arts_dpdrone', name:'Logistics Drone', artType:'Instant', cost:2, img:'assets/arts/arts_dpdrone.png',
      text:'Gain 5 DP.', effects:[{k:'gainDP',v:5}] },
    { id:'arts_concussion', name:'Concussion Mine', artType:'Instant', cost:3, img:'assets/arts/arts_concussion.png',
      text:'Deal 3 damage to the enemy player and Sleep one enemy operator.',
      effects:[{k:'dmgPlayer',v:3},{k:'sleepTarget'}], needsTarget:true },
    { id:'arts_sweep', name:'Precision Sweep', artType:'Instant', cost:4, img:'assets/arts/arts_sweep.png',
      text:'Destroy all enemy operators with DEF 2 or less.', effects:[{k:'destroyFront',maxDef:2}] },
    { id:'arts_bulwark', name:'Bulwark Field', artType:'Field', cost:3, duration:3, img:'assets/arts/arts_bulwark.png',
      text:'All friendly operators get +4 DEF.', effects:[{k:'buffDefAll',v:4}] },
    { id:'arts_counter', name:'Tactical Strike', artType:'Instant', cost:3, img:'assets/arts/arts_counter.png',
      text:'Deal 2 damage to the enemy player, then draw 1 card.',
      effects:[{k:'dmgPlayer',v:2},{k:'draw',v:1}] },
    { id:'arts_reposition', name:'Tactical Retreat', artType:'Instant', cost:2, img:'assets/arts/arts_reposition.png',
      text:"Bounce one enemy operator back to the opponent's hand.",
      effects:[{k:'bounceTarget'}], needsTarget:true },
    // ---- extended Arts (batch 2) ----
    { id:'arts_missilestrike', name:'Missile Strike', artType:'Instant', cost:4, img:'assets/arts/arts_missilestrike.png',
      text:'Deal 4 damage to the enemy player.', effects:[{k:'dmgPlayer',v:4}] },
    { id:'arts_gravemend', name:'Grave Recall', artType:'Instant', cost:3, img:'assets/arts/arts_gravemend.png',
      text:'Return a random operator from your discard pile to your hand.', effects:[{k:'returnFromGrave'}] },
    { id:'arts_warcry', name:'War Cry', artType:'Field', cost:3, duration:3, img:'assets/arts/arts_warcry.png',
      text:'All friendly operators get +2 ATK.', effects:[{k:'buffAtkAll',v:2}] },
    { id:'arts_quickdraw', name:'Quick Draw', artType:'Instant', cost:2, img:'assets/arts/arts_quickdraw.png',
      text:'Draw 3 cards.', effects:[{k:'draw',v:3}] },
    { id:'arts_dpburst', name:'Field Supply', artType:'Instant', cost:1, img:'assets/arts/arts_dpburst.png',
      text:'Gain 6 DP.', effects:[{k:'gainDP',v:6}] },
    { id:'arts_silencefield', name:'Silence Field', artType:'Instant', cost:3, img:'assets/arts/arts_silencefield.png',
      text:'Silence one enemy operator.', effects:[{k:'silenceTarget'}], needsTarget:true },
    { id:'arts_sweeper', name:'Devastation', artType:'Instant', cost:5, img:'assets/arts/arts_sweeper.png',
      text:'Destroy all enemy operators with DEF 4 or less.', effects:[{k:'destroyFront',maxDef:4}] },
    { id:'arts_laststand', name:'Last Stand', artType:'Instant', cost:4, img:'assets/arts/arts_laststand.png',
      text:'Heal 16 HP to yourself.', effects:[{k:'healPlayer',v:16}] },
    // ---- extended Arts (batch 3 — Pokémon-TCG-inspired support) ----
    { id:'arts_intel', name:'Intel Report', artType:'Instant', cost:1, img:'assets/arts/arts_reinforce.png',
      text:'Draw 2 cards.', effects:[{k:'draw',v:2}] },
    { id:'arts_disrupt', name:'Oripathy Fog', artType:'Instant', cost:3, img:'assets/arts/arts_frostnova.png',
      text:"Shuffle the enemy's hand into their deck, then they draw the same number of cards.", effects:[{k:'shuffleOppHand'}] },
    { id:'arts_snowstorm', name:'Blizzard', artType:'Instant', cost:4, img:'assets/arts/arts_concussion.png',
      text:"Shuffle the enemy's hand into their deck; they draw only 2 cards.", effects:[{k:'shuffleOppHand', v:2}] },
    { id:'arts_salvage', name:'Salvage Crew', artType:'Instant', cost:3, img:'assets/arts/arts_gravemend.png',
      text:'Return 2 random cards from your discard pile to your hand.', effects:[{k:'graveToHand', v:2}] },
    { id:'arts_briefing', name:'Tactical Briefing', artType:'Instant', cost:2, img:'assets/arts/arts_quickdraw.png',
      text:'Shuffle your hand into your deck, then draw the same number of cards +1.', effects:[{k:'shuffleOwnHand', v:1}] }
  ];

  // ---------------------------------------------------------------------------
  // Locations (one per player, chosen at the start)
  // ---------------------------------------------------------------------------
  const LOCATIONS = [
    { id:'loc_rhodes', name:'Rhodes Island', cls:'Location',
      text:'At the start of your turn, gain 2 DP.',
      desc:'Your mobile headquarters. Every one of your turns starts with 2 extra DP, so you can deploy and cast faster than your opponent — great for aggressive, high-cost plays.',
      effects:[{k:'dpStart',v:2}] },
    { id:'loc_lungmen', name:'Lungmen Rooftop', cls:'Location',
      desc:'A vantage point above the city. Its Active ability is a repeatable source of direct damage — perfect for finishing off a weakened Doctor or chipping past a stalled frontline.',
      active:{ cost:2, text:'Deal 2 damage to the enemy player.', effects:[{k:'dmgPlayer',v:2}] } },
    { id:'loc_chernobog', name:'Chernobog', cls:'Location',
      text:'All your operators have +1 ATK.',
      desc:'The ruined Originium city. Every operator you control strikes 1 harder, so every trade and every hit on the enemy Doctor comes out ahead.',
      effects:[{k:'buffAtkAll',v:1}] }
  ];

  // ---------------------------------------------------------------------------
  // Arenas — the battlefield itself. The buff is SHARED: it applies to BOTH
  // players for the whole match. Shown on the player HUD at battle start.
  //   effects: { atk, def, dp, hp }  (hp is applied when an operator is deployed)
  // ---------------------------------------------------------------------------
  const ARENAS = [
    { id:'alley_night',      name:'Gang Alley',       text:'All Operators gain +1 ATK.',                          effects:{ atk:1 } },
    { id:'yan_downtown',     name:'Yan Downtown',     text:'All Operators gain +1 DEF.',                          effects:{ def:1 } },
    { id:'main_street',      name:'Main Street',      text:'Both Doctors gain +2 DP at the start of their turn.', effects:{ dp:2 } },
    { id:'desert',           name:'Scorched Desert',  text:'All Operators gain +2 ATK.',                          effects:{ atk:2 } },
    { id:'snow_forest',      name:'Snow Forest',      text:'All Operators gain +3 HP.',                           effects:{ hp:3 } },
    { id:'red_forest',       name:'Red Forest',       text:'All Operators gain +1 ATK and +1 DEF.',               effects:{ atk:1, def:1 } },
    { id:'victoria_street',  name:'Victoria Street',  text:'All Operators gain +2 HP and +1 DEF.',                effects:{ hp:2, def:1 } },
    { id:'wild_field',       name:'Wild Field',       text:'All Operators gain +4 HP.',                           effects:{ hp:4 } },
    { id:'chernobog',        name:'Chernobog Ruins',  text:'All Operators gain +2 ATK and +2 HP.',                effects:{ atk:2, hp:2 } },
    { id:'lungmen_night',    name:'Lungmen Night',    text:'Both Doctors gain +3 DP at the start of their turn.', effects:{ dp:3 } },
    { id:'sargon_jungle',    name:'Sargon Jungle',    text:'All Operators gain +2 DEF and +3 HP.',                effects:{ def:2, hp:3 } },
    { id:'iberia_coast',     name:'Iberia Coast',     text:'All Operators gain +1 ATK, +1 DEF and +2 HP.',        effects:{ atk:1, def:1, hp:2 } },
    { id:'kazimierz_arena',  name:'Kazimierz Arena',  text:'All Operators gain +3 ATK.',                          effects:{ atk:3 } },
    { id:'ursus_tundra',     name:'Ursus Tundra',     text:'All Operators gain +5 HP.',                           effects:{ hp:5 } }
  ];

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const NATION_NAME = {
    rhodes:'Rhodes Island', kazimierz:'Kazimierz', laterano:'Laterano', sargon:'Sargon',
    siracusa:'Siracusa', victoria:'Victoria', yan:'Yan', egir:'Ægir', ursus:'Ursus',
    columbia:'Columbia', bolivar:'Bolívar', higashi:'Higashi', kjerag:'Kjeragandr',
    iberia:'Iberia', sami:'Sami', rim:'Rim Billiton', minos:'Minos', leithanien:'Leithanien',
    lungmen:'Lungmen', glasgow:'Glasgow', penguin:'Penguin Logistics', blacksteel:'Black Steel',
    rhine:'Rhine Lab', abc:'Aegir', durin:'Durin'
  };

  function operatorCard(slug) {
    const o = OPERATORS.find(x => x.slug === slug);
    if (!o) return null;
    return Object.assign({}, o, {
      type:'Operator',
      faction: NATION_NAME[o.nation] || 'Independent',
      color: CLASS_COLOR[o.cls],
      icon: CLASS_ICON[o.cls],
      hp: operatorHp(o),
      img: 'assets/characters/' + o.slug + '.png'
    });
  }

  // ---------------------------------------------------------------------------
  // Balance patch — "Doctor damage" nerf.
  // Operator SKILLS that deal damage straight to the enemy Doctor now do less.
  // Values AND their printed text are updated together, so a card always shows
  // the real number. Arts and Location abilities keep their full damage.
  // ---------------------------------------------------------------------------
  const DOCTOR_SKILL_MULT = 0.5;                                    // keep half
  const nerfDoctorDmg = (n) => Math.max(1, Math.ceil(n * DOCTOR_SKILL_MULT));
  OPERATORS.forEach(op => {
    const sk = op.skill;
    if (!sk || !sk.effects) return;
    const hits = sk.effects.filter(e => e.k === 'dmgPlayer');
    if (!hits.length) return;
    hits.forEach(e => { e.v = nerfDoctorDmg(e.v); });
    if (typeof sk.text === 'string') {
      sk.text = sk.text.replace(/([Dd]eal )([0-9]+)( damage to the enemy player)/g,
        (m, pre, num, post) => pre + nerfDoctorDmg(Number(num)) + post);
    }
  });

  // ---------------------------------------------------------------------------
  // Balance patch — "Support & Tank rebalance".
  // Vanguards, Medics (healers), Defenders and buff-type Specialists lose raw
  // ATK, but the SUPPORT numbers in their skills are strengthened to compensate:
  //   • heals and stat buffs   -> +50% (rounded up)
  //   • DP gains / DP per turn -> +1
  // Damage-to-Doctor skills are NOT touched here (they already took the Doctor
  // nerf above). Effect values AND printed text are updated together.
  // ---------------------------------------------------------------------------
  const ATK_NERF = { Vanguard: 1, Medic: 1, Defender: 1 };            // -2 ATK
  const isBuffSpecialist = (op) => op.cls === 'Specialist' &&
    !!op.skill && Array.isArray(op.skill.effects) &&
    op.skill.effects.some(e => e.k === 'buffAtkSelf' || e.k === 'buffDefSelf' ||
                               e.k === 'buffAtkAll' || e.k === 'buffDefAll');
  const growSupport = (n) => Math.ceil(n * 1.5);
  OPERATORS.forEach(op => {
    if (!ATK_NERF[op.cls] && !isBuffSpecialist(op)) return;
    op.atk = Math.max(1, op.atk - 2);                                 // ATK nerf
    const sk = op.skill;
    if (!sk || !sk.effects) return;
    sk.effects.forEach(e => {
      if (e.v == null) return;
      if (e.k === 'gainDP' || e.k === 'dpStart') e.v += 1;
      else if (e.k === 'healPlayer' || e.k === 'buffDefAll' || e.k === 'buffDefSelf' ||
               e.k === 'buffAtkAll' || e.k === 'buffAtkSelf') e.v = growSupport(e.v);
    });
    if (typeof sk.text === 'string') {
      sk.text = sk.text
        .replace(/([Hh]eal )([0-9]+)( HP)/g, (m, a, n, b) => a + growSupport(Number(n)) + b)
        .replace(/(gain )([0-9]+)( DP)/g, (m, a, n, b) => a + (Number(n) + 1) + b)
        .replace(/\+([0-9]+)( (?:ATK|DEF))/g, (m, n, s) => '+' + growSupport(Number(n)) + s);
    }
  });

  // ---------------------------------------------------------------------------
  // Balance patch — "Top-end nerf".
  // The highest-ATK outliers lose raw ATK, and Blaze/Młynar's passive ATK buff
  // is halved (+2 -> +1). Effect values AND printed text are updated together.
  // (Instant-kill skills/Arts are additionally capped in the engine: KILL_LIMIT.)
  // ---------------------------------------------------------------------------
  const TOP_NERF = {
    skadi:      { atk: 7 },          // 9 -> 7  (ATK tertinggi di game)
    schwarz:    { atk: 6 },          // 8 -> 6  (+ instant kill)
    cliffheart: { atk: 5 },          // 7 -> 5
    projektred: { atk: 4 },          // 5 -> 4
    phantom:    { atk: 4 },          // 5 -> 4
    texas2:     { atk: 6 },          // 7 -> 6
    fartooth:   { atk: 6 },          // 7 -> 6
    nearl2:     { atk: 6 },          // 7 -> 6
    chen:       { atk: 5 },          // 6 -> 5
    ifrit:      { atk: 7 },          // 8 -> 7
    dusk:       { atk: 7 },          // 8 -> 7
    logos:      { atk: 6 },          // 7 -> 6
    w:          { atk: 7 },          // 8 -> 7
    carnelian:  { atk: 7 },          // 8 -> 7
    mostima:    { atk: 7 },          // 8 -> 7
    eunectes:   { atk: 6 },          // 7 -> 6 (DEF 7 tetap)
    blaze:      { buffAtkSelf: 1 },  // +2 -> +1 (efektif 9 -> 8)
    mlynar:     { buffAtkSelf: 1 }   // +2 -> +1 (efektif 9 -> 8)
  };
  OPERATORS.forEach(op => {
    const n = TOP_NERF[op.slug];
    if (!n) return;
    if (n.atk != null) op.atk = n.atk;
    if (n.buffAtkSelf != null && op.skill && op.skill.effects) {
      op.skill.effects.forEach(e => { if (e.k === 'buffAtkSelf') e.v = n.buffAtkSelf; });
      if (typeof op.skill.text === 'string') {
        op.skill.text = op.skill.text.replace(/\+([0-9]+)( ATK)/g, '+' + n.buffAtkSelf + '$2');
      }
    }
  });

  global.Cards = {
    OPERATORS, ARTS, LOCATIONS, ARENAS,
    CLASS_COLOR, CLASS_ICON, CLASS_HP, NATION_NAME,
    operatorCard, operatorHp,
    operatorBySlug: (s) => OPERATORS.find(x => x.slug === s) || null,
    artById: (id) => ARTS.find(x => x.id === id) || null,
    locationById: (id) => LOCATIONS.find(x => x.id === id) || null,
    arenaById: (id) => ARENAS.find(x => x.id === id) || null
  };
})(window);
