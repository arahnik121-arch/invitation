"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

/* ---------------- Настройки (через переменные окружения) ---------------- */
const PORT = Number(process.env.PORT || 8080);
const HIS_EMAIL = process.env.MAIL_TO_HIM || "arahnik121@gmail.com";
const HER_EMAIL = process.env.MAIL_TO_HER || "kate.buryleva@gmail.com";
const HER_NAME = process.env.HER_NAME || "Екатерина";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const MAIL_FROM = process.env.MAIL_FROM || (SMTP_USER ? `"DARK MATTER · Приглашение" <${SMTP_USER}>` : "");
const DRY_RUN = process.env.DRY_RUN === "1" || !SMTP_USER || !SMTP_PASS;
const TICKETS_URL = "https://www.darkmatter.berlin/tickets";
const PUBLIC_DIR = path.join(__dirname, "public");

const transport = DRY_RUN
  ? null
  : nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

/* ---------------- Даты ---------------- */
const HOURS = { 0: "11:00–22:00", 3: "14:00–22:00", 4: "14:00–22:00", 5: "12:00–23:00", 6: "11:00–23:00" };
const SLOTS = new Set(["Днём", "Ближе к вечеру", "Поздним вечером"]);
const fmtDate = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function parseDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diffDays = (d.getTime() - todayUtc) / 86400000;
  if (diffDays < 0 || diffDays > 220) return null;
  if (!HOURS[d.getUTCDay()]) return null; // пн/вт — музей закрыт
  return d;
}

/* ---------------- Письма ---------------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function ics(dateStr) {
  const d = dateStr.replace(/-/g, "");
  const next = new Date(dateStr + "T00:00:00Z");
  next.setUTCDate(next.getUTCDate() + 1);
  const end = next.toISOString().slice(0, 10).replace(/-/g, "");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//best-invitation//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:date-${d}@best-invitation.corgi-joy.uk`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${d}`,
    `DTEND;VALUE=DATE:${end}`,
    "SUMMARY:Свидание · DARK MATTER Berlin",
    "LOCATION:DARK MATTER\\, Köpenicker Chaussee 46\\, 10317 Berlin",
    "DESCRIPTION:Световая экспозиция для двоих.",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

function shell(inner) {
  return `<!doctype html><html lang="ru"><body style="margin:0;background:#000;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000;">
<tr><td align="center" style="padding:36px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;border:1px solid #f2f2ef;background:#000;color:#f2f2ef;font-family:Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 30px 8px;font-size:12px;letter-spacing:4px;font-weight:bold;">DARK MATTER · BERLIN</td></tr>
${inner}
<tr><td style="padding:22px 30px;border-top:1px solid #333;font-size:10px;letter-spacing:3px;color:#8a8a88;">KÖPENICKER CHAUSSEE 46 · 10317 BERLIN</td></tr>
</table></td></tr></table></body></html>`;
}

function row(label, value) {
  return `<tr><td style="padding:12px 30px 0;font-size:10px;letter-spacing:3px;color:#8a8a88;">${label}</td></tr>
<tr><td style="padding:4px 30px 0;font-size:17px;line-height:1.5;">${value}</td></tr>`;
}

function buildMails({ date, slot, wishes }) {
  const label = fmtDate.format(new Date(date + "T00:00:00Z")).replace(/\s?г\.$/, "");
  const hours = HOURS[new Date(date + "T00:00:00Z").getUTCDay()];
  const wishesHtml = wishes ? esc(wishes).replace(/\n/g, "<br>") : "<span style=\"color:#8a8a88\">— без пожеланий, полностью доверяет тебе —</span>";
  const big = `<tr><td style="padding:18px 30px 6px;font-size:28px;line-height:1.15;text-transform:uppercase;font-weight:bold;">${esc(label)}</td></tr>`;
  const attachments = [{ filename: "svidanie.ics", content: ics(date), contentType: "text/calendar; charset=utf-8" }];

  const toHim = {
    from: MAIL_FROM,
    to: HIS_EMAIL,
    replyTo: HER_EMAIL,
    subject: `💌 ${HER_NAME} сказала «да»: ${label}`,
    text:
      `${HER_NAME} согласилась пойти на свидание!\n\n` +
      `Дата: ${label}\nКогда удобнее: ${slot}\nЧасы работы музея: ${hours}\n\n` +
      `Пожелания:\n${wishes || "— без пожеланий —"}\n\nБилеты: ${TICKETS_URL}\n`,
    html: shell(
      `<tr><td style="padding:14px 30px 0;font-size:11px;letter-spacing:3px;color:#8a8a88;">${esc(HER_NAME.toUpperCase())} СКАЗАЛА «ДА»</td></tr>` +
        big +
        row("КОГДА УДОБНЕЕ", esc(slot)) +
        row("ЧАСЫ РАБОТЫ МУЗЕЯ", hours) +
        row("ПОЖЕЛАНИЯ К СВИДАНИЮ", wishesHtml) +
        `<tr><td style="padding:28px 30px 30px;"><a href="${TICKETS_URL}" style="display:inline-block;background:#f2f2ef;color:#000;text-decoration:none;font-size:12px;letter-spacing:3px;padding:14px 24px;font-weight:bold;">КУПИТЬ БИЛЕТЫ</a></td></tr>`
    ),
    attachments,
  };

  const toHer = {
    from: MAIL_FROM,
    to: HER_EMAIL,
    replyTo: HIS_EMAIL,
    subject: `Твой билет на свидание · ${label}`,
    text:
      `${HER_NAME}, спасибо за «да»!\n\n` +
      `Дата: ${label}\nКогда: ${slot}\nМесто: DARK MATTER, Köpenicker Chaussee 46, Berlin\n\n` +
      (wishes ? `Твои пожелания уже у меня:\n${wishes}\n\n` : "") +
      `Билеты куплю я. Тебе остаётся только прийти.\n`,
    html: shell(
      `<tr><td style="padding:14px 30px 0;font-size:11px;letter-spacing:3px;color:#8a8a88;">ВХОДНОЙ БИЛЕТ · 2 ПЕРСОНЫ</td></tr>` +
        big +
        row("КОГДА", esc(slot)) +
        row("МЕСТО", "DARK MATTER, Köpenicker Chaussee 46") +
        (wishes ? row("ТВОИ ПОЖЕЛАНИЯ УЖЕ У МЕНЯ", wishesHtml) : "") +
        `<tr><td style="padding:24px 30px 30px;font-size:16px;line-height:1.6;color:#cfcfcc;">Спасибо за «да». Билеты куплю я — тебе остаётся только прийти. ❤</td></tr>`
    ),
    attachments,
  };

  return [toHim, toHer];
}

/* ---------------- Ограничение частоты ---------------- */
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 3600_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 8;
}

