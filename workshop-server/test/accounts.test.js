import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acc-"));
Object.assign(process.env, { DATA_DIR: dir, NODE_ENV: "test" });
delete process.env.SMTP_HOST;
const { buildServer } = await import("../src/server.js");
const app = buildServer();
// Codes aus dem Log abfangen (ohne SMTP landen sie dort)
const codes = [];
const origInfo = app.log.info.bind(app.log);
app.log.info = (obj, ...rest) => {
  if (obj && obj.text) codes.push(/(\d{6})/.exec(obj.text)[1]);
  return origInfo(obj, ...rest);
};
await app.listen({ port: 0 });
const base = `http://127.0.0.1:${app.server.address().port}`;
const post = async (url, body, token) => {
  const r = await fetch(base + url, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

test("Konto: registrieren, bestätigen, anmelden, Passwort zurücksetzen, löschen", async () => {
  let r = await post("/api/account/register", { email: "Test@Example.com", password: "kurz" });
  assert.equal(r.status, 400);
  r = await post("/api/account/register", { email: "Test@Example.com", password: "geheim123", name: "Sebi" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(codes.length, 1);

  r = await post("/api/account/login", { email: "test@example.com", password: "geheim123" });
  assert.equal(r.status, 403);
  assert.equal(r.body.needVerify, true);
  const code = codes.at(-1);

  r = await post("/api/account/verify", { email: "test@example.com", code: "000000" === code ? "111111" : "000000" });
  assert.equal(r.status, 400);
  r = await post("/api/account/verify", { email: "test@example.com", code });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const token = r.body.token;
  assert.equal(r.body.account.email, "test@example.com");

  let me = await fetch(base + "/api/account/me", { headers: { authorization: `Bearer ${token}` } });
  assert.equal(me.status, 200);

  r = await post("/api/account/login", { email: "test@example.com", password: "falsch123" });
  assert.equal(r.status, 401);
  r = await post("/api/account/login", { email: "test@example.com", password: "geheim123" });
  assert.equal(r.status, 200);

  r = await post("/api/account/register", { email: "test@example.com", password: "geheim123" });
  assert.equal(r.status, 409);

  r = await post("/api/account/forgot", { email: "test@example.com" });
  assert.equal(r.status, 200);
  r = await post("/api/account/reset", { email: "test@example.com", code: codes.at(-1), password: "neuesPasswort1" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  // alte Sitzung ist weg
  me = await fetch(base + "/api/account/me", { headers: { authorization: `Bearer ${token}` } });
  assert.equal(me.status, 401);
  const t2 = r.body.token;

  r = await post("/api/account/delete", { password: "falsch" }, t2);
  assert.equal(r.status, 401);
  r = await post("/api/account/delete", { password: "neuesPasswort1" }, t2);
  assert.equal(r.status, 200);
  r = await post("/api/account/login", { email: "test@example.com", password: "neuesPasswort1" });
  assert.equal(r.status, 401);
  await app.close();
});
