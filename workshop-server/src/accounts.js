// Anvil-Studio-Konten: Registrierung mit E-Mail + Passwort, Bestätigungscode per Mail,
// Passwort zurücksetzen, Sitzungen. Passwörter werden mit scrypt (Salt pro Konto) gehasht.
import crypto from "node:crypto";
import { promisify } from "node:util";
import nodemailer from "nodemailer";

const scrypt = promisify(crypto.scrypt);
const now = () => Math.floor(Date.now() / 1000);
const SESSION_DAYS = 180;
const CODE_MINUTES = 15;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export function migrateAccounts(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      pw_hash TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_login INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS account_codes (
      email TEXT NOT NULL,
      purpose TEXT NOT NULL,           -- verify | reset
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (email, purpose)
    );
    CREATE TABLE IF NOT EXISTS account_sessions (
      token_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);
}

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}
async function checkPassword(pw, stored) {
  const [, s, k] = String(stored).split("$");
  if (!s || !k) return false;
  const key = await scrypt(pw, Buffer.from(s, "base64"), 64, { N: 16384, r: 8, p: 1 });
  const want = Buffer.from(k, "base64");
  return want.length === key.length && crypto.timingSafeEqual(want, key);
}
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

/** Mailversand: SMTP aus der Umgebung. Ohne SMTP_HOST landen Codes nur im Server-Log (für Tests). */
function makeMailer(log) {
  const host = process.env.SMTP_HOST;
  if (!host) {
    log.warn("SMTP_HOST fehlt – Bestätigungscodes werden nur ins Log geschrieben.");
    return { configured: false, send: async (to, subject, text) => log.info({ to, subject, text }, "Mail (nicht gesendet)") };
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const t = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "1" : port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" } : undefined,
  });
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  return { configured: true, send: (to, subject, text) => t.sendMail({ from, to, subject, text }) };
}

const TEXTS = {
  de: {
    verifySubject: "Dein Anvil-Studio-Code: {code}",
    verify: "Hallo{name},\n\ndein Bestätigungscode für Anvil Studio lautet:\n\n    {code}\n\nEr ist {min} Minuten gültig. Wenn du dich nicht registriert hast, kannst du diese Mail ignorieren.\n\nAnvil Studio",
    resetSubject: "Anvil Studio: Passwort zurücksetzen ({code})",
    reset: "Hallo{name},\n\nmit diesem Code setzt du dein Passwort für Anvil Studio zurück:\n\n    {code}\n\nEr ist {min} Minuten gültig. Wenn du das nicht angefordert hast, ignoriere diese Mail – dein Passwort bleibt unverändert.\n\nAnvil Studio",
  },
  en: {
    verifySubject: "Your Anvil Studio code: {code}",
    verify: "Hi{name},\n\nyour Anvil Studio confirmation code is:\n\n    {code}\n\nIt is valid for {min} minutes. If you didn't sign up, just ignore this email.\n\nAnvil Studio",
    resetSubject: "Anvil Studio: reset your password ({code})",
    reset: "Hi{name},\n\nuse this code to reset your Anvil Studio password:\n\n    {code}\n\nIt is valid for {min} minutes. If you didn't ask for this, ignore this email – your password stays the same.\n\nAnvil Studio",
  },
};
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

/** Einfache Bremse gegen Durchprobieren: pro Schlüssel höchstens n Versuche je Zeitfenster */
function limiter(max, windowSec) {
  const hits = new Map();
  return (key) => {
    const t = now();
    const h = (hits.get(key) || []).filter((x) => x > t - windowSec);
    if (h.length >= max) return false;
    h.push(t);
    hits.set(key, h);
    if (hits.size > 50000) hits.clear();
    return true;
  };
}

