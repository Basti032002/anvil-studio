// Workshop-Server für Anvil Studio.
// Nutzer melden sich mit ihrem Minecraft-Konto an (der Server prüft das Token
// bei Mojang), laden fertige Mods und/oder Quellcode hoch, Admins prüfen,
// bearbeiten, sperren und löschen.
import { landingPage } from "./landing.js";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { openDb, getSettings, saveSettings } from "./db.js";

const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = process.env.DATA_DIR || "./data";
const ADMINS = (process.env.ADMIN_UUIDS || "").split(",").map((s) => s.trim().toLowerCase().replace(/-/g, "")).filter(Boolean);
const ADMIN_NAMES = (process.env.ADMIN_NAMES || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const DEV_AUTH = process.env.WORKSHOP_DEV_AUTH === "1";
// Übergangs-Anmeldung mit dem Xbox-Konto (solange die Minecraft-Anmeldung noch nicht freigeschaltet ist)
const XBOX_LOGIN = process.env.XBOX_LOGIN !== "0";
// Quellcode bis 95 MB: Cloudflare (Free) lässt höchstens 100 MB pro Anfrage durch
const LIMITS = { mod: 64 * 1024 * 1024, source: 95 * 1024 * 1024, image: 5 * 1024 * 1024, images: 8, videos: 6 };
const CATEGORIES = ["adventure", "dimension", "ores", "tech", "deco", "creatures", "minigame", "magic", "tools", "food", "other"];

const FILES = path.join(DATA_DIR, "files");
fs.mkdirSync(FILES, { recursive: true });
const db = openDb(DATA_DIR);
const now = () => Math.floor(Date.now() / 1000);

export function buildServer() {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test", bodyLimit: 1024 * 1024, trustProxy: true });
  app.register(multipart, { limits: { fileSize: LIMITS.source, files: 12, fields: 10, fieldSize: 200_000 } });

  // ---- Fehler einheitlich als { error } ----
  app.setErrorHandler((err, _req, reply) => {
    const code = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (code === 500) app.log.error(err);
    reply.code(code).send({ error: code === 500 ? "Interner Fehler im Workshop-Server." : err.message });
  });
  const fail = (code, msg) => Object.assign(new Error(msg), { statusCode: code });

  // ---- Anmeldung ----
  const isAdmin = (u) => !!u && (ADMINS.includes(u.uuid) || ADMIN_NAMES.includes(u.name.toLowerCase()));

  async function minecraftProfile(token) {
    if (DEV_AUTH && token.startsWith("dev:")) {
      const name = token.slice(4).replace(/[^A-Za-z0-9_]/g, "").slice(0, 16) || "Dev";
      return { uuid: crypto.createHash("md5").update(name).digest("hex"), name };
    }
    const r = await fetch("https://api.minecraftservices.com/minecraft/profile", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) }).catch((e) => {
      throw fail(502, `Minecraft-Dienste nicht erreichbar (${e.cause?.code || e.name}). Bitte gleich nochmal versuchen.`);
    });
    if (r.status === 401) throw fail(401, "Die Minecraft-Anmeldung ist abgelaufen. Bitte melde dich neu an.");
    if (r.status === 404) throw fail(403, "Dieses Konto besitzt kein Minecraft: Java Edition.");
    if (!r.ok) throw fail(502, `Minecraft-Dienste antworten nicht (HTTP ${r.status}).`);
    const p = await r.json();
    return { uuid: String(p.id).toLowerCase().replace(/-/g, ""), name: String(p.name) };
  }

  async function xboxProfile(uhs, token) {
    if (DEV_AUTH && token.startsWith("devxbox:")) {
      const name = token.slice(8).replace(/[^A-Za-z0-9_ ]/g, "").slice(0, 16) || "DevXbox";
      return { uuid: "xbox-" + crypto.createHash("md5").update(name).digest("hex").slice(0, 16), name };
    }
    const r = await fetch("https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag", {
      headers: { Authorization: `XBL3.0 x=${uhs};${token}`, "x-xbl-contract-version": "2", Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    }).catch((e) => {
      throw fail(502, `Xbox Live nicht erreichbar (${e.cause?.code || e.name}). Bitte gleich nochmal versuchen.`);
    });
    if (r.status === 401 || r.status === 403) throw fail(401, "Die Xbox-Anmeldung ist abgelaufen. Bitte melde dich neu an.");
    if (!r.ok) throw fail(502, `Xbox Live antwortet nicht (HTTP ${r.status}).`);
    const u = (await r.json())?.profileUsers?.[0];
    const name = u?.settings?.find((x) => x.id === "Gamertag")?.value;
    if (!u?.id || !name) throw fail(502, "Xbox Live hat kein Profil geliefert.");
    return { uuid: "xbox-" + String(u.id), name: String(name) };
  }

  function userOf(req, allowQuery = false) {
    const h = req.headers.authorization || "";
    // Bilder werden per <img> geladen (ohne Header) → Sitzung darf dort auch als ?t= kommen
    const token = h.startsWith("Bearer ") ? h.slice(7) : allowQuery ? String(req.query?.t || "") : "";
    if (!token) return null;
    const s = db.prepare("SELECT uuid, name FROM sessions WHERE token = ? AND expires_at > ?").get(token, now());
    return s ? { uuid: s.uuid, name: s.name } : null;
  }
  const requireUser = (req) => {
    const u = userOf(req);
    if (!u) throw fail(401, "Bitte melde dich mit deinem Minecraft-Konto an.");
    return u;
  };
  const requireAdmin = (req) => {
    const u = requireUser(req);
    if (!isAdmin(u)) throw fail(403, `Nur für Workshop-Admins. Dein Konto „${u.name}“ ist auf dem Server nicht als Admin eingetragen (ADMIN_NAMES).`);
    return u;
  };

  app.post("/api/auth", async (req) => {
    const token = String(req.body?.minecraftToken || "");
    const xToken = String(req.body?.xboxToken || "");
    const xUhs = String(req.body?.xboxUhs || "");
    let p;
    if (token) {
      p = await minecraftProfile(token);
      // Uploads aus der Xbox-Übergangszeit auf das Minecraft-Konto übertragen
      if (xToken) {
        const x = await xboxProfile(xUhs, xToken).catch(() => null);
        if (x) {
          db.prepare("UPDATE items SET owner_uuid = ? WHERE owner_uuid = ?").run(p.uuid, x.uuid);
          for (const t of ["ratings", "subscriptions"]) {
            db.prepare(`UPDATE OR IGNORE ${t} SET uuid = ? WHERE uuid = ?`).run(p.uuid, x.uuid);
            db.prepare(`DELETE FROM ${t} WHERE uuid = ?`).run(x.uuid);
          }
          db.prepare("UPDATE comments SET uuid = ?, name = ? WHERE uuid = ?").run(p.uuid, p.name, x.uuid);
          db.prepare("UPDATE notifications SET uuid = ? WHERE uuid = ?").run(p.uuid, x.uuid);
          db.prepare("UPDATE reports SET reporter_uuid = ? WHERE reporter_uuid = ?").run(p.uuid, x.uuid);
          db.prepare("DELETE FROM sessions WHERE uuid = ?").run(x.uuid);
        }
      }
    } else if (xToken && XBOX_LOGIN) {
      p = await xboxProfile(xUhs, xToken);
    } else {
      throw fail(400, xToken ? "Die Anmeldung mit dem Xbox-Konto ist auf diesem Server abgeschaltet." : "Minecraft-Token fehlt.");
    }
    const session = crypto.randomBytes(32).toString("hex");
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now());
    db.prepare("INSERT INTO sessions(token, uuid, name, expires_at) VALUES(?, ?, ?, ?)").run(session, p.uuid, p.name, now() + 30 * 86400);
    // Namen in eigenen Uploads aktuell halten
    db.prepare("UPDATE items SET owner_name = ? WHERE owner_uuid = ?").run(p.name, p.uuid);
    return { token: session, user: { ...p, kind: p.uuid.startsWith("xbox-") ? "xbox" : "minecraft", admin: isAdmin(p) } };
  });

  app.get("/api/me", async (req) => {
    const u = requireUser(req);
    return { ...u, admin: isAdmin(u) };
  });

  app.post("/api/logout", async (req) => {
    const h = req.headers.authorization || "";
    if (h.startsWith("Bearer ")) db.prepare("DELETE FROM sessions WHERE token = ?").run(h.slice(7));
    return { ok: true };
  });

  // ---- Benachrichtigungen ----
  const notify = (uuid, kind, row, text = "") => {
    if (!uuid) return;
    db.prepare("INSERT INTO notifications(uuid, kind, item_id, title, text, created_at) VALUES(?, ?, ?, ?, ?, ?)").run(uuid, kind, row?.id || "", row?.title || "", String(text).slice(0, 2000), now());
    // alte aufräumen: höchstens 200 pro Nutzer
    db.prepare("DELETE FROM notifications WHERE uuid = ? AND id NOT IN (SELECT id FROM notifications WHERE uuid = ? ORDER BY id DESC LIMIT 200)").run(uuid, uuid);
  };

  // ---- Ansicht eines Uploads ----
  function deps(row) {
    let ids = [];
    try {
      ids = JSON.parse(row.dependencies || "[]");
    } catch {}
    return ids
      .map((id) => db.prepare("SELECT id, title, status, mod_file FROM items WHERE id = ?").get(id))
      .filter(Boolean)
      .map((d) => ({ id: d.id, title: d.title, available: d.status === "public" && !!d.mod_file }));
  }

  function videosOf(row) {
    let v = [];
    try {
      v = JSON.parse(row.videos || "[]");
    } catch {}
    if (!v.length && row.trailer_url) v = [row.trailer_url];
    return v;
  }

  function view(row, viewer) {
    const own = viewer && viewer.uuid === row.owner_uuid;
    const admin = isAdmin(viewer);
    const r = db.prepare("SELECT COUNT(*) AS n, COALESCE(AVG(stars), 0) AS avg FROM ratings WHERE item_id = ?").get(row.id);
    return {
      id: row.id,
      owner: { uuid: row.owner_uuid, name: row.owner_name },
      title: row.title,
      summary: row.summary,
      description: row.description,
      categories: JSON.parse(row.categories),
      mcVersion: row.mc_version,
      modVersion: row.mod_version,
      modId: row.mod_id,
      license: row.license,
      trailerUrl: row.trailer_url,
      videos: videosOf(row),
      images: JSON.parse(row.images).map((_, i) => `/api/items/${row.id}/images/${i}`),
      icon: row.icon ? `/api/items/${row.id}/icon` : null,
      hasMod: !!row.mod_file,
      modSize: row.mod_size,
      hasSource: !!row.source_file,
      sourceSize: row.source_size,
      downloads: row.downloads,
      featured: !!row.featured,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      rating: { avg: Math.round(r.avg * 10) / 10, count: r.n },
      comments: db.prepare("SELECT COUNT(*) AS n FROM comments WHERE item_id = ?").get(row.id).n,
      subscribers: db.prepare("SELECT COUNT(*) AS n FROM subscriptions WHERE item_id = ?").get(row.id).n,
      dependencies: deps(row),
      ...(viewer
        ? {
            myRating: db.prepare("SELECT stars FROM ratings WHERE item_id = ? AND uuid = ?").get(row.id, viewer.uuid)?.stars || 0,
            subscribed: !!db.prepare("SELECT 1 FROM subscriptions WHERE item_id = ? AND uuid = ?").get(row.id, viewer.uuid),
          }
        : {}),
      // Status und Sperrgrund nur für Ersteller und Admins
      ...(own || admin
        ? { status: row.status, reason: row.reason, allowResubmit: !!row.allow_resubmit, reviewedAt: row.reviewed_at }
        : {}),
      ...(admin ? { reports: db.prepare("SELECT COUNT(*) AS n FROM reports WHERE item_id = ? AND resolved = 0").get(row.id).n } : {}),
    };
  }

  const getItem = (id) => {
    const row = db.prepare("SELECT * FROM items WHERE id = ?").get(String(id));
    if (!row) throw fail(404, "Dieser Eintrag existiert nicht (mehr).");
    return row;
  };
  const canSee = (row, u) => row.status === "public" || (u && (u.uuid === row.owner_uuid || isAdmin(u)));

  // ---- Öffentliche Liste ----
  app.get("/api/items", async (req) => {
    const q = req.query || {};
    const where = ["status = 'public'"];
    const args = [];
    if (q.type === "mod") where.push("mod_file != ''");
    if (q.type === "source") where.push("source_file != ''");
    if (q.mc) (where.push("mc_version = ?"), args.push(String(q.mc)));
    if (q.owner) (where.push("owner_uuid = ?"), args.push(String(q.owner).replace(/-/g, "")));
    if (q.exclude) (where.push("id != ?"), args.push(String(q.exclude)));
    if (q.category) (where.push("categories LIKE ?"), args.push(`%"${String(q.category).replace(/[%_"]/g, "")}"%`));
    if (q.q) {
      where.push("(title LIKE ? OR summary LIKE ? OR owner_name LIKE ?)");
      const like = `%${String(q.q).replace(/[%_]/g, "")}%`;
      args.push(like, like, like);
    }
    const order =
      {
        new: "created_at DESC",
        updated: "updated_at DESC",
        name: "title COLLATE NOCASE",
        rating: "(SELECT COALESCE(AVG(stars), 0) FROM ratings WHERE item_id = items.id) DESC, downloads DESC",
      }[q.sort] || "featured DESC, downloads DESC";
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 60));
    const offset = Math.max(0, Number(q.offset) || 0);
    const rows = db.prepare(`SELECT * FROM items WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, limit, offset);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM items WHERE ${where.join(" AND ")}`).get(...args).n;
    const viewer = userOf(req);
    return { total, items: rows.map((r) => view(r, viewer)) };
  });

  // Zahlen für die Startseite des Workshops
  app.get("/api/stats/public", async () => {
    const one = (sql) => db.prepare(sql).get().n;
    return {
      mods: one("SELECT COUNT(*) AS n FROM items WHERE status = 'public' AND mod_file != ''"),
      sources: one("SELECT COUNT(*) AS n FROM items WHERE status = 'public' AND source_file != ''"),
      downloads: one("SELECT COALESCE(SUM(downloads), 0) AS n FROM items WHERE status = 'public'"),
      creators: one("SELECT COUNT(DISTINCT owner_uuid) AS n FROM items WHERE status = 'public'"),
    };
  });

  app.get("/api/items/:id", async (req) => {
    const u = userOf(req);
    const row = getItem(req.params.id);
    if (!canSee(row, u)) throw fail(404, "Dieser Eintrag existiert nicht (mehr).");
    return view(row, u);
  });

  // ---- Dateien ----
  const send = (reply, file, type, name) => {
    if (!fs.existsSync(file)) throw fail(404, "Datei nicht gefunden.");
    reply.header("Content-Type", type);
    reply.header("Content-Length", fs.statSync(file).size);
    if (name) reply.header("Content-Disposition", `attachment; filename="${name.replace(/[^A-Za-z0-9._-]/g, "_")}"`);
    return reply.send(fs.createReadStream(file));
  };

  app.get("/api/items/:id/download/:kind", async (req, reply) => {
    const u = userOf(req);
    const row = getItem(req.params.id);
    if (!canSee(row, u)) throw fail(404, "Dieser Eintrag existiert nicht (mehr).");
    const kind = req.params.kind;
    const stored = kind === "mod" ? row.mod_file : kind === "source" ? row.source_file : "";
    if (!stored) throw fail(404, "Diese Datei gibt es für den Eintrag nicht.");
    if (row.status === "public" && (!u || u.uuid !== row.owner_uuid)) {
      db.prepare("UPDATE items SET downloads = downloads + 1 WHERE id = ?").run(row.id);
      db.prepare("INSERT INTO downloads(item_id, day, count) VALUES(?, ?, 1) ON CONFLICT(item_id, day) DO UPDATE SET count = count + 1").run(row.id, Math.floor(now() / 86400));
    }
    const base = (row.mod_id || row.title).toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const name = kind === "mod" ? `${base}-${row.mod_version || "1.0"}.jar` : `${base}-${row.mod_version || "1.0"}-quellcode.zip`;
    return send(reply, path.join(FILES, row.id, stored), kind === "mod" ? "application/java-archive" : "application/zip", name);
  });

  const imgType = (f) => (f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "image/jpeg");
  app.get("/api/items/:id/images/:n", async (req, reply) => {
    const u = userOf(req, true);
    const row = getItem(req.params.id);
    if (!canSee(row, u)) throw fail(404, "Nicht gefunden.");
    const f = JSON.parse(row.images)[Number(req.params.n)];
    if (!f) throw fail(404, "Bild nicht gefunden.");
    reply.header("Cache-Control", row.status === "public" ? "public, max-age=3600" : "private, no-store");
    return send(reply, path.join(FILES, row.id, f), imgType(f));
  });
  app.get("/api/items/:id/icon", async (req, reply) => {
    const u = userOf(req, true);
    const row = getItem(req.params.id);
    if (!canSee(row, u) || !row.icon) throw fail(404, "Nicht gefunden.");
    reply.header("Cache-Control", row.status === "public" ? "public, max-age=3600" : "private, no-store");
    return send(reply, path.join(FILES, row.id, row.icon), "image/png");
  });

  // ---- Hochladen & Bearbeiten ----
  const magic = {
    zip: (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
    png: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
    jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    webp: (b) => b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP",
  };
  function head(file) {
    const fd = fs.openSync(file, "r");
    const b = Buffer.alloc(12);
    fs.readSync(fd, b, 0, 12, 0);
    fs.closeSync(fd);
    return b;
  }

  /** Liest ein Multipart-Formular: meta (JSON), mod, source, icon, images[] */
  async function readForm(req, dir) {
    const tmp = path.join(dir, `.tmp-${crypto.randomBytes(6).toString("hex")}`);
    fs.mkdirSync(tmp, { recursive: true });
    const out = { meta: {}, mod: null, source: null, icon: null, images: [], tmp };
    try {
      for await (const part of req.parts()) {
        if (part.type === "field") {
          if (part.fieldname === "meta") {
            try {
              out.meta = JSON.parse(part.value);
            } catch {
              throw fail(400, "Ungültige Angaben.");
            }
          }
          continue;
        }
        const field = part.fieldname;
        if (!["mod", "source", "icon", "images"].includes(field)) {
          part.file.resume();
          continue;
        }
        if (field === "images" && out.images.length >= LIMITS.images) throw fail(400, `Höchstens ${LIMITS.images} Bilder.`);
        const target = path.join(tmp, `${field}-${out.images.length}-${crypto.randomBytes(4).toString("hex")}`);
        await pipeline(part.file, fs.createWriteStream(target));
        if (part.file.truncated) throw fail(413, "Die Datei ist zu groß.");
        const size = fs.statSync(target).size;
        const b = head(target);
        if (field === "mod" || field === "source") {
          if (!magic.zip(b)) throw fail(400, field === "mod" ? "Die Mod muss eine .jar-Datei sein." : "Der Quellcode muss eine .zip-Datei sein.");
          if (size > LIMITS[field]) throw fail(413, "Die Datei ist zu groß.");
          out[field] = { path: target, size };
        } else {
          const ext = magic.png(b) ? "png" : magic.jpg(b) ? "jpg" : magic.webp(b) ? "webp" : null;
          if (!ext || (field === "icon" && ext !== "png")) throw fail(400, "Bilder müssen PNG, JPG oder WebP sein (Logo: PNG).");
          if (size > LIMITS.image) throw fail(413, "Ein Bild ist größer als 5 MB.");
          if (field === "icon") out.icon = { path: target, ext };
          else out.images.push({ path: target, ext });
        }
      }
      return out;
    } catch (e) {
      fs.rmSync(tmp, { recursive: true, force: true });
      throw e;
    }
  }

  function cleanMeta(m, partial) {
    const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
    const out = {
      title: str(m.title, 80),
      summary: str(m.summary, 200),
      description: str(m.description, 20000),
      mcVersion: str(m.mcVersion, 20),
      modVersion: str(m.modVersion, 40),
      modId: str(m.modId, 64),
      license: str(m.license, 60),
      trailerUrl: str(m.trailerUrl, 300),
      categories: Array.isArray(m.categories) ? m.categories.filter((c) => CATEGORIES.includes(c)).slice(0, 5) : undefined,
      dependencies: Array.isArray(m.dependencies)
        ? [...new Set(m.dependencies.map(String))].filter((id) => /^[a-f0-9]{16}$/.test(id) && db.prepare("SELECT 1 FROM items WHERE id = ? AND status = 'public'").get(id)).slice(0, 10)
        : undefined,
    };
    const yt = /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//;
    if (out.trailerUrl && !yt.test(out.trailerUrl)) throw fail(400, "Der Trailer muss ein YouTube-Link sein.");
    if (Array.isArray(m.videos)) {
      out.videos = [...new Set(m.videos.map((v) => String(v).trim()).filter(Boolean))].slice(0, LIMITS.videos);
      for (const v of out.videos) if (v.length > 300 || !yt.test(v)) throw fail(400, "Videos müssen YouTube-Links sein.");
      out.trailerUrl = out.videos[0] || "";
    }
    // Reihenfolge der Bilder: "old:3" = vorhandenes Bild 3, "new:0" = erstes neu hochgeladenes
    if (Array.isArray(m.imageOrder)) out.imageOrder = m.imageOrder.map(String).filter((x) => /^(old|new):\d{1,2}$/.test(x)).slice(0, LIMITS.images);
    if (!partial && !out.title) throw fail(400, "Bitte gib einen Titel an.");
    return out;
  }

  /** Dateien aus dem Formular in den Ordner des Eintrags übernehmen */
  function storeFiles(form, dir, row, order) {
    const set = {};
    if (form.mod) {
      fs.renameSync(form.mod.path, path.join(dir, "mod.jar"));
      Object.assign(set, { mod_file: "mod.jar", mod_size: form.mod.size });
    }
    if (form.source) {
      fs.renameSync(form.source.path, path.join(dir, "source.zip"));
      Object.assign(set, { source_file: "source.zip", source_size: form.source.size });
    }
    if (form.icon) {
      fs.renameSync(form.icon.path, path.join(dir, "icon.png"));
      set.icon = "icon.png";
    }
    if (order) {
      const before = JSON.parse(row?.images || "[]");
      const fresh = form.images.map((img, i) => {
        const n = `image-${Date.now().toString(36)}-${i}.${img.ext}`;
        fs.renameSync(img.path, path.join(dir, n));
        return n;
      });
      const names = [];
      for (const o of order) {
        const [kind, n] = o.split(":");
        const f = kind === "old" ? before[Number(n)] : fresh[Number(n)];
        if (f && !names.includes(f)) names.push(f);
      }
      for (const f of [...before, ...fresh]) if (!names.includes(f)) fs.rmSync(path.join(dir, f), { force: true });
      set.images = JSON.stringify(names.slice(0, LIMITS.images));
    } else if (form.images.length) {
      for (const old of JSON.parse(row?.images || "[]")) fs.rmSync(path.join(dir, old), { force: true });
      const names = form.images.map((img, i) => {
        const n = `image-${Date.now().toString(36)}-${i}.${img.ext}`;
        fs.renameSync(img.path, path.join(dir, n));
        return n;
      });
      set.images = JSON.stringify(names);
    }
    fs.rmSync(form.tmp, { recursive: true, force: true });
    return set;
  }

  const needsReview = (hasMod, hasSource) => {
    const s = getSettings(db);
    return (hasMod && s.reviewMods) || (hasSource && s.reviewSource);
  };

  app.post("/api/items", async (req) => {
    const u = requireUser(req);
    const id = crypto.randomBytes(8).toString("hex");
    const dir = path.join(FILES, id);
    fs.mkdirSync(dir, { recursive: true });
    try {
      const form = await readForm(req, dir);
      if (!form.mod && !form.source) throw fail(400, "Lade eine Mod-Datei, Quellcode oder beides hoch.");
      const m = cleanMeta(form.meta, false);
      const files = storeFiles(form, dir, null, m.imageOrder);
      const status = needsReview(!!form.mod, !!form.source) ? "pending" : "public";
      const t = now();
      db.prepare(
        `INSERT INTO items(id, owner_uuid, owner_name, title, summary, description, categories, mc_version, mod_version, mod_id, license, trailer_url,
          images, icon, mod_file, mod_size, source_file, source_size, status, dependencies, videos, created_at, updated_at)
         VALUES(@id, @owner_uuid, @owner_name, @title, @summary, @description, @categories, @mc_version, @mod_version, @mod_id, @license, @trailer_url,
          @images, @icon, @mod_file, @mod_size, @source_file, @source_size, @status, @dependencies, @videos, @t, @t)`,
      ).run({
        id,
        owner_uuid: u.uuid,
        owner_name: u.name,
        title: m.title,
        summary: m.summary || "",
        description: m.description || "",
        categories: JSON.stringify(m.categories || []),
        mc_version: m.mcVersion || "",
        mod_version: m.modVersion || "",
        mod_id: m.modId || "",
        license: m.license || "",
        trailer_url: m.trailerUrl || "",
        images: files.images || "[]",
        icon: files.icon || "",
        mod_file: files.mod_file || "",
        mod_size: files.mod_size || 0,
        source_file: files.source_file || "",
        source_size: files.source_size || 0,
        status,
        dependencies: JSON.stringify(m.dependencies || []),
        videos: JSON.stringify(m.videos || (m.trailerUrl ? [m.trailerUrl] : [])),
        t,
      });
      return view(getItem(id), u);
    } catch (e) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw e;
    }
  });

  app.put("/api/items/:id", async (req) => {
    const u = requireUser(req);
    const row = getItem(req.params.id);
    if (row.owner_uuid !== u.uuid) throw fail(403, "Das ist nicht dein Eintrag.");
    if (row.status === "blocked" && !row.allow_resubmit) throw fail(403, "Dieser Eintrag ist gesperrt und kann nicht erneut eingereicht werden.");
    const dir = path.join(FILES, row.id);
    const form = await readForm(req, dir);
    const m = cleanMeta(form.meta, true);
    const files = storeFiles(form, dir, row, m.imageOrder);
    const hasMod = !!(files.mod_file || row.mod_file);
    const hasSource = !!(files.source_file || row.source_file);
    let status = row.status;
    if (row.status === "blocked" || row.status === "rejected") status = needsReview(hasMod, hasSource) ? "pending" : "public";
    else if (row.status === "public" && getSettings(db).reviewUpdates && (files.mod_file || files.source_file)) status = "pending";
    const set = {
      ...(m.title !== undefined && m.title ? { title: m.title } : {}),
      ...(m.summary !== undefined ? { summary: m.summary } : {}),
      ...(m.description !== undefined ? { description: m.description } : {}),
      ...(m.categories ? { categories: JSON.stringify(m.categories) } : {}),
      ...(m.mcVersion !== undefined ? { mc_version: m.mcVersion } : {}),
      ...(m.modVersion !== undefined ? { mod_version: m.modVersion } : {}),
      ...(m.modId !== undefined ? { mod_id: m.modId } : {}),
      ...(m.license !== undefined ? { license: m.license } : {}),
      ...(m.trailerUrl !== undefined ? { trailer_url: m.trailerUrl } : {}),
      ...(m.videos ? { videos: JSON.stringify(m.videos) } : m.trailerUrl !== undefined ? { videos: JSON.stringify(m.trailerUrl ? [m.trailerUrl] : []) } : {}),
      ...(m.dependencies ? { dependencies: JSON.stringify(m.dependencies.filter((d) => d !== row.id)) } : {}),
      ...files,
      status,
      reason: status === row.status ? row.reason : "",
      updated_at: now(),
    };
    db.prepare(`UPDATE items SET ${Object.keys(set).map((k) => `${k} = @${k}`).join(", ")} WHERE id = @id`).run({ ...set, id: row.id });
    // Abonnenten über neue Dateien informieren (nur wenn öffentlich)
    if (status === "public" && (files.mod_file || files.source_file)) {
      for (const s of db.prepare("SELECT uuid FROM subscriptions WHERE item_id = ? AND uuid != ?").all(row.id, u.uuid)) {
        notify(s.uuid, "update", { ...row, title: set.title || row.title }, m.modVersion || "");
      }
    }
    return view(getItem(row.id), u);
  });

  app.delete("/api/items/:id", async (req) => {
    const u = requireUser(req);
    const row = getItem(req.params.id);
    if (row.owner_uuid !== u.uuid && !isAdmin(u)) throw fail(403, "Das ist nicht dein Eintrag.");
    if (row.owner_uuid !== u.uuid) notify(row.owner_uuid, "deleted", row, String(req.body?.reason || "").slice(0, 2000));
    db.prepare("DELETE FROM items WHERE id = ?").run(row.id);
    fs.rmSync(path.join(FILES, row.id), { recursive: true, force: true });
    return { ok: true };
  });

  app.get("/api/me/items", async (req) => {
    const u = requireUser(req);
    const rows = db.prepare("SELECT * FROM items WHERE owner_uuid = ? ORDER BY updated_at DESC").all(u.uuid);
    return { items: rows.map((r) => view(r, u)) };
  });

  app.post("/api/items/:id/report", async (req) => {
    const u = requireUser(req);
    const row = getItem(req.params.id);
    const reason = String(req.body?.reason || "").trim().slice(0, 1000);
    if (!reason) throw fail(400, "Bitte beschreibe kurz, was nicht stimmt.");
    const dup = db.prepare("SELECT 1 FROM reports WHERE item_id = ? AND reporter_uuid = ? AND resolved = 0").get(row.id, u.uuid);
    if (!dup) db.prepare("INSERT INTO reports(item_id, reporter_uuid, reporter_name, reason, created_at) VALUES(?, ?, ?, ?, ?)").run(row.id, u.uuid, u.name, reason, now());
    return { ok: true };
  });

  // ---- Bewertungen ----
  app.put("/api/items/:id/rating", async (req) => {
    const u = requireUser(req);
    const row = getItem(req.params.id);
    if (row.status !== "public") throw fail(400, "Nur veröffentlichte Einträge können bewertet werden.");
    if (row.owner_uuid === u.uuid) throw fail(400, "Eigene Einträge kannst du nicht bewerten.");
    const stars = Math.round(Number(req.body?.stars) || 0);
    if (stars <= 0) db.prepare("DELETE FROM ratings WHERE item_id = ? AND uuid = ?").run(row.id, u.uuid);
    else db.prepare("INSERT INTO ratings(item_id, uuid, stars) VALUES(?, ?, ?) ON CONFLICT(item_id, uuid) DO UPDATE SET stars = excluded.stars").run(row.id, u.uuid, Math.min(5, stars));
    return view(getItem(row.id), u);
  });

  // ---- Kommentare ----
  const commentView = (c, u) => ({ id: c.id, author: { uuid: c.uuid, name: c.name }, text: c.text, createdAt: c.created_at, canDelete: !!u && (u.uuid === c.uuid || isAdmin(u)) });
  app.get("/api/items/:id/comments", async (req) => {
    const u = userOf(req);
    const row = getItem(req.params.id);
    if (!canSee(row, u)) throw fail(404, "Dieser Eintrag existiert nicht (mehr).");
    const rows = db.prepare("SELECT * FROM comments WHERE item_id = ? ORDER BY created_at DESC LIMIT 200").all(row.id);
    return { comments: rows.map((c) => commentView(c, u)) };
  });
  app.post("/api/items/:id/comments", async (req) => {
    const u = requireUser(req);
    const row = getItem(req.params.id);
    if (row.status !== "public") throw fail(400, "Kommentare gehen nur bei veröffentlichten Einträgen.");
    const text = String(req.body?.text || "").trim().slice(0, 1000);
    if (!text) throw fail(400, "Der Kommentar ist leer.");
    const last = db.prepare("SELECT MAX(created_at) AS t FROM comments WHERE uuid = ?").get(u.uuid).t || 0;
    if (now() - last < 10) throw fail(429, "Bitte warte kurz vor dem nächsten Kommentar.");
    const info = db.prepare("INSERT INTO comments(item_id, uuid, name, text, created_at) VALUES(?, ?, ?, ?, ?)").run(row.id, u.uuid, u.name, text, now());
    if (row.owner_uuid !== u.uuid) notify(row.owner_uuid, "comment", row, `${u.name}: ${text.slice(0, 200)}`);
    return commentView(db.prepare("SELECT * FROM comments WHERE id = ?").get(info.lastInsertRowid), u);
  });
  app.delete("/api/comments/:cid", async (req) => {
    const u = requireUser(req);
    const c = db.prepare("SELECT * FROM comments WHERE id = ?").get(Number(req.params.cid));
    if (!c) throw fail(404, "Kommentar nicht gefunden.");
    if (c.uuid !== u.uuid && !isAdmin(u)) throw fail(403, "Das ist nicht dein Kommentar.");
    db.prepare("DELETE FROM comments WHERE id = ?").run(c.id);
    return { ok: true };
  });

  // ---- Abonnements ----
  app.post("/api/items/:id/subscribe", async (req) => {
    const u = requireUser(req);
    const row = getItem(req.params.id);
    if (!canSee(row, u)) throw fail(404, "Dieser Eintrag existiert nicht (mehr).");
    db.prepare("INSERT OR IGNORE INTO subscriptions(uuid, item_id, created_at) VALUES(?, ?, ?)").run(u.uuid, row.id, now());
    return view(getItem(row.id), u);
  });
  app.delete("/api/items/:id/subscribe", async (req) => {
    const u = requireUser(req);
    db.prepare("DELETE FROM subscriptions WHERE uuid = ? AND item_id = ?").run(u.uuid, String(req.params.id));
    const row = db.prepare("SELECT * FROM items WHERE id = ?").get(String(req.params.id));
    return row ? view(row, u) : { ok: true };
  });
  app.get("/api/me/subscriptions", async (req) => {
    const u = requireUser(req);
    const rows = db.prepare("SELECT items.* FROM subscriptions JOIN items ON items.id = subscriptions.item_id WHERE subscriptions.uuid = ? AND items.status = 'public' ORDER BY items.updated_at DESC").all(u.uuid);
    return { items: rows.map((r) => view(r, u)) };
  });

  // ---- Benachrichtigungen ----
  app.get("/api/me/notifications", async (req) => {
    const u = requireUser(req);
    const rows = db.prepare("SELECT * FROM notifications WHERE uuid = ? ORDER BY id DESC LIMIT 50").all(u.uuid);
    const unread = db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE uuid = ? AND read = 0").get(u.uuid).n;
    return {
      unread,
      items: rows.map((n) => ({ id: n.id, kind: n.kind, itemId: n.item_id, title: n.title, text: n.text, createdAt: n.created_at, read: !!n.read })),
    };
  });
  app.post("/api/me/notifications/read", async (req) => {
    const u = requireUser(req);
    db.prepare("UPDATE notifications SET read = 1 WHERE uuid = ?").run(u.uuid);
    return { ok: true };
  });

  // ---- Admin ----
  app.get("/api/admin/items", async (req) => {
    const u = requireAdmin(req);
    const st = String(req.query?.status || "all");
    const where =
      st === "reported"
        ? "id IN (SELECT item_id FROM reports WHERE resolved = 0)"
        : ["pending", "public", "blocked", "rejected"].includes(st)
          ? `status = '${st}'`
          : "1 = 1";
    const like = req.query?.q ? `%${String(req.query.q).replace(/[%_]/g, "")}%` : null;
    const rows = like
      ? db.prepare(`SELECT * FROM items WHERE ${where} AND (title LIKE ? OR owner_name LIKE ?) ORDER BY updated_at DESC LIMIT 500`).all(like, like)
      : db.prepare(`SELECT * FROM items WHERE ${where} ORDER BY updated_at DESC LIMIT 500`).all();
    return { items: rows.map((r) => view(r, u)) };
  });

  app.get("/api/admin/stats", async (req) => {
    requireAdmin(req);
    const count = (w) => db.prepare(`SELECT COUNT(*) AS n FROM items WHERE ${w}`).get().n;
    const since = Math.floor(now() / 86400) - 30;
    return {
      pending: count("status = 'pending'"),
      public: count("status = 'public'"),
      blocked: count("status = 'blocked'"),
      rejected: count("status = 'rejected'"),
      reported: db.prepare("SELECT COUNT(DISTINCT item_id) AS n FROM reports WHERE resolved = 0").get().n,
      downloads30: db.prepare("SELECT COALESCE(SUM(count), 0) AS n FROM downloads WHERE day >= ?").get(since).n,
    };
  });

  app.get("/api/admin/items/:id/reports", async (req) => {
    requireAdmin(req);
    return { reports: db.prepare("SELECT id, reporter_name AS reporter, reason, created_at AS createdAt, resolved FROM reports WHERE item_id = ? ORDER BY created_at DESC").all(String(req.params.id)) };
  });

  const review = (row, admin, set) => {
    const all = { ...set, reviewed_at: now(), reviewed_by: admin.name };
    db.prepare(`UPDATE items SET ${Object.keys(all).map((k) => `${k} = @${k}`).join(", ")} WHERE id = @id`).run({ ...all, id: row.id });
  };

  app.post("/api/admin/items/:id/:action", async (req) => {
    const admin = requireAdmin(req);
    const row = getItem(req.params.id);
    const reason = String(req.body?.reason || "").trim().slice(0, 2000);
    switch (req.params.action) {
      case "approve":
        review(row, admin, { status: "public", reason: "" });
        db.prepare("UPDATE reports SET resolved = 1 WHERE item_id = ?").run(row.id);
        if (row.status !== "public") notify(row.owner_uuid, "approved", row);
        break;
      case "reject":
        if (!reason) throw fail(400, "Bitte gib einen Grund an – der Ersteller sieht ihn.");
        review(row, admin, { status: "rejected", reason, allow_resubmit: 1 });
        notify(row.owner_uuid, "rejected", row, reason);
        break;
      case "block":
        if (!reason) throw fail(400, "Bitte gib einen Grund an – der Ersteller sieht ihn.");
        review(row, admin, { status: "blocked", reason, allow_resubmit: req.body?.allowResubmit === false ? 0 : 1 });
        db.prepare("UPDATE reports SET resolved = 1 WHERE item_id = ?").run(row.id);
        notify(row.owner_uuid, "blocked", row, reason);
        break;
      case "unblock":
        review(row, admin, { status: "public", reason: "" });
        notify(row.owner_uuid, "unblocked", row);
        break;
      case "feature":
        db.prepare("UPDATE items SET featured = ? WHERE id = ?").run(req.body?.featured ? 1 : 0, row.id);
        if (req.body?.featured && !row.featured) notify(row.owner_uuid, "featured", row);
        break;
      case "dismiss-reports":
        db.prepare("UPDATE reports SET resolved = 1 WHERE item_id = ?").run(row.id);
        break;
      default:
        throw fail(404, "Unbekannte Aktion.");
    }
    return view(getItem(row.id), admin);
  });

  app.patch("/api/admin/items/:id", async (req) => {
    const admin = requireAdmin(req);
    const row = getItem(req.params.id);
    const m = cleanMeta(req.body || {}, true);
    const set = {
      ...(m.title ? { title: m.title } : {}),
      ...(m.summary !== undefined ? { summary: m.summary } : {}),
      ...(m.description !== undefined ? { description: m.description } : {}),
      ...(m.categories ? { categories: JSON.stringify(m.categories) } : {}),
      ...(typeof req.body?.reason === "string" ? { reason: req.body.reason.trim().slice(0, 2000) } : {}),
      ...(typeof req.body?.allowResubmit === "boolean" ? { allow_resubmit: req.body.allowResubmit ? 1 : 0 } : {}),
    };
    if (Object.keys(set).length) db.prepare(`UPDATE items SET ${Object.keys(set).map((k) => `${k} = @${k}`).join(", ")} WHERE id = @id`).run({ ...set, id: row.id });
    return view(getItem(row.id), admin);
  });

  app.get("/api/admin/settings", async (req) => {
    requireAdmin(req);
    return getSettings(db);
  });
  app.put("/api/admin/settings", async (req) => {
    requireAdmin(req);
    return saveSettings(db, req.body || {});
  });

  app.get("/api/health", async () => ({ ok: true, categories: CATEGORIES }));

  // Öffentliche Startseite für Browser-Besucher – der Workshop selbst läuft in der App
  app.get("/", async (req, reply) => {
    const one = (sql) => db.prepare(sql).get().n || 0;
    const stats = {
      items: one("SELECT COUNT(*) AS n FROM items WHERE status = 'public'"),
      creators: one("SELECT COUNT(DISTINCT owner_uuid) AS n FROM items WHERE status = 'public'"),
      downloads: one("SELECT COALESCE(SUM(downloads), 0) AS n FROM items WHERE status = 'public'"),
    };
    const latest = db.prepare("SELECT id, title, summary, owner_name, mc_version FROM items WHERE status = 'public' ORDER BY created_at DESC LIMIT 6").all();
    reply.type("text/html; charset=utf-8").header("cache-control", "public, max-age=60");
    return landingPage({ stats, latest });
  });
  app.get("/privacy", async (req, reply) => reply.redirect("/#privacy"));
  app.get("/datenschutz", async (req, reply) => reply.redirect("/#privacy"));
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const app = buildServer();
  app.listen({ port: PORT, host: "0.0.0.0" }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
