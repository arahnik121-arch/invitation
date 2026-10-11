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
    let mode = 0, modeBlend = 0;
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
          pts.push({ u, v, y: 0, seed: Math.random() * Math.PI * 2 });
        }
      }
    }

    function targetY(p, t) {
      const { u, v, seed } = p;
      switch (mode) {
        case 0: // медленная длинная волна
          return Math.sin(t * 0.55 + u * 2.6 + v * 1.4) * 0.55 + Math.sin(t * 0.3 + v * 3) * 0.2;
        case 1: // взволнованная рябь — вопрос задан
          return Math.sin(t * 1.4 + Math.hypot(u * 2.2, (v - 0.5) * 3) * 4) * 0.42 + Math.sin(t * 2 + seed) * 0.06;
        case 2: // спокойная плоскость, поднятая к потолку
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

      // рисуем от дальних рядов к ближним
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        p.y += (targetY(p, t) - p.y) * ease;

        const z3 = 2.2 + p.v * 3.2;
        const gx = cx + (p.u * 1.6) / z3 * F;
        const gy = cy - (p.y * 0.55) / z3 * F;
        const hx = hcx + p.u * 1.9 * hs;
        const hy = hcy - ((p.y - 0.35) / 0.5 + 1.07) * hs;
        const sx = gx + (hx - gx) * hb;
        const sy = gy + (hy - gy) * hb;
        const depth = 1 - p.v * (1 - hb * 0.6);
        const s = (2.2 / z3) * (1 - hb) + (wide ? 0.75 : 0.6) * hb;

        // тросы
        ctx.strokeStyle = `rgba(242,242,239,${0.04 + depth * 0.05})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        const wx = Math.round(sx) + 0.5; // ровная толщина всех тросов
        ctx.moveTo(wx, 0);
        ctx.lineTo(wx, sy);
        ctx.stroke();

        // сфера
        const size = (10 + depth * 18) * s * (W < 700 ? 0.8 : 1);
        ctx.globalAlpha = (0.35 + depth * 0.65) * (wide ? 1 : 1 - hb * 0.3);
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
    return { setMode };
  })();

  /* =========================================================
   * Переходы между залами
   * ========================================================= */
  let step = 0;
  function go(n) {
    step = n;
    $$(".scene").forEach(s => s.classList.toggle("is-active", +s.dataset.step === n));
    $$(".nav-item").forEach(i => i.classList.toggle("is-current", +i.dataset.stepLabel === n));
    Light.setMode(n);
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
  let dodges = 0;
  const MAX_DODGES = NO_LABELS.length;

  function resetNo() {
    dodges = 0;
    no.className = "btn btn-ghost btn-no";
    no.removeAttribute("style");
    no.textContent = NO_LABELS[0];
    no.hidden = false;
    yes.style.removeProperty("--grow");
    yes.classList.remove("is-glowing");
    yes.textContent = "ДА";
    caption.textContent = "";
  }

  function dodge(px, py) {
    if (step !== 1 || no.hidden) return;
    dodges++;
    yes.style.setProperty("--grow", (1 + Math.min(dodges, 6) * 0.11).toFixed(2));
    if (dodges >= 3) yes.classList.add("is-glowing");

    if (dodges >= MAX_DODGES) {
      no.classList.add("is-gone");
      caption.textContent = "Кнопка «нет» ушла на техническое обслуживание. Навсегда.";
      yes.textContent = "ДА, КОНЕЧНО";
      setTimeout(() => { no.hidden = true; }, 350);
      return;
    }

    const r = no.getBoundingClientRect();
    if (!no.classList.contains("is-loose")) {
      no.style.left = r.left + "px";
      no.style.top = r.top + "px";
      no.classList.add("is-loose");
      void no.offsetWidth; // зафиксировать стартовую позицию для перехода
    }
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
      go(3);
      const r = $(".ticket").getBoundingClientRect();
      setTimeout(() => sparks(r.left + r.width / 2, r.top + r.height / 2, 46), 900);
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

  go(0);
})();
