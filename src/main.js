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

  // ── Layout-хелперы: относительные координаты вместо жёстких пикселей ──
  // cx/cy — процент от W/H (0..100). pw/ph — ширина/высота в процентах.
  // centreX/centreY — центрирование элемента заданной ширины/высоты.
  // PAD — стандартный отступ между элементами.
  function cx(pct) { return Math.round(W * pct / 100); }
  function cy(pct) { return Math.round(H * pct / 100); }
  function pw(pct) { return Math.round(W * pct / 100); }
  function ph(pct) { return Math.round(H * pct / 100); }
  function centreX(w) { return Math.round((W - w) / 2); }
  function centreY(h) { return Math.round((H - h) / 2); }
  const PAD = 12;

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
  let selectedMonsterIds = [];
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
    const top = panelHeight() + pw(0.8);
    return { x: PAD, y: top, w: W - pw(2.8), h: H - top - ph(27.8) - pw(1.9) };
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
    Renderer.text('ГИЛЬДИЯ', cx(1.9), cy(2.2), { color: '#d8b96a', font: 'bold 11px Georgia' });
    Renderer.text('ДЕНЬ ' + a.day + '/' + a.maxDays, cx(10.9), cy(2.2),
      { color: '#e7d7ae', font: 'bold 10px Georgia' });
    Renderer.text(a.gold + ' зол.', cx(21.9), cy(2.2), { color: '#e7c765', font: 'bold 10px Georgia' });

    const stage = Models.threatStage(a.threat);
    Renderer.text('УГРОЗА ' + Math.round(a.threat * 100) + '%', cx(34.4), cy(2.2),
      { color: STAGE_LIGHT[stage], font: 'bold 10px Georgia' });
    Renderer.roundRect(cx(43.8), cy(1.4), pw(10.9), ph(0.8), 3, 'rgba(0,0,0,0.5)');
    Renderer.roundRect(cx(43.8), cy(1.4), Math.max(4, pw(10.9) * Math.min(1, a.threat)), ph(0.8), 3, STAGE_LIGHT[stage]);

    Renderer.text('ШТАТ ' + a.monsters.length + '/' + Models.rosterCap(a), cx(57.8), cy(2.2),
      { color: '#cbb98f', font: 'bold 10px Georgia' });
    Renderer.text('СОБЕС. ' + a.interviewsLeft + '/3', cx(68.8), cy(2.2),
      { color: a.interviewsLeft > 0 ? '#cbb98f' : '#d08a7a', font: 'bold 10px Georgia' });
    Renderer.text('ЗАКАЗЫ ' + a.quests.filter(function (q) { return !q.intercepted; }).length, cx(79.7), cy(2.2),
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
    const slotSpacing = pw(15.6);
    const startX = cx(1.9);
    const x = startX + i * slotSpacing;
    const frame = { x: x + pw(3.1), y: cy(3.9), w: pw(5.0), h: ph(8.9) };
    const m = a.monsters[i];
    const capped = i < Models.rosterCap(a);
    const hovered = hoverRect(x + pw(1.1), cy(3.3), pw(8.6), ph(13.9));

    if (m) {
      Renderer.note(frame.x - pw(0.2), frame.y - pw(0.2), frame.w + pw(0.3), frame.h + pw(0.3), { pin: false });
      Renderer.drawMonsterIcon('mon_' + m.speciesKey, frame.x + pw(0.2), frame.y + pw(0.2), frame.w - pw(0.3));
      const st = STATUS_LABELS[m.status] || STATUS_LABELS.injured;
      Renderer.roundRect(frame.x + frame.w - pw(0.8), frame.y + frame.h - pw(0.8), pw(0.8), ph(1.4), 4, st.color);
      Renderer.roundRectStroke(frame.x + frame.w - pw(0.8), frame.y + frame.h - pw(0.8), pw(0.8), ph(1.4), 4, 'rgba(30,18,8,0.85)', 1);

      Renderer.ink(m.name, x + pw(7.0), cy(15.3), { align: 'center', font: 'bold 11px Georgia' });
      Renderer.text(st.text, x + pw(7.0), cy(17.2), { color: st.color, align: 'center', font: 'bold 8px system-ui' });

      if (hovered) Renderer.roundRectStroke(frame.x - pw(0.2), frame.y - pw(0.2), frame.w + pw(0.3), frame.h + pw(0.3), 3, '#e8c76a', 2);

      addArea(x + pw(1.1), cy(3.3), pw(8.6), ph(14.2), function () {
        selectedMonsterViewId = m.id;
        setState('monster');
      });
      return;
    }

    if (!capped) {
      Renderer.roundRect(frame.x - pw(0.2), frame.y - pw(0.2), frame.w + pw(0.3), frame.h + pw(0.3), 2, 'rgba(10,7,4,0.55)');
      Renderer.roundRectStroke(frame.x - pw(0.2), frame.y - pw(0.2), frame.w + pw(0.3), frame.h + pw(0.3), 2, 'rgba(90,70,45,0.5)', 1);
      Renderer.lockIcon(frame.x + frame.w / 2, frame.y + frame.h / 2, pw(2.5), '#6b5a45');
      Renderer.text('закрыто', x + pw(7.0), cy(15.3), { color: '#8a7355', align: 'center', font: 'bold 9px Georgia' });
      if (hovered) {
        Renderer.roundRectStroke(frame.x - pw(0.2), frame.y - pw(0.2), frame.w + pw(0.3), frame.h + pw(0.3), 2, 'rgba(168,134,42,0.55)', 1.5);
        showTip(x + pw(7.0), cy(17.2), 'Улучшите стойла');
      }
      return;
    }

    Renderer.roundRectStroke(frame.x, frame.y, frame.w, frame.h, 2, 'rgba(220,200,160,0.35)', 1.5);
    Renderer.text('+', frame.x + frame.w / 2, frame.y + frame.h / 2 + pw(0.5),
      { color: 'rgba(240,225,190,0.5)', align: 'center', font: 'bold 24px Georgia' });
    Renderer.text('пусто', x + pw(7.0), cy(15.3), { color: '#8a7355', align: 'center', font: 'bold 9px Georgia' });

    addArea(x + pw(1.1), cy(3.3), pw(8.6), ph(14.2), function () {
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
      Renderer.text('Новые придут завтра.', r.x + r.w / 2, r.y + r.h / 2 + pw(3.3),
        { color: T.inkSoft, align: 'center', font: '12px Georgia' });
      return;
    }

    const gap = pw(2.8);
    const cw = Math.floor((r.w - gap * 2) / 3);
    const ch = Math.min(r.h - ph(5.6), ph(44.4));
    const y0 = r.y + pw(4.7) + Math.max(0, (r.h - ph(5.6) - ch) / 2);

    a.candidates.forEach(function (cand, i) {
      const x = r.x + i * (cw + gap);
      const y = y0;
      const full = a.monsters.length >= Models.rosterCap(a);
      const canHire = a.interviewsLeft > 0 && !full;

      noteCard(x, y, cw, ch, { shadow: true });

      Renderer.note(x + cw / 2 - pw(6.2), y + ph(1.7), pw(12.5), ph(12.5), { pin: false });
      Renderer.drawMonsterIcon('mon_' + cand.speciesKey, x + cw / 2 - pw(5.8), y + ph(2.1), pw(11.7));

      Renderer.ink(cand.name, x + cw / 2, y + ph(16.7), { align: 'center', font: 'bold 16px Georgia' });
      Renderer.text('[' + cand.speciesLabel + ']', x + cw / 2, y + ph(19.2),
        { color: T.inkSoft, align: 'center', font: '11px Georgia' });
      Renderer.text('Черта: ' + cand.traits[0], x + cw / 2, y + ph(21.7),
        { color: '#6b4a18', align: 'center', font: 'italic 11px Georgia' });

      Renderer.text('Стоимость найма: ' + cand.cost + ' зол.', x + cw / 2, y + ph(24.2),
        { color: T.inkSoft, align: 'center', font: 'bold 11px Georgia' });

      const stats = [['СИЛА', cand.stats.str], ['ЛОВ', cand.stats.agi], ['ИНТ', cand.stats.int], ['УДА', cand.stats.luck]];
      stats.forEach(function (s, j) {
        const sx = x + pw(1.1) + (j % 2) * (cw / 2 - pw(1.1));
        const sy = y + ph(27.2) + Math.floor(j / 2) * ph(3.6);
        Renderer.text(s[0], sx, sy, { color: T.inkSoft, font: '10px system-ui' });
        Renderer.ink(String(s[1]), sx + cw / 2 - pw(4.2), sy, { align: 'right', font: 'bold 16px Georgia' });
      });

      Renderer.rect(x + pw(1.9), y + ch - ph(11.7), cw - pw(3.9), pw(0.1), 'rgba(90,60,25,0.3)');
      Renderer.text('Найм: 1 собеседование + ' + cand.cost + ' зол.', x + cw / 2, y + ch - ph(9.2),
        { color: T.inkSoft, align: 'center', font: '10px Georgia' });

      button(x + pw(1.1), y + ch - ph(7.8), cw - pw(2.2), ph(4.4), full ? 'СТОЙЛА ПОЛНЫ' : 'НАНЯТЬ', function () {
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

    const gap = pw(1.2);
    const cw = pw(29.7), chh = ph(10.0), gapY = ph(1.1);
    a.quests.forEach(function (q, i) {
      const col = i % 2, row = Math.floor(i / 2);
      const x = r.x + col * (cw + gap);
      const y = r.y + pw(3.9) + row * (chh + gapY);
      drawQuestNote(a, q, x, y, cw, chh);
    });

    const quest = a.quests.find(function (q) { return q.id === selectedQuestId; });
    const panelY = r.y + pw(3.9) + 2 * (chh + gapY) + pw(0.8);

    Renderer.rect(r.x, panelY - pw(0.6), r.w, pw(0.1), 'rgba(90,60,25,0.3)');
    Renderer.ink(quest ? 'Отправляем на задание' : 'Кого отправим?', r.x, panelY + pw(1.9),
      { font: 'bold 11px Georgia' });
    Renderer.text(quest ? quest.title : 'Выберите заказ выше', r.x + r.w, panelY + pw(1.9),
      { color: T.inkSoft, align: 'right', font: '9px Georgia' });

    const chipW = pw(8.6), chipH = ph(5.8), chipGap = pw(1.2);
    const chipsPerRow = Math.max(1, Math.floor((r.w - pw(17.2) - pw(2.4)) / (chipW + chipGap)));
    const chipStartY = panelY + pw(3.1);
    let lastChipY = chipStartY;

    a.monsters.forEach(function (m, i) {
      const col = i % chipsPerRow;
      const row = Math.floor(i / chipsPerRow);
      const x = r.x + col * (chipW + chipGap);
      const y = chipStartY + row * (chipH + pw(1.6));
      lastChipY = y;
      const disabled = m.status !== 'idle';
      const selected = selectedMonsterIds.includes(m.id);
      noteCard(x, y, chipW, chipH, {
        disabled: disabled,
        selected: selected,
        pin: false,
        onClick: function () {
          if (selected) {
            selectedMonsterIds = selectedMonsterIds.filter(function (id) { return id !== m.id; });
          } else if (selectedMonsterIds.length < 3) {
            selectedMonsterIds.push(m.id);
          }
        },
        reason: m.status === 'injured' ? 'Монстр ранен' : 'Монстр отдыхает до завтра'
      });
      Renderer.drawMonsterIcon('mon_' + m.speciesKey, x + pw(0.5), y + pw(1.0), pw(2.2));
      Renderer.ink(m.name, x + pw(3.0), y + pw(1.4), { font: 'bold 9px Georgia' });
      Renderer.text(disabled ? (m.status === 'injured' ? 'ранен' : 'отдыхает')
        : ('ИНТ ' + m.stats.int + ' · СИЛ ' + m.stats.str), x + pw(3.0), y + pw(2.5),
        { color: disabled ? '#7a1f1f' : T.inkSoft, font: '8px system-ui' });
    });

    const infoY = lastChipY + chipH + pw(2.4);

    if (selectedMonsterIds.length > 0) {
      Renderer.text('Выбрано: ' + selectedMonsterIds.length + '/3 монстров', r.x, infoY,
        { color: '#d8b96a', font: 'bold 11px Georgia' });
    }

    const monsters = selectedMonsterIds.map(function (id) {
      return a.monsters.find(function (m) { return m.id === id; });
    }).filter(Boolean);

    // Показываем вероятность успеха всей группы (силы суммируются)
    if (quest && monsters.length > 0) {
      Renderer.text('Шанс группы: ' + Math.round(Models.groupSuccessChance(monsters, quest, a) * 100) + '%', r.x, infoY + pw(2.8),
        { color: '#d8b96a', font: 'bold 11px Georgia' });
    }

    button(r.x + r.w - pw(17.2), infoY, pw(17.2), ph(5.8), 'ОТПРАВИТЬ НА ЗАДАНИЕ', sendMission, {
      variant: 'ghost',
      font: 'bold 11px Georgia',
      disabled: !quest || monsters.length === 0,
      reason: !quest ? 'Сначала выберите заказ' : 'Выберите хотя бы одного свободного монстра'
    });
  }

  function drawQuestNote(a, q, x, y, w, h) {
    if (q.intercepted) {
      Renderer.note(x, y, w, h, { pin: true });
      Renderer.rect(x, y, w, h, 'rgba(30,22,14,0.45)');
      Renderer.drawIcon('ui_intercepted', x + pw(0.8), y + h / 2 - pw(2.1), pw(4.2), pw(4.2), { label: 'X', color: '#3a2a1a' });
      Renderer.text(q.title, x + pw(6.2), y + pw(3.1), { color: '#5d4a33', font: 'italic 10px Georgia' });
      Renderer.text('ПЕРЕХВАЧЕНО КОНКУРЕНТАМИ', x + pw(6.2), y + pw(5.6),
        { color: '#7a1f1f', font: 'bold 8px Georgia' });
      return;
    }

    noteCard(x, y, w, h, {
      selected: selectedQuestId === q.id,
      shadow: true,
      onClick: function () { selectedQuestId = q.id; selectedMonsterIds = []; }
    });

    const art = QUEST_ART[q.type];
    if (art) Renderer.drawIcon(art, x + pw(0.8), y + pw(1.1), pw(5.6), pw(5.6), { label: q.type, color: '#3a2a1a' });
    else {
      Renderer.roundRect(x + pw(0.8), y + pw(1.1), pw(5.6), pw(5.6), pw(0.4), 'rgba(90,60,25,0.2)');
      Renderer.ink(q.type.substring(0, 2).toUpperCase(), x + pw(3.6), y + pw(4.7),
        { align: 'center', font: 'bold 11px Georgia' });
    }

    Renderer.ink(q.title, x + pw(7.5), y + pw(3.1), { font: 'bold 10px Georgia' });
    Renderer.text('Сложность ' + q.difficulty + ' · ' + q.risk, x + pw(7.5), y + pw(5.0),
      { color: T.inkSoft, font: '8px system-ui' });
    Renderer.ink(q.reward + ' зол.', x + w - pw(1.4), y + pw(3.1), { align: 'right', font: 'bold 12px Georgia' });

    if (q.species.length) {
      Renderer.text('Рекомендуется: ' + q.species.map(function (s) { return Models.SPECIES[s].label; }).join('/') +
        ' (+2 к статам)', x + pw(7.5), y + pw(6.8), { color: '#6b4a18', font: 'italic 8px Georgia' });
    }
  }

  function sendMission() {
    const a = Game.agency;
    const quest = a.quests.find(function (q) { return q.id === selectedQuestId; });
    const monsters = selectedMonsterIds.map(function (id) {
      return a.monsters.find(function (m) { return m.id === id; });
    }).filter(Boolean);
    if (!quest || monsters.length === 0 || quest.intercepted ||
        monsters.some(function (m) { return m.status !== 'idle'; })) {
      showToast('Нужен свободный монстр и не перехваченный заказ');
      return;
    }
    // Один общий результат на всю группу — силы суммируются
    a.lastResult = Models.calculateGroupResult(monsters, quest, a);
    Audio.playSfx('depart');
    setState('mission');
  }

  // ── Вкладка «Магазин» ────────────────────────────────────────────────────
  function drawShopTab(a, r) {
    tabHeader(r, 'МАГАЗИН ГИЛЬДИИ', a.gold + ' золота');

    const keys = Models.UPGRADE_ORDER;
    const cw = pw(29.7), ch = ph(9.4), gapX = pw(1.2), gapY = ph(1.1);
    const compact = r.h < ph(44.4);

    keys.forEach(function (key, i) {
      const col = i % 2, row = Math.floor(i / 2);
      const x = r.x + col * (cw + gapX);
      const y = r.y + ph(3.9) + row * (ch + gapY) - (compact ? pw(0.5) : 0);
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

      Renderer.ink(conf.name, x + pw(1.1), y + ph(2.8), { font: 'bold 12px Georgia' });
      Renderer.text(conf.desc, x + pw(1.1), y + ph(5.0), { color: T.inkSoft, font: '9px system-ui' });

      for (let j = 0; j < conf.maxLevel; j++) {
        Renderer.roundRect(x + pw(1.1) + j * pw(0.9), y + ph(6.7), pw(0.7), ph(1.0), 1,
          j < lvl ? '#8a6d1a' : 'rgba(90,60,25,0.25)');
      }

      if (maxed) {
        Renderer.text('МАКС', x + cw - pw(1.1), y + ph(3.9), { color: '#3f6b2a', align: 'right', font: 'bold 11px Georgia' });
      } else {
        Renderer.ink(cost + ' зол.', x + cw - pw(1.1), y + ph(3.9),
          { align: 'right', font: 'bold 11px Georgia', color: affordable ? '#2a1c10' : '#7a1f1f' });
        Renderer.text(affordable ? 'КУПИТЬ' : 'НЕТ ЗОЛОТА', x + cw - pw(1.1), y + ph(6.1),
          { color: affordable ? T.inkSoft : '#7a1f1f', align: 'right', font: 'bold 8px Georgia' });
      }
    });

    const y2 = r.y + ph(3.9) + 4 * (ch + gapY) - (compact ? pw(0.5) : 0);
    if (y2 + ph(7.5) <= r.y + r.h) {
      const full = a.monsters.length >= Models.rosterCap(a);
      const canUndead = a.gold >= 150 && !full;
      noteCard(r.x, y2, r.w, ph(7.5), {
        disabled: !canUndead,
        onClick: canUndead ? hireUndead : null,
        reason: full ? 'Стойла переполнены' : 'Нужно 150 золота'
      });
      Renderer.drawIcon('ui_crypt', r.x + pw(0.8), y2 + pw(1.1), pw(3.1), pw(3.1), { label: 'Н', color: '#3a2a1a' });
      Renderer.ink('НАНЯТЬ НЕЖИТЬ', r.x + pw(5.0), y2 + pw(3.3), { font: 'bold 12px Georgia' });
      Renderer.text('Случайный Скелет или Вампир, без собеседования', r.x + pw(5.0), y2 + pw(5.6),
        { color: T.inkSoft, font: '9px system-ui' });
      Renderer.ink('150 зол.', r.x + r.w - pw(1.1), y2 + pw(4.2), { align: 'right', font: 'bold 11px Georgia' });
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

    const cw = pw(19.5), ch = ph(8.6), gapX = pw(0.8), gapY = ph(1.1);
    Models.ITEMS.forEach(function (item, i) {
      const col = i % 3, row = Math.floor(i / 3);
      const x = r.x + col * (cw + gapX);
      const y = r.y + ph(3.9) + row * (ch + gapY);
      const owned = inventoryCount(a, item.id);
      const affordable = a.gold >= item.price;

      noteCard(x, y, cw, ch, { onClick: function () { buyItem(item); } });

      Renderer.ink(item.name, x + pw(0.8), y + ph(2.5), { font: 'bold 10px Georgia' });
      Renderer.text(item.desc, x + pw(0.8), y + ph(4.7), { color: T.inkSoft, font: '8px system-ui' });
      Renderer.ink(item.price + ' зол.', x + pw(0.8), y + ph(7.2),
        { font: 'bold 9px Georgia', color: affordable ? '#2a1c10' : '#7a1f1f' });
      if (owned > 0) {
        Renderer.text('×' + owned, x + cw - pw(0.8), y + ph(2.5), { color: '#3f6b2a', align: 'right', font: 'bold 11px Georgia' });
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
    Renderer.note(cx(1.9), cy(83.3), pw(20.3), ph(6.1), { pin: false });
    Renderer.ink('ПОДСКАЗКА', cx(2.7), cy(85.6), { font: 'bold 10px Georgia' });
    Renderer.text(nextStepHint(a, currentTab), cx(2.7), cy(87.2), { color: T.inkSoft, font: '11px Georgia' });

    const lastDay = a.day >= a.maxDays;
    button(centreX(440), cy(83.3), pw(34.4), ph(6.1),
      (lastDay ? 'ФИНАЛЬНЫЙ ТЕНДЕР' : 'ЗАКОНЧИТЬ ДЕНЬ') + ' · ' + a.day + '/' + a.maxDays,
      function () { setState('endday'); }, { font: 'bold 14px Georgia' });

    Renderer.note(cx(77.7), cy(83.3), pw(20.3), ph(6.1), { pin: false });
    Renderer.ink('СВОБОДНЫ: ' + a.monsters.filter(function (m) { return m.status === 'idle'; }).length +
      ' · СУМКА: ' + a.inventory.length + ' предм.', cx(78.6), cy(85.0), { font: 'bold 10px Georgia' });
    Renderer.text('Угроза ' + Models.threatLabel(a.threat) + ' · перехват ' +
      Math.round(Models.interceptChance(a) * 100) + '%', cx(78.6), cy(86.7),
      { color: T.inkSoft, font: '10px Georgia' });

    const tabs = [
      { id: 'hire', label: 'НАЙМ', badge: a.interviewsLeft + '/3' },
      { id: 'quests', label: 'ЗАКАЗЫ', badge: String(a.quests.filter(function (q) { return !q.intercepted; }).length) },
      { id: 'shop', label: 'МАГАЗИН', badge: '' },
      { id: 'items', label: 'АМУНИЦИЯ', badge: String(a.inventory.length) }
    ];
    const bw = pw(20.3), gap = ph(1.7);
    const totalTabs = tabs.length * (bw + gap) - gap;
    const tabStartX = centreX(totalTabs);
    tabs.forEach(function (t, i) {
      const x = tabStartX + i * (bw + gap);
      const active = currentTab === t.id;
      const hovered = hoverRect(x, cy(90.3), bw, ph(7.2));

      Renderer.wood(x, cy(90.3), bw, ph(7.2), { grain: active ? 0.75 : 0.5 });
      if (active) {
        Renderer.rect(x, cy(90.3), bw, ph(7.2), 'rgba(255,220,140,0.10)');
        Renderer.roundRectStroke(x, cy(90.3), bw, ph(7.2), 3, '#d8b96a', 2);
      } else if (hovered) {
        Renderer.roundRectStroke(x, cy(90.3), bw, ph(7.2), 3, 'rgba(216,185,106,0.65)', 1.5);
      }
      Renderer.text(t.label, x + bw / 2, cy(90.3) + ph(4.4),
        { color: active ? '#f3e0b0' : '#cbb98f', align: 'center', font: 'bold 14px Georgia' });
      if (t.badge) {
        Renderer.text(t.badge, x + bw - pw(0.8), cy(90.3) + ph(2.2),
          { color: active ? '#f3e0b0' : '#8f7f63', align: 'right', font: 'bold 10px Georgia' });
      }

      addArea(x, cy(90.3), bw, ph(7.2), function () {
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

    const x = cx(4.7), y = cy(11.1), w = pw(90.6), h = ph(75.0);
    Renderer.paper(x, y, w, h, { r: 8, burn: 18 });
    Renderer.corners(x + pw(0.6), y + pw(0.6), w - pw(1.3), h - pw(1.3), 'rgba(120,80,30,0.4)');

    Renderer.drawMonsterIcon('mon_' + m.speciesKey, x + pw(2.3), y + pw(2.3), pw(10.0));
    Renderer.ink(m.name, x + pw(14.1), y + pw(5.0), { font: 'bold 28px Georgia' });
    const st = STATUS_LABELS[m.status] || STATUS_LABELS.injured;
    Renderer.text('[' + m.speciesLabel + '] · ' + st.text, x + pw(14.1), y + pw(7.0),
      { color: st.color, font: 'bold 11px Georgia' });
    Renderer.text('Черта: ' + m.traits[0] + ' — ' + (Content.TRAIT_INFO[m.traits[0]] || ''),
      x + pw(14.1), y + pw(8.8), { color: T.inkSoft, font: 'italic 11px Georgia' });
    Renderer.text('Предпочтение: ' + m.preference + ' · заданий: ' + m.missions + ' · оверкиллов: ' + m.overkillCount,
      x + pw(14.1), y + pw(10.3), { color: '#7a6244', font: '10px system-ui' });

    const stats = [['СИЛА', m.stats.str, 'str'], ['ЛОВКОСТЬ', m.stats.agi, 'agi'],
      ['ИНТЕЛЛЕКТ', m.stats.int, 'int'], ['УДАЧА', m.stats.luck, 'luck']];
    stats.forEach(function (s, i) {
      const sx = x + pw(2.3) + i * pw(21.9);
      const bonus = Models.itemBonus(m, s[2]);
      Renderer.text(s[0], sx, y + pw(13.6), { color: T.inkSoft, font: '10px system-ui' });
      Renderer.ink(String(s[1]) + (bonus ? ' (+' + bonus + ')' : ''), sx, y + pw(15.6),
        { font: 'bold 20px Georgia', color: bonus ? '#3f6b2a' : undefined });
    });

    Renderer.ink('ЭКИПИРОВКА', x + pw(2.3), y + pw(18.8), { font: 'bold 11px Georgia' });
    ['weapon', 'armor', 'amulet'].forEach(function (slot, i) {
      const sx = x + pw(2.3) + i * pw(29.7), sy = y + pw(19.9), sw = pw(28.1), sh = ph(6.9);
      const itemId = m.equipment ? m.equipment[slot] : null;
      const item = Models.getItem(itemId);

      noteCard(sx, sy, sw, sh, {
        pin: false,
        selected: !!item,
        onClick: item ? function () { unequip(m, slot); } : null
      });
      Renderer.text(SLOT_LABELS[slot], sx + pw(0.8), sy + pw(1.3), { color: '#7a6244', font: '8px system-ui' });
      Renderer.ink(item ? item.name : '— пусто —', sx + pw(0.8), sy + pw(2.8),
        { font: 'bold 11px Georgia', color: item ? undefined : '#8a7355' });
      if (item) {
        const bonusText = Object.entries(item.bonus || {}).map(function (e) {
          var labels = { str: 'СИЛ', agi: 'ЛОВ', int: 'ИНТ', luck: 'УДА' };
          return '+' + e[1] + ' ' + (labels[e[0]] || e[0]);
        }).join(' · ');
        Renderer.text((bonusText ? bonusText + ' · ' : '') + (item.injuryMod < 0 ? Math.round(item.injuryMod * -100) + '% к травме' : item.desc || ''), sx + pw(0.8), sy + pw(3.9),
          { color: '#3f6b2a', align: 'left', font: 'bold 8px system-ui' });
        Renderer.text('снять', sx + sw - pw(0.8), sy + pw(2.8), { color: '#7a1f1f', align: 'right', font: '8px system-ui' });
      }
    });

    Renderer.ink('СУМКА', x + pw(2.3), y + pw(25.8), { font: 'bold 11px Georgia' });
    const bag = {};
    a.inventory.forEach(function (id) { bag[id] = (bag[id] || 0) + 1; });
    const bagIds = Object.keys(bag);
    if (!bagIds.length) {
      Renderer.text('Пусто. Экипировка покупается в «Амуниции».', x + pw(2.3), y + pw(27.7),
        { color: T.inkSoft, font: '11px Georgia' });
    }

    bagIds.slice(0, 12).forEach(function (id, i) {
      const item = Models.getItem(id);
      if (!item) return;
      const col = i % 6, row = Math.floor(i / 6);
      const bx = x + pw(2.3) + col * pw(14.8), by = y + pw(26.6) + row * pw(4.1), bw = pw(14.1), bh = ph(6.4);

      noteCard(bx, by, bw, bh, {
        pin: false,
        onClick: function () {
          if (item.type === 'consumable') useItem(m, id);
          else equipItem(m, id);
        }
      });
      Renderer.ink(item.name + (bag[id] > 1 ? ' ×' + bag[id] : ''), bx + pw(0.8), by + pw(1.4), { font: 'bold 10px Georgia' });
      Renderer.text(item.type === 'consumable' ? 'применить' : 'надеть', bx + pw(0.8), by + pw(2.8),
        { color: item.type === 'consumable' ? '#8a4a12' : '#3f6b2a', font: '8px system-ui' });
    });

    if (bagIds.length > 12) {
      Renderer.text('и ещё ' + (bagIds.length - 12) + ' вид(ов)', x + w - pw(2.3), y + pw(25.8),
        { color: T.inkSoft, align: 'right', font: '10px Georgia' });
    }

    button(x + w - pw(12.5), y + h - pw(4.7), pw(10.9), ph(5.6), 'НАЗАД', function () { setState('agency'); },
      { variant: 'ghost', font: 'bold 12px Georgia' });

    if (m.status === 'idle') {
      button(x + pw(2.3), y + h - pw(4.7), pw(10.9), ph(5.6), 'УВОЛЬНИТЬ', function () {
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
    const x = W/2 + (p - 1) * pw(25.0);

    Renderer.text('ЗАДАНИЕ В РАБОТЕ', W/2, cy(22.2), { color: '#d8b96a', align: 'center', font: 'bold 18px Georgia' });
    Renderer.text(r.questTitle, W/2, cy(27.8), { color: '#efe2c0', align: 'center', font: 'bold 20px Georgia' });
    Renderer.text('Монстр ушёл и не отвечает на письма…', W/2, cy(33.3),
      { color: '#a08a63', align: 'center', font: '14px Georgia' });

    if (m) {
      Renderer.drawMonsterIcon('mon_' + m.speciesKey, x, cy(40.3), pw(7.8));
      Renderer.text(m.name, x + pw(3.9), cy(56.9), { color: '#efe2c0', align: 'center', font: 'bold 16px Georgia' });
    }

    const barW = pw(59.4);
    const barX = W/2 - barW/2;
    const barY = H - pw(15.6);
    Renderer.roundRect(barX, barY, barW, pw(0.6), pw(0.3), '#2a1c10');
    Renderer.roundRect(barX, barY, Math.max(6, barW * p), pw(0.6), pw(0.3), '#c9a227');

    Renderer.text('Чем закончится — узнаем из докладной.', W/2, barY + pw(3.9),
      { color: '#7a6244', align: 'center', font: '11px Georgia' });
  }

  // ── Отчёт ────────────────────────────────────────────────────────────────
  function drawReport() {
    const a = Game.agency;
    const r = a.lastResult;

    Renderer.drawImage('bg_agency', 0, 0, W, H);
    Renderer.rect(0, 0, W, H, 'rgba(6,4,2,0.86)');
    if (!r) return;

    const x = cx(6.2), y = cy(11.1), w = pw(87.5), h = ph(75.0);
    Renderer.paper(x, y, w, h, { r: 8, burn: 20 });
    Renderer.corners(x + pw(0.6), y + pw(0.6), w - pw(1.3), h - pw(1.3), 'rgba(120,80,30,0.4)');

    Renderer.note(x + pw(2.5), y + pw(3.3), pw(6.2), ph(11.1), { pin: false });
    Renderer.drawMonsterIcon('mon_' + r.speciesKey, x + pw(2.8), y + pw(3.9), pw(5.6));

    Renderer.ink('ДОКЛАДНАЯ', x + pw(10.3), y + pw(6.7), { font: 'bold 16px Georgia' });
    const multi = r.participants && r.participants.length > 1;
    Renderer.text(multi ? r.monsterName + ' и ещё ' + (r.participants.length - 1) : ('от ' + r.monsterName + ' · ' + r.speciesLabel),
      x + pw(10.3), y + pw(10.0), { color: T.inkSoft, font: '13px Georgia' });
    Renderer.text('Задание: ' + r.questTitle, x + pw(10.3), y + pw(13.1),
      { color: '#6b4a18', font: 'italic 13px Georgia' });
    Renderer.text('День ' + a.day, x + w - pw(2.5), y + pw(5.8), { color: '#7a6244', align: 'right', font: '12px Georgia' });
    Renderer.rect(x + pw(2.5), y + pw(15.6), w - pw(5.0), pw(0.1), 'rgba(90,60,25,0.4)');

    const font = 'italic 24px Georgia';
    const full = '«' + r.reportText + '»';
    const lines = Renderer.wrapText(full, w - pw(9.4), font);
    const visible = Math.min(full.length, Math.floor(reportTime * 45));
    let remaining = visible;
    lines.forEach(function (line, i) {
      const take = Math.max(0, Math.min(line.length, remaining));
      remaining -= take;
      Renderer.ink(line.slice(0, take), x + pw(4.7), y + pw(22.2) + i * pw(5.0), { font: font });
    });

    // Список участников группы при мульти-отправке
    if (r.participants && r.participants.length > 1) {
      Renderer.text('Участники группы:', x + pw(2.5), y + pw(44.4),
        { color: '#d8b96a', font: 'bold 12px Georgia' });
      const names = r.participants.map(function (pid) {
        var m = Game.agency.monsters.find(function (x) { return x.id === pid; });
        return m ? m.name : '—';
      }).join(' · ');
      Renderer.text(names, x + pw(2.5), y + pw(47.5), { color: T.inkSoft, font: '11px Georgia' });
    }

    if (r.type === 'overkill') {
      const p = Math.min(1, reportTime / 1.2);
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        const dist = pw(2.3) + p * pw(9.4) + (i % 5) * pw(0.6);
        Renderer.rect(x + w/2 + Math.cos(ang) * dist, y + pw(38.9) + Math.sin(ang) * dist * 0.55, pw(0.3), pw(0.3),
          i % 3 === 0 ? '#8a4a12' : '#8a6d1a');
      }
      Renderer.text('МОНСТР ПЕРЕСТАРАЛСЯ', x + pw(2.5), y + pw(44.4), { color: '#8a4a12', font: 'bold 13px Georgia' });
    }

    const sealX = x + pw(9.4), sealY = y + pw(48.6);
    Renderer.ctx.save();
    Renderer.ctx.globalAlpha = 0.8;
    Renderer.roundRect(sealX - pw(2.3), sealY - pw(2.3), pw(4.7), pw(4.7), pw(2.3), '#6e1a1a');
    Renderer.roundRectStroke(sealX - pw(2.3), sealY - pw(2.3), pw(4.7), pw(4.7), pw(2.3), '#3f0f0f', pw(0.2));
    Renderer.text('АГ', sealX, sealY + pw(1.0), { color: '#e8b4a0', align: 'center', font: 'bold 18px Georgia' });
    Renderer.ctx.restore();
    Renderer.text('Печать агентства', x + pw(12.9), sealY + pw(0.8), { color: '#6b4a18', font: 'italic 11px Georgia' });

    Renderer.rect(x + pw(2.5), y + pw(55.3), w - pw(5.0), pw(0.1), 'rgba(90,60,25,0.4)');

    const trust = Math.round(r.honesty * 100);
    const trustColor = trust >= 80 ? '#3f6b2a' : (trust >= 40 ? '#8a6d1a' : '#7a1f1f');
    Renderer.text('Интеллект ' + r.int + ' — честность отчёта ' + trust + '%', x + pw(2.5), y + pw(58.9),
      { color: trustColor, font: 'bold 13px Georgia' });
    Renderer.text('Отчёт пишет сам монстр. Чем выше интеллект, тем чаще он говорит правду.',
      x + pw(2.5), y + pw(61.7), { color: '#7a6244', font: '11px Georgia' });

    if (reportTime > 0.9) {
      button(x + w - pw(17.2), y + h - pw(8.3), pw(14.8), ph(5.6), 'ПРИНЯТЬ ОТЧЁТ', acceptReport,
        { variant: 'ghost', font: 'bold 13px Georgia' });
    }
  }

  function acceptReport() {
    const a = Game.agency;
    const r = a.lastResult;
    if (!r) { setState('agency'); return; }

    Models.applyMissionResult(a, r);
    selectedQuestId = null;
    selectedMonsterIds = [];

    if (checkDefeat()) return;

    setState('agency');
    if (a.quests.length === 0) showToast('Заказы закончились — завершайте день');
  }

  // ── Конец дня ────────────────────────────────────────────────────────────
  function drawEndDay() {
    const a = Game.agency;

    Renderer.drawImage('bg_agency', 0, 0, W, H);
    Renderer.rect(0, 0, W, H, 'rgba(6,4,2,0.88)');

    const x = cx(4.7), y = cy(8.3), w = pw(90.6), h = ph(80.6);
    Renderer.paper(x, y, w, h, { r: 8, burn: 18 });
    Renderer.corners(x + pw(0.6), y + pw(0.6), w - pw(1.3), h - pw(1.3), 'rgba(120,80,30,0.4)');

    Renderer.ink('КОНЕЦ ДНЯ ' + a.day, x + w / 2, y + ph(5.8), { align: 'center', font: 'bold 26px Georgia' });
    Renderer.text('Золото начислено только сейчас — докладные могли врать.',
      x + w / 2, y + ph(9.2), { color: T.inkSoft, align: 'center', font: '12px Georgia' });

    const cells = [
      ['ЗАДАНИЙ', a.dayStats.questsDone],
      ['ЗАРАБОТАНО', '+' + a.dayStats.goldEarned],
      ['ПЕРЕХВАЧЕНО', a.dayStats.intercepted],
      ['ПОТЕРЯНО', a.dayStats.losses]
    ];
    cells.forEach(function (c, i) {
      const cx = x + pw(4.7) + i * pw(21.9);
      Renderer.text(c[0], cx, y + ph(13.9), { color: T.inkSoft, font: '9px system-ui' });
      Renderer.ink(String(c[1]), cx, y + ph(18.3), { font: 'bold 24px Georgia' });
    });

    Renderer.rect(x + pw(2.5), y + ph(20.8), w - pw(5.0), pw(0.1), 'rgba(90,60,25,0.35)');
    Renderer.ink('РЕЗУЛЬТАТЫ МИССИЙ', x + pw(2.5), y + ph(23.6), { font: 'bold 11px Georgia' });

    if (!a.dayStats.missions.length) {
      Renderer.text('Сегодня никто не выходил на задания.', x + pw(2.5), y + ph(27.5),
        { color: '#7a6244', font: '12px Georgia' });
    }

    a.dayStats.missions.slice(-10).forEach(function (m, i) {
      const my = y + ph(26.1) + i * ph(3.9);
      const info = MISSION_LABELS[m.type] || { text: m.type, color: T.ink };
      Renderer.text('• ' + m.monsterName + ' — ' + m.questTitle, x + pw(2.5), my,
        { color: T.ink, font: '12px Georgia' });
      Renderer.text(info.text + (m.gold ? ' (+' + m.gold + ')' : ''), x + w - pw(3.1), my,
        { color: info.color, align: 'right', font: 'bold 12px Georgia' });
    });

    const stage = Models.threatStage(a.threat);
    Renderer.text('Угроза: ' + Models.threatLabel(a.threat) + ' (' + Math.round(a.threat * 100) + '%)' +
      ' · перехват ' + Math.round(Models.interceptChance(a) * 100) + '%',
      x + pw(2.5), y + ph(63.9), { color: STAGE_INK[stage], font: 'bold 13px Georgia' });
    Renderer.text(a.upgrades.intel > 0 ? 'Отдел разведки работает.' : 'Без отдела разведки конкуренты смелее.',
      x + pw(2.5), y + ph(67.2), { color: T.inkSoft, font: '11px Georgia' });

    const lastDay = a.day >= a.maxDays;
    button(x + w / 2 - pw(12.5), y + h - ph(9.7), pw(25.0), ph(6.1),
      lastDay ? 'ФИНАЛЬНЫЙ ТЕНДЕР' : 'СЛЕДУЮЩИЙ ДЕНЬ',
      handleEndDayButton, { font: 'bold 14px Georgia' });
  }

  function handleEndDayButton() {
    const a = Game.agency;
    if (a.day >= a.maxDays) { startTender(); return; }

    Models.nextDay(a);
    currentTab = 'quests';
    selectedQuestId = null;
    selectedMonsterIds = [];
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

    Renderer.text('ФИНАЛЬНЫЙ ТЕНДЕР', W/2, cy(6.9), { align: 'center', font: 'bold 28px Georgia', color: '#d8b96a' });
    Renderer.text('«' + Content.TENDER_TEXT.intro + '»', W/2, cy(11.1),
      { color: '#a08a63', align: 'center', font: 'italic 11px Georgia' });

    Renderer.paper(centreX(840), cy(13.9), pw(65.6), ph(8.3), { r: 6, burn: 10 });
    Renderer.ink(tender.quest.title, W/2, cy(18.1), { align: 'center', font: 'bold 15px Georgia' });
    Renderer.text('Сложность 8 · победит тот, чей отчёт убедительнее (статы, интеллект, предпочтения)',
      W/2, cy(21.1), { color: T.inkSoft, align: 'center', font: '11px Georgia' });
    Renderer.drawIcon('quest_citadel', W/2 + pw(31.2), cy(14.7), pw(4.1), pw(4.1), { label: 'Ц', color: '#3a2a1a' });

    // Left panel - AI Agency
    Renderer.paper(cx(3.1), cy(25.0), pw(43.8), ph(58.3), { r: 6, burn: 12 });
    Renderer.ink('ГЕРОЙ-ДИРЕКТОР', cx(4.7), cy(29.2), { font: 'bold 15px Georgia' });
    Renderer.text(tender.aiAgency, cx(4.7), cy(32.6), { color: T.inkSoft, font: '11px Georgia' });

    const ai = tender.aiChampion;
    Renderer.drawMonsterIcon('mon_' + ai.speciesKey, cx(4.7), cy(35.4), pw(5.6));
    Renderer.ink(ai.name, cx(11.7), cy(39.6), { font: 'bold 17px Georgia' });
    Renderer.text('[' + ai.speciesLabel + '] ИНТ ' + ai.stats.int, cx(11.7), cy(43.8),
      { color: T.inkSoft, font: '12px monospace' });

    Renderer.text('Он выставит сильнейшего переговорщика.', cx(4.7), cy(50.0), { color: '#6b4a18', font: '11px Georgia' });
    Renderer.text('Ваш отчёт оценивают по:', cx(4.7), cy(54.2), { color: '#6b4a18', font: '11px Georgia' });
    Renderer.text('• сила против сложности 8', cx(5.6), cy(58.3), { color: '#6b4a18', font: '11px Georgia' });
    Renderer.text('• честность (ИНТ 14+ / 8+ / ниже)', cx(5.6), cy(62.5), { color: '#6b4a18', font: '11px Georgia' });
    Renderer.text('• совпадение с предпочтением', cx(5.6), cy(66.7), { color: '#6b4a18', font: '11px Georgia' });

    // Right panel - Your Champion
    Renderer.paper(W - pw(46.9), cy(25.0), pw(43.8), ph(58.3), { r: 6, burn: 12 });
    Renderer.ink('ВАШ ЧЕМПИОН', W - pw(45.3), cy(29.2), { font: 'bold 15px Georgia' });
    Renderer.text('Выберите монстра и его экипировку', W - pw(45.3), cy(32.6), { color: T.inkSoft, font: '11px Georgia' });

    const cw = pw(19.5), chh = ph(7.8);
    a.monsters.forEach(function (m, i) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = W - pw(45.3) + col * (cw + pw(1.2));
      const y = cy(36.1) + row * (chh + ph(1.4));
      if (y + chh > cy(80.6)) return;

      noteCard(x, y, cw, chh, {
        pin: false,
        selected: tender.playerChampionId === m.id,
        onClick: function () { if (!tender.resolved) tender.playerChampionId = m.id; }
      });
      Renderer.drawMonsterIcon('mon_' + m.speciesKey, x + pw(0.5), y + pw(0.8), chh - pw(0.9));
      Renderer.ink(m.name, x + chh + pw(0.8), y + pw(3.1), { font: 'bold 12px Georgia' });
      Renderer.text('ИНТ ' + m.stats.int + ' · СИЛ ' + m.stats.str, x + chh + pw(0.8), y + pw(5.6),
        { color: T.inkSoft, font: '10px monospace' });
      const rate = tenderRating(m, a);
      Renderer.text(rate.text, x + chh + pw(0.8), y + pw(7.2), { color: rate.color, font: 'bold 10px Georgia' });
    });

    if (!tender.resolved) {
      button(centreX(360), cy(84.7), pw(28.1), ph(7.8), 'ОТПРАВИТЬ ЛУЧШЕГО', resolveTender, { variant: 'hero', font: 'bold 15px Georgia' });
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

    const spot = ctx.createRadialGradient(W/2, cy(12.5), pw(0.8), W/2, cy(12.5), pw(21.9));
    spot.addColorStop(0, 'rgba(168,85,247,0.28)');
    spot.addColorStop(1, 'rgba(168,85,247,0)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(30,22,42,0.92)';
    ctx.beginPath();
    ctx.ellipse(W/2, H * 0.66, W * 0.47, ph(10.0), 0, 0, Math.PI * 2);
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
    Renderer.paper(centreX(900), cy(11.1), pw(70.3), ph(72.2), { r: 8, burn: 18 });
    Renderer.corners(centreX(900) + pw(0.4), cy(11.8), pw(69.5), ph(70.8), res.win ? 'rgba(63,107,42,0.7)' : 'rgba(122,31,31,0.7)');

    Renderer.ink(res.win ? 'ВАШ ОТЧЁТ УБЕДИТЕЛЬНЕЕ' : 'ГЕРОЙ-ДИРЕКТОР УБЕДИТЕЛЬНЕЕ', W/2, cy(16.7),
      { align: 'center', font: 'bold 20px Georgia', color: res.win ? '#3f6b2a' : '#7a1f1f' });

    [res.player, res.ai].forEach(function (p, i) {
      const x = W/2 - pw(32.8) + i * pw(34.4);
      Renderer.text(i ? 'ГЕРОЙ-ДИРЕКТОР' : 'ВЫ', x, cy(21.7), { color: i ? '#6b4a18' : '#3f6b2a', font: 'bold 12px Georgia' });
      Renderer.ink(p.name + ' · ИНТ ' + p.int, x, cy(24.7), { font: 'bold 13px Georgia' });

      Renderer.wrapText('«' + p.report.text + '»', pw(31.2), 'italic 13px Georgia').slice(0, 8).forEach(function (line, j) {
        Renderer.text(line, x, cy(28.6) + j * pw(1.6), { color: '#4a3520', font: 'italic 13px Georgia' });
      });

      Renderer.ink('Счёт: ' + (i ? res.aiScore : res.playerScore), x, cy(52.8), { font: 'bold 16px Georgia' });
      Renderer.text(p.report.lied ? 'Отчёт подозрительно красивый…' : 'Отчёт выглядит честным', x, cy(56.1),
        { color: p.report.lied ? '#8a4a12' : T.inkSoft, font: '10px Georgia' });
    });

    button(centreX(320), cy(77.8), pw(25.0), ph(6.7), 'ПОДВЕСТИ ИТОГ', function () {
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

    const x = cx(35.2), y = cy(11.1), w = pw(70.3), h = ph(77.8);
    Renderer.paper(x, y, w, h, { r: 8, burn: 20 });
    Renderer.corners(x + pw(0.6), y + pw(0.6), w - pw(1.3), h - pw(1.3), win ? 'rgba(63,107,42,0.7)' : 'rgba(122,31,31,0.7)');

    Renderer.ink(win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ', W/2, y + pw(9.7),
      { align: 'center', font: 'bold 48px Georgia', color: win ? '#3f6b2a' : '#7a1f1f' });

    let text = win ? Content.TENDER_TEXT.win : Content.TENDER_TEXT.lose;
    if (!win && outcome && outcome.reason === 'threat') {
      text = 'Конкуренты заняли город. Агентство закрыто, монстры разбежались по подвалам.';
    }
    if (!win && outcome && outcome.reason === 'nomons') {
      text = 'В штате не осталось ни одного монстра. Тендер проигран без боя.';
    }

    Renderer.wrapText(text, w - pw(7.8), '16px Georgia').forEach(function (line, i) {
      Renderer.ink(line, W/2, y + pw(19.4) + i * pw(4.2), { align: 'center', font: '16px Georgia' });
    });

    if (outcome && outcome.result) {
      Renderer.text('Тендер: вы ' + outcome.result.playerScore + ' — герой ' + outcome.result.aiScore,
        W/2, y + pw(33.3), { color: T.inkSoft, align: 'center', font: '14px Georgia' });
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
      const ry = y + pw(41.7) + i * pw(4.7);
      Renderer.text(r[0], x + pw(4.7), ry, { color: T.inkSoft, font: '13px Georgia' });
      Renderer.ink(String(r[1]), x + w - pw(4.7), ry, { align: 'right', font: 'bold 13px Georgia' });
    });

    button(x + pw(4.7), y + h - pw(9.7), pw(20.3), ph(7.5), 'НОВАЯ ИГРА', startNewGame, { font: 'bold 13px Georgia' });
    button(x + w - pw(25.0), y + h - pw(9.7), pw(20.3), ph(7.5), 'В МЕНЮ', function () { outcome = null; setState('menu'); },
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

    const x = centreX(900), y = cy(16.7), w = pw(70.3), h = ph(63.9);
    Renderer.paper(x, y, w, h, { r: 8, burn: 22 });
    Renderer.corners(x + pw(0.6), y + pw(0.6), w - pw(1.3), h - pw(1.3), 'rgba(120,80,30,0.45)');

    Renderer.ink('ПОСЛЕДНИЙ', W/2, y + pw(13.3), { align: 'center', font: 'bold 64px Georgia' });
    Renderer.ink('ЧЕЛОВЕК', W/2, y + pw(22.2), { align: 'center', font: 'bold 64px Georgia' });
    Renderer.text('агентство по трудоустройству монстров', W/2, y + pw(27.2),
      { color: T.inkSoft, align: 'center', font: 'italic 15px Georgia' });
    Renderer.rect(x + pw(7.8), y + pw(29.2), w - pw(15.6), pw(0.1), 'rgba(90,60,25,0.4)');

    const save = readSave();
    button(centreX(340), y + pw(34.7), pw(26.6), ph(8.9), 'НОВАЯ ИГРА', function () {
      Game.agency = Models.createAgency();
      setState('intro');
    }, { font: 'bold 16px Georgia' });

    button(centreX(340), y + pw(45.8), pw(26.6), ph(8.9), save ? ('ПРОДОЛЖИТЬ · день ' + save.day) : 'ПРОДОЛЖИТЬ', function () {
      if (loadGame()) { currentTab = 'hire'; setState('agency'); }
      else showToast('Сохранение не найдено');
    }, {
      variant: 'ghost',
      font: 'bold 15px Georgia',
      disabled: !saveAvailable,
      reason: 'Пока нет сохранения'
    });

    button(centreX(340), y + pw(56.9), pw(26.6), ph(8.9), 'КАК ИГРАТЬ', function () { helpFrom = 'menu'; setState('help'); },
      { variant: 'ghost', font: 'bold 15px Georgia' });

    Renderer.text('Мышь / тап. Esc — пауза, Enter — подтвердить.', W/2, y + h - pw(5.0),
      { color: '#7a6244', align: 'center', font: '11px Georgia' });
    Renderer.text('FEIS Game Jam · 2026', W/2, y + h - pw(2.2), { color: '#8a7355', align: 'center', font: '11px Georgia' });
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

    const x = centreX(800), y = cy(16.7), w = pw(62.5), h = ph(66.7);
    Renderer.paper(x, y, w, h, { r: 8, burn: 22 });
    Renderer.corners(x + pw(0.6), y + pw(0.6), w - pw(1.3), h - pw(1.3), 'rgba(120,80,30,0.45)');

    const lines = [
      'Герои ушли в другие измерения — качаться до бесконечности.',
      'Города остались. Монстры остались. Работы — ни у кого.',
      'Ты — последний человек, бывший клерк гильдии приёмов.',
      'Открыл агентство: горожане платят, монстры пугают. И врут в отчётах.',
      '',
      'Продержись 14 дней. На 14-й день бывший герой откроет своё агентство —',
      'и город достанется тому, чей монстр напишет убедительный отчёт.'
    ];

    Renderer.ink('ПОСЛЕДНИЙ ЧЕЛОВЕК', W/2, y + pw(9.7), { align: 'center', font: 'bold 36px Georgia' });
    Renderer.rect(x + pw(9.4), y + pw(11.7), w - pw(18.8), pw(0.1), 'rgba(90,60,25,0.4)');

    lines.forEach(function (line, i) {
      const shown = Math.min(line.length, Math.max(0, Math.floor((introTime - 0.2 - i * 0.25) * 60)));
      Renderer.ink(line.slice(0, shown), W/2, y + pw(18.1) + i * pw(4.4),
        { align: 'center', font: i >= 5 ? '11px Georgia' : '14px Georgia' });
    });

    if (introTime > 2.2) {
      button(centreX(360), y + h - pw(11.1), pw(28.1), ph(7.5), 'ОТКРЫТЬ АГЕНТСТВО', function () { setState('agency'); },
        { font: 'bold 13px Georgia' });
    } else {
      Renderer.text('клик — пропустить', W/2, y + h - pw(4.2), { color: '#7a6244', align: 'center', font: '10px Georgia' });
      addArea(0, 0, W, H, function () { introTime = 3; });
    }
  }

  // ── Помощь и пауза ───────────────────────────────────────────────────────
  function drawHelp() {
    hitAreas.length = 0;
    Renderer.rect(0, 0, W, H, 'rgba(4,3,1,0.86)');

    const x = centreX(900), y = cy(5.6), w = pw(70.3), h = ph(83.3);
    Renderer.paper(x, y, w, h, { r: 8, burn: 20 });
    Renderer.corners(x + pw(0.6), y + pw(0.6), w - pw(1.3), h - pw(1.3), 'rgba(120,80,30,0.45)');

    Renderer.ink('КАК ИГРАТЬ', W/2, y + pw(6.1), { align: 'center', font: 'bold 24px Georgia' });
    Renderer.rect(x + pw(9.4), y + pw(7.8), w - pw(18.8), pw(0.1), 'rgba(90,60,25,0.4)');

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
      const ry = y + pw(13.9) + i * pw(6.7);
      Renderer.ink(r[0], x + pw(3.1), ry, { font: 'bold 13px Georgia' });
      Renderer.text(r[1], x + pw(3.1), ry + pw(2.5), { color: T.inkSoft, font: '11px Georgia' });
    });

    Renderer.ink('Цель: дожить до 14-го дня и выиграть тендер у Героя-Директора.',
      W/2, y + h - pw(11.1), { align: 'center', font: '11px Georgia', color: '#6b4a18' });

    button(W/2 - 100, y + h - pw(8.3), pw(15.6), ph(6.1), 'ПОНЯТНО', closeHelp,
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

    const x = centreX(600), y = centreY(400), w = pw(46.9), h = ph(55.6);
    Renderer.paper(x, y, w, h, { r: 8, burn: 18 });
    Renderer.corners(x + pw(0.6), y + pw(0.6), w - pw(1.3), h - pw(1.3), 'rgba(120,80,30,0.45)');
    Renderer.ink('ПАУЗА', W/2, y + pw(9.7), { align: 'center', font: 'bold 32px Georgia' });

    button(centreX(360), y + pw(15.3), pw(28.1), ph(7.8), 'ПРОДОЛЖИТЬ', function () { setState('agency'); },
      { font: 'bold 15px Georgia' });
    button(centreX(360), y + pw(25.0), pw(28.1), ph(7.8), 'КАК ИГРАТЬ', function () { helpFrom = 'pause'; setState('help'); },
      { variant: 'ghost', font: 'bold 14px Georgia' });
    button(centreX(360), y + pw(34.7), pw(28.1), ph(7.8), 'В МЕНЮ', function () { saveGame(); setState('menu'); },
      { variant: 'ghost', font: 'bold 14px Georgia' });
  }

  // ── Тост ─────────────────────────────────────────────────────────────────
  function drawToast() {
    const font = 'bold 10px Georgia';
    Renderer.ctx.font = font;
    const tw = Math.min(480, Renderer.ctx.measureText(toast.msg).width + 30);
    const x = (W - tw) / 2, y = cy(15.0);

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
