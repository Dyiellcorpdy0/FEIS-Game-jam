window.Renderer = {
  ctx: null,
  tex: {},
  patterns: {},

  THEME: {
    bg:       '#0b0908',
    panel:    '#171a21',
    panelHi:  '#1f232c',
    border:   '#2c313c',
    text:     '#d6d9e0',
    muted:    '#8b919e',
    accent:   '#c9a227',
    gold:     '#f5c542',
    success:  '#4ade80',
    danger:   '#ef4444',
    select:   '#3b82f6',
    warn:     '#f97316',
    hero:     '#a855f7',
    // Палитра «старого пергамента и дерева»
    paper:    '#d8c49a',
    paperHi:  '#e4d2a8',
    paperLo:  '#bfa878',
    ink:      '#2a1c10',
    inkSoft:  '#4a3520',
    wood:     '#3a2415',
    woodLo:   '#241509',
    rust:     '#7a3a22',
    metal:    '#5a4a3a',
    grime:    'rgba(20,14,8,0.22)'
  },

  init(ctx) {
    this.ctx = ctx;
    this.initTextures();
  },

  // ── Процедурные текстуры ─────────────────────────────────────────────────
  _rand(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  _tile(w, h, seed, painter) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const c = document.createElement('canvas');
    if (!c) return null;
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (!g) return null;
    painter(g, w, h, this._rand(seed));
    return c;
  },

  initTextures() {
    const T = this.THEME;

    this.tex.paper = this._tile(160, 160, 1337, (g, w, h, rnd) => {
      g.fillStyle = T.paper;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 450; i++) {
        g.fillStyle = 'rgba(70,45,20,' + (0.02 + rnd() * 0.07).toFixed(3) + ')';
        g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
      }
      for (let i = 0; i < 40; i++) {
        g.strokeStyle = 'rgba(255,248,225,' + (0.03 + rnd() * 0.05).toFixed(3) + ')';
        g.lineWidth = 1;
        g.beginPath();
        const x = rnd() * w, y = rnd() * h;
        g.moveTo(x, y);
        g.lineTo(x + (rnd() - 0.5) * 40, y + (rnd() - 0.5) * 10);
        g.stroke();
      }
      for (let i = 0; i < 7; i++) {
        const x = rnd() * w, y = rnd() * h, r = 8 + rnd() * 26;
        const rg = g.createRadialGradient(x, y, 1, x, y, r);
        rg.addColorStop(0, 'rgba(120,80,40,0.10)');
        rg.addColorStop(1, 'rgba(120,80,40,0)');
        g.fillStyle = rg;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    });

    this.tex.wood = this._tile(160, 160, 4242, (g, w, h, rnd) => {
      g.fillStyle = T.wood;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) {
        const x = rnd() * w;
        g.strokeStyle = 'rgba(20,10,4,' + (0.05 + rnd() * 0.16).toFixed(3) + ')';
        g.lineWidth = 0.6 + rnd() * 1.6;
        g.beginPath();
        g.moveTo(x, 0);
        g.bezierCurveTo(x + 6, h * 0.33, x - 6, h * 0.66, x + 3, h);
        g.stroke();
      }
      for (let i = 0; i < 5; i++) {
        const x = rnd() * w, y = rnd() * h;
        g.strokeStyle = 'rgba(15,8,3,0.35)';
        g.lineWidth = 1;
        g.beginPath();
        g.ellipse(x, y, 3 + rnd() * 4, 7 + rnd() * 8, 0, 0, Math.PI * 2);
        g.stroke();
      }
      for (let i = 0; i < 25; i++) {
        g.fillStyle = 'rgba(255,220,170,' + (0.015 + rnd() * 0.03).toFixed(3) + ')';
        g.fillRect(rnd() * w, rnd() * h, 2, 1);
      }
    });

    this.tex.metal = this._tile(96, 96, 777, (g, w, h, rnd) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#6a5947');
      grad.addColorStop(0.45, '#4b3d2f');
      grad.addColorStop(1, '#2e241b');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) {
        g.fillStyle = 'rgba(20,14,8,' + (0.05 + rnd() * 0.2).toFixed(3) + ')';
        g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1);
      }
      for (let i = 0; i < 10; i++) {
        g.strokeStyle = 'rgba(170,140,100,' + (0.03 + rnd() * 0.06).toFixed(3) + ')';
        g.beginPath();
        g.moveTo(rnd() * w, rnd() * h);
        g.lineTo(rnd() * w, rnd() * h);
        g.stroke();
      }
    });

    this.tex.grime = this._tile(320, 240, 2024, (g, w, h, rnd) => {
      for (let i = 0; i < 700; i++) {
        g.fillStyle = 'rgba(8,5,3,' + (0.04 + rnd() * 0.16).toFixed(3) + ')';
        const s = 0.6 + rnd() * 2.4;
        g.fillRect(rnd() * w, rnd() * h, s, s);
      }
      for (let i = 0; i < 18; i++) {
        const x = rnd() * w, y = rnd() * h, r = 10 + rnd() * 40;
        const rg = g.createRadialGradient(x, y, 1, x, y, r);
        rg.addColorStop(0, 'rgba(10,6,3,0.10)');
        rg.addColorStop(1, 'rgba(10,6,3,0)');
        g.fillStyle = rg;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    });

    if (this.ctx && this.ctx.createPattern) {
      this.patterns.paper = this.tex.paper ? this.ctx.createPattern(this.tex.paper, 'repeat') : null;
      this.patterns.wood = this.tex.wood ? this.ctx.createPattern(this.tex.wood, 'repeat') : null;
      this.patterns.metal = this.tex.metal ? this.ctx.createPattern(this.tex.metal, 'repeat') : null;
      this.patterns.grime = this.tex.grime ? this.ctx.createPattern(this.tex.grime, 'repeat') : null;
    }
  },

  // ── Базовые примитивы ────────────────────────────────────────────────────
  alpha(hex, a) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  },

  rect(x, y, w, h, color) {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  },

  pathRoundRect(x, y, w, h, r) {
    const { ctx } = this;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  },

  roundRect(x, y, w, h, r, color) {
    this.pathRoundRect(x, y, w, h, r);
    this.ctx.fillStyle = color;
    this.ctx.fill();
  },

  roundRectStroke(x, y, w, h, r, color, lw = 1) {
    this.pathRoundRect(x, y, w, h, r);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lw;
    this.ctx.stroke();
  },

  text(str, x, y, { color = '#d6d9e0', size = '16px', align = 'start', font = 'system-ui', baseline = 'alphabetic', weight = 'normal', style = 'normal' } = {}) {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.font = font.includes('px') ? font : `${style} ${weight} ${size} ${font}`;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(str, x, y);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  },

  // Чернила на пергаменте: тёмный текст с лёгким светлым «выдавлением»
  ink(str, x, y, opts) {
    opts = opts || {};
    this.text(str, x + 1, y + 1, Object.assign({}, opts, { color: 'rgba(255,246,220,0.20)' }));
    this.text(str, x, y, Object.assign({}, opts, { color: opts.color || '#1a1008' }));
  },

  gradientRect(x, y, w, h, colorTop, colorBottom) {
    const { ctx } = this;
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, colorTop);
    grad.addColorStop(1, colorBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
  },

  wrapText(text, maxWidth, font) {
    const { ctx } = this;
    const prev = ctx.font;
    ctx.font = font;
    const words = String(text).split(' ');
    const lines = [];
    let line = '';
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    ctx.font = prev;
    return lines;
  },

  // ── Пергамент ────────────────────────────────────────────────────────────
  paper(x, y, w, h, opts) {
    opts = opts || {};
    const ctx = this.ctx;
    const r = opts.r == null ? 4 : opts.r;
    const burn = opts.burn == null ? 10 : opts.burn;
    const T = this.THEME;

    ctx.save();
    this.pathRoundRect(x, y, w, h, r);
    ctx.clip();

    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, T.paperHi);
    g.addColorStop(0.55, T.paper);
    g.addColorStop(1, T.paperLo);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);

    if (this.patterns.paper) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = this.patterns.paper;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }

    // Обожжённые края
    const edges = [
      [x, y, w, burn, 0, 0, 0, burn],
      [x, y + h - burn, w, burn, 0, h - burn, 0, h],
      [x, y, burn, h, 0, 0, burn, 0],
      [x + w - burn, y, burn, h, w - burn, 0, w, 0]
    ];
    edges.forEach(function (e) {
      const grad = ctx.createLinearGradient(x + e[4], y + e[5], x + e[6], y + e[7]);
      grad.addColorStop(0, 'rgba(52,30,12,0.72)');
      grad.addColorStop(0.55, 'rgba(70,42,18,0.28)');
      grad.addColorStop(1, 'rgba(70,42,18,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(e[0], e[1], e[2], e[3]);
    });

    // Внутренняя тень и пятна
    const vg = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.2,
      x + w / 2, y + h / 2, Math.max(w, h) * 0.62);
    vg.addColorStop(0, 'rgba(60,36,14,0)');
    vg.addColorStop(1, 'rgba(60,36,14,0.30)');
    ctx.fillStyle = vg;
    ctx.fillRect(x, y, w, h);

    ctx.restore();

    if (opts.frame !== false) {
      this.roundRectStroke(x, y, w, h, r, 'rgba(70,44,20,0.85)', 1.5);
      this.roundRectStroke(x + 3, y + 3, w - 6, h - 6, r, 'rgba(255,245,215,0.12)', 1);
    }
  },

  // Пергаментная карточка с «гвоздиком»
  note(x, y, w, h, opts) {
    opts = opts || {};
    this.paper(x, y, w, h, { r: 3, burn: 7 });
    if (opts.pin !== false) {
      const ctx = this.ctx;
      ctx.fillStyle = 'rgba(40,24,10,0.55)';
      ctx.beginPath();
      ctx.arc(x + w / 2, y + 5, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,240,210,0.45)';
      ctx.beginPath();
      ctx.arc(x + w / 2 - 0.7, y + 4.3, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  // ── Дерево и металл ──────────────────────────────────────────────────────
  wood(x, y, w, h, opts) {
    opts = opts || {};
    const ctx = this.ctx;
    const r = opts.r == null ? 3 : opts.r;

    ctx.save();
    this.pathRoundRect(x, y, w, h, r);
    ctx.clip();

    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#422917');
    g.addColorStop(0.5, '#341f10');
    g.addColorStop(1, '#22140a');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);

    if (this.patterns.wood) {
      ctx.globalAlpha = opts.grain == null ? 0.55 : opts.grain;
      ctx.fillStyle = this.patterns.wood;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }

    const plank = opts.plank || 26;
    ctx.strokeStyle = 'rgba(12,6,2,0.55)';
    ctx.lineWidth = 1;
    for (let yy = y + plank; yy < y + h; yy += plank) {
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,220,170,0.05)';
    ctx.fillRect(x, y, w, 1.5);

    ctx.restore();
    this.roundRectStroke(x, y, w, h, r, '#1a0f07', 1.5);

    if (opts.nails !== false) {
      this.rivet(x + 7, y + 7);
      this.rivet(x + w - 7, y + 7);
      if (h > 34) {
        this.rivet(x + 7, y + h - 7);
        this.rivet(x + w - 7, y + h - 7);
      }
    }
  },

  metal(x, y, w, h, opts) {
    opts = opts || {};
    const ctx = this.ctx;
    const r = opts.r == null ? 3 : opts.r;

    ctx.save();
    this.pathRoundRect(x, y, w, h, r);
    ctx.clip();

    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#6b5945');
    g.addColorStop(0.45, '#4a3c2e');
    g.addColorStop(1, '#2b2118');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);

    if (this.patterns.metal) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = this.patterns.metal;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = 'rgba(255,235,200,0.12)';
    ctx.fillRect(x, y, w, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x, y + h - 1.5, w, 1.5);

    ctx.restore();
    this.roundRectStroke(x, y, w, h, r, '#1b1410', 1.5);

    if (opts.rivets !== false) {
      this.rivet(x + 8, y + 8);
      this.rivet(x + w - 8, y + 8);
      this.rivet(x + 8, y + h - 8);
      this.rivet(x + w - 8, y + h - 8);
    }
  },

  rivet(cx, cy, r) {
    r = r || 3;
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.4, 0.5, cx, cy, r);
    g.addColorStop(0, '#c9b28c');
    g.addColorStop(0.6, '#6c5842');
    g.addColorStop(1, '#2a2018');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  },

  // ── Замок (закрытый слот) ────────────────────────────────────────────────
  lockIcon(cx, cy, size, color) {
    const ctx = this.ctx;
    color = color || '#6b5a45';
    const s = size;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, s * 0.14);
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.18, s * 0.26, Math.PI, 0);
    ctx.stroke();

    const bodyW = s * 0.62, bodyH = s * 0.46;
    this.roundRect(cx - bodyW / 2, cy - s * 0.02, bodyW, bodyH, s * 0.08, color);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy + s * 0.16, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - s * 0.025, cy + s * 0.18, s * 0.05, s * 0.12);
    ctx.restore();
  },

  // ── Ржавая цепь (ручка сворачивания панели) ──────────────────────────────
  chain(x, yTop, yBottom, opts) {
    opts = opts || {};
    const ctx = this.ctx;
    const linkH = 9;
    ctx.save();
    for (let y = yTop, i = 0; y < yBottom; y += linkH, i++) {
      ctx.beginPath();
      ctx.ellipse(x, y + linkH / 2, i % 2 ? 2.6 : 4.4, linkH / 2, 0, 0, Math.PI * 2);
      ctx.strokeStyle = i % 2 ? '#7c6a52' : '#9c8564';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(30,20,10,0.55)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    const ry = yBottom + 8;
    ctx.beginPath();
    ctx.arc(x, ry, 8, 0, Math.PI * 2);
    ctx.strokeStyle = '#a08a63';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(20,12,6,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  },

  // ── Атмосферные наложения ────────────────────────────────────────────────
  grime(w, h, alpha) {
    if (!this.patterns.grime) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 0.55 : alpha;
    ctx.fillStyle = this.patterns.grime;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  },

  vignette(w, h, strength) {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,' + (strength == null ? 0.55 : strength) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  },

  corners(x, y, w, h, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color || 'rgba(201,162,39,0.55)';
    ctx.lineWidth = 1.4;
    const s = 10;
    [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(function (c) {
      ctx.beginPath();
      ctx.moveTo(c[0] + c[2] * s, c[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.lineTo(c[0], c[1] + c[3] * s);
      ctx.stroke();
    });
    ctx.restore();
  },

  // ── Изображения ──────────────────────────────────────────────────────────
  drawImage(name, x, y, w, h) {
    const img = window.Assets.get(name);
    if (img && img.complete && img.naturalWidth > 0) {
      this.ctx.drawImage(img, x, y, w, h);
      return true;
    }
    return false;
  },

  drawIcon(name, x, y, w, h, { label = '', color = '#2c313c' } = {}) {
    if (this.drawImage(name, x, y, w, h)) return true;
    this.roundRect(x, y, w, h, 5, color);
    this.roundRectStroke(x, y, w, h, 5, this.THEME.border, 1);
    if (label) {
      this.text(String(label).charAt(0).toUpperCase(), x + w / 2, y + h / 2 + h * 0.18, {
        color: '#0e0f13', align: 'center', font: `bold ${Math.round(h * 0.5)}px system-ui`
      });
    }
    return false;
  },

  drawMonsterIcon(name, x, y, size) {
    if (this.drawImage(name, x, y, size, size)) return true;
    this.roundRect(x, y, size, size, 4, '#1a1520');
    this.roundRectStroke(x, y, size, size, 4, this.THEME.border, 1);
    return false;
  },

  drawCard(name, x, y, w, h, borderColor = null) {
    const ctx = this.ctx;
    this.roundRect(x, y, w, h, 8, '#1a1520');
    this.roundRectStroke(x, y, w, h, 8, borderColor || this.THEME.border, 1.5);

    const pad = 8;
    const imgW = w - pad * 2;
    const imgH = h - pad * 2 - 30;
    const drawn = this.drawImage(name, x + pad, y + pad, imgW, imgH);

    if (!drawn) {
      ctx.fillStyle = '#2d1f14';
      ctx.fillRect(x + pad, y + pad, imgW, imgH);
      ctx.fillStyle = this.THEME.muted;
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(name, x + w / 2, y + h / 2);
      ctx.textAlign = 'start';
    }
    return drawn;
  }
};