export function registerAccountRoutes(app, db, fail) {
  migrateAccounts(db);
  const mailer = makeMailer(app.log);
  const ipLimit = limiter(30, 15 * 60);
  const mailLimit = limiter(5, 60 * 60);

  const lang = (req) => (String(req.body?.lang || req.headers["accept-language"] || "").toLowerCase().startsWith("de") ? "de" : "en");
  const cleanEmail = (e) => String(e || "").trim().toLowerCase();
  const guard = (req) => {
    if (!ipLimit(req.ip)) throw fail(429, "Zu viele Versuche. Bitte warte ein paar Minuten.");
  };

  async function sendCode(email, purpose, l, name) {
    if (!mailLimit(`${purpose}:${email}`)) throw fail(429, "Es wurden schon viele Codes verschickt. Bitte warte etwas und schau auch im Spam-Ordner.");
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    db.prepare("INSERT OR REPLACE INTO account_codes(email, purpose, code_hash, expires_at, attempts) VALUES(?, ?, ?, ?, 0)").run(email, purpose, sha(`${purpose}:${email}:${code}`), now() + CODE_MINUTES * 60);
    const T = TEXTS[l];
    const v = { code, min: CODE_MINUTES, name: name ? ` ${name}` : "" };
    try {
      await mailer.send(email, fill(purpose === "verify" ? T.verifySubject : T.resetSubject, v), fill(purpose === "verify" ? T.verify : T.reset, v));
    } catch (e) {
      app.log.error(e, "Mailversand fehlgeschlagen");
      throw fail(502, "Die E-Mail konnte gerade nicht verschickt werden. Bitte später nochmal versuchen.");
    }
  }

  function useCode(email, purpose, code) {
    const row = db.prepare("SELECT * FROM account_codes WHERE email = ? AND purpose = ?").get(email, purpose);
    if (!row || row.expires_at < now()) throw fail(400, "Der Code ist abgelaufen. Lass dir einen neuen schicken.");
    if (row.attempts >= 5) throw fail(429, "Zu viele falsche Codes. Lass dir einen neuen schicken.");
    if (row.code_hash !== sha(`${purpose}:${email}:${String(code || "").replace(/\D/g, "")}`)) {
      db.prepare("UPDATE account_codes SET attempts = attempts + 1 WHERE email = ? AND purpose = ?").run(email, purpose);
      throw fail(400, "Der Code stimmt nicht.");
    }
    db.prepare("DELETE FROM account_codes WHERE email = ? AND purpose = ?").run(email, purpose);
  }

  function newSession(acc) {
    const token = crypto.randomBytes(32).toString("hex");
    db.prepare("DELETE FROM account_sessions WHERE expires_at < ?").run(now());
    db.prepare("INSERT INTO account_sessions(token_hash, account_id, created_at, expires_at) VALUES(?, ?, ?, ?)").run(sha(token), acc.id, now(), now() + SESSION_DAYS * 86400);
    db.prepare("UPDATE accounts SET last_login = ? WHERE id = ?").run(now(), acc.id);
    return { token, account: publicAccount(acc) };
  }
  const publicAccount = (a) => ({ id: a.id, email: a.email, name: a.name, verified: !!a.verified, createdAt: a.created_at });

  function accountOf(req) {
    const h = req.headers.authorization || "";
    if (!h.startsWith("Bearer ")) return null;
    const s = db.prepare("SELECT a.* FROM account_sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?").get(sha(h.slice(7)), now());
    return s || null;
  }
  const checkPw = (pw) => {
    if (typeof pw !== "string" || pw.length < 8) throw fail(400, "Das Passwort muss mindestens 8 Zeichen lang sein.");
    if (pw.length > 200) throw fail(400, "Das Passwort ist zu lang.");
  };

  app.post("/api/account/register", async (req) => {
    guard(req);
    const email = cleanEmail(req.body?.email);
    const name = String(req.body?.name || "").trim().slice(0, 40);
    const pw = req.body?.password;
    if (!EMAIL_RE.test(email)) throw fail(400, "Bitte gib eine gültige E-Mail-Adresse ein.");
    checkPw(pw);
    const existing = db.prepare("SELECT * FROM accounts WHERE email = ?").get(email);
    if (existing?.verified) throw fail(409, "Mit dieser E-Mail gibt es schon ein Konto. Melde dich an oder setze dein Passwort zurück.");
    const hash = await hashPassword(pw);
    if (existing) db.prepare("UPDATE accounts SET pw_hash = ?, name = ? WHERE id = ?").run(hash, name, existing.id);
    else db.prepare("INSERT INTO accounts(id, email, name, pw_hash, verified, created_at) VALUES(?, ?, ?, ?, 0, ?)").run(crypto.randomUUID(), email, name, hash, now());
    await sendCode(email, "verify", lang(req), name);
    return { ok: true, needVerify: true, mailConfigured: mailer.configured };
  });

  app.post("/api/account/resend", async (req) => {
    guard(req);
    const email = cleanEmail(req.body?.email);
    const acc = db.prepare("SELECT * FROM accounts WHERE email = ?").get(email);
    if (acc && !acc.verified) await sendCode(email, "verify", lang(req), acc.name);
    return { ok: true };
  });

  app.post("/api/account/verify", async (req) => {
    guard(req);
    const email = cleanEmail(req.body?.email);
    const acc = db.prepare("SELECT * FROM accounts WHERE email = ?").get(email);
    if (!acc) throw fail(404, "Zu dieser E-Mail gibt es kein Konto.");
    useCode(email, "verify", req.body?.code);
    db.prepare("UPDATE accounts SET verified = 1 WHERE id = ?").run(acc.id);
    return newSession({ ...acc, verified: 1 });
  });

  app.post("/api/account/login", async (req) => {
    guard(req);
    const email = cleanEmail(req.body?.email);
    const acc = db.prepare("SELECT * FROM accounts WHERE email = ?").get(email);
    // Gleiche Meldung für „gibt es nicht“ und „falsches Passwort“
    if (!acc || !(await checkPassword(String(req.body?.password || ""), acc.pw_hash))) throw fail(401, "E-Mail oder Passwort stimmt nicht.");
    if (!acc.verified) {
      await sendCode(email, "verify", lang(req), acc.name).catch(() => {});
      throw Object.assign(fail(403, "Bitte bestätige zuerst deine E-Mail – wir haben dir einen neuen Code geschickt."), { needVerify: true });
    }
    return newSession(acc);
  });

  app.post("/api/account/forgot", async (req) => {
    guard(req);
    const email = cleanEmail(req.body?.email);
    const acc = db.prepare("SELECT * FROM accounts WHERE email = ?").get(email);
    // Immer „ok“ – so lässt sich nicht herausfinden, welche Adressen ein Konto haben
    if (acc) await sendCode(email, "reset", lang(req), acc.name).catch((e) => app.log.warn(e));
    return { ok: true };
  });

  app.post("/api/account/reset", async (req) => {
    guard(req);
    const email = cleanEmail(req.body?.email);
    const acc = db.prepare("SELECT * FROM accounts WHERE email = ?").get(email);
    if (!acc) throw fail(400, "Der Code stimmt nicht.");
    checkPw(req.body?.password);
    useCode(email, "reset", req.body?.code);
    db.prepare("UPDATE accounts SET pw_hash = ?, verified = 1 WHERE id = ?").run(await hashPassword(req.body.password), acc.id);
    // Alle alten Sitzungen beenden
    db.prepare("DELETE FROM account_sessions WHERE account_id = ?").run(acc.id);
    return newSession({ ...acc, verified: 1 });
  });

  app.get("/api/account/me", async (req) => {
    const acc = accountOf(req);
    if (!acc) throw fail(401, "Bitte melde dich an.");
    return publicAccount(acc);
  });

  app.post("/api/account/logout", async (req) => {
    const h = req.headers.authorization || "";
    if (h.startsWith("Bearer ")) db.prepare("DELETE FROM account_sessions WHERE token_hash = ?").run(sha(h.slice(7)));
    return { ok: true };
  });

  app.post("/api/account/delete", async (req) => {
    guard(req);
    const acc = accountOf(req);
    if (!acc) throw fail(401, "Bitte melde dich an.");
    if (!(await checkPassword(String(req.body?.password || ""), acc.pw_hash))) throw fail(401, "Das Passwort stimmt nicht.");
    db.prepare("DELETE FROM accounts WHERE id = ?").run(acc.id);
    db.prepare("DELETE FROM account_codes WHERE email = ?").run(acc.email);
    return { ok: true };
  });

  // Für Admin-Statistik
  return { count: () => db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE verified = 1").get().n };
}
