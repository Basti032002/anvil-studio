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
  // Reihenfolge ändern: neues Bild nach vorn, altes dahinter; dazu zwei Videos
  const fd4 = new FormData();
  fd4.append("meta", JSON.stringify({ imageOrder: ["new:0", "old:0"], videos: ["https://youtu.be/a1", "https://www.youtube.com/watch?v=b2"] }));
  fd4.append("images", new Blob([png]), "b.png");
  const reordered = await json(`/api/items/${withImg.body.id}`, { method: "PUT", headers: auth(r.body.token), body: fd4 });
  assert.equal(reordered.status, 200, JSON.stringify(reordered.body));
  assert.equal(reordered.body.images.length, 2);
  assert.deepEqual(reordered.body.videos, ["https://youtu.be/a1", "https://www.youtube.com/watch?v=b2"]);
  assert.equal(reordered.body.trailerUrl, "https://youtu.be/a1");
  const fd5 = new FormData();
  fd5.append("meta", JSON.stringify({ imageOrder: ["old:1"] }));
  const dropped = await json(`/api/items/${withImg.body.id}`, { method: "PUT", headers: auth(r.body.token), body: fd5 });
  assert.equal(dropped.body.images.length, 1);
  const bad = new FormData();
  bad.append("meta", JSON.stringify({ videos: ["https://evil.example/x"] }));
  assert.equal((await json(`/api/items/${withImg.body.id}`, { method: "PUT", headers: auth(r.body.token), body: bad })).status, 400);

  // Später mit Minecraft (+ Xbox-Nachweis) → Upload gehört jetzt dem Minecraft-Konto
  r = await post({ minecraftToken: "dev:Spieler", xboxUhs: "1", xboxToken: "devxbox:Gamer Tag" });
  assert.equal(r.body.user.kind, "minecraft");
  const mine = await json("/api/me/items", { headers: auth(r.body.token) });
  assert.ok(mine.body.items.some((i) => i.id === up.body.id && i.owner.name === "Spieler"), JSON.stringify(mine.body));

  assert.equal((await post({})).status, 400);
  await app.close();
});

test("Bewertungen, Kommentare, Abos, Abhängigkeiten, Benachrichtigungen", async () => {
  const app2 = buildServer();
  await app2.listen({ port: 0 });
  const b2 = `http://127.0.0.1:${app2.server.address().port}`;
  const j = async (url, opts = {}) => {
    const r = await fetch(b2 + url, opts);
    return { status: r.status, body: await r.json() };
  };
  const log = async (n) => (await j("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ minecraftToken: `dev:${n}` }) })).body.token;
  const jh = (t) => ({ authorization: `Bearer ${t}`, "content-type": "application/json" });
  const anna = await log("Anna");
  const ben = await log("Ben");
  const admin = await log("Admin");
  await j("/api/admin/settings", { method: "PUT", headers: jh(admin), body: JSON.stringify({ reviewMods: true, reviewSource: true }) });

  const up = async (tok, meta) => {
    const fd = new FormData();
    fd.append("meta", JSON.stringify(meta));
    fd.append("mod", new Blob([zip]), "m.jar");
    return (await j("/api/items", { method: "POST", headers: { authorization: `Bearer ${tok}` }, body: fd })).body;
  };
  const lib = await up(anna, { title: "Bibliothek", mcVersion: "1.21.1" });
  await j(`/api/admin/items/${lib.id}/approve`, { method: "POST", headers: jh(admin), body: "{}" });
  const mod = await up(ben, { title: "Mit Abhängigkeit", mcVersion: "1.21.1", dependencies: [lib.id, "ffffffffffffffff"] });
  assert.deepEqual(mod.dependencies.map((d) => d.id), [lib.id]);
  assert.equal(mod.dependencies[0].available, true);

  // Benachrichtigung bei Freigabe / Ablehnung
  await j(`/api/admin/items/${mod.id}/reject`, { method: "POST", headers: jh(admin), body: JSON.stringify({ reason: "Bitte Beschreibung" }) });
  let n = (await j("/api/me/notifications", { headers: jh(ben) })).body;
  assert.equal(n.unread, 1);
  assert.equal(n.items[0].kind, "rejected");
  assert.equal(n.items[0].text, "Bitte Beschreibung");
  await j("/api/me/notifications/read", { method: "POST", headers: jh(ben), body: "{}" });
  assert.equal((await j("/api/me/notifications", { headers: jh(ben) })).body.unread, 0);

  // Bewerten
  assert.equal((await j(`/api/items/${lib.id}/rating`, { method: "PUT", headers: jh(anna), body: JSON.stringify({ stars: 5 }) })).status, 400);
  let r = await j(`/api/items/${lib.id}/rating`, { method: "PUT", headers: jh(ben), body: JSON.stringify({ stars: 4 }) });
  assert.equal(r.body.rating.avg, 4);
  assert.equal(r.body.myRating, 4);
  r = await j(`/api/items/${lib.id}/rating`, { method: "PUT", headers: jh(admin), body: JSON.stringify({ stars: 2 }) });
  assert.equal(r.body.rating.count, 2);
  assert.equal(r.body.rating.avg, 3);

  // Kommentieren → Ersteller bekommt Nachricht
  r = await j(`/api/items/${lib.id}/comments`, { method: "POST", headers: jh(ben), body: JSON.stringify({ text: "Super Mod!" }) });
  assert.equal(r.status, 200);
  assert.equal((await j(`/api/items/${lib.id}/comments`, { method: "POST", headers: jh(ben), body: JSON.stringify({ text: "Nochmal" }) })).status, 429);
  const list = (await j(`/api/items/${lib.id}/comments`)).body.comments;
  assert.equal(list.length, 1);
  assert.equal(list[0].canDelete, false);
  n = (await j("/api/me/notifications", { headers: jh(anna) })).body;
  assert.ok(n.items.some((x) => x.kind === "comment" && x.text.includes("Super Mod")));
  assert.equal((await j(`/api/comments/${list[0].id}`, { method: "DELETE", headers: { authorization: `Bearer ${anna}` } })).status, 403);
  assert.equal((await j(`/api/comments/${list[0].id}`, { method: "DELETE", headers: { authorization: `Bearer ${admin}` } })).body.ok, true);

  // Abonnieren → Update-Nachricht
  r = await j(`/api/items/${lib.id}/subscribe`, { method: "POST", headers: jh(ben), body: "{}" });
  assert.equal(r.body.subscribed, true);
  assert.equal(r.body.subscribers, 1);
  assert.equal((await j("/api/me/subscriptions", { headers: jh(ben) })).body.items.length, 1);
  await j(`/api/admin/settings`, { method: "PUT", headers: jh(admin), body: JSON.stringify({ reviewUpdates: false }) });
  const fd = new FormData();
  fd.append("meta", JSON.stringify({ modVersion: "1.1.0" }));
  fd.append("mod", new Blob([zip]), "m.jar");
  await j(`/api/items/${lib.id}`, { method: "PUT", headers: { authorization: `Bearer ${anna}` }, body: fd });
  n = (await j("/api/me/notifications", { headers: jh(ben) })).body;
  assert.equal(n.items[0].kind, "update");
  assert.equal(n.items[0].text, "1.1.0");

  // Sortieren nach Bewertung
  assert.equal((await j("/api/items?sort=rating")).status, 200);
  await app2.close();
});
