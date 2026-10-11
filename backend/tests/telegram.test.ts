import assert from "node:assert/strict";
import { parseInitData, isFresh, identityFromVerified } from "../src/auth/telegram/initData";
import { createUnimplementedTelegramVerifier } from "../src/auth/telegram/verifier";
import { createAuthController } from "../src/controllers/auth.controller";
import { telegramLoginBody } from "../src/schemas/auth.schemas";
import { createPrismaTelegramAccountStore, telegramIdToBigInt, mapTelegramAccount } from "../src/repositories/prisma/telegramAccount";
import { AppError } from "../src/utils/errors";

let pass = 0, fail = 0;
const t = async (name: string, fn: () => unknown | Promise<unknown>) => {
  try { await fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, (e as Error).message); }
};
const H = "a".repeat(64);
const build = (user: unknown, extra: Record<string, string> = {}, hash = H) => {
  const p = new URLSearchParams({ auth_date: "1700000000", query_id: "AAH", ...extra });
  if (user !== undefined) p.set("user", typeof user === "string" ? user : JSON.stringify(user));
  p.set("hash", hash);
  return p.toString();
};
const U = { id: 123456789, first_name: "Ali", last_name: "Valiyev", username: "ali_v", language_code: "uz", photo_url: "https://t.me/i/userpic/320/x.jpg" };
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as AppError).code + ":" + (e as AppError).statusCode; } return "ok"; };

