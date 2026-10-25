// Модель данных и вся игровая математика.
// Никаких обращений к DOM/звуку — только чистые правила (см. docs/balance.md).
window.Models = (function () {
  'use strict';

  const SPECIES = {
    goblin:   { label: 'Гоблин', bias: { str: 0, agi: 3, int: 0, luck: 2 }, color: '#8bcf6b' },
    skeleton: { label: 'Скелет', bias: { str: -1, agi: 1, int: 4, luck: 1 }, color: '#a0a0a0' },
    slime:    { label: 'Слизь',  bias: { str: -2, agi: -1, int: -3, luck: 5 }, color: '#6bb8cf' },
    imp:      { label: 'Импу',   bias: { str: -1, agi: 2, int: 5, luck: -1 }, color: '#cf6b8b' },
    vampire:  { label: 'Вампир', bias: { str: 3, agi: 4, int: 5, luck: 0 }, color: '#e04a4a' }
  };

  // Черты из docs/content.md; эффекты — в effectiveStat/overkillChance/травмах.
  const TRAITS = ['устрашающий', 'трусливый', 'удачливый', 'неуклюжий', 'храбрый',
    'проворный', 'мудрый', 'глупый', 'тяжеловес', 'неуловимый'];

  // 13 предпочтений с реальной проверкой (в docs/content.md описаны 15;
  // «требует_троя_в_штате» и «боится_огня» не используются: троллей и огненных
  // заданий в контенте нет — иначе кандидат был бы ненанимаемым).
  const PREFERENCES = [
    'работать_только_с_нежитью',
    'не_работать_с_нежитью',
    'работать_только_с_гоблинами',
    'не_лезть_в_пещеры',
    'только_подземелья',
    'требует_вампира_в_команде',
    'любит_риск',
    'только_лёгкие_задания',
    'работает_только_один',
    'требует_импа',
    'не_работает_с_слизями',
    'любит_золото',
    'трусливый'
  ];

  // Какая стата решает задание (docs/balance.md §1).
  const QUEST_STATS = {
    farm: 'str', caravan: 'str', warehouse: 'str', bridge: 'str', bazar: 'str', citadel: 'str',
    cave: 'int', ruins: 'int', sewer: 'int', tower: 'int', ritual: 'int',
    village: 'agi', city: 'agi', forest: 'agi'
  };

  const UNDERGROUND = ['cave', 'ruins', 'citadel'];

  const UPGRADES_CONFIG = {
    stables:    { name: 'Стойла',            maxLevel: 2, baseCost: 50,  desc: '+1 место в штате' },
    forge:      { name: 'Кузня',             maxLevel: 3, baseCost: 60,  desc: '+2 к статам за уровень' },
    sewer:      { name: 'Канализация',       maxLevel: 2, baseCost: 40,  desc: 'Слизи: +1/+2 к статам' },
    crypta:     { name: 'Крипта',            maxLevel: 2, baseCost: 50,  desc: 'Скелеты: +1/+2 к статам' },
    training:   { name: 'Тренировочный зал', maxLevel: 2, baseCost: 40,  desc: 'Новые рекруты: +1/+2 стат' },
    intel:      { name: 'Отдел разведки',    maxLevel: 1, baseCost: 100, desc: 'Перехват −50%, угроза −2%/день' },
    lie_school: { name: 'Школа лжи',         maxLevel: 1, baseCost: 80,  desc: 'Шанс лжи −25%' }
  };

  const UPGRADE_ORDER = ['stables', 'forge', 'sewer', 'crypta', 'training', 'intel', 'lie_school'];

  // Экипировка из docs/content.md. bonus — прибавка к статистике,
  // injuryMod — сдвиг шанса травмы (отрицательный = безопаснее).
  const ITEMS = [
    { id: 'club',          name: 'Ржавая дубина',     type: 'weapon',     price: 20,  bonus: { str: 2 },           injuryMod: 0,     desc: '+2 СИЛА' },
    { id: 'sword',         name: 'Железный меч',      type: 'weapon',     price: 60,  bonus: { str: 5 },           injuryMod: 0,     desc: '+5 СИЛА' },
    { id: 'dagger',        name: 'Кинжал теней',      type: 'weapon',     price: 80,  bonus: { agi: 3, luck: 2 },  injuryMod: 0,     desc: '+3 ЛОВ, +2 УДА' },
    { id: 'staff',         name: 'Посох некроманта',  type: 'weapon',     price: 100, bonus: { int: 5 },           injuryMod: 0,     desc: '+5 ИНТ' },
    { id: 'leather',       name: 'Кожаная броня',     type: 'armor',      price: 30,  bonus: {},                   injuryMod: -0.05, desc: '−5% к шансу травмы' },
    { id: 'chain',         name: 'Кольчуга',          type: 'armor',      price: 70,  bonus: { agi: -1 },          injuryMod: -0.10, desc: '−10% к травме, −1 ЛОВ' },
    { id: 'cloak',         name: 'Плащ теней',        type: 'armor',      price: 90,  bonus: { agi: 3 },           injuryMod: -0.08, desc: '−8% к травме, +3 ЛОВ' },
    { id: 'luck_amulet',   name: 'Амулет удачи',      type: 'amulet',     price: 40,  bonus: { luck: 5 },          injuryMod: 0,     desc: '+5 УДА' },
    { id: 'int_amulet',    name: 'Амулет интеллекта', type: 'amulet',     price: 60,  bonus: { int: 3 },           injuryMod: 0,     desc: '+3 ИНТ' },
    { id: 'shadow_amulet', name: 'Амулет тени',       type: 'amulet',     price: 80,  bonus: { agi: 3, int: 2 },   injuryMod: 0,     desc: '+3 ЛОВ, +2 ИНТ' },
    { id: 'potion',        name: 'Зелье лечения',     type: 'consumable', price: 30,  effect: 'heal',              desc: 'лечит раненого монстра' },
    { id: 'elixir',        name: 'Эликсир силы',      type: 'consumable', price: 50,  effect: 'elixir',            desc: '+5 СИЛА на одно задание' }
  ];

  // ── Угроза героев ────────────────────────────────────────────────────────
  // threat — «часы поражения» 0..1, растёт на 0.05 в день (ступень в 10% каждые
  // 2 дня: 10% → 20% на 3-й день → 30% на 5-й → 40% на 7-й).
  // Шанс перехвата заказа = ступень × 0.1 (docs/balance.md §6), с разведкой ×0.5.
  const THREAT_STEP = 0.05;

  function threatStage(threat) {
    return Utils.clamp(Math.round(threat / 0.1) || 1, 1, 4);
  }

  function threatLabel(threat) {
    return ['', 'Низкая', 'Средняя', 'Высокая', 'Критичная'][threatStage(threat)];
  }

  function interceptChance(agency) {
    const mul = agency.upgrades.intel > 0 ? 0.5 : 1;
    return threatStage(agency.threat) * 0.1 * mul;
  }

  function advanceThreat(agency) {
    const intelCut = agency.upgrades.intel > 0 ? 0.02 : 0;
    agency.threat = Utils.clamp(agency.threat + THREAT_STEP - intelCut, 0, 1);
  }

  // ── Генерация ────────────────────────────────────────────────────────────
  function uid() { return Utils.uid(); }

  function rosterCap(agency) {
    return 4 + agency.upgrades.stables;
  }

  function riskLabel(difficulty) {
    if (difficulty <= 3) return 'Низкий';
    if (difficulty === 4) return 'Средний';
    if (difficulty === 5) return 'Высокий';
    return 'Критический';
  }

  function createMonster(forceSpecies, trainingLevel) {
    const key = forceSpecies || Utils.pick(Object.keys(SPECIES));
    const sp = SPECIES[key];
    const base = Utils.randInt(4, 14);
    const stats = {
      str:  Utils.clamp(base + sp.bias.str  + Utils.randInt(-1, 1), 1, 20),
      agi:  Utils.clamp(base + sp.bias.agi  + Utils.randInt(-1, 1), 1, 20),
      int:  Utils.clamp(base + sp.bias.int  + Utils.randInt(-1, 1), 1, 20),
      luck: Utils.clamp(base + sp.bias.luck + Utils.randInt(-1, 1), 1, 20)
    };
    for (let i = 0; i < (trainingLevel || 0); i++) {
      const k = Utils.pick(['str', 'agi', 'int', 'luck']);
      stats[k] = Utils.clamp(stats[k] + 1, 1, 20);
    }
    return {
      id: uid(),
      name: Utils.pick(Content.MONSTER_NAMES[key]),
      speciesKey: key,
      speciesLabel: sp.label,
      color: sp.color,
      stats: stats,
      traits: [Utils.pick(TRAITS)],
      preference: Utils.pick(PREFERENCES),
      status: 'idle',
      overkillCount: 0,
      missions: 0,
      equipment: { weapon: null, armor: null, amulet: null },
      temp: null
    };
  }

  function makeQuest(template) {
    return {
      id: uid(),
      title: template.title,
      difficulty: template.diff,
      reward: template.reward,
      baseReward: template.reward,
      risk: riskLabel(template.diff),
      type: template.type,
      species: (template.species || []).slice(),
      intercepted: false
    };
  }

  function generateQuests(agency) {
    agency.quests = [];
    const board = Utils.shuffle(Content.QUESTS.slice()).slice(0, 4);
    const chance = interceptChance(agency);
    let intercepted = 0;

    board.forEach(function (template) {
      const q = makeQuest(template);
      if (Utils.chance(chance)) {
        q.intercepted = true;
        q.reward = 0;
        intercepted++;
      }
      agency.quests.push(q);
    });

    agency.dayStats.intercepted = intercepted;
    agency.stats.interceptedTotal += intercepted;
  }

  function generateCandidates(agency) {
    const rosterSpecies = agency.monsters.map(function (m) { return m.speciesKey; });
    const result = [];
    for (let attempt = 0; attempt < 60 && result.length < 3; attempt++) {
      const c = createMonster(null, agency.upgrades.training);
      if (rosterSpecies.includes(c.speciesKey)) continue;
      if (result.some(function (x) { return x.name === c.name && x.speciesKey === c.speciesKey; })) continue;
      // Стоимость найма: базовая 20 + 5 за каждую единицу средней статы
      const avgStat = (c.stats.str + c.stats.agi + c.stats.int + c.stats.luck) / 4;
      c.cost = 20 + Math.round(avgStat * 2.5);
      result.push(c);
    }
    while (result.length < 3) {
      const c = createMonster(null, agency.upgrades.training);
      const avgStat = (c.stats.str + c.stats.agi + c.stats.int + c.stats.luck) / 4;
      c.cost = 20 + Math.round(avgStat * 2.5);
      result.push(c);
    }
    return result;
  }

  function freshDayStats() {
    return { questsDone: 0, goldEarned: 0, losses: 0, intercepted: 0, missions: [] };
  }

  function createAgency() {
    const upgrades = {};
    UPGRADE_ORDER.forEach(function (k) { upgrades[k] = 0; });

    const agency = {
      day: 1,
      maxDays: 14,
      gold: 100,
      rep: 0,
      level: 1,
      threat: 0.1,
      monsters: [],
      candidates: [],
      quests: [],
      log: [],
      upgrades: upgrades,
      inventory: ['club'],
      interviewsLeft: 3,
      lastResult: null,
      dayStats: freshDayStats(),
      stats: { questsDone: 0, goldEarned: 0, losses: 0, overkills: 0, interceptedTotal: 0, missions: [] }
    };

    agency.monsters.push(createMonster(null, upgrades.training), createMonster(null, upgrades.training));
    generateQuests(agency);
    agency.candidates = generateCandidates(agency);
    return agency;
  }

  // ── Собеседование ────────────────────────────────────────────────────────
  function prefCheck(pref, agency) {
    const roster = agency.monsters.map(function (m) { return m.speciesKey; });
    const board = agency.quests.filter(function (q) { return !q.intercepted; });
    const has = function () {
      for (let i = 0; i < arguments.length; i++) if (roster.includes(arguments[i])) return true;
      return false;
    };
    const boardHas = function (types) { return board.some(function (q) { return types.includes(q.type); }); };

    switch (pref) {
      case 'работать_только_с_нежитью':
        return { ok: has('skeleton', 'vampire'), reason: 'Требую нежить в штат!' };
      case 'не_работать_с_нежитью':
        return { ok: !has('skeleton', 'vampire'), reason: 'Не хочу работать с нежитью!' };
      case 'работать_только_с_гоблинами':
        return { ok: has('goblin'), reason: 'Хочу гоблина в команду!' };
      case 'не_лезть_в_пещеры':
        return { ok: !boardHas(UNDERGROUND), reason: 'Не полезу в пещеры!' };
      case 'только_подземелья':
        return { ok: boardHas(UNDERGROUND), reason: 'Хочу в подземелья, а не вот это!' };
      case 'требует_вампира_в_команде':
        return { ok: has('vampire'), reason: 'Мне нужен вампир в команде!' };
      case 'любит_риск':
        return { ok: board.some(function (q) { return q.difficulty >= 6; }), reason: 'Скучно, нет достойных заказов!' };
      case 'только_лёгкие_задания':
        return { ok: board.some(function (q) { return q.difficulty <= 4; }), reason: 'Слишком опасно!' };
      case 'работает_только_один':
        return { ok: agency.monsters.length < 3, reason: 'Работаю в одиночку, не хочу напарников!' };
      case 'требует_импа':
        return { ok: has('imp'), reason: 'Позовите Импу!' };
      case 'не_работает_с_слизями':
        return { ok: !has('slime'), reason: 'Не хочу со слизью!' };
      case 'любит_золото':
        return { ok: board.some(function (q) { return q.reward >= 50; }) || agency.gold >= 100, reason: 'Мало платите!' };
      case 'трусливый':
        return { ok: Math.random() > agency.threat * 0.3, reason: 'Слишком страшно у вас тут!' };
      default:
        return { ok: true, reason: '' };
    }
  }

  function tryHire(candidate, agency) {
    if (agency.interviewsLeft <= 0) {
      return { success: false, consumed: false, reason: 'Все собеседования на сегодня использованы' };
    }
    if (agency.monsters.length >= rosterCap(agency)) {
      return { success: false, consumed: false, reason: 'Нет свободных мест в стойлах' };
    }
    // Стоимость найма взимается только при успешном найме (docs/balance.md §5).
    if (agency.gold < candidate.cost) {
      return { success: false, consumed: false, reason: 'Недостаточно золота на найм!' };
    }
    agency.interviewsLeft--;
    const res = prefCheck(candidate.preference, agency);
    if (!res.ok) {
      return { success: false, consumed: true, reason: res.reason };
    }
    agency.gold -= candidate.cost;
    return { success: true, consumed: true, reason: res.reason, cost: candidate.cost };
  }

  function fireMonster(agency, monsterId) {
    const idx = agency.monsters.findIndex(function (m) { return m.id === monsterId; });
    if (idx === -1) return { success: false, reason: 'Монстр не найден в штате' };
    const m = agency.monsters[idx];
    if (m.status !== 'idle') return { success: false, reason: 'Монстр занят на задании' };
    agency.monsters.splice(idx, 1);
    return { success: true, name: m.name };
  }

  // ── Экономика ────────────────────────────────────────────────────────────
  function buyUpgrade(agency, key) {
    const conf = UPGRADES_CONFIG[key];
    if (!conf) return { success: false, reason: 'Неизвестное улучшение' };
    const lvl = agency.upgrades[key];
    if (lvl >= conf.maxLevel) return { success: false, reason: 'Максимальный уровень!' };

    const cost = conf.baseCost * (lvl + 1);
    if (agency.gold < cost) return { success: false, reason: 'Недостаточно золота!' };

    agency.gold -= cost;
    agency.upgrades[key]++;
    return { success: true, cost: cost };
  }

  function hireUndead(agency) {
    if (agency.monsters.length >= rosterCap(agency)) return { success: false, reason: 'Стойла переполнены!' };
    const cost = 150;
    if (agency.gold < cost) return { success: false, reason: 'Нужно 150 золота!' };

    agency.gold -= cost;
    const species = Utils.chance(0.7) ? 'skeleton' : 'vampire';
    const monster = createMonster(species, agency.upgrades.training);
    monster.status = 'idle';
    agency.monsters.push(monster);
    return { success: true, monster: monster };
  }

  // ── Экипировка ───────────────────────────────────────────────────────────
  function getItem(id) {
    if (!id) return null;
    return ITEMS.find(function (i) { return i.id === id; }) || null;
  }

  function itemBonus(monster, statKey) {
    let sum = 0;
    if (!monster || !monster.equipment) return 0;
    ['weapon', 'armor', 'amulet'].forEach(function (slot) {
      const it = getItem(monster.equipment[slot]);
      if (it && it.bonus && it.bonus[statKey]) sum += it.bonus[statKey];
    });
    if (statKey === 'str' && monster.temp && monster.temp.str) sum += monster.temp.str;
    return sum;
  }

  function equipmentInjuryMod(monster) {
    let mod = 0;
    if (!monster || !monster.equipment) return 0;
    ['weapon', 'armor', 'amulet'].forEach(function (slot) {
      const it = getItem(monster.equipment[slot]);
      if (it && it.injuryMod) mod += it.injuryMod;
    });
    return mod;
  }

  function equipItem(agency, monster, itemId) {
    const item = getItem(itemId);
    if (!item) return { success: false, reason: 'Предмет не найден' };
    if (item.type === 'consumable') return { success: false, reason: 'Это расходник' };

    const idx = agency.inventory.indexOf(itemId);
    if (idx === -1) return { success: false, reason: 'Предмета нет в сумке' };
    if (!monster.equipment) monster.equipment = { weapon: null, armor: null, amulet: null };

    const slot = item.type;
    if (monster.equipment[slot]) agency.inventory.push(monster.equipment[slot]);
    agency.inventory.splice(idx, 1);
    monster.equipment[slot] = itemId;
    return { success: true };
  }

  function unequipItem(agency, monster, slot) {
    if (!monster.equipment || !monster.equipment[slot]) return { success: false, reason: 'Слот пуст' };
    agency.inventory.push(monster.equipment[slot]);
    monster.equipment[slot] = null;
    return { success: true };
  }

  function useItem(agency, monster, itemId) {
    const item = getItem(itemId);
    if (!item || item.type !== 'consumable') return { success: false, reason: 'Это не расходник' };

    const idx = agency.inventory.indexOf(itemId);
    if (idx === -1) return { success: false, reason: 'Предмета нет в сумке' };

    if (item.effect === 'heal') {
      if (monster.status !== 'injured') return { success: false, reason: 'Монстр не ранен' };
      monster.status = 'idle';
    } else if (item.effect === 'elixir') {
      monster.temp = { str: 5, missions: 1 };
    }

    agency.inventory.splice(idx, 1);
    return { success: true, item: item };
  }

  function buyItem(agency, itemId) {
    const item = getItem(itemId);
    if (!item) return { success: false, reason: 'Предмет не найден' };
    if (agency.gold < item.price) return { success: false, reason: 'Недостаточно золота!' };
    agency.gold -= item.price;
    agency.inventory.push(itemId);
    return { success: true, item: item };
  }

  // ── Задания ──────────────────────────────────────────────────────────────
  // Эффективная стата: база + кузня + черты − несоответствие требуемому виду.
  function effectiveStat(monster, quest, agency) {
    const statKey = QUEST_STATS[quest.type] || 'str';
    let v = monster.stats[statKey] + agency.upgrades.forge * 2 + itemBonus(monster, statKey);

    if (monster.speciesKey === 'slime') v += (agency.upgrades.sewer || 0);
    if (monster.speciesKey === 'skeleton') v += (agency.upgrades.crypta || 0);

    if (quest.species.length && quest.species.indexOf(monster.speciesKey) === -1) v -= 2;

    const t = monster.traits[0];
    if (t === 'устрашающий' && ['farm', 'village', 'bridge', 'bazar'].indexOf(quest.type) !== -1) v += 2;
    if (t === 'трусливый') v -= 2;
    if (t === 'тяжеловес' && statKey === 'str') v += 3;
    if (t === 'мудрый' && statKey === 'int') v += 2;
    if (t === 'глупый' && statKey === 'int') v -= 2;
    if (t === 'проворный' && ['caravan', 'city'].indexOf(quest.type) !== -1) v += 2;
    if (t === 'храбрый' && agency.threat >= 0.4) v += 2;

    return v;
  }

  function successChance(monster, quest, agency) {
    const eff = effectiveStat(monster, quest, agency);
    let chance = 0.5 + (eff - quest.difficulty) * 0.05;

    if (monster.preference === 'любит_риск' && quest.difficulty >= 6) chance += 0.1;
    if (monster.preference === 'только_лёгкие_задания' && quest.difficulty <= 4) chance += 0.1;

    return Utils.clamp(chance, 0.05, 0.95);
  }

  function effectiveIntel(monster) {
    let int = monster.stats.int + itemBonus(monster, 'int');
    const t = monster.traits[0];
    if (t === 'мудрый') int += 2;
    if (t === 'глупый') int -= 2;
    return Utils.clamp(int, 1, 20);
  }

  function honestyChance(monster, agency) {
    const int = effectiveIntel(monster);
    let honest = int >= 14 ? 1.0 : (int >= 8 ? 0.5 : 0.1);
    // «Школа лжи» уменьшает шанс лжи на 25%, а не увеличивает честность.
    if (agency.upgrades.lie_school > 0) honest = 1 - (1 - honest) * 0.75;
    return honest;
  }

  function groupSuccessChance(monsters, quest, agency) {
    let totalStat = 0;
    monsters.forEach(function (m) {
      totalStat += effectiveStat(m, quest, agency);
    });
    let chance = 0.5 + (totalStat - quest.difficulty) * 0.05;
    monsters.forEach(function (m) {
      if (m.preference === 'любит_риск' && quest.difficulty >= 6) chance += 0.05;
      if (m.preference === 'только_лёгкие_задания' && quest.difficulty <= 4) chance += 0.05;
    });
    return Utils.clamp(chance, 0.05, 0.95);
  }

  function overkillReportKey(type) {
    const key = 'overkill_' + type;
    return Content.REPORTS[key] ? key : 'overkill_farm';
  }

  function calculateGroupResult(monsters, quest, agency) {
    // Силы всех монстров суммируются — главная суть мультиотправки
    let totalStat = 0;
    let totalInjuryMod = 0;
    let hasClumsy = false;

    monsters.forEach(function (m) {
      totalStat += effectiveStat(m, quest, agency);
      totalInjuryMod += equipmentInjuryMod(m);
      if (m.traits[0] === 'неуклюжий') hasClumsy = true;
    });

    // Шанс успеха на основе суммарной статы (командный бонус)
    let chance = 0.5 + (totalStat - quest.difficulty) * 0.05;

    // Бонусы предпочтений от каждого монстра
    monsters.forEach(function (m) {
      if (m.preference === 'любит_риск' && quest.difficulty >= 6) chance += 0.05;
      if (m.preference === 'только_лёгкие_задания' && quest.difficulty <= 4) chance += 0.05;
    });

    chance = Utils.clamp(chance, 0.05, 0.95);

    const armor = totalInjuryMod + (hasClumsy ? 0.2 : 0);

    let type, gold = 0, injury = false;
    if (Math.random() < chance) {
      // Оверкилл шанс основан на среднем превышении сложности
      const avgMargin = totalStat / monsters.length - quest.difficulty;
      let p = 0.08 + Math.max(0, avgMargin) * 0.015;
      monsters.forEach(function (m) {
        if (m.traits[0] === 'удачливый') p += 0.05;
      });
      p = Utils.clamp(p, 0.05, 0.30);

      if (Utils.chance(p)) {
        type = 'overkill';
        gold = Math.floor(quest.reward * 1.5);
        injury = Utils.chance(Utils.clamp(0.3 + armor, 0.02, 0.8));
      } else if (Utils.chance(0.18)) {
        type = 'partial';
        gold = Math.round(quest.reward * 0.5);
      } else {
        type = 'success';
        gold = quest.reward;
      }
    } else {
      const r = Math.random();
      const injuryP = Utils.clamp(0.2 + armor, 0.02, 0.5);
      if (r < 0.7) type = 'fail';
      else if (r < 0.7 + injuryP) { type = 'injury'; injury = true; }
      else if (r < 0.7 + injuryP + 0.1) {
        // Неуловимый у любого монстра спасает от исчезновения
        if (monsters.some(function (m) { return m.traits[0] === 'неуловимый'; })) {
          type = 'injury'; injury = true;
        } else type = 'lost';
      } else type = 'fail';
    }

    // Честность отчёта — от самого умного монстра в группе
    const bestIntMonster = monsters.reduce(function (best, m) {
      return effectiveIntel(m) > effectiveIntel(best) ? m : best;
    }, monsters[0]);

    const honest = honestyChance(bestIntMonster, agency);
    let reportKey, lied = false;

    if (type === 'overkill') {
      reportKey = overkillReportKey(quest.type);
    } else if (type === 'injury') {
      reportKey = 'injury';
    } else if (type === 'lost') {
      reportKey = 'lost';
    } else {
      const truthful = Utils.chance(honest);
      lied = !truthful;
      if (type === 'success') reportKey = truthful ? 'success_honest' : 'success_lie';
      else if (type === 'partial') reportKey = truthful ? 'partial_honest' : 'partial_lie';
      else reportKey = truthful ? 'fail_honest' : 'fail_lie';
    }

    return {
      type: type,
      gold: gold,
      injury: injury,
      reportText: Utils.pick(Content.REPORTS[reportKey]),
      reportKey: reportKey,
      lied: lied,
      honesty: honest,
      int: effectiveIntel(bestIntMonster),
      monsterId: bestIntMonster.id,
      monsterName: bestIntMonster.name,
      speciesKey: bestIntMonster.speciesKey,
      speciesLabel: bestIntMonster.speciesLabel,
      questId: quest.id,
      questTitle: quest.title,
      participants: monsters.map(function (m) { return m.id; })
    };
  }

  // «Перестарался» — не любой успех, а заметное превышение сложности.
  // Отдельный бросок: формула «roll >= difficulty * 1.5» давала overkill
  // почти на каждом успехе.
  function overkillChance(monster, quest, agency) {
    const statKey = QUEST_STATS[quest.type] || 'str';
    const margin = effectiveStat(monster, quest, agency) - quest.difficulty;
    let p = 0.08 + Math.max(0, margin) * 0.015;
    if (monster.traits[0] === 'удачливый') p += 0.10;
    return Utils.clamp(p, 0.05, 0.30);
  }

  function calculateResult(monster, quest, agency) {
    const chance = successChance(monster, quest, agency);
    const armor = equipmentInjuryMod(monster) + (monster.traits[0] === 'неуклюжий' ? 0.2 : 0);

    let type, gold = 0, injury = false;
    if (Math.random() < chance) {
      if (Utils.chance(overkillChance(monster, quest, agency))) {
        type = 'overkill';
        gold = Math.floor(quest.reward * 1.5);
        injury = Utils.chance(Utils.clamp(0.3 + armor, 0.02, 0.8));
      } else if (Utils.chance(0.18)) {
        type = 'partial';
        gold = Math.round(quest.reward * 0.5);
      } else {
        type = 'success';
        gold = quest.reward;
      }
    } else {
      const r = Math.random();
      const injuryP = Utils.clamp(0.2 + armor, 0.02, 0.5);
      if (r < 0.7) type = 'fail';
      else if (r < 0.7 + injuryP) { type = 'injury'; injury = true; }
      else if (r < 0.7 + injuryP + 0.1) {
        if (monster.traits[0] === 'неуловимый') { type = 'injury'; injury = true; }
        else type = 'lost';
      }
      else type = 'fail';
    }

    const honest = honestyChance(monster, agency);
    let reportKey, lied = false;

    if (type === 'overkill') {
      reportKey = overkillReportKey(quest.type);
    } else if (type === 'injury') {
      reportKey = 'injury';
    } else if (type === 'lost') {
      reportKey = 'lost';
    } else {
      const truthful = Utils.chance(honest);
      lied = !truthful;
      if (type === 'success') reportKey = truthful ? 'success_honest' : 'success_lie';
      else if (type === 'partial') reportKey = truthful ? 'partial_honest' : 'partial_lie';
      else reportKey = truthful ? 'fail_honest' : 'fail_lie';
    }

    return {
      type: type,
      gold: gold,
      injury: injury,
      reportText: Utils.pick(Content.REPORTS[reportKey]),
      reportKey: reportKey,
      lied: lied,
      honesty: honest,
      int: effectiveIntel(monster),
      monsterId: monster.id,
      monsterName: monster.name,
      speciesKey: monster.speciesKey,
      speciesLabel: monster.speciesLabel,
      questId: quest.id,
      questTitle: quest.title
    };
  }

  function applyMissionResult(agency, r) {
    agency.gold += r.gold;
    agency.stats.goldEarned += r.gold;
    agency.dayStats.goldEarned += r.gold;

    agency.quests = agency.quests.filter(function (q) { return q.id !== r.questId; });

    if (r.type === 'success' || r.type === 'overkill' || r.type === 'partial') {
      agency.stats.questsDone++;
      agency.dayStats.questsDone++;
    }
    if (r.type === 'overkill') {
      // +5% угрозы за перестарательство (docs/balance.md §3).
      agency.stats.overkills++;
      agency.threat = Utils.clamp(agency.threat + 0.03, 0, 1);
    }

    // Все участники группы получают статус после задания
    (r.participants || [r.monsterId]).forEach(function (pid) {
      const m = agency.monsters.find(function (x) { return x.id === pid; });
      if (!m) return;
      if (r.type === 'lost') {
        agency.monsters = agency.monsters.filter(function (x) { return x.id !== m.id; });
        agency.stats.losses++;
        agency.dayStats.losses++;
      } else {
        m.missions++;
        if (r.type === 'overkill') m.overkillCount++;
        if (r.injury) m.status = 'injured';
        else m.status = 'busy';   // один монстр — одно задание в день
      }
      if (m.temp) {
        m.temp.missions--;
        if (m.temp.missions <= 0) m.temp = null;
      }
    });

    const record = {
      monsterName: r.monsterName,
      questTitle: r.questTitle,
      type: r.type,
      gold: r.gold
    };
    agency.dayStats.missions.push(record);
    agency.stats.missions.push(record);
  }

  function nextDay(agency) {
    agency.day++;
    agency.monsters.forEach(function (m) {
      if (m.status === 'injured' || m.status === 'busy') m.status = 'idle';
    });
    advanceThreat(agency);
    agency.interviewsLeft = 3;
    agency.dayStats = freshDayStats();
    generateQuests(agency);
    agency.candidates = generateCandidates(agency);
  }

  function isThreatDefeat(agency) {
    return agency.threat >= 1;
  }

  // ── Тендер ───────────────────────────────────────────────────────────────
  function preferenceMatchesTask(monster, quest) {
    const pref = monster.preference;
    if (pref === 'любит_риск') return quest.difficulty >= 6;
    if (pref === 'только_лёгкие_задания') return quest.difficulty <= 4;
    if (pref === 'только_подземелья') return UNDERGROUND.indexOf(quest.type) !== -1;
    if (pref === 'не_лезть_в_пещеры') return UNDERGROUND.indexOf(quest.type) === -1;
    return true;
  }

  function evaluateScore(monster, quest, agency) {
    const base = effectiveStat(monster, quest, agency) - quest.difficulty;
    const int = effectiveIntel(monster);
    const honesty = int >= 14 ? 10 : (int >= 8 ? 5 : -5);
    const pref = preferenceMatchesTask(monster, quest) ? 5 : -5;
    const randomFactor = Utils.randInt(-5, 5);
    return base + honesty + pref + randomFactor;
  }

  function createTender(agency) {
    const aiRoster = [];
    for (let i = 0; i < 3; i++) {
      const m = createMonster();
      m.stats.int = Utils.clamp(12 + Utils.randInt(0, 6), 1, 20);
      m.stats.str = Utils.clamp(8 + Utils.randInt(0, 8), 1, 20);
      m.name = Utils.pick(Content.MONSTER_NAMES[m.speciesKey]);
      aiRoster.push(m);
    }
    const quest = makeQuest(Content.TENDER_QUEST);
    // ИИ-герой берёт монстра с максимальным интеллектом (docs/balance.md §8).
    const aiChampion = aiRoster.slice().sort(function (a, b) { return b.stats.int - a.stats.int; })[0];

    return {
      quest: quest,
      aiName: 'Герой-Директор',
      aiAgency: 'Гильдия Света',
      aiRoster: aiRoster,
      aiChampion: aiChampion,
      playerChampionId: agency.monsters.length ? agency.monsters[0].id : null,
      resolved: false,
      result: null
    };
  }

  function resolveTender(agency, tender) {
    const player = agency.monsters.find(function (m) { return m.id === tender.playerChampionId; }) || agency.monsters[0];
    const quest = tender.quest;
    const playerScore = evaluateScore(player, quest, agency);
    // У гильдии свои улучшения — они не должны расти от покупок игрока.
    const aiAgency = { threat: 0.5, upgrades: { forge: 3, intel: 1, lie_school: 0, stables: 0 } };
    const aiScore = evaluateScore(tender.aiChampion, quest, aiAgency) + 3;
    const win = playerScore > aiScore;

    function reportFor(monster, score) {
      const honest = honestyChance(monster, agency);
      const truthful = Utils.chance(honest);
      let key;
      if (score > 0) key = truthful ? 'success_honest' : 'success_lie';
      else key = truthful ? 'fail_honest' : 'fail_lie';
      return { text: Utils.pick(Content.REPORTS[key]), lied: !truthful };
    }

    return {
      win: win,
      playerScore: playerScore,
      aiScore: aiScore,
      player: {
        name: player.name,
        species: player.speciesLabel,
        int: player.stats.int,
        report: reportFor(player, playerScore)
      },
      ai: {
        name: tender.aiChampion.name,
        species: tender.aiChampion.speciesLabel,
        int: tender.aiChampion.stats.int,
        report: reportFor(tender.aiChampion, aiScore)
      }
    };
  }

  return {
    SPECIES,
    UPGRADES_CONFIG,
    UPGRADE_ORDER,
    ITEMS,
    QUEST_STATS,
    rosterCap,
    riskLabel,
    threatStage,
    threatLabel,
    interceptChance,
    advanceThreat,
    isThreatDefeat,
    createMonster,
    createAgency,
    generateQuests,
    generateCandidates,
    tryHire,
    buyUpgrade,
    hireUndead,
    fireMonster,
    getItem,
    itemBonus,
    equipmentInjuryMod,
    equipItem,
    unequipItem,
    useItem,
    buyItem,
    successChance,
    honestyChance,
    overkillChance,
    groupSuccessChance,
    effectiveStat,
    effectiveIntel,
    calculateResult,
    calculateGroupResult,
    applyMissionResult,
    nextDay,
    evaluateScore,
    preferenceMatchesTask,
    createTender,
    resolveTender
  };
})();
