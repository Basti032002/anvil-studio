import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-"));
Object.assign(process.env, { DATA_DIR: dir, WORKSHOP_DEV_AUTH: "1", ADMIN_NAMES: "Admin", NODE_ENV: "test" });
const { buildServer } = await import("../src/server.js");
const app = buildServer();
await app.listen({ port: 0 });
const base = `http://127.0.0.1:${app.server.address().port}`;

const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
async function login(name) {
  const r = await fetch(`${base}/api/auth`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ minecraftToken: `dev:${name}` }) });
  return (await r.json()).token;
}
const auth = (t) => ({ authorization: `Bearer ${t}` });
async function json(url, opts = {}) {
  const r = await fetch(base + url, opts);
  const body = await r.json();
  return { status: r.status, body };
}

test("workshop flow", async () => {
  const sebi = await login("Sebi");
  const admin = await login("Admin");
  const max = await login("Max");

  // Hochladen
  const fd = new FormData();
  fd.append("meta", JSON.stringify({ title: "Kristallhöhlen", summary: "Höhlen", description: "Lang", categories: ["ores", "x"], mcVersion: "1.21.1", modVersion: "1.2.0", trailerUrl: "https://youtu.be/abc" }));
  fd.append("mod", new Blob([zip]), "mod.jar");
  fd.append("source", new Blob([zip]), "src.zip");
  fd.append("images", new Blob([png]), "a.png");
  fd.append("icon", new Blob([png]), "icon.png");
  let r = await json("/api/items", { method: "POST", headers: auth(sebi), body: fd });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const id = r.body.id;
  assert.equal(r.body.status, "pending");
  assert.deepEqual(r.body.categories, ["ores"]);

  // noch nicht öffentlich
  assert.equal((await json("/api/items")).body.total, 0);
  assert.equal((await json(`/api/items/${id}`)).status, 404);
  assert.equal((await json(`/api/items/${id}`, { headers: auth(max) })).status, 404);

  // falscher Typ
  const bad = new FormData();
  bad.append("meta", JSON.stringify({ title: "X" }));
  bad.append("mod", new Blob([png]), "x.jar");
  assert.equal((await json("/api/items", { method: "POST", headers: auth(sebi), body: bad })).status, 400);

  // kein Admin
  assert.equal((await json(`/api/admin/items/${id}/approve`, { method: "POST", headers: auth(max) })).status, 403);
  // Freigeben
  r = await json(`/api/admin/items/${id}/approve`, { method: "POST", headers: auth(admin) });
  assert.equal(r.body.status, "public");
  r = await json("/api/items?type=source&q=krist");
  assert.equal(r.body.total, 1);
  assert.equal(r.body.items[0].status, undefined, "Status nicht öffentlich");

  // Download zählt
  const d = await fetch(`${base}/api/items/${id}/download/mod`);
  assert.equal(d.status, 200);
  assert.match(d.headers.get("content-disposition"), /kristallh_hlen-1\.2\.0\.jar/);
  assert.equal((await json(`/api/items/${id}`)).body.downloads, 1);

  // Melden + Sperren mit Grund
  await json(`/api/items/${id}/report`, { method: "POST", headers: { ...auth(max), "content-type": "application/json" }, body: JSON.stringify({ reason: "Fremde Texturen" }) });
  assert.equal((await json("/api/admin/stats", { headers: auth(admin) })).body.reported, 1);
  assert.equal((await json(`/api/admin/items/${id}/block`, { method: "POST", headers: { ...auth(admin), "content-type": "application/json" }, body: "{}" })).status, 400);
  r = await json(`/api/admin/items/${id}/block`, { method: "POST", headers: { ...auth(admin), "content-type": "application/json" }, body: JSON.stringify({ reason: "Fremde Texturen ersetzen" }) });
  assert.equal(r.body.status, "blocked");
  const mine = (await json("/api/me/items", { headers: auth(sebi) })).body.items[0];
  assert.equal(mine.reason, "Fremde Texturen ersetzen");
  assert.equal((await json("/api/items")).body.total, 0);

  // Admin bearbeitet Beschreibung
  r = await json(`/api/admin/items/${id}`, { method: "PATCH", headers: { ...auth(admin), "content-type": "application/json" }, body: JSON.stringify({ description: "Neu" }) });
  assert.equal(r.body.description, "Neu");

  // Erneut einreichen → wieder zu prüfen
  const up = new FormData();
  up.append("meta", JSON.stringify({ summary: "Repariert" }));
  r = await json(`/api/items/${id}`, { method: "PUT", headers: auth(sebi), body: up });
  assert.equal(r.body.status, "pending");
  assert.equal(r.body.reason, "");

  // Fremder darf nicht ändern / löschen
  assert.equal((await json(`/api/items/${id}`, { method: "DELETE", headers: auth(max) })).status, 403);

  // Einstellungen: ohne Prüfung direkt öffentlich
  r = await json("/api/admin/settings", { method: "PUT", headers: { ...auth(admin), "content-type": "application/json" }, body: JSON.stringify({ reviewMods: false, reviewSource: false }) });
  assert.equal(r.body.reviewMods, false);
  const fd2 = new FormData();
  fd2.append("meta", JSON.stringify({ title: "Direkt" }));
  fd2.append("mod", new Blob([zip]), "m.jar");
  r = await json("/api/items", { method: "POST", headers: auth(max), body: fd2 });
  assert.equal(r.body.status, "public");

  // Löschen durch Admin
  assert.equal((await json(`/api/items/${id}`, { method: "DELETE", headers: auth(admin) })).body.ok, true);
  assert.equal(fs.existsSync(path.join(dir, "files", id)), false);
});

