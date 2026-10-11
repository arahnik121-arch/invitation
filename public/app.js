(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* =========================================================
   * Световая инсталляция: кинетическая решётка светящихся сфер
   * ========================================================= */
  const Light = (() => {
    const canvas = $("#light");
    const ctx = canvas.getContext("2d");
    let W = 0, H = 0, DPR = 1, pts = [], NX = 0, NZ = 0;
    let mode = 0, modeBlend = 0, nameBlend = 0;
    const NAME_MODE = 4;

    // Точечный шрифт 5×7 для имени
    const GLYPHS = {
      "К": ["1...1", "1..1.", "1.1..", "11...", "1.1..", "1..1.", "1...1"],
      "А": [".111.", "1...1", "1...1", "11111", "1...1", "1...1", "1...1"],
      "Т": ["11111", "..1..", "..1..", "..1..", "..1..", "..1..", "..1.."],
      "Я": [".1111", "1...1", "1...1", ".1111", "..1.1", ".1..1", "1...1"],
    };
    const NAME = "КАТЯ";
    const NAME_COLS = NAME.length * 6 - 1;
    const NAME_CELLS = [];
    [...NAME].forEach((ch, li) => GLYPHS[ch].forEach((row, r) => [...row].forEach((c, cc) => {
      if (c === "1") NAME_CELLS.push({ c: li * 6 + cc, r });
    })));
    NAME_CELLS.sort((a, b) => a.c - b.c || a.r - b.r);

    // Раздаём клетки имени сферам: слева направо, чтобы перетекание было плавным
    function assignName() {
      pts.forEach(p => { p.nc = null; p.nr = null; });
      const order = [...pts].sort((a, b) => a.u - b.u || a.v - b.v);
      const m = Math.min(NAME_CELLS.length, order.length);
      for (let k = 0; k < m; k++) {
        const p = order[Math.round(k * (order.length - 1) / Math.max(1, m - 1))];
        if (p.nc !== null) continue;
        p.nc = NAME_CELLS[k].c; p.nr = NAME_CELLS[k].r;
      }
    }
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

    // заранее отрисованный «блик» сферы
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = 64;
    {
      const s = sprite.getContext("2d");
      const g = s.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.12, "rgba(245,248,255,.95)");
      g.addColorStop(0.3, "rgba(220,232,255,.28)");
      g.addColorStop(1, "rgba(200,220,255,0)");
      s.fillStyle = g;
      s.fillRect(0, 0, 64, 64);
    }

    function heartY(x, f) {
      // x ∈ [-2, 2]; f ∈ [0..1] — от нижней кромки до верхней
      const ax = Math.min(Math.abs(x), 2);
      const top = Math.sqrt(Math.max(0, 1 - (ax - 1) ** 2));
      const bot = Math.acos(1 - ax) - Math.PI;
      return bot + (top - bot) * f;
    }

    function build() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const small = W < 700;
      const nx = small ? 13 : 23, nz = small ? 7 : 9;
      if (nx === NX && nz === NZ) return; // при ресайзе (адресная строка на телефоне) не сбрасываем сферы
      NX = nx; NZ = nz;
      pts = [];
      for (let iz = 0; iz < NZ; iz++) {
        for (let ix = 0; ix < NX; ix++) {
          const u = ix / (NX - 1) * 2 - 1;     // -1..1
          const v = iz / (NZ - 1);             //  0..1
          pts.push({ u, v, y: 0, seed: Math.random() * Math.PI * 2, nc: null, nr: null });
        }
      }
      assignName();
    }

    function targetY(p, t) {
      const { u, v, seed } = p;
      switch (mode) {
        case 0: // медленная длинная волна
          return Math.sin(t * 0.55 + u * 2.6 + v * 1.4) * 0.55 + Math.sin(t * 0.3 + v * 3) * 0.2;
        case 1: // взволнованная рябь — вопрос задан
          return Math.sin(t * 1.4 + Math.hypot(u * 2.2, (v - 0.5) * 3) * 4) * 0.42 + Math.sin(t * 2 + seed) * 0.06;
        case 2: // спокойная плоскость, поднятая к потолку
        case NAME_MODE: // свободные сферы ждут под потолком, пока горит имя
          return 0.95 + Math.sin(t * 0.7 + u * 1.5 + v * 2) * 0.12;
        case 3: // сердце
          return heartY(u * 1.9, v) * 0.5 + 0.35 + Math.sin(t * 1.6 + seed) * 0.025;
        default:
          return 0;
      }
    }

    let last = 0;
    function frame(ms) {
      const t = ms / 1000;
      // сглаживание не зависит от частоты кадров
      const dt = Math.min(0.25, last ? (ms - last) / 1000 : 1 / 60);
      last = ms;
      const k = r => 1 - Math.pow(1 - r, dt * 60);
      mouse.x += (mouse.tx - mouse.x) * k(0.04);
      mouse.y += (mouse.ty - mouse.y) * k(0.04);
      // Safari может отдать размер холста 0 при первом запуске и не всегда шлёт resize —
      // сверяем размер в каждом кадре.
      if (canvas.clientWidth !== W || canvas.clientHeight !== H || canvas.width !== Math.round(W * DPR)) build();
      ctx.clearRect(0, 0, W, H);

      const heart = mode === 3;
      modeBlend += ((heart ? 1 : 0) - modeBlend) * k(0.03);
      const hb = modeBlend;
      nameBlend += ((mode === NAME_MODE ? 1 : 0) - nameBlend) * k(mode === NAME_MODE ? 0.045 : 0.03);
      const nb = nameBlend;

      const cx = W / 2 + mouse.x * 30;
      const cy = H * 0.5 + mouse.y * 16;
      const F = Math.max(W, 900) * 0.82;                 // фокусное расстояние
      // сердце: плоский силуэт — справа от билета на десктопе, приглушённым фоном на телефоне
      const wide = W > 1000;
      const hw = wide ? Math.min(W * 0.3, H * 0.5) : Math.min(W * 0.9, H * 0.55);
      const hcx = (wide ? W * 0.74 : W / 2) + mouse.x * 12;
      const hcy = H * 0.5 + mouse.y * 8;
      const beat = Math.pow(Math.max(0, Math.sin(t * 2.6)), 14); // сердцебиение
      const hs = (hw / 4) * (1 + 0.05 * beat);
      const ease = k(heart ? 0.035 : 0.025);
      // имя: справа на десктопе (там же, где потом сердце), по центру на телефоне
      const nw = wide ? Math.min(W * 0.36, 560) : W * 0.84;
      const cell = nw / NAME_COLS;
      const ncx = (wide ? W * 0.74 : W / 2) + mouse.x * 10;
      const ncy = (wide ? H * 0.5 : H * 0.45) + mouse.y * 6;

      // рисуем от дальних рядов к ближним
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        p.y += (targetY(p, t) - p.y) * ease;

        const z3 = 2.2 + p.v * 3.2;
        const gx = cx + (p.u * 1.6) / z3 * F;
        const gy = cy - (p.y * 0.55) / z3 * F;
        const hx = hcx + p.u * 1.9 * hs;
        const hy = hcy - ((p.y - 0.35) / 0.5 + 1.07) * hs;
        let sx = gx + (hx - gx) * hb;
        let sy = gy + (hy - gy) * hb;
        let depth = 1 - p.v * (1 - hb * 0.6);
        let s = (2.2 / z3) * (1 - hb) + (wide ? 0.75 : 0.6) * hb;
        let fade = 1;
        if (nb > 0.001) {
          if (p.nc !== null) {
            // сфера-буква: лёгкое мерцание, как у живого света
            const flick = 1 + Math.sin(t * 3 + p.seed * 5) * 0.05;
            const nx = ncx + (p.nc - (NAME_COLS - 1) / 2) * cell;
            const ny = ncy + (p.nr - 3) * cell + Math.sin(t * 1.4 + p.nc * 0.35) * cell * 0.08;
            sx += (nx - sx) * nb;
            sy += (ny - sy) * nb;
            depth += (1 - depth) * nb;
            s += ((wide ? 0.95 : 0.8) * flick - s) * nb;
          } else {
            fade = 1 - nb * 0.75; // лишние сферы приглушаются под потолком
          }
        }

        // тросы
        ctx.strokeStyle = `rgba(242,242,239,${(0.04 + depth * 0.05) * fade})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        const wx = Math.round(sx) + 0.5; // ровная толщина всех тросов
        ctx.moveTo(wx, 0);
        ctx.lineTo(wx, sy);
        ctx.stroke();

        // сфера
        const size = (10 + depth * 18) * s * (W < 700 ? 0.8 : 1);
        ctx.globalAlpha = (0.35 + depth * 0.65) * (wide ? 1 : 1 - hb * 0.3) * fade;
        ctx.drawImage(sprite, sx - size / 2, sy - size / 2, size, size);
        ctx.globalAlpha = 1;
      }
      if (!reduceMotion) requestAnimationFrame(frame);
    }

    function setMode(m) { mode = m; if (reduceMotion) requestAnimationFrame(frame); }

    window.addEventListener("resize", () => { build(); if (reduceMotion) requestAnimationFrame(frame); });
    window.addEventListener("pointermove", e => {
      mouse.tx = (e.clientX / innerWidth) * 2 - 1;
      mouse.ty = (e.clientY / innerHeight) * 2 - 1;
    }, { passive: true });

    build();
    requestAnimationFrame(frame);
    return { setMode, NAME_MODE, sprite };
  })();

  /* =========================================================
   * Переходы между залами
   * ========================================================= */
  let step = 0, heartTimer = 0;
  function go(n) {
    step = n;
    $$(".scene").forEach(s => s.classList.toggle("is-active", +s.dataset.step === n));
    $$(".nav-item").forEach(i => i.classList.toggle("is-current", +i.dataset.stepLabel === n));
    clearTimeout(heartTimer);
    if (n === 3 && !reduceMotion) {
      // финал: сначала имя из света, потом сердце
      Light.setMode(Light.NAME_MODE);
      heartTimer = setTimeout(() => { if (step === 3) Light.setMode(3); }, 3600);
    } else {
      Light.setMode(n);
    }
    if (n !== 3) stopCountdown();
    const active = $(`.scene[data-step="${n}"]`);
    const focusable = active && active.querySelector("h1, h2");
    if (focusable) { focusable.setAttribute("tabindex", "-1"); focusable.focus({ preventScroll: true }); }
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    if (n !== 1) resetNo();
  }
  $$("[data-next]").forEach(b => b.addEventListener("click", () => go(step + 1)));

  function sparks(x, y, n = 28) {
    if (reduceMotion) return;
    for (let i = 0; i < n; i++) {
      const el = document.createElement("span");
      el.className = "spark";
      const a = Math.random() * Math.PI * 2;
      const d = 60 + Math.random() * 220;
      el.style.left = x + "px";
      el.style.top = y + "px";
      el.style.setProperty("--dx", Math.cos(a) * d + "px");
      el.style.setProperty("--dy", Math.sin(a) * d + "px");
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1500);
    }
  }

  /* =========================================================
   * Световой корги: собирается из искр, бежит к кнопке «нет»,
   * хватает её и уносит за край экрана
   * ========================================================= */
  const Corgi = (() => {
    const AMBER = [255, 168, 74], CREAM = [255, 244, 228];
    const tint = rgb => {
      const c = document.createElement("canvas");
      c.width = c.height = 48;
      const s = c.getContext("2d");
      const g = s.createRadialGradient(24, 24, 0, 24, 24, 24);
      g.addColorStop(0, `rgba(255,255,255,1)`);
      g.addColorStop(0.18, `rgba(${rgb},.95)`);
      g.addColorStop(0.45, `rgba(${rgb},.25)`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      s.fillStyle = g; s.fillRect(0, 0, 48, 48);
      return c;
    };
    const SPR_AMBER = tint(AMBER.join(","));
    const SPR_CREAM = tint(CREAM.join(","));

    // --- силуэт в локальных единицах: длина тела ≈ 1.4, морда вправо, y вниз ---
    const inE = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
    const inT = (px, py, [ax, ay], [bx, by], [cx, cy]) => {
      const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
      const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
      const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
      return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    };
    const EAR1 = [[0.44, -0.24], [0.47, -0.44], [0.545, -0.27]];
    const EAR2 = [[0.555, -0.27], [0.625, -0.44], [0.665, -0.22]];
    const inBody = (x, y) =>
      inE(x, y, -0.02, 0.01, 0.44, 0.145) ||      // длинное туловище-батон
      inE(x, y, 0.3, 0.02, 0.15, 0.155) ||        // грудь
      inE(x, y, -0.38, 0, 0.14, 0.15) ||          // пушистая попа
      inE(x, y, 0.42, -0.08, 0.1, 0.11) ||        // короткая шея
      inE(x, y, 0.55, -0.16, 0.145, 0.125) ||     // голова
      inE(x, y, 0.71, -0.11, 0.1, 0.065) ||       // морда
      inT(x, y, ...EAR1) || inT(x, y, ...EAR2) || // уши-локаторы
      inE(x, y, -0.535, -0.1, 0.06, 0.05);        // хвостик
    const isCream = (x, y) =>
      y > 0.07 || (x > 0.25 && y > -0.04 && inE(x, y, 0.3, 0.03, 0.13, 0.15)) ||
      (x > 0.63 && y > -0.16) || (Math.abs(x - 0.6) < 0.025 && y < -0.17 && y > -0.27);
    const EYE = [0.59, -0.19], NOSE = [0.805, -0.125], MOUTH = [0.79, -0.07];
    const HIPS = [-0.38, -0.27, 0.24, 0.34];
    const HIP_Y = 0.09;
    const LEG_PHASE = [0, Math.PI, Math.PI, 0];

    const STEP = 0.026;
    const SHAPE = [];
    for (let y = -0.55; y <= 0.18; y += STEP) {
      for (let x = -0.6; x <= 0.82; x += STEP) {
        const jx = x + (Math.random() - 0.5) * STEP * 0.35, jy = y + (Math.random() - 0.5) * STEP * 0.35;
        if (!inBody(jx, jy)) continue;
        if (Math.hypot(jx - EYE[0], jy - EYE[1]) < 0.03) continue; // глаз — тёмная точка
        SHAPE.push({ x: jx, y: jy, leg: -1, cream: isCream(jx, jy), big: false });
      }
    }
    HIPS.forEach((hx, leg) => {
      for (let dy = 0.01; dy <= 0.19; dy += STEP) {
        for (let dx = -0.026; dx <= 0.027; dx += STEP) {
          SHAPE.push({ x: dx, y: dy, leg, hx, cream: dy > 0.13, big: false });
        }
      }
    });
    SHAPE.push({ x: NOSE[0], y: NOSE[1], leg: -1, cream: true, big: true });

    let cv = null, ctx = null, raf = 0, run = null;

    function ensureCanvas() {
      if (cv) return;
      cv = document.createElement("canvas");
      cv.id = "corgi";
      cv.setAttribute("aria-hidden", "true");
      document.body.appendChild(cv);
      ctx = cv.getContext("2d");
    }
    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const easeOut = x => 1 - Math.pow(1 - x, 3);
    const clamp01 = x => Math.max(0, Math.min(1, x));

    // точка силуэта → экран (с учётом бега: подпрыгивание и шаги лап)
    function project(p, ox, oy, S, dir, phase, stride) {
      let lx = p.x, ly = p.y;
      if (p.leg >= 0) {
        // лапа качается вокруг бедра (HIP_Y), p.x/p.y — смещение от бедра
        const a = Math.sin(phase + LEG_PHASE[p.leg]) * 0.6 * stride;
        const c = Math.cos(a), s = Math.sin(a);
        lx = p.hx + p.x * c - p.y * s;
        ly = HIP_Y + p.x * s + p.y * c;
      }
      return [ox + lx * S * dir, oy + ly * S];
    }

    function start(btn, onGrab, onDone) {
      ensureCanvas(); size();
      const W = innerWidth, H = innerHeight;
      const S = Math.max(130, Math.min(W * 0.42, 290));
      const r = btn.getBoundingClientRect();
      const bx = r.left + r.width / 2, by = r.top + r.height / 2;

      // куда смотреть: туда, где больше места для разбега
      const edge = 0.68 * S + 24;                                // хвост не должен обрезаться краем экрана
      const roomR = bx - MOUTH[0] * S - edge;
      const roomL = (W - edge) - (bx + MOUTH[0] * S);
      const dir = roomR >= roomL ? 1 : -1;
      const ox1 = bx - dir * MOUTH[0] * S;                       // где окажется центр тела в момент укуса
      const oy = by - MOUTH[1] * S;
      const dist = Math.max(0, Math.min(Math.max(roomR, roomL), Math.max(S * 0.9, W * 0.32)));
      const ox0 = ox1 - dir * dist;

      const pts = SHAPE.map(p => {
        const a = Math.random() * Math.PI * 2, d = S * (0.6 + Math.random() * 1.6);
        const [tx, ty] = project(p, ox0, oy, S, dir, 0, 0);
        return { ...p, sx: tx + Math.cos(a) * d, sy: ty + Math.sin(a) * d, delay: Math.random() * 0.35 };
      });
      const trail = [];
      const speed = Math.max(W * 1.15, 650);
      const T_FORM = 1.15, T_HOP = 0.35, T_RUN = dist / speed, T_GRAB = 0.55;
      run = { btn, pts, trail, S, dir, ox0, ox1, oy, t0: performance.now(), grabbed: false, onGrab, onDone,
        T: { form: T_FORM, hop: T_FORM + T_HOP, run: T_FORM + T_HOP + T_RUN, grab: T_FORM + T_HOP + T_RUN + T_GRAB } };
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    }

    function tick(now) {
      if (!run) return;
      const R = run, t = (now - R.t0) / 1000, { S, dir, T } = R;
      const W = innerWidth, H = innerHeight;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";

      let ox = R.ox0, oy = R.oy, phase = 0, stride = 0, bob = 0, assemble = 1, alpha = 1;
      if (t < T.form) {
        assemble = t / T.form;
      } else if (t < T.hop) {
        const h = (t - T.form) / (T.hop - T.form);
        bob = -Math.sin(h * Math.PI) * S * 0.08;               // радостный подскок
      } else if (t < T.run) {
        const q = (t - T.hop) / Math.max(0.001, T.run - T.hop);
        ox = R.ox0 + (R.ox1 - R.ox0) * q;
        phase = t * 22; stride = 1;
        bob = -Math.abs(Math.sin(phase)) * S * 0.035;
      } else if (t < T.grab) {
        ox = R.ox1;
        if (!R.grabbed) { R.grabbed = true; R.onGrab && R.onGrab(mouthAt(ox, oy)); }
        const g = (t - T.run) / (T.grab - T.run);
        bob = -Math.sin(g * Math.PI) * S * 0.05;                // мотает головой с добычей
      } else {
        const q = t - T.grab;
        ox = R.ox1 + R.dir * q * Math.max(W * 1.25, 700) * Math.min(1, q * 3 + 0.3);
        phase = t * 24; stride = 1;
        bob = -Math.abs(Math.sin(phase)) * S * 0.035;
        if ((R.dir > 0 && ox - 0.7 * S > W + 20) || (R.dir < 0 && ox + 0.7 * S < -20)) return finish();
      }
      oy = R.oy + bob;

      // шлейф искр за бегущим корги
      if (stride && Math.random() < 0.9) {
        for (let i = 0; i < 3; i++) {
          R.trail.push({ x: ox - dir * 0.45 * S + (Math.random() - 0.5) * S * 0.2, y: oy + (Math.random() - 0.3) * S * 0.25,
            vx: -dir * (40 + Math.random() * 80), vy: -20 + Math.random() * 40, life: 1 });
        }
      }
      const dt = 1 / 60;
      for (let i = R.trail.length - 1; i >= 0; i--) {
        const s = R.trail[i];
        s.life -= dt * 1.6; s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.life <= 0) { R.trail.splice(i, 1); continue; }
        const sz = S * 0.07 * s.life;
        ctx.globalAlpha = s.life * 0.8;
        ctx.drawImage(SPR_AMBER, s.x - sz / 2, s.y - sz / 2, sz, sz);
      }

      const dotSize = Math.max(5, STEP * S * 1.9);
      for (const p of R.pts) {
        const [tx, ty] = project(p, ox, oy, S, dir, phase, stride);
        let x = tx, y = ty, a = alpha;
        if (assemble < 1) {
          const e = easeOut(clamp01((assemble * T.form - p.delay) / (T.form - 0.35)));
          x = p.sx + (tx - p.sx) * e; y = p.sy + (ty - p.sy) * e; a = 0.25 + 0.75 * e;
        }
        const sz = p.big ? dotSize * 1.7 : dotSize * (0.85 + Math.sin(t * 7 + p.x * 40) * 0.1);
        ctx.globalAlpha = a;
        ctx.drawImage(p.cream ? SPR_CREAM : SPR_AMBER, x - sz / 2, y - sz / 2, sz, sz);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      // кнопка в зубах
      if (R.grabbed) {
        const [mx, my] = mouthAt(ox, oy);
        const b = R.btn;
        b.style.left = mx - b.offsetWidth * (dir > 0 ? 0.15 : 0.85) + "px";
        b.style.top = my - b.offsetHeight * 0.35 + "px";
        b.style.transform = `rotate(${dir * (12 + Math.sin(t * 20) * 4)}deg) scale(.82)`;
      }
      raf = requestAnimationFrame(tick);
    }

    function mouthAt(ox, oy) { return [ox + run.dir * MOUTH[0] * run.S, oy + MOUTH[1] * run.S]; }

    function finish() {
      const R = run;
      stop();
      R && R.onDone && R.onDone();
    }
    function stop() {
      cancelAnimationFrame(raf);
      run = null;
      if (ctx) ctx.clearRect(0, 0, cv.width, cv.height);
    }
    return { start, stop, get active() { return !!run; } };
  })();

  /* =========================================================
   * Вопрос: «нет» не принимается
   * ========================================================= */
  const yes = $("#btn-yes");
  const no = $("#btn-no");
  const caption = $("#no-caption");
  const NO_LABELS = ["НЕТ", "ТОЧНО?", "ПОДУМАЙ ЕЩЁ", "НЕ-А", "ПРОМАХ", "Я ВСЁ РАВНО УБЕГУ", "ПОСЛЕДНИЙ ШАНС"];
  const NO_CAPTIONS = [
    "Экспонат «нет» руками не трогать.",
    "Эта кнопка из коллекции кинетического искусства — она движется сама.",
    "Интересный выбор. Но у экскурсовода другие данные.",
    "По статистике музея 100% Екатерин выбирают «да».",
    "Кнопка «да» растёт от ожидания. Посмотри на неё.",
    "Смотритель зала вежливо намекает на соседнюю кнопку.",
    "Ладно. Последняя попытка.",
  ];
  let dodges = 0, confiscating = false;
  const MAX_DODGES = NO_LABELS.length;

  function resetNo() {
    dodges = 0;
    confiscating = false;
    Corgi.stop();
    no.className = "btn btn-ghost btn-no";
    no.removeAttribute("style");
    no.textContent = NO_LABELS[0];
    no.hidden = false;
    yes.style.removeProperty("--grow");
    yes.classList.remove("is-glowing");
    yes.textContent = "ДА";
    caption.textContent = "";
  }

  function loosen() {
    const r = no.getBoundingClientRect();
    if (!no.classList.contains("is-loose")) {
      no.style.left = r.left + "px";
      no.style.top = r.top + "px";
      no.classList.add("is-loose");
      void no.offsetWidth; // зафиксировать стартовую позицию для перехода
    }
  }

  function woof(x, y) {
    const el = document.createElement("span");
    el.className = "woof";
    el.textContent = "ГАВ!";
    el.style.left = x + "px";
    el.style.top = y + "px";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  function confiscate() {
    // финал: кнопку «нет» уносит охранник музея — световой корги
    confiscating = true;
    yes.textContent = "ДА, КОНЕЧНО";
    if (reduceMotion) {
      no.classList.add("is-gone");
      caption.textContent = "Охрана музея изъяла экспонат «нет». Остался только один вариант.";
      setTimeout(() => { no.hidden = true; }, 350);
      return;
    }
    loosen();
    // кнопка отбегает на «сцену» внизу, где корги точно поместится целиком
    const S = Math.max(130, Math.min(innerWidth * 0.42, 290));
    const yr = yes.getBoundingClientRect();
    const bh = no.offsetHeight;
    const maxTop = innerHeight - 0.36 * S - 24 - bh;
    const top = Math.min(maxTop, Math.max(yr.bottom + 0.45 * S, innerHeight * 0.72 - bh / 2));
    const sx = Math.min(innerWidth - no.offsetWidth - 16, Math.max(yr.right + 24, innerWidth * 0.55));
    no.style.left = Math.max(16, sx) + "px";
    no.style.top = top + "px";
    no.textContent = "ЭЙ, ТЫ КТО?";
    caption.textContent = "Ой. Кажется, в зал проник посторонний…";
    setTimeout(() => startCorgi(), 450);
  }

  function startCorgi() {
    if (step !== 1 || no.hidden) return;
    Corgi.start(no,
      ([mx, my]) => {
        no.classList.add("is-carried");
        no.textContent = "НЕТ";
        woof(mx, my - Math.min(90, innerWidth * 0.16));
        caption.textContent = "Охрана музея изъяла экспонат «нет».";
      },
      () => {
        no.hidden = true;
        no.classList.remove("is-carried");
        caption.textContent = "Охрана музея изъяла экспонат «нет». Остался только один вариант.";
      });
  }

  function dodge(px, py) {
    if (step !== 1 || no.hidden || confiscating) return;
    dodges++;
    yes.style.setProperty("--grow", (1 + Math.min(dodges, 6) * 0.11).toFixed(2));
    if (dodges >= 3) yes.classList.add("is-glowing");

    if (dodges >= MAX_DODGES) return confiscate();

    loosen();
    no.textContent = NO_LABELS[dodges];
    caption.textContent = NO_CAPTIONS[dodges - 1];

    const bw = no.offsetWidth, bh = no.offsetHeight;
    const pad = 16;
    const yr = yes.getBoundingClientRect();
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < 24; i++) {
      const x = pad + Math.random() * Math.max(1, innerWidth - bw - pad * 2);
      const y = 80 + Math.random() * Math.max(1, innerHeight - bh - 160);
      const cx = x + bw / 2, cy = y + bh / 2;
      const fromPointer = Math.hypot(cx - px, cy - py);
      const overlapsYes = !(x + bw < yr.left - 12 || x > yr.right + 12 || y + bh < yr.top - 12 || y > yr.bottom + 12);
      const score = Math.min(fromPointer, 420) - (overlapsYes ? 1000 : 0) + Math.random() * 40;
      if (score > bestScore) { bestScore = score; best = { x, y }; }
    }
    no.style.left = best.x + "px";
    no.style.top = best.y + "px";
  }

  // мышь: убегает, когда курсор подбирается близко
  document.addEventListener("pointermove", e => {
    if (step !== 1 || no.hidden || e.pointerType === "touch") return;
    const r = no.getBoundingClientRect();
    const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
    const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
    if (Math.hypot(dx, dy) < 26) dodge(e.clientX, e.clientY);
  });
  // палец/клавиатура: прыгает при попытке нажать
  no.addEventListener("pointerdown", e => { e.preventDefault(); dodge(e.clientX, e.clientY); });
  no.addEventListener("click", e => {
    e.preventDefault();
    if (e.detail !== 0) return; // мышь/палец уже обработаны в pointerdown; здесь только клавиатура
    const r = no.getBoundingClientRect();
    dodge(r.left + r.width / 2, r.top + r.height / 2);
  });

  yes.addEventListener("click", e => {
    const r = yes.getBoundingClientRect();
    sparks(e.clientX || r.left + r.width / 2, e.clientY || r.top + r.height / 2, 40);
    Corgi.stop();
    no.hidden = true;
    caption.textContent = "Я знал.";
    setTimeout(() => go(2), reduceMotion ? 0 : 700);
  });

  /* =========================================================
   * Календарь
   * ========================================================= */
  const HOURS = { 0: "11:00 – 22:00", 3: "14:00 – 22:00", 4: "14:00 – 22:00", 5: "12:00 – 23:00", 6: "11:00 – 23:00" };
  const CLOSED = new Set([1, 2]); // пн, вт
  const fmtMonth = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" });
  const fmtLong = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const fmtShort = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const minDate = new Date(today); minDate.setDate(minDate.getDate() + 1);
  const maxDate = new Date(today); maxDate.setMonth(maxDate.getMonth() + 6);
  let view = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  let selected = null;

  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const sameDay = (a, b) => a && b && a.getTime() === b.getTime();

  function renderCal() {
    const grid = $("#cal-grid");
    grid.innerHTML = "";
    $("#cal-title").textContent = fmtMonth.format(view).replace(" г.", "");
    $("#cal-prev").disabled = view <= new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    $("#cal-next").disabled = view >= new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);

    const offset = (new Date(view.getFullYear(), view.getMonth(), 1).getDay() + 6) % 7;
    const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    for (let i = 0; i < offset; i++) grid.appendChild(Object.assign(document.createElement("span"), { className: "cal-empty" }));

    let firstFocusable = null;
    for (let d = 1; d <= days; d++) {
      const date = new Date(view.getFullYear(), view.getMonth(), d);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cal-day";
      b.textContent = d;
      b.dataset.date = iso(date);
      const past = date < minDate || date > maxDate;
      const closed = CLOSED.has(date.getDay());
      if (past) b.classList.add("is-past");
      if (closed) b.classList.add("is-closed");
      if (sameDay(date, today)) b.classList.add("is-today");
      if (sameDay(date, selected)) { b.classList.add("is-selected"); b.setAttribute("aria-pressed", "true"); }
      b.disabled = past || closed;
      b.setAttribute("aria-label", fmtLong.format(date) + (closed ? " — музей закрыт" : ""));
      if (!b.disabled) {
        b.addEventListener("click", () => pick(date));
        if (!firstFocusable) firstFocusable = b;
      }
      grid.appendChild(b);
    }
  }

  function pick(date) {
    selected = date;
    const picked = $("#picked");
    picked.textContent = fmtShort.format(date);
    picked.classList.remove("is-empty");
    $("#hours").textContent = `Музей открыт ${HOURS[date.getDay()]}`;
    $("#submit").disabled = false;
    $("#form-msg").textContent = "";
    renderCal();
  }

  $("#cal-prev").addEventListener("click", () => { view.setMonth(view.getMonth() - 1); renderCal(); });
  $("#cal-next").addEventListener("click", () => { view.setMonth(view.getMonth() + 1); renderCal(); });
  $("#picked").classList.add("is-empty");
  renderCal();

  /* =========================================================
   * Пожелания и отправка
   * ========================================================= */
  const wishes = $("#wishes");
  wishes.addEventListener("input", () => { $("#wish-count").textContent = wishes.value.length; });

  $("#rsvp").addEventListener("submit", async e => {
    e.preventDefault();
    const msg = $("#form-msg");
    const btn = $("#submit");
    if (!selected) { msg.textContent = "Сначала выбери дату в календаре."; msg.classList.add("is-error"); return; }

    const slot = ($("input[name=slot]:checked") || {}).value || "";
    btn.disabled = true;
    btn.textContent = "ОТПРАВЛЯЮ…";
    msg.classList.remove("is-error");
    msg.textContent = "";

    try {
      const res = await fetch("api/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: iso(selected),
          slot,
          wishes: wishes.value.trim(),
          website: $("#website").value,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);

      $("#ticket-date").textContent = fmtShort.format(selected);
      $("#ticket-slot").textContent = `${slot} · ${HOURS[selected.getDay()]}`;
      $("#ics-link").href = `api/ics?date=${iso(selected)}&slot=${encodeURIComponent(slot)}`;
      startCountdown(selected, slot);
      go(3);
      // на узком экране билет проявляется после имени из света
      const delay = innerWidth <= 1000 && !reduceMotion ? 4300 : 900;
      setTimeout(() => {
        if (step !== 3) return;
        const r = $(".ticket").getBoundingClientRect();
        sparks(r.left + r.width / 2, r.top + r.height / 2, 46);
      }, delay);
    } catch (err) {
      msg.textContent = "Письмо застряло где-то в темноте. Попробуй ещё раз — или просто скажи мне дату вслух ❤";
      msg.classList.add("is-error");
      console.error(err);
    } finally {
      btn.disabled = !selected;
      btn.textContent = "ПОДТВЕРДИТЬ";
    }
  });

  $("#restart").addEventListener("click", () => go(2));

  /* =========================================================
   * Обратный отсчёт на билете
   * ========================================================= */
  const SLOT_HOUR = { "Днём": 14, "Ближе к вечеру": 17, "Поздним вечером": 20 };
  let cdTimer = 0;
  function startCountdown(date, slot) {
    stopCountdown();
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate(), SLOT_HOUR[slot] || 17);
    const pad = n => String(n).padStart(2, "0");
    const tickCd = () => {
      let s = Math.max(0, Math.floor((target - Date.now()) / 1000));
      const d = Math.floor(s / 86400); s %= 86400;
      const h = Math.floor(s / 3600); s %= 3600;
      const m = Math.floor(s / 60); s %= 60;
      $("#cd-d").textContent = d;
      $("#cd-h").textContent = pad(h);
      $("#cd-m").textContent = pad(m);
      $("#cd-s").textContent = pad(s);
    };
    tickCd();
    cdTimer = setInterval(tickCd, 1000);
  }
  function stopCountdown() { clearInterval(cdTimer); }

  go(0);
})();