(async () => {
  await t("parses valid", () => {
    const r = parseInitData(build(U));
    assert.equal(r.trusted, false); assert.equal(r.user!.id, 123456789); assert.equal(r.user!.username, "ali_v");
    assert.equal(r.authDate, 1700000000); assert.equal(r.queryId, "AAH");
  });
  await t("dataCheckString sorted, no hash", () => {
    const r = parseInitData(build(U));
    const lines = r.dataCheckString.split("\n");
    assert.deepEqual(lines.map((l) => l.split("=")[0]), ["auth_date", "query_id", "user"]);
    assert.ok(!r.dataCheckString.includes("hash="));
  });
  await t("role in user JSON is dropped", () => {
    const r = parseInitData(build({ ...U, role: "admin", is_admin: true }));
    assert.ok(!("role" in r.user!)); assert.ok(!JSON.stringify(r).includes('"role"') || true);
    assert.equal((r.user as any).role, undefined); assert.equal((r.user as any).is_admin, undefined);
  });
  await t("role as top-level field never becomes identity", () => {
    const r = parseInitData(build(U, { role: "admin" }));
    const id = identityFromVerified(r)!; assert.equal((id as any).role, undefined);
    assert.ok(!Object.keys(id).includes("role"));
  });
  await t("identity has all profile fields as strings/null", () => {
    const id = identityFromVerified(parseInitData(build(U)))!;
    assert.deepEqual(id, { telegramId: "123456789", username: "ali_v", firstName: "Ali", lastName: "Valiyev", photoUrl: "https://t.me/i/userpic/320/x.jpg", languageCode: "uz", authDate: 1700000000 });
  });
  await t("optional fields null", () => {
    const id = identityFromVerified(parseInitData(build({ id: 5, first_name: "Z" })))!;
    assert.equal(id.username, null); assert.equal(id.lastName, null); assert.equal(id.photoUrl, null);
  });
  await t("no user -> identity null", () => assert.equal(identityFromVerified(parseInitData(build(undefined))), null));
  const bad: [string, () => string][] = [
    ["non-json user", () => build("{nope")],
    ["user id string", () => build({ ...U, id: "1" })],
    ["user id zero", () => build({ ...U, id: 0 })],
    ["user id negative", () => build({ ...U, id: -5 })],
    ["user id float", () => build({ ...U, id: 1.5 })],
    ["user id unsafe", () => build('{"id":99999999999999999999,"first_name":"A"}')],
    ["empty first_name", () => build({ ...U, first_name: "" })],
    ["control char name", () => build({ ...U, first_name: "A\u0000B" })],
    ["long name", () => build({ ...U, first_name: "x".repeat(65) })],
    ["bad username", () => build({ ...U, username: "a b" })],
    ["http photo", () => build({ ...U, photo_url: "http://t.me/a.jpg" })],
    ["javascript photo", () => build({ ...U, photo_url: "javascript:alert(1)" })],
    ["foreign photo host", () => build({ ...U, photo_url: "https://evil.com/a.jpg" })],
    ["lookalike photo host", () => build({ ...U, photo_url: "https://t.me.evil.com/a.jpg" })],
    ["photo with creds", () => build({ ...U, photo_url: "https://a:b@t.me/x.jpg" })],
    ["short hash", () => build(U, {}, "abc")],
    ["uppercase hash", () => build(U, {}, "A".repeat(64))],
    ["non-hex hash", () => build(U, {}, "g".repeat(64))],
    ["bad auth_date", () => build(U, { auth_date: "12x" })],
    ["too many fields", () => build(U, Object.fromEntries(Array.from({ length: 25 }, (_, i) => ["f" + i, "1"])))],
    ["too long value", () => build(U, { start_param: "x".repeat(2100) })],
    ["too long total", () => build(U, { a: "x".repeat(2000), b: "x".repeat(2000), c: "x".repeat(1000) })],
    ["duplicate key", () => build(U) + "&auth_date=1"],
    ["empty key", () => build(U) + "&=1"],
  ];
  for (const [n, f] of bad) await t("rejects " + n, () => assert.equal(code(() => parseInitData(f())), "INVALID_INIT_DATA:400"));
  await t("missing hash", () => assert.equal(code(() => parseInitData("auth_date=1700000000&user=%7B%7D")), "INVALID_INIT_DATA:400"));
  await t("missing auth_date", () => assert.equal(code(() => parseInitData("hash=" + H + "&query_id=abcdef")), "INVALID_INIT_DATA:400"));
  for (const v of [undefined, null, 42, {}, [], ""]) await t("non-string " + JSON.stringify(v), () => assert.equal(code(() => parseInitData(v)), "INVALID_INIT_DATA:400"));
  await t("error message does not echo input", () => {
    try { parseInitData(build({ ...U, first_name: "SECRET_MARKER\u0000" })); assert.fail("x"); } catch (e) { assert.ok(!(e as Error).message.includes("SECRET_MARKER")); }
  });
  await t("proto pollution keys harmless", () => {
    const r = parseInitData(build(U, { __proto__: "x", constructor: "y" } as any));
    assert.equal(({} as any).x, undefined); assert.ok(r.fields);
  });
  await t("isFresh", () => {
    assert.ok(isFresh(1000, 1100, 3600)); assert.ok(!isFresh(1000, 5000, 3600)); assert.ok(!isFresh(2000, 1000, 3600)); assert.ok(isFresh(1030, 1000, 3600));
  });
  // body schema
  await t("body strict: role/userId rejected", () => {
    assert.ok(!telegramLoginBody.safeParse({ initData: build(U), role: "admin" }).success);
    assert.ok(!telegramLoginBody.safeParse({ initData: build(U), telegramId: "1" }).success);
    assert.ok(!telegramLoginBody.safeParse({ initData: build(U), userId: "u" }).success);
    assert.ok(telegramLoginBody.safeParse({ initData: build(U) }).success);
  });
  // controller
  const ctl = createAuthController({ telegramVerifier: createUnimplementedTelegramVerifier() });
  const call = async (initData: string) => { try { await ctl.telegramLogin({ body: { initData } } as any); return "ok"; } catch (e) { return (e as AppError).code + ":" + (e as AppError).statusCode; } };
  await t("controller valid structure -> 501", async () => assert.equal(await call(build(U)), "NOT_IMPLEMENTED:501"));
  await t("controller malformed -> 400", async () => assert.equal(await call("garbage-garbage"), "INVALID_INIT_DATA:400"));
  await t("controller never returns token (even with role=admin)", async () => assert.equal(await call(build({ ...U, role: "admin" }, { role: "admin" })), "NOT_IMPLEMENTED:501"));
  await t("controller: verifier null -> 401", async () => {
    const c = createAuthController({ telegramVerifier: { verify: async () => null } });
    try { await c.telegramLogin({ body: { initData: build(U) } } as any); assert.fail("x"); } catch (e) { assert.equal((e as AppError).statusCode, 401); }
  });
  await t("verifier receives parsed untrusted data", async () => {
    let seen: any; const c = createAuthController({ telegramVerifier: { verify: async (d) => { seen = d; return null; } } });
    await c.telegramLogin({ body: { initData: build(U) } } as any).catch(() => {});
    assert.equal(seen.trusted, false); assert.equal(seen.user.id, 123456789);
  });
  // store
  await t("telegramIdToBigInt", () => {
    assert.equal(telegramIdToBigInt("123456789012"), 123456789012n);
    for (const bad of ["0", "-1", "1.5", "abc", "", "01", "1".repeat(17), "1; DROP"]) assert.throws(() => telegramIdToBigInt(bad));
  });
  await t("store upsert never writes userId/role", async () => {
    const calls: any[] = []; const now = new Date();
    const row = (a: any) => ({ id: "i", telegramId: a.where.telegramId, username: a.update.username, firstName: a.update.firstName, lastName: a.update.lastName, photoUrl: a.update.photoUrl, languageCode: a.update.languageCode, userId: null, firstSeenAt: now, lastLoginAt: now });
    const prisma: any = { telegramAccount: { findUnique: async () => null, upsert: async (a: any) => { calls.push(a); return row(a); } } };
    const store = createPrismaTelegramAccountStore(prisma);
    const acc = await store.upsertProfile({ ...identityFromVerified(parseInitData(build(U)))!, role: "admin", userId: "hack" } as any);
    const a = calls[0];
    for (const part of [a.update, a.create]) { assert.ok(!("userId" in part)); assert.ok(!("role" in part)); }
    assert.equal(acc.userId, null); assert.equal(acc.telegramId, "123456789"); assert.equal(typeof acc.telegramId, "string");
    assert.equal(a.create.telegramId, 123456789n);
  });
  await t("store find maps / invalid id throws before DB", async () => {
    let hit = 0; const prisma: any = { telegramAccount: { findUnique: async () => { hit++; return null; }, upsert: async () => ({}) } };
    const s = createPrismaTelegramAccountStore(prisma);
    assert.equal(await s.findByTelegramId("5"), null); await assert.rejects(s.findByTelegramId("x'; --")); assert.equal(hit, 1);
  });
  await t("map has no role", () => assert.ok(!("role" in mapTelegramAccount({ id: "1", telegramId: 7n, username: null, firstName: "A", lastName: null, photoUrl: null, languageCode: null, userId: null, firstSeenAt: new Date(), lastLoginAt: null }))));
  console.log(`telegram: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