test("Xbox-Übergangsanmeldung und Übernahme aufs Minecraft-Konto", async () => {
  const post = (body) => json("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  let r = await post({ xboxUhs: "1", xboxToken: "devxbox:Gamer Tag" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.user.kind, "xbox");
  assert.equal(r.body.user.name, "Gamer Tag");
  const xuid = r.body.user.uuid;
  const fd = new FormData();
  fd.append("meta", JSON.stringify({ title: "Xbox-Mod", mcVersion: "1.21.1" }));
  fd.append("source", new Blob([zip]), "src.zip");
  const up = await json("/api/items", { method: "POST", headers: auth(r.body.token), body: fd });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.equal(up.body.owner.uuid, xuid);
  // Bild eines noch nicht geprüften Uploads: nur mit Sitzung (?t=)
  const admin = await login("Admin");
  await json("/api/admin/settings", { method: "PUT", headers: { ...auth(admin), "content-type": "application/json" }, body: JSON.stringify({ reviewMods: true, reviewSource: true }) });
  const fd3 = new FormData();
  fd3.append("meta", JSON.stringify({ title: "Mit Bild", mcVersion: "1.21.1" }));
  fd3.append("source", new Blob([zip]), "src.zip");
  fd3.append("images", new Blob([png]), "a.png");
  const withImg = await json("/api/items", { method: "POST", headers: auth(r.body.token), body: fd3 });
  assert.equal(withImg.body.status, "pending");
  assert.equal((await fetch(`${base}/api/items/${withImg.body.id}/images/0`)).status, 404);
  assert.equal((await fetch(`${base}/api/items/${withImg.body.id}/images/0?t=${r.body.token}`)).status, 200);

  // Später mit Minecraft (+ Xbox-Nachweis) → Upload gehört jetzt dem Minecraft-Konto
  r = await post({ minecraftToken: "dev:Spieler", xboxUhs: "1", xboxToken: "devxbox:Gamer Tag" });
  assert.equal(r.body.user.kind, "minecraft");
  const mine = await json("/api/me/items", { headers: auth(r.body.token) });
  assert.ok(mine.body.items.some((i) => i.id === up.body.id && i.owner.name === "Spieler"), JSON.stringify(mine.body));

  assert.equal((await post({})).status, 400);
  await app.close();
});