/* ---------------- HTTP ---------------- */
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};

function json(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS });
  res.end(JSON.stringify(obj));
}

function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR)) return json(res, 403, { ok: false });
  fs.readFile(file, (err, buf) => {
    if (err) {
      // любой неизвестный путь → главная
      return fs.readFile(path.join(PUBLIC_DIR, "index.html"), (e2, idx) => {
        if (e2) return json(res, 404, { ok: false });
        res.writeHead(200, { "Content-Type": TYPES[".html"], "Cache-Control": "no-cache", ...SECURITY_HEADERS });
        res.end(idx);
      });
    }
    const ext = path.extname(file);
    res.writeHead(200, {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300",
      ...SECURITY_HEADERS,
    });
    res.end(req.method === "HEAD" ? undefined : buf);
  });
}

function readBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", c => {
      size += c.length;
      if (size > limit) { reject(new Error("too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleRsvp(req, res) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
  if (limited(ip)) return json(res, 429, { ok: false, error: "Слишком много попыток, попробуй через час" });

  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { ok: false, error: "Bad request" }); }

  if (body.website) return json(res, 200, { ok: true }); // бот заполнил ловушку — тихо игнорируем

  const d = parseDate(body.date);
  if (!d) return json(res, 400, { ok: false, error: "Неверная дата" });
  const slot = SLOTS.has(body.slot) ? body.slot : "Ближе к вечеру";
  const wishes = typeof body.wishes === "string" ? body.wishes.trim().slice(0, 1500) : "";
  const data = { date: body.date, slot, wishes };

  const mails = buildMails(data);
  try {
    if (DRY_RUN) {
      for (const m of mails) console.log(`[DRY_RUN] письмо → ${m.to}\n  Тема: ${m.subject}\n${m.text.replace(/^/gm, "  ")}`);
    } else {
      await Promise.all(mails.map(m => transport.sendMail(m)));
    }
    console.log(`RSVP: ${data.date} · ${slot} · пожелания: ${wishes ? wishes.length + " симв." : "нет"}`);
    json(res, 200, { ok: true });
  } catch (err) {
    console.error("Ошибка отправки почты:", err.message);
    json(res, 502, { ok: false, error: "Не удалось отправить письмо" });
  }
}

module.exports = { buildMails };
if (require.main !== module) return;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/healthz") return json(res, 200, { ok: true });
  if (url.pathname === "/api/rsvp") {
    if (req.method !== "POST") return json(res, 405, { ok: false });
    return handleRsvp(req, res).catch(err => { console.error(err); json(res, 500, { ok: false }); });
  }
  if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { ok: false });
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Приглашение работает на :${PORT}${DRY_RUN ? " (DRY_RUN: письма только в лог)" : ""}`);
});

for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => server.close(() => process.exit(0)));
