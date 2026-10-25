// Экраны, ввод и связка «модель ↔ рендер».
// Композиция: доска монстров сверху, динамическая пергаментная область,
// деревянная навигация снизу. Все кликабельные зоны регистрируются в hitAreas.
(function () {
  'use strict';

  const W = 1280;
  const H = 720;
  const T = Renderer.THEME;
  const SAVE_KEY = 'feis_last_human_v1';

  // ── Сетка трёх зон ───────────────────────────────────────────────────────
  const TOP_FULL = 130;
  const TOP_MINI = 34;
  const NAV_Y = 650, NAV_H = 52;
  const DAY_Y = 600, DAY_H = 44;
  const SLOTS = 6;

  const QUEST_ART = {
    farm: 'quest_farm', village: 'quest_farm', forest: 'quest_farm',
    caravan: 'quest_caravan', warehouse: 'quest_caravan', bazar: 'quest_caravan',
    cave: 'quest_cave', sewer: 'quest_cave',
    ruins: 'quest_ruins',
    citadel: 'quest_citadel', tower: 'quest_citadel', city: 'quest_citadel', ritual: 'quest_citadel'
  };

  const STAGE_INK = { 1: '#3f6b2a', 2: '#8a6d1a', 3: '#8a4a12', 4: '#7a1f1f' };
  const STAGE_LIGHT = { 1: '#4ade80', 2: '#e0c46a', 3: '#e0904a', 4: '#e06060' };

  const MISSION_LABELS = {
    success: { text: 'Успех', color: '#3f6b2a' },
    partial: { text: 'Частично', color: '#8a6d1a' },
    overkill: { text: 'Оверкилл!', color: '#8a4a12' },
    fail: { text: 'Провал', color: '#7a1f1f' },
    injury: { text: 'Травма', color: '#7a1f1f' },
    lost: { text: 'Исчез', color: '#7a1f1f' }
  };

  const STATUS_LABELS = {
    idle: { text: 'СВОБОДЕН', color: '#3f6b2a' },
    busy: { text: 'ОТДЫХАЕТ', color: '#6b5a45' },
    injured: { text: 'РАНЕН', color: '#7a1f1f' }
  };

  const SLOT_LABELS = { weapon: 'ОРУЖИЕ', armor: 'БРОНЯ', amulet: 'АМУЛЕТ' };

  const TRANSITION_MAP = {
    'menu->intro': { type: 'fade', dur: 300 },
    'intro->agency': { type: 'fade', dur: 400 },
    'menu->agency': { type: 'fade', dur: 300 },
    'agency->monster': { type: 'scale', dur: 150 },
    'monster->agency': { type: 'scale', dur: 150 },
    'agency->mission': { type: 'slide', dur: 300 },
    'mission->report': { type: 'fade', dur: 250 },
    'report->agency': { type: 'fade', dur: 250 },
    'agency->endday': { type: 'fade', dur: 250 },
    'endday->agency': { type: 'fade', dur: 250 },
    'endday->tender': { type: 'fade', dur: 400 },
    'tender->victory': { type: 'fade', dur: 500 },
    'tender->defeat': { type: 'fade', dur: 500 },
    'agency->help': { type: 'fade', dur: 150 },
    'help->agency': { type: 'fade', dur: 150 },
    'menu->help': { type: 'fade', dur: 150 },
    'help->menu': { type: 'fade', dur: 150 },
    'agency->pause': { type: 'fade', dur: 150 },
    'pause->agency': { type: 'fade', dur: 150 },
    'pause->menu': { type: 'fade', dur: 300 },
    'victory->menu': { type: 'fade', dur: 300 },
    'defeat->menu': { type: 'fade', dur: 300 }
  };

  // ── Состояние UI ─────────────────────────────────────────────────────────
  let currentTab = 'hire';
  let selectedQuestId = null;
  let selectedMonsterId = null;
  let selectedMonsterViewId = null;
  let toast = { msg: '', t: 0 };
  let tender = null;
  let outcome = null;
  let time = 0;
  let hitAreas = [];
  let transition = null;
  let helpFrom = 'menu';
  let missionTimer = 0;
  let reportTime = 0;
  let keysPrev = {};
  let saveAvailable = false;
  let introTime = 0;
  let panelAnim = 0;       // 0 — доска развёрнута, 1 — свернута
  let panelTarget = 0;

  // ── Утилиты ──────────────────────────────────────────────────────────────
  function inRect(p, x, y, w, h) { return p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h; }
  function hoverRect(x, y, w, h) { return inRect(Input.mouse, x, y, w, h); }
  function addArea(x, y, w, h, onClick) { hitAreas.push({ x, y, w, h, onClick }); }
  function showToast(msg) { toast.msg = msg; toast.t = 3.6; }

  function pressed(code) {
    const now = Input.isKeyPressed(code);
    const was = !!keysPrev[code];
    keysPrev[code] = now;
    return now && !was;
  }

  function easeInOut(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }

  function panelHeight() {
    const e = easeInOut(Math.max(0, Math.min(1, panelAnim)));
    return TOP_FULL - (TOP_FULL - TOP_MINI) * e;
  }

  function centralRect() {
    const top = panelHeight() + 6;
    return { x: 18, y: top, w: W - 36, h: H - top - 200 - 14 };
  }

  function innerRect(c) { return { x: c.x + 12, y: c.y + 8, w: c.w - 24, h: c.h - 16 }; }

  // ── Кнопки ───────────────────────────────────────────────────────────────
  function button(x, y, w, h, label, onClick, opts) {
    opts = opts || {};
    const disabled = !!opts.disabled;
    const variant = opts.variant || 'primary';
    const font = opts.font || 'bold 12px Georgia';
    const hovered = !disabled && hoverRect(x, y, w, h);

    if (disabled) {
      Renderer.wood(x, y, w, h, { grain: 0.3, nails: false });
      Renderer.rect(x, y, w, h, 'rgba(10,7,4,0.55)');
      Renderer.text(label, x + w / 2, y + h / 2 + 4, { color: '#7b6a52', align: 'center', font });
    } else {
      if (variant === 'ghost') Renderer.wood(x, y, w, h, { grain: 0.6 });
      else Renderer.metal(x, y, w, h);

      if (hovered) {
        Renderer.roundRectStroke(x, y, w, h, 3, 'rgba(245,197,66,0.9)', 2);
        Renderer.rect(x, y, w, h, 'rgba(255,220,140,0.08)');
      }
      const color = variant === 'danger' ? '#f0b4a0'
        : variant === 'success' ? '#dff0c8'
          : variant === 'hero' ? '#e6c9ff'
            : '#f3e0b0';
      Renderer.text(label, x + w / 2, y + h / 2 + 4, { color, align: 'center', font });
    }

    if (disabled) {
      if (opts.reason) addArea(x, y, w, h, function () { showToast(opts.reason); });
    } else {
      addArea(x, y, w, h, function () { Audio.playSfx('click'); onClick(); });
    }
  }

  // Пергаментная карточка (центральная область и финал)
  function noteCard(x, y, w, h, opts) {
    opts = opts || {};
    const disabled = !!opts.disabled;
    const selected = !!opts.selected;
    const hovered = !disabled && hoverRect(x, y, w, h);

    if (opts.shadow) Renderer.rect(x + 2, y + 3, w, h, 'rgba(0,0,0,0.35)');
    Renderer.note(x, y, w, h, { pin: opts.pin !== false });

    if (selected) Renderer.roundRectStroke(x, y, w, h, 4, '#a8862a', 2.5);
    else if (hovered) Renderer.roundRectStroke(x, y, w, h, 4, 'rgba(168,134,42,0.85)', 1.8);
    else Renderer.roundRectStroke(x, y, w, h, 4, 'rgba(70,46,20,0.55)', 1);

    if (disabled) Renderer.rect(x, y, w, h, 'rgba(30,20,10,0.38)');

    if (opts.onClick && !disabled) {
      addArea(x, y, w, h, function () { Audio.playSfx('select'); opts.onClick(); });
    } else if (opts.onClick && disabled) {
      addArea(x, y, w, h, function () { showToast(opts.reason || 'Недоступно'); });
    }
  }

  // ── Панель монстров (верхняя зона) ───────────────────────────────────────
  function drawTopPanel(a) {
    const topH = panelHeight();
    const ctx = Renderer.ctx;

    Renderer.wood(0, 0, W, topH, { r: 0, plank: 26, nails: false });
    Renderer.metal(0, topH - 3, W, 3, { rivets: false });

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, topH);
    ctx.clip();

    // Шапка: ресурсы всегда видны
    Renderer.gradientRect(0, 0, W, 24, 'rgba(12,8,5,0.92)', 'rgba(12,8,5,0.72)');
    Renderer.text('ГИЛЬДИЯ', 24, 16, { color: '#d8b96a', font: 'bold 11px Georgia' });
    Renderer.text('ДЕНЬ ' + a.day + '/' + a.maxDays, 140, 16,
      { color: '#e7d7ae', font: 'bold 10px Georgia' });
    Renderer.text(a.gold + ' зол.', 280, 16, { color: '#e7c765', font: 'bold 10px Georgia' });

    const stage = Models.threatStage(a.threat);
    Renderer.text('УГРОЗА ' + Math.round(a.threat * 100) + '%', 440, 16,
      { color: STAGE_LIGHT[stage], font: 'bold 10px Georgia' });
    Renderer.roundRect(560, 10, 140, 6, 3, 'rgba(0,0,0,0.5)');
    Renderer.roundRect(560, 10, Math.max(4, 140 * Math.min(1, a.threat)), 6, 3, STAGE_LIGHT[stage]);

    Renderer.text('ШТАТ ' + a.monsters.length + '/' + Models.rosterCap(a), 740, 16,
      { color: '#cbb98f', font: 'bold 10px Georgia' });
    Renderer.text('СОБЕС. ' + a.interviewsLeft + '/3', 880, 16,
      { color: a.interviewsLeft > 0 ? '#cbb98f' : '#d08a7a', font: 'bold 10px Georgia' });
    Renderer.text('ЗАКАЗЫ ' + a.quests.filter(function (q) { return !q.intercepted; }).length, 1020, 16,
      { color: '#cbb98f', font: 'bold 10px Georgia' });

    if (topH > 40) {
      for (let i = 0; i < SLOTS; i++) drawSlot(a, i, topH);
    }
    ctx.restore();

    // Цепь-ручка
    Renderer.chain(W - 20, 4, Math.max(12, topH - 18));
    Renderer.text(panelTarget ? '▼' : '▲', W - 20, topH - 4,
      { color: 'rgba(230,210,170,0.8)', align: 'center', font: 'bold 9px system-ui' });
    addArea(W - 42, 0, 42, Math.max(TOP_MINI, topH), function () {
      panelTarget = panelTarget ? 0 : 1;
      Audio.playSfx('pick');
      showToast(panelTarget ? 'Доска свёрнута' : 'Доска развёрнута');
    });
  }

  function drawSlot(a, i, topH) {
    const slotSpacing = 200;
    const startX = 24;
    const x = startX + i * slotSpacing;
    const frame = { x: x + 40, y: 28, w: 64, h: 64 };
    const m = a.monsters[i];
    const capped = i < Models.rosterCap(a);
    const hovered = hoverRect(x + 14, 24, 110, 100);

    if (m) {
      Renderer.note(frame.x - 2, frame.y - 2, frame.w + 4, frame.h + 4, { pin: false });
      Renderer.drawMonsterIcon('mon_' + m.speciesKey, frame.x + 2, frame.y + 2, frame.w - 4);
      const st = STATUS_LABELS[m.status] || STATUS_LABELS.injured;
      Renderer.roundRect(frame.x + frame.w - 10, frame.y + frame.h - 10, 10, 10, 5, st.color);
      Renderer.roundRectStroke(frame.x + frame.w - 10, frame.y + frame.h - 10, 10, 10, 5, 'rgba(30,18,8,0.85)', 1);

      Renderer.ink(m.name, x + 90, 110, { align: 'center', font: 'bold 11px Georgia' });
      Renderer.text(st.text, x + 90, 124, { color: st.color, align: 'center', font: 'bold 8px system-ui' });

      if (hovered) Renderer.roundRectStroke(frame.x - 2, frame.y - 2, frame.w + 4, frame.h + 4, 3, '#e8c76a', 2);

      addArea(x + 14, 24, 110, 102, function () {
        selectedMonsterViewId = m.id;
        setState('monster');
      });
      return;
    }

    if (!capped) {
      Renderer.roundRect(frame.x - 2, frame.y - 2, frame.w + 4, frame.h + 4, 3, 'rgba(10,7,4,0.55)');
      Renderer.roundRectStroke(frame.x - 2, frame.y - 2, frame.w + 4, frame.h + 4, 3, 'rgba(90,70,45,0.5)', 1);
      Renderer.lockIcon(frame.x + frame.w / 2, frame.y + frame.h / 2, 32, '#6b5a45');
      Renderer.text('закрыто', x + 90, 110, { color: '#8a7355', align: 'center', font: 'bold 9px Georgia' });
      if (hovered) {
        Renderer.roundRectStroke(frame.x - 2, frame.y - 2, frame.w + 4, frame.h + 4, 3, 'rgba(168,134,42,0.55)', 1.5);
        showTip(x + 90, 124, 'Улучшите стойла');
      }
      return;
    }

    Renderer.roundRectStroke(frame.x, frame.y, frame.w, frame.h, 3, 'rgba(220,200,160,0.35)', 1.5);
    Renderer.text('+', frame.x + frame.w / 2, frame.y + frame.h / 2 + 7,
      { color: 'rgba(240,225,190,0.5)', align: 'center', font: 'bold 24px Georgia' });
    Renderer.text('пусто', x + 90, 110, { color: '#8a7355', align: 'center', font: 'bold 9px Georgia' });

    addArea(x + 14, 24, 110, 102, function () {
      currentTab = 'hire';
      showToast('Выберите кандидата в разделе «Найм»');
    });
  }

  function showTip(cx, y, text) {
    Renderer.text(text, cx, y, { color: 'rgba(240,220,180,0.85)', align: 'center', font: '8px system-ui' });
  }

  // ── Динамическая зона ────────────────────────────────────────────────────
  function drawCentral(a) {
    const c = centralRect();
    const r = innerRect(c);

    Renderer.paper(c.x, c.y, c.w, c.h, { r: 5, burn: 14 });
    Renderer.corners(c.x + 5, c.y + 5, c.w - 10, c.h - 10, 'rgba(120,80,30,0.35)');

    if (currentTab === 'hire') drawHireTab(a, r);
    else if (currentTab === 'quests') drawQuestsTab(a, r);
    else if (currentTab === 'shop') drawShopTab(a, r);
    else drawItemsTab(a, r);
  }

  function tabHeader(r, title, right) {
    Renderer.ink(title, r.x, r.y + 14, { font: 'bold 13px Georgia' });
    Renderer.rect(r.x, r.y + 20, r.w, 1, 'rgba(90,60,25,0.35)');
    if (right) Renderer.text(right, r.x + r.w, r.y + 13, { color: T.inkSoft, align: 'right', font: 'bold 8px Georgia' });
  }

  // ── Вкладка «Найм» ───────────────────────────────────────────────────────
  function drawHireTab(a, r) {
    tabHeader(r, 'НАЙМ В ОТРЯД',
      'собеседований ' + a.interviewsLeft + '/3 · штат ' + a.monsters.length + '/' + Models.rosterCap(a));

    if (!a.candidates.length) {
      Renderer.ink('Кандидаты на сегодня закончились.', r.x + r.w / 2, r.y + r.h / 2,
        { align: 'center', font: '16px Georgia' });
      Renderer.text('Новые придут завтра.', r.x + r.w / 2, r.y + r.h / 2 + 24,
        { color: T.inkSoft, align: 'center', font: '12px Georgia' });
      return;
    }

    const gap = 20;
    const cw = Math.floor((r.w - gap * 2) / 3);
    const ch = Math.min(r.h - 40, 320);
    const y0 = r.y + 34 + Math.max(0, (r.h - 40 - ch) / 2);

    a.candidates.forEach(function (cand, i) {
      const x = r.x + i * (cw + gap);
      const y = y0;
      const full = a.monsters.length >= Models.rosterCap(a);
      const canHire = a.interviewsLeft > 0 && !full;

      noteCard(x, y, cw, ch, { shadow: true });

      Renderer.note(x + cw / 2 - 45, y + 12, 90, 90, { pin: false });
      Renderer.drawMonsterIcon('mon_' + cand.speciesKey, x + cw / 2 - 42, y + 15, 84);

      Renderer.ink(cand.name, x + cw / 2, y + 120, { align: 'center', font: 'bold 16px Georgia' });
      Renderer.text('[' + cand.speciesLabel + ']', x + cw / 2, y + 138,
        { color: T.inkSoft, align: 'center', font: '11px Georgia' });
      Renderer.text('Черта: ' + cand.traits[0], x + cw / 2, y + 156,
        { color: '#6b4a18', align: 'center', font: 'italic 11px Georgia' });

      Renderer.text('Стоимость найма: ' + cand.cost + ' зол.', x + cw / 2, y + 174,
        { color: T.inkSoft, align: 'center', font: 'bold 11px Georgia' });

      const stats = [['СИЛА', cand.stats.str], ['ЛОВ', cand.stats.agi], ['ИНТ', cand.stats.int], ['УДА', cand.stats.luck]];
      stats.forEach(function (s, j) {
        const sx = x + 16 + (j % 2) * (cw / 2 - 8);
        const sy = y + 196 + Math.floor(j / 2) * 26;
        Renderer.text(s[0], sx, sy, { color: T.inkSoft, font: '10px system-ui' });
        Renderer.ink(String(s[1]), sx + cw / 2 - 30, sy, { align: 'right', font: 'bold 16px Georgia' });
      });

      Renderer.rect(x + 14, y + ch - 84, cw - 28, 1, 'rgba(90,60,25,0.3)');
      Renderer.text('Найм: 1 собеседование + ' + cand.cost + ' зол.', x + cw / 2, y + ch - 66,
        { color: T.inkSoft, align: 'center', font: '10px Georgia' });

      button(x + 16, y + ch - 56, cw - 32, 32, full ? 'СТОЙЛА ПОЛНЫ' : 'НАНЯТЬ', function () {
        hireCandidate(cand);
      }, {
        variant: 'ghost',
        font: 'bold 12px Georgia',
        disabled: !canHire,
        reason: full ? 'Стойла переполнены' : 'Собеседования закончились'
      });
    });
  }

  function hireCandidate(cand) {
    const a = Game.agency;
    const idx = a.candidates.findIndex(function (c) { return c.id === cand.id; });
    if (idx === -1) return;

    const res = Models.tryHire(cand, a);
    if (!res.consumed) { showToast(res.reason); Audio.playSfx('reject'); return; }

    a.candidates.splice(idx, 1);
    if (res.success) {
      a.monsters.push(cand);
      Audio.playSfx('hire');
      showToast(cand.name + ' принят в отряд за ' + cand.cost + ' зол.');
    } else {
      Audio.playSfx('reject');
      showToast('Отказ: ' + res.reason);
    }
  }

  // ── Вкладка «Заказы» ─────────────────────────────────────────────────────
  function drawQuestsTab(a, r) {
    tabHeader(r, 'ДОСКА ЗАКАЗОВ', 'перехват ' + Math.round(Models.interceptChance(a) * 100) + '%');

    const cw = 380, chh = 72, gapY = 8;
    a.quests.forEach(function (q, i) {
      const col = i % 2, row = Math.floor(i / 2);
      const x = r.x + col * (cw + 16);
      const y = r.y + 28 + row * (chh + gapY);
      drawQuestNote(a, q, x, y, cw, chh);
    });

    const quest = a.quests.find(function (q) { return q.id === selectedQuestId; });
    const panelY = r.y + 28 + 2 * (chh + gapY) + 6;

    Renderer.rect(r.x, panelY - 4, r.w, 1, 'rgba(90,60,25,0.3)');
    Renderer.ink(quest ? 'Отправляем на задание' : 'Кого отправим?', r.x, panelY + 14,
      { font: 'bold 11px Georgia' });
    Renderer.text(quest ? quest.title : 'Выберите заказ выше', r.x + r.w, panelY + 14,
      { color: T.inkSoft, align: 'right', font: '9px Georgia' });

    const chipY = panelY + 22;
    const chipW = 110, chipH = 42;
    a.monsters.forEach(function (m, i) {
      const x = r.x + i * (chipW + 8);
      if (x + chipW > r.x + r.w - 220) return;
      const disabled = m.status !== 'idle';
      const selected = selectedMonsterId === m.id;
      noteCard(x, chipY, chipW, chipH, {
        disabled: disabled,
        selected: selected,
        pin: false,
        onClick: function () { selectedMonsterId = m.id; },
        reason: m.status === 'injured' ? 'Монстр ранен' : 'Монстр отдыхает до завтра'
      });
      Renderer.drawMonsterIcon('mon_' + m.speciesKey, x + 6, chipY + 7, 28);
      Renderer.ink(m.name, x + 38, chipY + 18, { font: 'bold 9px Georgia' });
      Renderer.text(disabled ? (m.status === 'injured' ? 'ранен' : 'отдыхает')
        : ('ИНТ ' + m.stats.int + ' · СИЛ ' + m.stats.str), x + 38, chipY + 32,
        { color: disabled ? '#7a1f1f' : T.inkSoft, font: '8px system-ui' });
    });

    button(r.x + r.w - 220, chipY, 220, 42, 'ОТПРАВИТЬ НА ЗАДАНИЕ', sendMission, {
      variant: 'ghost',
      font: 'bold 11px Georgia',
      disabled: !quest || !selectedMonsterId,
      reason: !quest ? 'Сначала выберите заказ' : 'Выберите свободного монстра'
    });
  }

  function drawQuestNote(a, q, x, y, w, h) {
    if (q.intercepted) {
      Renderer.note(x, y, w, h, { pin: true });
      Renderer.rect(x, y, w, h, 'rgba(30,22,14,0.45)');
      Renderer.drawIcon('ui_intercepted', x + 6, y + h / 2 - 15, 30, 30, { label: 'X', color: '#3a2a1a' });
      Renderer.text(q.title, x + 44, y + 22, { color: '#5d4a33', font: 'italic 10px Georgia' });
      Renderer.text('ПЕРЕХВАЧЕНО КОНКУРЕНТАМИ', x + 44, y + 40,
        { color: '#7a1f1f', font: 'bold 8px Georgia' });
      return;
    }

    noteCard(x, y, w, h, {
      selected: selectedQuestId === q.id,
      shadow: true,
      onClick: function () { selectedQuestId = q.id; selectedMonsterId = null; }
    });

    const art = QUEST_ART[q.type];
    if (art) Renderer.drawIcon(art, x + 6, y + 8, 40, 40, { label: q.type, color: '#3a2a1a' });
    else {
      Renderer.roundRect(x + 6, y + 8, 40, 40, 3, 'rgba(90,60,25,0.2)');
      Renderer.ink(q.type.substring(0, 2).toUpperCase(), x + 26, y + 34,
        { align: 'center', font: 'bold 11px Georgia' });
    }

    Renderer.ink(q.title, x + 54, y + 22, { font: 'bold 10px Georgia' });
    Renderer.text('Сложность ' + q.difficulty + ' · ' + q.risk, x + 54, y + 36,
      { color: T.inkSoft, font: '8px system-ui' });
    Renderer.ink(q.reward + ' зол.', x + w - 10, y + 22, { align: 'right', font: 'bold 12px Georgia' });

    if (q.species.length) {
      Renderer.text('Рекомендуется: ' + q.species.map(function (s) { return Models.SPECIES[s].label; }).join('/') +
        ' (+2 к статам)', x + 54, y + 49, { color: '#6b4a18', font: 'italic 8px Georgia' });
    }
  }

  function sendMission() {
    const a = Game.agency;
    const quest = a.quests.find(function (q) { return q.id === selectedQuestId; });
    const monster = a.monsters.find(function (m) { return m.id === selectedMonsterId; });
    if (!quest || !monster || quest.intercepted || monster.status !== 'idle') {
      showToast('Нужен свободный монстр и не перехваченный заказ');
      return;
    }
    a.lastResult = Models.calculateResult(monster, quest, a);
    Audio.playSfx('depart');
    setState('mission');
  }

  // ── Вкладка «Магазин» ────────────────────────────────────────────────────
  function drawShopTab(a, r) {
    tabHeader(r, 'МАГАЗИН ГИЛЬДИИ', a.gold + ' золота');

    const keys = Models.UPGRADE_ORDER;
    const cw = 380, ch = 68, gapX = 16, gapY = 8;
    const compact = r.h < 320;

    keys.forEach(function (key, i) {
      const col = i % 2, row = Math.floor(i / 2);
      const x = r.x + col * (cw + gapX);
      const y = r.y + 28 + row * (ch + gapY) - (compact ? 6 : 0);
      const conf = Models.UPGRADES_CONFIG[key];
      const lvl = a.upgrades[key];
      const maxed = lvl >= conf.maxLevel;
      const cost = conf.baseCost * (lvl + 1);
      const affordable = a.gold >= cost;

      noteCard(x, y, cw, ch, {
        disabled: maxed,
        onClick: maxed ? null : function () { buyUpgrade(key); },
        reason: 'Максимальный уровень'
      });

      Renderer.ink(conf.name, x + 14, y + 20, { font: 'bold 12px Georgia' });
      Renderer.text(conf.desc, x + 14, y + 36, { color: T.inkSoft, font: '9px system-ui' });

      for (let j = 0; j < conf.maxLevel; j++) {
        Renderer.roundRect(x + 14 + j * 12, y + 48, 9, 7, 2,
          j < lvl ? '#8a6d1a' : 'rgba(90,60,25,0.25)');
      }

      if (maxed) {
        Renderer.text('МАКС', x + cw - 14, y + 28, { color: '#3f6b2a', align: 'right', font: 'bold 11px Georgia' });
      } else {
        Renderer.ink(cost + ' зол.', x + cw - 14, y + 28,
          { align: 'right', font: 'bold 11px Georgia', color: affordable ? '#2a1c10' : '#7a1f1f' });
        Renderer.text(affordable ? 'КУПИТЬ' : 'НЕТ ЗОЛОТА', x + cw - 14, y + 44,
          { color: affordable ? T.inkSoft : '#7a1f1f', align: 'right', font: 'bold 8px Georgia' });
      }
    });

    const y2 = r.y + 28 + 4 * (ch + gapY) - (compact ? 6 : 0);
    if (y2 + 56 <= r.y + r.h) {
      const full = a.monsters.length >= Models.rosterCap(a);
      const canUndead = a.gold >= 150 && !full;
      noteCard(r.x, y2, r.w, 54, {
        disabled: !canUndead,
        onClick: canUndead ? hireUndead : null,
        reason: full ? 'Стойла переполнены' : 'Нужно 150 золота'
      });
      Renderer.drawIcon('ui_crypt', r.x + 10, y2 + 8, 40, 40, { label: 'Н', color: '#3a2a1a' });
      Renderer.ink('НАНЯТЬ НЕЖИТЬ', r.x + 64, y2 + 24, { font: 'bold 12px Georgia' });
      Renderer.text('Случайный Скелет или Вампир, без собеседования', r.x + 64, y2 + 40,
        { color: T.inkSoft, font: '9px system-ui' });
      Renderer.ink('150 зол.', r.x + r.w - 14, y2 + 30, { align: 'right', font: 'bold 11px Georgia' });
    }
  }

  function buyUpgrade(key) {
    const res = Models.buyUpgrade(Game.agency, key);
    if (res.success) { Audio.playSfx('upgrade'); showToast('Куплено: ' + Models.UPGRADES_CONFIG[key].name); }
    else { Audio.playSfx('reject'); showToast(res.reason); }
  }

  function hireUndead() {
    const res = Models.hireUndead(Game.agency);
    if (res.success) { Audio.playSfx('hire'); showToast('Нанят: ' + res.monster.name + ' (' + res.monster.speciesLabel + ')'); }
    else { Audio.playSfx('reject'); showToast(res.reason); }
  }

  // ── Вкладка «Амуниция» ───────────────────────────────────────────────────
  function inventoryCount(a, id) { return a.inventory.filter(function (x) { return x === id; }).length; }

  function drawItemsTab(a, r) {
    tabHeader(r, 'АМУНИЦИЯ', 'в сумке: ' + a.inventory.length + ' · ' + a.gold + ' зол.');

    const cw = 250, ch = 62, gapX = 10, gapY = 8;
    Models.ITEMS.forEach(function (item, i) {
      const col = i % 3, row = Math.floor(i / 3);
      const x = r.x + col * (cw + gapX);
      const y = r.y + 28 + row * (ch + gapY);
      const owned = inventoryCount(a, item.id);
      const affordable = a.gold >= item.price;

      noteCard(x, y, cw, ch, { onClick: function () { buyItem(item); } });

      Renderer.ink(item.name, x + 10, y + 18, { font: 'bold 10px Georgia' });
      Renderer.text(item.desc, x + 10, y + 34, { color: T.inkSoft, font: '8px system-ui' });
      Renderer.ink(item.price + ' зол.', x + 10, y + 52,
        { font: 'bold 9px Georgia', color: affordable ? '#2a1c10' : '#7a1f1f' });
      if (owned > 0) {
        Renderer.text('×' + owned, x + cw - 10, y + 18, { color: '#3f6b2a', align: 'right', font: 'bold 11px Georgia' });
      }
    });
  }

  function buyItem(item) {
    const res = Models.buyItem(Game.agency, item.id);
    if (res.success) { Audio.playSfx('upgrade'); showToast('Куплено: ' + item.name); }
    else { Audio.playSfx('reject'); showToast(res.reason); }
  }

  // ── Нижняя панель ────────────────────────────────────────────────────────
  function drawBottom(a) {
    Renderer.note(24, DAY_Y, 260, DAY_H, { pin: false });
    Renderer.ink('ПОДСКАЗКА', 34, DAY_Y + 16, { font: 'bold 10px Georgia' });
    Renderer.text(nextStepHint(a, currentTab), 34, DAY_Y + 34, { color: T.inkSoft, font: '11px Georgia' });

    const lastDay = a.day >= a.maxDays;
    button(W/2 - 220, DAY_Y, 440, DAY_H,
      (lastDay ? 'ФИНАЛЬНЫЙ ТЕНДЕР' : 'ЗАКОНЧИТЬ ДЕНЬ') + ' · ' + a.day + '/' + a.maxDays,
      function () { setState('endday'); }, { font: 'bold 14px Georgia' });

    Renderer.note(W - 284, DAY_Y, 260, DAY_H, { pin: false });
    Renderer.ink('СВОБОДНЫ: ' + a.monsters.filter(function (m) { return m.status === 'idle'; }).length +
      ' · СУМКА: ' + a.inventory.length + ' предм.', W - 274, DAY_Y + 18, { font: 'bold 10px Georgia' });
    Renderer.text('Угроза ' + Models.threatLabel(a.threat) + ' · перехват ' +
      Math.round(Models.interceptChance(a) * 100) + '%', W - 274, DAY_Y + 38,
      { color: T.inkSoft, font: '10px Georgia' });

    const tabs = [
      { id: 'hire', label: 'НАЙМ', badge: a.interviewsLeft + '/3' },
      { id: 'quests', label: 'ЗАКАЗЫ', badge: String(a.quests.filter(function (q) { return !q.intercepted; }).length) },
      { id: 'shop', label: 'МАГАЗИН', badge: '' },
      { id: 'items', label: 'АМУНИЦИЯ', badge: String(a.inventory.length) }
    ];
    const bw = 260, gap = 12;
    const totalTabs = tabs.length * (bw + gap) - gap;
    const tabStartX = (W - totalTabs) / 2;
    tabs.forEach(function (t, i) {
      const x = tabStartX + i * (bw + gap);
      const active = currentTab === t.id;
      const hovered = hoverRect(x, NAV_Y, bw, NAV_H);

      Renderer.wood(x, NAV_Y, bw, NAV_H, { grain: active ? 0.75 : 0.5 });
      if (active) {
        Renderer.rect(x, NAV_Y, bw, NAV_H, 'rgba(255,220,140,0.10)');
        Renderer.roundRectStroke(x, NAV_Y, bw, NAV_H, 3, '#d8b96a', 2);
      } else if (hovered) {
        Renderer.roundRectStroke(x, NAV_Y, bw, NAV_H, 3, 'rgba(216,185,106,0.65)', 1.5);
      }
      Renderer.text(t.label, x + bw / 2, NAV_Y + 32,
        { color: active ? '#f3e0b0' : '#cbb98f', align: 'center', font: 'bold 14px Georgia' });
      if (t.badge) {
        Renderer.text(t.badge, x + bw - 10, NAV_Y + 16,
          { color: active ? '#f3e0b0' : '#8f7f63', align: 'right', font: 'bold 10px Georgia' });
      }

      addArea(x, NAV_Y, bw, NAV_H, function () {
        Audio.playSfx('select');
        currentTab = t.id;
      });
    });
  }

  function nextStepHint(a, tabId) {
    if (tabId === 'hire') {
      if (a.interviewsLeft > 0 && a.monsters.length < Models.rosterCap(a) && a.candidates.length)
        return 'Нанять монстра: собеседование + золото';
      if (a.interviewsLeft <= 0) return 'Собеседования закончились — завершите день';
      return 'Стойла переполнены — наймите нежить в магазине или увольте монстра';
    }
    if (tabId === 'quests') {
      if (a.quests.some(function (q) { return !q.intercepted; })) return 'Выберите заказ и монстра, затем отправьте';
      return 'Все заказы выполнены — завершите день';
    }
    if (tabId === 'shop') {
      if (a.gold >= 150 && a.monsters.length < Models.rosterCap(a)) return 'Купить улучшение или нанять нежить';
      return 'Купить улучшение за золото';
    }
    if (tabId === 'items') {
      if (a.inventory.length) return 'Нажмите предмет в сумке, чтобы надеть или применить';
      return 'Сумка пуста — покупайте экипировку в магазине';
    }
    if (a.interviewsLeft > 0 && a.candidates.length) return 'Наймите монстра';
    if (a.quests.some(function (q) { return !q.intercepted; })) return 'Отправьте на заказ';
    return 'Завершите день';
  }

  // ── Экран агентства ──────────────────────────────────────────────────────
  function drawAgency() {
    const a = Game.agency;
    Renderer.drawImage('bg_agency', 0, 0, W, H);
    Renderer.rect(0, 0, W, H, 'rgba(8,6,4,0.78)');
    Renderer.grime(W, H, 0.5);

    drawTopPanel(a);
    drawCentral(a);
    drawBottom(a);

    Renderer.vignette(W, H, 0.5);
  }

  // ── Досье монстра ────────────────────────────────────────────────────────
  function drawMonsterView() {
    const a = Game.agency;
    const m = a.monsters.find(function (x) { return x.id === selectedMonsterViewId; });
    if (!m) return;

    hitAreas.length = 0;
    Renderer.rect(0, 0, W, H, 'rgba(6,4,2,0.8)');

    const x = 60, y = 80, w = 1160, h = 540;
    Renderer.paper(x, y, w, h, { r: 8, burn: 18 });
    Renderer.corners(x + 8, y + 8, w - 16, h - 16, 'rgba(120,80,30,0.4)');

    Renderer.drawMonsterIcon('mon_' + m.speciesKey, x + 30, y + 30, 128);
    Renderer.ink(m.name, x + 180, y + 64, { font: 'bold 28px Georgia' });
    const st = STATUS_LABELS[m.status] || STATUS_LABELS.injured;
    Renderer.text('[' + m.speciesLabel + '] · ' + st.text, x + 180, y + 90,
      { color: st.color, font: 'bold 11px Georgia' });
    Renderer.text('Черта: ' + m.traits[0] + ' — ' + (Content.TRAIT_INFO[m.traits[0]] || ''),
      x + 180, y + 112, { color: T.inkSoft, font: 'italic 11px Georgia' });
    Renderer.text('Предпочтение: ' + m.preference + ' · заданий: ' + m.missions + ' · оверкиллов: ' + m.overkillCount,
      x + 180, y + 132, { color: '#7a6244', font: '10px system-ui' });

    const stats = [['СИЛА', m.stats.str, 'str'], ['ЛОВКОСТЬ', m.stats.agi, 'agi'],
      ['ИНТЕЛЛЕКТ', m.stats.int, 'int'], ['УДАЧА', m.stats.luck, 'luck']];
    stats.forEach(function (s, i) {
      const sx = x + 30 + i * 280;
      const bonus = Models.itemBonus(m, s[2]);
      Renderer.text(s[0], sx, y + 174, { color: T.inkSoft, font: '10px system-ui' });
      Renderer.ink(String(s[1]) + (bonus ? ' (+' + bonus + ')' : ''), sx, y + 200,
        { font: 'bold 20px Georgia', color: bonus ? '#3f6b2a' : undefined });
    });

    Renderer.ink('ЭКИПИРОВКА', x + 30, y + 240, { font: 'bold 11px Georgia' });
    ['weapon', 'armor', 'amulet'].forEach(function (slot, i) {
      const sx = x + 30 + i * 380, sy = y + 254, sw = 360, sh = 50;
      const itemId = m.equipment ? m.equipment[slot] : null;
      const item = Models.getItem(itemId);

      noteCard(sx, sy, sw, sh, {
        pin: false,
        selected: !!item,
        onClick: item ? function () { unequip(m, slot); } : null
      });
      Renderer.text(SLOT_LABELS[slot], sx + 10, sy + 16, { color: '#7a6244', font: '8px system-ui' });
      Renderer.ink(item ? item.name : '— пусто —', sx + 10, sy + 36,
        { font: 'bold 11px Georgia', color: item ? undefined : '#8a7355' });
      if (item) {
        const bonusText = Object.entries(item.bonus || {}).map(function (e) {
          var labels = { str: 'СИЛ', agi: 'ЛОВ', int: 'ИНТ', luck: 'УДА' };
          return '+' + e[1] + ' ' + (labels[e[0]] || e[0]);
        }).join(' · ');
        Renderer.text((bonusText ? bonusText + ' · ' : '') + (item.injuryMod < 0 ? Math.round(item.injuryMod * -100) + '% к травме' : item.desc || ''), sx + 10, sy + 50,
          { color: '#3f6b2a', align: 'left', font: 'bold 8px system-ui' });
        Renderer.text('снять', sx + sw - 10, sy + 36, { color: '#7a1f1f', align: 'right', font: '8px system-ui' });
      }
    });

    Renderer.ink('СУМКА', x + 30, y + 330, { font: 'bold 11px Georgia' });
    const bag = {};
    a.inventory.forEach(function (id) { bag[id] = (bag[id] || 0) + 1; });
    const bagIds = Object.keys(bag);
    if (!bagIds.length) {
      Renderer.text('Пусто. Экипировка покупается в «Амуниции».', x + 30, y + 354,
        { color: T.inkSoft, font: '11px Georgia' });
    }

    bagIds.slice(0, 12).forEach(function (id, i) {
      const item = Models.getItem(id);
      if (!item) return;
      const col = i % 6, row = Math.floor(i / 6);
      const bx = x + 30 + col * 190, by = y + 340 + row * 52, bw = 180, bh = 46;

      noteCard(bx, by, bw, bh, {
        pin: false,
        onClick: function () {
          if (item.type === 'consumable') useItem(m, id);
          else equipItem(m, id);
        }
      });
      Renderer.ink(item.name + (bag[id] > 1 ? ' ×' + bag[id] : ''), bx + 10, by + 18, { font: 'bold 10px Georgia' });
      Renderer.text(item.type === 'consumable' ? 'применить' : 'надеть', bx + 10, by + 36,
        { color: item.type === 'consumable' ? '#8a4a12' : '#3f6b2a', font: '8px system-ui' });
    });

    if (bagIds.length > 12) {
      Renderer.text('и ещё ' + (bagIds.length - 12) + ' вид(ов)', x + w - 30, y + 330,
        { color: T.inkSoft, align: 'right', font: '10px Georgia' });
    }

    button(x + w - 160, y + h - 60, 140, 40, 'НАЗАД', function () { setState('agency'); },
      { variant: 'ghost', font: 'bold 12px Georgia' });

    if (m.status === 'idle') {
      button(x + 30, y + h - 60, 140, 40, 'УВОЛЬНИТЬ', function () {
        const res = Models.fireMonster(Game.agency, m.id);
        if (res.success) { Audio.playSfx('reject'); showToast(res.name + ' уволен.'); setState('agency'); }
        else { Audio.playSfx('reject'); showToast(res.reason); }
      }, { variant: 'danger', font: 'bold 12px Georgia' });
    }
  }

  function equipItem(m, id) {
    const res = Models.equipItem(Game.agency, m, id);
    if (res.success) { Audio.playSfx('pick'); showToast('Надето: ' + Models.getItem(id).name); }
    else { Audio.playSfx('reject'); showToast(res.reason); }
  }

  function unequip(m, slot) {
    const res = Models.unequipItem(Game.agency, m, slot);
    if (res.success) { Audio.playSfx('pick'); showToast('Снято'); }
    else { Audio.playSfx('reject'); showToast(res.reason); }
  }

  function useItem(m, id) {
    const res = Models.useItem(Game.agency, m, id);
    if (res.success) { Audio.playSfx('hire'); showToast('Использовано: ' + res.item.name); }
    else { Audio.playSfx('reject'); showToast(res.reason); }
  }

  // ── Миссия ───────────────────────────────────────────────────────────────
  function drawMission() {
    const a = Game.agency;
    const r = a.lastResult;
    if (!r) return;
    const m = a.monsters.find(function (x) { return x.id === r.monsterId; });

    Renderer.drawImage('bg_agency', 0, 0, W, H);
    Renderer.rect(0, 0, W, H, 'rgba(6,4,2,0.88)');
    Renderer.grime(W, H, 0.6);

    const p = 1 - Math.max(0, missionTimer) / 2.0;
    const x = W/2 + (p - 1) * 320;

    Renderer.text('ЗАДАНИЕ В РАБОТЕ', W/2, 160, { color: '#d8b96a', align: 'center', font: 'bold 18px Georgia' });
    Renderer.text(r.questTitle, W/2, 200, { color: '#efe2c0', align: 'center', font: 'bold 20px Georgia' });
    Renderer.text('Монстр ушёл и не отвечает на письма…', W/2, 240,
      { color: '#a08a63', align: 'center', font: '14px Georgia' });

    if (m) {
      Renderer.drawMonsterIcon('mon_' + m.speciesKey, x, 290, 100);
      Renderer.text(m.name, x + 50, 410, { color: '#efe2c0', align: 'center', font: 'bold 16px Georgia' });
    }

    const barW = 760;
    const barX = W/2 - barW/2;
    const barY = H - 200;
    Renderer.roundRect(barX, barY, barW, 8, 4, '#2a1c10');
    Renderer.roundRect(barX, barY, Math.max(6, barW * p), 8, 4, '#c9a227');

    Renderer.text('Чем закончится — узнаем из докладной.', W/2, barY + 28,
      { color: '#7a6244', align: 'center', font: '11px Georgia' });
  }

  // ── Отчёт ────────────────────────────────────────────────────────────────
  function drawReport() {
    const a = Game.agency;
    const r = a.lastResult;

    Renderer.drawImage('bg_agency', 0, 0, W, H);
    Renderer.rect(0, 0, W, H, 'rgba(6,4,2,0.86)');
    if (!r) return;

    const x = 80, y = 80, w = 1120, h = 540;
    Renderer.paper(x, y, w, h, { r: 8, burn: 20 });
    Renderer.corners(x + 8, y + 8, w - 16, h - 16, 'rgba(120,80,30,0.4)');

    Renderer.note(x + 32, y + 24, 80, 80, { pin: false });
    Renderer.drawMonsterIcon('mon_' + r.speciesKey, x + 36, y + 28, 72);

    Renderer.ink('ДОКЛАДНАЯ', x + 132, y + 48, { font: 'bold 16px Georgia' });
    Renderer.text('от ' + r.monsterName + ' · ' + r.speciesLabel, x + 132, y + 72,
      { color: T.inkSoft, font: '13px Georgia' });
    Renderer.text('Задание: ' + r.questTitle, x + 132, y + 94,
      { color: '#6b4a18', font: 'italic 13px Georgia' });
    Renderer.text('День ' + a.day, x + w - 32, y + 42, { color: '#7a6244', align: 'right', font: '12px Georgia' });
    Renderer.rect(x + 32, y + 112, w - 64, 1, 'rgba(90,60,25,0.4)');

    const font = 'italic 24px Georgia';
    const full = '«' + r.reportText + '»';
    const lines = Renderer.wrapText(full, w - 120, font);
    const visible = Math.min(full.length, Math.floor(reportTime * 45));
    let remaining = visible;
    lines.forEach(function (line, i) {
      const take = Math.max(0, Math.min(line.length, remaining));
      remaining -= take;
      Renderer.ink(line.slice(0, take), x + 60, y + 160 + i * 36, { font: font });
    });

    if (r.lied && r.int <= 7 && visible >= full.length) {
      if (Math.sin(reportTime * 9) > 0.4) {
        Renderer.rect(x + 42, y + 140, w - 84, lines.length * 36, 'rgba(216,196,154,0.45)');
      }
    }

    if (r.type === 'overkill') {
      const p = Math.min(1, reportTime / 1.2);
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        const dist = 30 + p * 120 + (i % 5) * 8;
        Renderer.rect(x + w/2 + Math.cos(ang) * dist, y + 280 + Math.sin(ang) * dist * 0.55, 4, 4,
          i % 3 === 0 ? '#8a4a12' : '#8a6d1a');
      }
      Renderer.text('МОНСТР ПЕРЕСТАРАЛСЯ', x + 32, y + 320, { color: '#8a4a12', font: 'bold 13px Georgia' });
    }

    const sealX = x + 120, sealY = y + 350;
    Renderer.ctx.save();
    Renderer.ctx.globalAlpha = 0.8;
    Renderer.roundRect(sealX - 30, sealY - 30, 60, 60, 30, '#6e1a1a');
    Renderer.roundRectStroke(sealX - 30, sealY - 30, 60, 60, 30, '#3f0f0f', 3);
    Renderer.text('АГ', sealX, sealY + 7, { color: '#e8b4a0', align: 'center', font: 'bold 18px Georgia' });
    Renderer.ctx.restore();
    Renderer.text('Печать агентства', x + 165, sealY + 6, { color: '#6b4a18', font: 'italic 11px Georgia' });

    Renderer.rect(x + 32, y + 398, w - 64, 1, 'rgba(90,60,25,0.4)');

    const trust = Math.round(r.honesty * 100);
    const trustColor = trust >= 80 ? '#3f6b2a' : (trust >= 40 ? '#8a6d1a' : '#7a1f1f');
    Renderer.text('Интеллект ' + r.int + ' — честность отчёта ' + trust + '%', x + 32, y + 424,
      { color: trustColor, font: 'bold 13px Georgia' });
    Renderer.text('Отчёт пишет сам монстр. Чем выше интеллект, тем чаще он говорит правду.',
      x + 32, y + 444, { color: '#7a6244', font: '11px Georgia' });

    if (reportTime > 0.9) {
      button(x + w - 220, y + h - 60, 190, 40, 'ПРИНЯТЬ ОТЧЁТ', acceptReport,
        { variant: 'ghost', font: 'bold 13px Georgia' });
    }
  }

  function acceptReport() {
    const a = Game.agency;
    const r = a.lastResult;
    if (!r) { setState('agency'); return; }

    Models.applyMissionResult(a, r);
    selectedQuestId = null;
    selectedMonsterId = null;

    if (checkDefeat()) return;

    setState('agency');
    if (a.quests.length === 0) showToast('Заказы закончились — завершайте день');
  }

  // ── Конец дня ────────────────────────────────────────────────────────────
  function drawEndDay() {
    const a = Game.agency;

    Renderer.drawImage('bg_agency', 0, 0, W, H);
    Renderer.rect(0, 0, W, H, 'rgba(6,4,2,0.88)');

    const x = 60, y = 60, w = 1160, h = 580;
    Renderer.paper(x, y, w, h, { r: 8, burn: 18 });
    Renderer.corners(x + 8, y + 8, w - 16, h - 16, 'rgba(120,80,30,0.4)');

    Renderer.ink('КОНЕЦ ДНЯ ' + a.day, x + w / 2, y + 42, { align: 'center', font: 'bold 26px Georgia' });
    Renderer.text('Золото начислено только сейчас — докладные могли врать.',
      x + w / 2, y + 66, { color: T.inkSoft, align: 'center', font: '12px Georgia' });

    const cells = [
      ['ЗАДАНИЙ', a.dayStats.questsDone],
      ['ЗАРАБОТАНО', '+' + a.dayStats.goldEarned],
      ['ПЕРЕХВАЧЕНО', a.dayStats.intercepted],
      ['ПОТЕРЯНО', a.dayStats.losses]
    ];
    cells.forEach(function (c, i) {
      const cx = x + 60 + i * 280;
      Renderer.text(c[0], cx, y + 100, { color: T.inkSoft, font: '9px system-ui' });
      Renderer.ink(String(c[1]), cx, y + 132, { font: 'bold 24px Georgia' });
    });

    Renderer.rect(x + 32, y + 150, w - 64, 1, 'rgba(90,60,25,0.35)');
    Renderer.ink('РЕЗУЛЬТАТЫ МИССИЙ', x + 32, y + 170, { font: 'bold 11px Georgia' });

    if (!a.dayStats.missions.length) {
      Renderer.text('Сегодня никто не выходил на задания.', x + 32, y + 198,
        { color: '#7a6244', font: '12px Georgia' });
    }

    a.dayStats.missions.slice(-10).forEach(function (m, i) {
      const my = y + 188 + i * 28;
      const info = MISSION_LABELS[m.type] || { text: m.type, color: T.ink };
      Renderer.text('• ' + m.monsterName + ' — ' + m.questTitle, x + 32, my,
        { color: T.ink, font: '12px Georgia' });
      Renderer.text(info.text + (m.gold ? ' (+' + m.gold + ')' : ''), x + w - 40, my,
        { color: info.color, align: 'right', font: 'bold 12px Georgia' });
    });

    const stage = Models.threatStage(a.threat);
    Renderer.text('Угроза: ' + Models.threatLabel(a.threat) + ' (' + Math.round(a.threat * 100) + '%)' +
      ' · перехват ' + Math.round(Models.interceptChance(a) * 100) + '%',
      x + 32, y + 460, { color: STAGE_INK[stage], font: 'bold 13px Georgia' });
    Renderer.text(a.upgrades.intel > 0 ? 'Отдел разведки работает.' : 'Без отдела разведки конкуренты смелее.',
      x + 32, y + 484, { color: T.inkSoft, font: '11px Georgia' });

    const lastDay = a.day >= a.maxDays;
    button(x + w / 2 - 160, y + h - 70, 320, 44,
      lastDay ? 'ФИНАЛЬНЫЙ ТЕНДЕР' : 'СЛЕДУЮЩИЙ ДЕНЬ',
      handleEndDayButton, { font: 'bold 14px Georgia' });
  }

  function handleEndDayButton() {
    const a = Game.agency;
    if (a.day >= a.maxDays) { startTender(); return; }

    Models.nextDay(a);
    currentTab = 'quests';
    selectedQuestId = null;
    selectedMonsterId = null;
    if (checkDefeat()) return;

    Audio.playSfx('new_day');
    saveGame();
    setState('agency');
  }

  function checkDefeat() {
    if (Models.isThreatDefeat(Game.agency)) {
      outcome = { win: false, reason: 'threat' };
      setState('defeat');
      Audio.playSfx('lose');
      return true;
    }
    return false;
  }

  // ── Тендер ───────────────────────────────────────────────────────────────
  function startTender() {
    const a = Game.agency;
    if (!a.monsters.length) {
      outcome = { win: false, reason: 'nomons' };
      setState('defeat');
      return;
    }
    tender = Models.createTender(a);
    Audio.playSfx('tender');
    setState('tender');
  }

  function tenderRating(m, a) {
    const q = { difficulty: Content.TENDER_QUEST.diff, type: Content.TENDER_QUEST.type, species: [] };
    const eff = Models.effectiveStat(m, q, a) - q.difficulty;
    const int = Models.effectiveIntel(m);
    const honesty = int >= 14 ? 10 : int >= 8 ? 5 : -5;
    const pref = Models.preferenceMatchesTask(m, Content.TENDER_QUEST) ? 5 : -5;
    const score = eff + honesty + pref;
    if (score >= 14) return { text: 'СИЛЬНЫЙ ОТЧЁТ', color: '#3f6b2a' };
    if (score >= 6) return { text: 'НОРМАЛЬНЫЙ ОТЧЁТ', color: '#8a6d1a' };
    return { text: 'СЛАБЫЙ ОТЧЁТ', color: '#7a1f1f' };
  }

  function drawTender() {
    const a = Game.agency;
    if (!tender) { startTender(); return; }

    drawTenderBackdrop();

    Renderer.text('ФИНАЛЬНЫЙ ТЕНДЕР', W/2, 50, { align: 'center', font: 'bold 28px Georgia', color: '#d8b96a' });
    Renderer.text('«' + Content.TENDER_TEXT.intro + '»', W/2, 80,
      { color: '#a08a63', align: 'center', font: 'italic 11px Georgia' });

    Renderer.paper(W/2 - 420, 100, 840, 60, { r: 6, burn: 10 });
    Renderer.ink(tender.quest.title, W/2, 130, { align: 'center', font: 'bold 15px Georgia' });
    Renderer.text('Сложность 8 · победит тот, чей отчёт убедительнее (статы, интеллект, предпочтения)',
      W/2, 152, { color: T.inkSoft, align: 'center', font: '11px Georgia' });
    Renderer.drawIcon('quest_citadel', W/2 + 400, 106, 52, 52, { label: 'Ц', color: '#3a2a1a' });

    // Left panel - AI Agency
    Renderer.paper(40, 180, 560, 420, { r: 6, burn: 12 });
    Renderer.ink('ГЕРОЙ-ДИРЕКТОР', 60, 210, { font: 'bold 15px Georgia' });
    Renderer.text(tender.aiAgency, 60, 235, { color: T.inkSoft, font: '11px Georgia' });

    const ai = tender.aiChampion;
    Renderer.drawMonsterIcon('mon_' + ai.speciesKey, 60, 255, 72);
    Renderer.ink(ai.name, 150, 285, { font: 'bold 17px Georgia' });
    Renderer.text('[' + ai.speciesLabel + '] ИНТ ' + ai.stats.int, 150, 315,
      { color: T.inkSoft, font: '12px monospace' });

    Renderer.text('Он выставит сильнейшего переговорщика.', 60, 360, { color: '#6b4a18', font: '11px Georgia' });
    Renderer.text('Ваш отчёт оценивают по:', 60, 390, { color: '#6b4a18', font: '11px Georgia' });
    Renderer.text('• сила против сложности 8', 72, 420, { color: '#6b4a18', font: '11px Georgia' });
    Renderer.text('• честность (ИНТ 14+ / 8+ / ниже)', 72, 450, { color: '#6b4a18', font: '11px Georgia' });
    Renderer.text('• совпадение с предпочтением', 72, 480, { color: '#6b4a18', font: '11px Georgia' });

    // Right panel - Your Champion
    Renderer.paper(W - 600, 180, 560, 420, { r: 6, burn: 12 });
    Renderer.ink('ВАШ ЧЕМПИОН', W - 580, 210, { font: 'bold 15px Georgia' });
    Renderer.text('Выберите монстра и его экипировку', W - 580, 235, { color: T.inkSoft, font: '11px Georgia' });

    const cw = 250, chh = 56;
    a.monsters.forEach(function (m, i) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = W - 580 + col * (cw + 16);
      const y = 260 + row * (chh + 10);
      if (y + chh > 580) return;

      noteCard(x, y, cw, chh, {
        pin: false,
        selected: tender.playerChampionId === m.id,
        onClick: function () { if (!tender.resolved) tender.playerChampionId = m.id; }
      });
      Renderer.drawMonsterIcon('mon_' + m.speciesKey, x + 6, y + 6, chh - 12);
      Renderer.ink(m.name, x + chh + 10, y + 22, { font: 'bold 12px Georgia' });
      Renderer.text('ИНТ ' + m.stats.int + ' · СИЛ ' + m.stats.str, x + chh + 10, y + 40,
        { color: T.inkSoft, font: '10px monospace' });
      const rate = tenderRating(m, a);
      Renderer.text(rate.text, x + chh + 10, y + 52, { color: rate.color, font: 'bold 10px Georgia' });
    });

    if (!tender.resolved) {
      button(W/2 - 180, 610, 360, 56, 'ОТПРАВИТЬ ЛУЧШЕГО', resolveTender, { variant: 'hero', font: 'bold 15px Georgia' });
    } else {
      drawTenderResult();
    }
  }

  function drawTenderBackdrop() {
    const ctx = Renderer.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a1328');
    g.addColorStop(0.55, '#0d0a14');
    g.addColorStop(1, '#07060b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const spot = ctx.createRadialGradient(W/2, 90, 10, W/2, 90, 280);
    spot.addColorStop(0, 'rgba(168,85,247,0.28)');
    spot.addColorStop(1, 'rgba(168,85,247,0)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(30,22,42,0.92)';
    ctx.beginPath();
    ctx.ellipse(W/2, H * 0.66, W * 0.47, 72, 0, 0, Math.PI * 2);
    ctx.fill();
    Renderer.grime(W, H, 0.4);
  }

  function resolveTender() {
    if (!tender || tender.resolved) return;
    const a = Game.agency;
    if (!a.monsters.some(function (m) { return m.id === tender.playerChampionId; })) {
      tender.playerChampionId = a.monsters[0].id;
    }
    tender.result = Models.resolveTender(a, tender);
    tender.resolved = true;
    Audio.playSfx(tender.result.win ? 'win' : 'lose');
  }

  function drawTenderResult() {
    const res = tender.result;

    Renderer.rect(0, 0, W, H, 'rgba(6,4,10,0.55)');
    Renderer.paper(W/2 - 450, 80, 900, 520, { r: 8, burn: 18 });
    Renderer.corners(W/2 - 445, 85, 890, 510, res.win ? 'rgba(63,107,42,0.7)' : 'rgba(122,31,31,0.7)');

    Renderer.ink(res.win ? 'ВАШ ОТЧЁТ УБЕДИТЕЛЬНЕЕ' : 'ГЕРОЙ-ДИРЕКТОР УБЕДИТЕЛЬНЕЕ', W/2, 120,
      { align: 'center', font: 'bold 20px Georgia', color: res.win ? '#3f6b2a' : '#7a1f1f' });

    [res.player, res.ai].forEach(function (p, i) {
      const x = W/2 - 420 + i * 440;
      Renderer.text(i ? 'ГЕРОЙ-ДИРЕКТОР' : 'ВЫ', x, 156, { color: i ? '#6b4a18' : '#3f6b2a', font: 'bold 12px Georgia' });
      Renderer.ink(p.name + ' · ИНТ ' + p.int, x, 178, { font: 'bold 13px Georgia' });

      Renderer.wrapText('«' + p.report.text + '»', 400, 'italic 13px Georgia').slice(0, 8).forEach(function (line, j) {
        Renderer.text(line, x, 206 + j * 20, { color: '#4a3520', font: 'italic 13px Georgia' });
      });

      Renderer.ink('Счёт: ' + (i ? res.aiScore : res.playerScore), x, 380, { font: 'bold 16px Georgia' });
      Renderer.text(p.report.lied ? 'Отчёт подозрительно красивый…' : 'Отчёт выглядит честным', x, 404,
        { color: p.report.lied ? '#8a4a12' : T.inkSoft, font: '10px Georgia' });
    });

    button(W/2 - 160, 560, 320, 48, 'ПОДВЕСТИ ИТОГ', function () {
      outcome = { win: res.win, reason: 'tender', result: res };
      setState(res.win ? 'victory' : 'defeat');
    }, { font: 'bold 14px Georgia' });
  }

  // ── Победа / поражение ───────────────────────────────────────────────────
  function drawOutcome() {
    const a = Game.agency;
    const win = !!(outcome && outcome.win);

    hitAreas.length = 0;
    if (win) drawTenderBackdrop();
    else {
      Renderer.drawImage('bg_agency', 0, 0, W, H);
      Renderer.rect(0, 0, W, H, 'rgba(6,4,2,0.86)');
    }
    Renderer.rect(0, 0, W, H, 'rgba(5,5,8,0.35)');

    const x = W/2 - 450, y = 80, w = 900, h = 560;
    Renderer.paper(x, y, w, h, { r: 8, burn: 20 });
    Renderer.corners(x + 8, y + 8, w - 16, h - 16, win ? 'rgba(63,107,42,0.7)' : 'rgba(122,31,31,0.7)');

    Renderer.ink(win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ', W/2, y + 70,
      { align: 'center', font: 'bold 48px Georgia', color: win ? '#3f6b2a' : '#7a1f1f' });

    let text = win ? Content.TENDER_TEXT.win : Content.TENDER_TEXT.lose;
    if (!win && outcome && outcome.reason === 'threat') {
      text = 'Конкуренты заняли город. Агентство закрыто, монстры разбежались по подвалам.';
    }
    if (!win && outcome && outcome.reason === 'nomons') {
      text = 'В штате не осталось ни одного монстра. Тендер проигран без боя.';
    }

    Renderer.wrapText(text, w - 100, '16px Georgia').forEach(function (line, i) {
      Renderer.ink(line, W/2, y + 140 + i * 30, { align: 'center', font: '16px Georgia' });
    });

    if (outcome && outcome.result) {
      Renderer.text('Тендер: вы ' + outcome.result.playerScore + ' — герой ' + outcome.result.aiScore,
        W/2, y + 240, { color: T.inkSoft, align: 'center', font: '14px Georgia' });
    }

    const rows = [
      ['Дней выжито', Math.min(a.day, a.maxDays)],
      ['Заданий выполнено', a.stats.questsDone],
      ['Золота заработано', a.stats.goldEarned],
      ['Монстров потеряно', a.stats.losses],
      ['Оверкиллов', a.stats.overkills],
      ['Заказов перехвачено', a.stats.interceptedTotal]
    ];
    rows.forEach(function (r, i) {
      const cy = y + 300 + i * 34;
      Renderer.text(r[0], x + 60, cy, { color: T.inkSoft, font: '13px Georgia' });
      Renderer.ink(String(r[1]), x + w - 60, cy, { align: 'right', font: 'bold 13px Georgia' });
    });

    button(x + 60, y + h - 70, 260, 54, 'НОВАЯ ИГРА', startNewGame, { font: 'bold 13px Georgia' });
    button(x + w - 320, y + h - 70, 260, 54, 'В МЕНЮ', function () { outcome = null; setState('menu'); },
      { variant: 'ghost', font: 'bold 13px Georgia' });
  }

  function startNewGame() {
    Game.agency = Models.createAgency();
    tender = null;
    outcome = null;
    currentTab = 'hire';
    setState('agency');
  }

  // ── Меню ─────────────────────────────────────────────────────────────────
  function drawMenu() {
    Renderer.rect(0, 0, W, H, T.bg);
    Renderer.rect(0, 0, W, H, 'rgba(6,4,2,0.88)');
    Renderer.vignette(W, H, 0.5);

    const x = W/2 - 450, y = 120, w = 900, h = 460;
    Renderer.paper(x, y, w, h, { r: 8, burn: 22 });
    Renderer.corners(x + 8, y + 8, w - 16, h - 16, 'rgba(120,80,30,0.45)');

    Renderer.ink('ПОСЛЕДНИЙ', W/2, y + 96, { align: 'center', font: 'bold 64px Georgia' });
    Renderer.ink('ЧЕЛОВЕК', W/2, y + 160, { align: 'center', font: 'bold 64px Georgia' });
    Renderer.text('агентство по трудоустройству монстров', W/2, y + 196,
      { color: T.inkSoft, align: 'center', font: 'italic 15px Georgia' });
    Renderer.rect(x + 100, y + 210, w - 200, 1, 'rgba(90,60,25,0.4)');

    const save = readSave();
    button(W/2 - 170, y + 250, 340, 64, 'НОВАЯ ИГРА', function () {
      Game.agency = Models.createAgency();
      setState('intro');
    }, { font: 'bold 16px Georgia' });

    button(W/2 - 170, y + 330, 340, 64, save ? ('ПРОДОЛЖИТЬ · день ' + save.day) : 'ПРОДОЛЖИТЬ', function () {
      if (loadGame()) { currentTab = 'hire'; setState('agency'); }
      else showToast('Сохранение не найдено');
    }, {
      variant: 'ghost',
      font: 'bold 15px Georgia',
      disabled: !saveAvailable,
      reason: 'Пока нет сохранения'
    });

    button(W/2 - 170, y + 410, 340, 64, 'КАК ИГРАТЬ', function () { helpFrom = 'menu'; setState('help'); },
      { variant: 'ghost', font: 'bold 15px Georgia' });

    Renderer.text('Мышь / тап. Esc — пауза, Enter — подтвердить.', W/2, y + h - 36,
      { color: '#7a6244', align: 'center', font: '11px Georgia' });
    Renderer.text('FEIS Game Jam · 2026', W/2, y + h - 16, { color: '#8a7355', align: 'center', font: '11px Georgia' });
  }

  function readSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return d && d.agency ? d.agency : null;
    } catch (e) { return null; }
  }

  // ── Пролог ───────────────────────────────────────────────────────────────
  function drawIntro() {
    Renderer.rect(0, 0, W, H, T.bg);
    Renderer.rect(0, 0, W, H, 'rgba(5,3,1,0.92)');
    Renderer.vignette(W, H, 0.4);

    const x = W/2 - 400, y = 120, w = 800, h = 480;
    Renderer.paper(x, y, w, h, { r: 8, burn: 22 });
    Renderer.corners(x + 8, y + 8, w - 16, h - 16, 'rgba(120,80,30,0.45)');

    const lines = [
      'Герои ушли в другие измерения — качаться до бесконечности.',
      'Города остались. Монстры остались. Работы — ни у кого.',
      'Ты — последний человек, бывший клерк гильдии приёмов.',
      'Открыл агентство: горожане платят, монстры пугают. И врут в отчётах.',
      '',
      'Продержись 14 дней. На 14-й день бывший герой откроет своё агентство —',
      'и город достанется тому, чей монстр напишет убедительный отчёт.'
    ];

    Renderer.ink('ПОСЛЕДНИЙ ЧЕЛОВЕК', W/2, y + 70, { align: 'center', font: 'bold 36px Georgia' });
    Renderer.rect(x + 120, y + 84, w - 240, 1, 'rgba(90,60,25,0.4)');

    lines.forEach(function (line, i) {
      const shown = Math.min(line.length, Math.max(0, Math.floor((introTime - 0.2 - i * 0.25) * 60)));
      Renderer.ink(line.slice(0, shown), W/2, y + 130 + i * 32,
        { align: 'center', font: i >= 5 ? '11px Georgia' : '14px Georgia' });
    });

    if (introTime > 2.2) {
      button(W/2 - 180, y + h - 80, 360, 54, 'ОТКРЫТЬ АГЕНТСТВО', function () { setState('agency'); },
        { font: 'bold 13px Georgia' });
    } else {
      Renderer.text('клик — пропустить', W/2, y + h - 30, { color: '#7a6244', align: 'center', font: '10px Georgia' });
      addArea(0, 0, W, H, function () { introTime = 3; });
    }
  }

  // ── Помощь и пауза ───────────────────────────────────────────────────────
  function drawHelp() {
    hitAreas.length = 0;
    Renderer.rect(0, 0, W, H, 'rgba(4,3,1,0.86)');

    const x = W/2 - 450, y = 40, w = 900, h = 600;
    Renderer.paper(x, y, w, h, { r: 8, burn: 20 });
    Renderer.corners(x + 8, y + 8, w - 16, h - 16, 'rgba(120,80,30,0.45)');

    Renderer.ink('КАК ИГРАТЬ', W/2, y + 44, { align: 'center', font: 'bold 24px Georgia' });
    Renderer.rect(x + 120, y + 56, w - 240, 1, 'rgba(90,60,25,0.4)');

    const rows = [
      ['1. Найм', 'У кандидата скрытое предпочтение и черта. Найм тратит 1 из 3 попыток и золото; отказ — тоже тратит попытку.'],
      ['2. Заказы', '"Рекомендуется" — подходящий вид даёт бонус к статам, но можно отправить любого монстра. Монстр выполняет одно задание в день.'],
      ['3. Статы', 'СИЛА — физическая сила. ЛОВКОСТЬ — скорость и точность. ИНТЕЛЛЕКТ — честность отчётов. УДАЧА — шанс оверкилла и крита.'],
      ['4. Отчёты', 'Монстр пишет сам и может врать: ИНТ 14+ — почти всегда честен, 8–13 — примерно наполовину, ниже 8 — часто врёт.'],
      ['5. Оверкилл', 'Перестарался: +50% золота, но +3% угрозы и риск травмы.'],
      ['6. Угроза', 'Конкуренты перехватывают заказы: чем выше угроза, тем чаще перехват. Угроза 100% — поражение.'],
      ['7. Экипировка', 'Предметы из «Амуниции» надеваются в досье монстра (клик по портрету). У каждого предмета свои бонусы к статам.'],
      ['8. Финал', '14-й день: тендер с Героем-Директором. Побеждает агент с более убедительным отчётом.']
    ];

    rows.forEach(function (r, i) {
      const ry = y + 100 + i * 48;
      Renderer.ink(r[0], x + 40, ry, { font: 'bold 13px Georgia' });
      Renderer.text(r[1], x + 40, ry + 18, { color: T.inkSoft, font: '11px Georgia' });
    });

    Renderer.ink('Цель: дожить до 14-го дня и выиграть тендер у Героя-Директора.',
      W/2, y + h - 80, { align: 'center', font: '11px Georgia', color: '#6b4a18' });

    button(W/2 - 100, y + h - 60, 200, 44, 'ПОНЯТНО', closeHelp,
      { variant: 'ghost', font: 'bold 13px Georgia' });
  }

  function closeHelp() {
    if (helpFrom === 'menu') setState('menu');
    else if (helpFrom === 'pause') setState('pause');
    else setState('agency');
  }

  function drawPause() {
    hitAreas.length = 0;
    Renderer.rect(0, 0, W, H, 'rgba(4,3,1,0.74)');

    const x = W/2 - 300, y = H/2 - 200, w = 600, h = 400;
    Renderer.paper(x, y, w, h, { r: 8, burn: 18 });
    Renderer.corners(x + 8, y + 8, w - 16, h - 16, 'rgba(120,80,30,0.45)');
    Renderer.ink('ПАУЗА', W/2, y + 70, { align: 'center', font: 'bold 32px Georgia' });

    button(W/2 - 180, y + 110, 360, 56, 'ПРОДОЛЖИТЬ', function () { setState('agency'); },
      { font: 'bold 15px Georgia' });
    button(W/2 - 180, y + 180, 360, 56, 'КАК ИГРАТЬ', function () { helpFrom = 'pause'; setState('help'); },
      { variant: 'ghost', font: 'bold 14px Georgia' });
    button(W/2 - 180, y + 250, 360, 56, 'В МЕНЮ', function () { saveGame(); setState('menu'); },
      { variant: 'ghost', font: 'bold 14px Georgia' });
  }

  // ── Тост ─────────────────────────────────────────────────────────────────
  function drawToast() {
    const font = 'bold 10px Georgia';
    Renderer.ctx.font = font;
    const tw = Math.min(480, Renderer.ctx.measureText(toast.msg).width + 30);
    const x = (W - tw) / 2, y = 108;

    Renderer.note(x, y, tw, 28, { pin: false });
    Renderer.roundRectStroke(x, y, tw, 28, 3, 'rgba(168,134,42,0.9)', 1.5);
    Renderer.ink(toast.msg, W / 2, y + 18, { align: 'center', font: font });
  }

  // ── Состояния и ввод ─────────────────────────────────────────────────────
  function setState(next) {
    if (Game.state === next) return;
    const conf = TRANSITION_MAP[Game.state + '->' + next] || { type: 'fade', dur: 250 };
    transition = { type: conf.type, dur: conf.dur, t: 0, from: Game.state, to: next, switched: false };
    Audio.playSfx('transition');
  }

  function enterState(to) {
    Game.state = to;

    if (to === 'mission') missionTimer = 2.0;
    if (to === 'report') reportTime = 0;
    if (to === 'endday') saveGame();
    if (to === 'menu') refreshSave();
    if (to === 'intro') introTime = 0;
    if (to === 'tender' && !tender) tender = Models.createTender(Game.agency);
    if (to === 'victory' || to === 'defeat') {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
      saveAvailable = false;
    }
    if (to === 'agency') {
      if (Game.agency) Game.agency.lastResult = null;
      saveGame();
    }
  }

  function drawTransitionOverlay() {
    if (!transition) return;
    const p = Math.min(1, transition.t / transition.dur);
    Renderer.rect(0, 0, W, H, 'rgba(0,0,0,' + (Math.sin(p * Math.PI) * 0.85).toFixed(3) + ')');
  }

  function withTransitionTransform(drawFn) {
    const ctx = Renderer.ctx;
    if (!transition) { drawFn(); return; }

    const p = Math.min(1, transition.t / transition.dur);
    const isOld = !transition.switched;
    const k = isOld ? p : (p - 0.5) * 2;

    ctx.save();
    if (transition.type === 'scale') {
      const s = isOld ? 1 - 0.05 * k : 0.95 + 0.05 * k;
      ctx.translate(W / 2, H / 2);
      ctx.scale(s, s);
      ctx.translate(-W / 2, -H / 2);
    } else if (transition.type === 'slide') {
      ctx.translate(isOld ? -40 * k : 40 * (1 - k), 0);
    }
    drawFn();
    ctx.restore();
  }

  // ── Сохранение ───────────────────────────────────────────────────────────
  function refreshSave() {
    try { saveAvailable = !!localStorage.getItem(SAVE_KEY); }
    catch (e) { saveAvailable = false; }
  }

  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, agency: Game.agency }));
      saveAvailable = true;
    } catch (e) { /* приватный режим */ }
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !data.agency || !data.agency.monsters) return false;
      Game.agency = data.agency;
      if (!Game.agency.inventory) Game.agency.inventory = [];
      return true;
    } catch (e) { return false; }
  }

  // ── Цикл ─────────────────────────────────────────────────────────────────
  function update(dt) {
    time += dt;
    if (toast.t > 0) toast.t -= dt;
    if (Game.state === 'intro') introTime += dt;

    if (panelAnim !== panelTarget) {
      const step = dt / 0.28;
      panelAnim = panelTarget > panelAnim ? Math.min(panelTarget, panelAnim + step)
        : Math.max(panelTarget, panelAnim - step);
    }

    if (transition) {
      transition.t += dt * 1000;
      if (!transition.switched && transition.t >= transition.dur / 2) {
        transition.switched = true;
        enterState(transition.to);
      }
      if (transition.t >= transition.dur) transition = null;
      return;
    }

    if (Game.state === 'mission') {
      missionTimer -= dt;
      if (missionTimer <= 0) setState('report');
    }
    if (Game.state === 'report') reportTime += dt;

    const click = Input.consumeClick();
    if (click) {
      for (let i = hitAreas.length - 1; i >= 0; i--) {
        const area = hitAreas[i];
        if (inRect(click, area.x, area.y, area.w, area.h)) {
          area.onClick();
          break;
        }
      }
    }

    if (pressed('Escape')) {
      if (Game.state === 'report') acceptReport();
      else if (Game.state === 'pause') setState('agency');
      else if (Game.state === 'help') closeHelp();
      else if (Game.state === 'agency') setState('pause');
      else if (Game.state === 'monster') setState('agency');
    }
    if (pressed('Enter') || pressed('Space')) {
      if (Game.state === 'menu') { Game.agency = Models.createAgency(); setState('intro'); }
      else if (Game.state === 'intro') setState('agency');
      else if (Game.state === 'report' && reportTime > 0.9) acceptReport();
      else if (Game.state === 'endday') handleEndDayButton();
    }
    if (pressed('KeyC') && Game.state === 'agency') {
      panelTarget = panelTarget ? 0 : 1;
      Audio.playSfx('pick');
      showToast(panelTarget ? 'Доска свёрнута' : 'Доска развёрнута');
    }
  }

  function render() {
    hitAreas = [];
    Renderer.rect(0, 0, W, H, T.bg);

    const state = transition && !transition.switched ? transition.from : Game.state;
    withTransitionTransform(function () { drawState(state); });

    drawTransitionOverlay();
    if (toast.t > 0) drawToast();

    Game.hitAreas = hitAreas;
    const overArea = hitAreas.some(function (a) { return inRect(Input.mouse, a.x, a.y, a.w, a.h); });
    Game.canvas.style.cursor = overArea ? 'pointer' : 'default';
  }

  function drawState(state) {
    if (state === 'menu') drawMenu();
    else if (state === 'intro') drawIntro();
    else if (state === 'help') { if (helpFrom === 'menu') drawMenu(); else drawAgency(); drawHelp(); }
    else if (state === 'pause') { drawAgency(); drawPause(); }
    else if (state === 'monster') { drawAgency(); drawMonsterView(); }
    else if (state === 'mission') drawMission();
    else if (state === 'report') drawReport();
    else if (state === 'endday') drawEndDay();
    else if (state === 'tender') drawTender();
    else if (state === 'victory' || state === 'defeat') drawOutcome();
    else drawAgency();
  }

  // ── Инициализация ────────────────────────────────────────────────────────
  async function init() {
    if (location.search.indexOf('debug') !== -1) document.body.classList.add('debug');

    await Assets.load();
    Audio.init();
    Game.init('game');
    Input.init(Game.canvas);
    Renderer.init(Game.ctx);

    refreshSave();
    Game.state = 'menu';
    Game.update = update;
    Game.render = render;
    Game.setState = setState;

    const debugBtn = document.getElementById('debugBtn');
    const debugPanel = document.getElementById('debugPanel');
    if (debugBtn && debugPanel) {
      debugBtn.addEventListener('click', function () {
        debugPanel.textContent = JSON.stringify({
          state: Game.state, agency: Game.agency, tender: tender, outcome: outcome
        }, null, 2);
        debugPanel.classList.toggle('open');
      });
    }

    function frame(now) {
      Game.loop(now);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  init();
})();
