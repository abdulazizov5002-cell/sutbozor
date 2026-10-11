import assert from "node:assert/strict";
import { scrub, scrubString, sanitizeUrl, serializeError, isSensitiveKey, REDACTED } from "../src/logging/redact";
import { buildLoggerOptions, logRequestCompleted } from "../src/logging/logger";

let pass = 0, fail = 0;
const t = (n: string, f: () => void) => { try { f(); pass++; } catch (e) { fail++; console.log("FAIL", n, (e as Error).message); } };
const J = (v: unknown) => JSON.stringify(v);
// Soxta qiymatlar ish vaqtida yig'iladi, shunda sir skaneri test faylini yolg'on topilma deb belgilamaydi.
const BOT = ["123456789", "AAH-abcdefghijklmnopqrstuvwxyz012345"].join(":");
const PG = (u: string, p: string, h: string) => ["postgresql", "//" + u + ":" + p + "@" + h].join(":");
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlMTIz";
const HASH = "a".repeat(64);
const INIT = `query_id=AAH&user=%7B%22id%22%3A1%2C%22first_name%22%3A%22Ali%22%7D&auth_date=1700000000&hash=${HASH}`;

t("sensitive keys", () => {
  for (const k of ["password", "newPassword", "access_token", "refreshToken", "initData", "init_data", "hash", "passHash", "Authorization", "cookie", "x-api-key", "client_secret", "cardNumber", "cvv", "transactionId", "iban", "accountNumber", "botToken", "TELEGRAM_BOT_TOKEN", "JWT_SECRET", "otp"]) assert.ok(isSensitiveKey(k), k);
  for (const k of ["amount", "status", "orderId", "paymentId", "method", "userId", "role", "ms", "route", "authDate", "hashtag"]) assert.ok(!isSensitiveKey(k), k);
});
t("deep key redaction", () => {
  const out = J(scrub({ a: { b: { password: "p1", list: [{ token: "t1" }, { initData: INIT }] } }, ok: 1, transactionId: "TX-9", cardNumber: "4111111111111111" }));
  for (const s of ["p1", "t1", HASH, "TX-9", "4111111111111111"]) assert.ok(!out.includes(s), s);
  assert.ok(out.includes('"ok":1'));
});
t("value patterns in strings", () => {
  for (const s of [`Bearer ${JWT}`, JWT, `bot ${BOT} failed`, INIT, encodeURIComponent(INIT), PG("sutbozor", "SuperParol1", "localhost:5432/db"), "password=hunter22 ok", `{"token":"abc123def"}`, "card 4444444444444444 x", "karta 4111 1111 1111 1111 ok"]) {
    const o = scrubString(s);
    for (const bad of [JWT, BOT, HASH, "SuperParol1", "hunter22", "abc123def", "4444444444444444", "4111111111111111"]) assert.ok(!o.includes(bad), `${s} -> ${o}`);
  }
  assert.equal(scrubString("Telefon so'rovi muvaffaqiyatli"), "Telefon so'rovi muvaffaqiyatli");
});
t("db url keeps host, drops password", () => {
  const o = scrubString("connect " + PG("sutbozor", "Sirli123", "db.local:5432/x") + " failed");
  assert.ok(o.includes("db.local") && !o.includes("Sirli123"));
});
t("sanitizeUrl", () => {
  const u = sanitizeUrl(`/api/auth/me?token=${JWT}&page=2&initData=${encodeURIComponent(INIT)}&q=non&hash=${HASH}#frag`);
  assert.ok(u.startsWith("/api/auth/me?") && u.includes("page=2") && u.includes("q=non"));
  for (const bad of [JWT, HASH, "Ali", "frag"]) assert.ok(!u.includes(bad), bad);
  assert.equal(sanitizeUrl("/api/health"), "/api/health");
  assert.ok(sanitizeUrl("/x?" + "a=1&".repeat(100)).split("&").length <= 20);
  assert.ok(sanitizeUrl("/" + "x".repeat(5000)).length <= 200);
  assert.ok(!sanitizeUrl(`/api/t/${BOT}/x`).includes(BOT));
});
t("limits and safety", () => {
  const circ: any = { a: 1 }; circ.self = circ;
  assert.ok(J(scrub(circ)).includes("circular"));
  assert.ok(J(scrub({ big: "x".repeat(100000) })).length < 3000);
  assert.ok(J(scrub(Array.from({ length: 1000 }, (_, i) => i))).length < 1000);
  let deep: any = {}; const root = deep; for (let i = 0; i < 50; i++) { deep.n = {}; deep = deep.n; }
  assert.ok(J(scrub(root)).includes("depth limit"));
  assert.equal(scrub(10n), "10"); assert.equal(scrub(null), null);
  assert.ok(J(scrub(Object.fromEntries(Array.from({ length: 500 }, (_, i) => ["k" + i, i])))).length < 2000);
});
t("serializeError scrubs message and bounds stack", () => {
  const e = new Error(`Invalid prisma query ... password=Hunter99 token ${JWT} url ${PG("u", "DbPass77", "h/db")}`);
  const o = J(serializeError(e));
  for (const bad of ["Hunter99", JWT, "DbPass77"]) assert.ok(!o.includes(bad), bad);
  assert.ok(o.includes("Error"));
  assert.ok(J(serializeError("raw " + BOT)).indexOf(BOT) === -1);
});
t("logMethod hook scrubs objects, strings, errors; keeps req/res for serializers", () => {
  const opts: any = buildLoggerOptions("info");
  const seen: unknown[][] = [];
  const method = (...a: unknown[]) => { seen.push(a); };
  opts.hooks.logMethod.call({}, [{ body: { password: "pw1" }, note: `token ${BOT}`, req: { url: "/a" } }, `msg Bearer ${JWT}`], method);
  opts.hooks.logMethod.call({}, [new Error("password=zzz999 boom")], method);
  const all = J(seen);
  for (const bad of ["pw1", BOT, JWT, "zzz999"]) assert.ok(!all.includes(bad), bad);
  assert.deepEqual((seen[0]![0] as any).req, { url: "/a" });
  assert.ok((seen[1]![0] as any).err instanceof Error);
});
t("req serializer drops headers/body, sanitizes url", () => {
  const opts: any = buildLoggerOptions("info");
  const o = opts.serializers.req({ method: "POST", url: `/api/auth/telegram?initData=${HASH}`, id: "r1", headers: { authorization: `Bearer ${JWT}` }, body: { initData: INIT } });
  assert.deepEqual(Object.keys(o).sort(), ["id", "method", "url"]);
  assert.ok(!J(o).includes(HASH) && !J(o).includes(JWT));
  assert.deepEqual(Object.keys(opts.serializers.res({ statusCode: 200, getHeaders: () => ({}) })), ["statusCode"]);
});
t("pino redact paths cover headers and body fields", () => {
  const p: string[] = (buildLoggerOptions("info") as any).redact.paths;
  for (const x of ["req.headers.authorization", "req.headers.cookie", "req.body.password", "req.body.initData", 'req.headers["x-telegram-init-data"]']) assert.ok(p.includes(x), x);
});
t("request completed log: no body/headers, route pattern, user ctx", () => {
  const logs: any[] = [];
  const log: any = new Proxy({}, { get: (_t, lvl) => (obj: any, msg: string) => logs.push({ lvl, obj, msg }) });
  const req: any = { method: "POST", url: `/api/payments/PAY-1/submit?token=${JWT}&page=1`, routeOptions: { url: "/api/payments/:id/submit" }, log, user: { id: "u1", role: "business" }, body: { transactionId: "TX-SECRET", password: "pw" }, headers: { authorization: `Bearer ${JWT}` } };
  logRequestCompleted(req, { statusCode: 403, elapsedTime: 12.4 } as any);
  const rec = logs[0]; const s = J(rec);
  assert.equal(rec.lvl, "warn"); assert.equal(rec.obj.route, "/api/payments/:id/submit"); assert.equal(rec.obj.userId, "u1"); assert.equal(rec.obj.ms, 12);
  for (const bad of [JWT, "TX-SECRET", "pw", "PAY-1"]) assert.ok(!s.includes(bad), bad);
  logs.length = 0; logRequestCompleted({ ...req, user: undefined } as any, { statusCode: 200, elapsedTime: 1 } as any);
  assert.equal(logs[0].lvl, "info"); assert.ok(!("userId" in logs[0].obj));
  logs.length = 0; logRequestCompleted({ ...req, routeOptions: undefined, url: "/nope" } as any, { statusCode: 500, elapsedTime: 1 } as any);
  assert.equal(logs[0].lvl, "error"); assert.equal(logs[0].obj.route, "/nope");
});
console.log(`logging: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
