import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createBearerStrategy } from "../src/auth/bearer.strategy";
import { createJwtTokenService } from "../src/auth/jwt";
import type { TelegramAccountStore, UserLookup } from "../src/auth/ports";
import { parseInitData } from "../src/auth/telegram/initData";
import { createTelegramVerifier } from "../src/auth/telegram/verifier";
import { createAuthController } from "../src/controllers/auth.controller";
import { authenticate, setAuthStrategy } from "../src/middleware/auth";
import type { TelegramAccount, User } from "../src/domain/entities";
import type { AppError } from "../src/utils/errors";

let pass = 0, fail = 0;
const t = async (name: string, fn: () => unknown | Promise<unknown>) => {
  try { await fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, (e as Error).message); }
};
const errOf = async (fn: () => Promise<unknown>) => {
  try { await fn(); return "ok"; } catch (e) { const a = e as AppError; return `${a.code ?? a.message}:${a.statusCode ?? ""}`; }
};

// Soxta (haqiqiy emas) qiymatlar: ish vaqtida quriladi, kodda maxfiy ko'rinishidagi satr yo'q.
const BOT = ["1234567890", "x".repeat(35)].join(":");
const SECRET = "k".repeat(40);
const NOW = 1_700_000_100;

/** Python'ning hmac moduli bilan MUSTAQIL hisoblangan qiymat (node'dagi kod bilan emas): bir xil BOT va maydonlar uchun. */
const PY_USER = '{"id":123456789,"first_name":"Ali","username":"ali_v"}';
const PY_HASH = "13108d87c6e95094b8539d78698f1b749ff22c9baa614af0ec28ae64fafe1612";
const pyInitData = (hash = PY_HASH) => new URLSearchParams({ auth_date: "1700000000", query_id: "AAH", user: PY_USER, hash }).toString();

/** Testlar uchun to'g'ri imzolangan initData yasaydi (Telegram algoritmi bo'yicha). */
const sign = (fields: Record<string, string>, token = BOT) => {
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dcs).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
};
const userJson = (id: number, extra: Record<string, unknown> = {}) => JSON.stringify({ id, first_name: "Ali", ...extra });
const fresh = (id = 111, extra: Record<string, string> = {}) => sign({ auth_date: String(NOW - 10), user: userJson(id), ...extra });

const verifier = createTelegramVerifier({ botToken: BOT, maxAgeSec: 3600, now: () => NOW });

(async () => {
  // ---------- Telegram HMAC ----------
  await t("MUSTAQIL vektor (Python hmac) node verifier bilan mos", async () => {
    const v = createTelegramVerifier({ botToken: BOT, maxAgeSec: 10_000_000, now: () => 1_700_000_050 });
    const id = await v.verify(parseInitData(pyInitData()));
    assert.ok(id); assert.equal(id!.telegramId, "123456789"); assert.equal(id!.username, "ali_v");
  });
  await t("vektordagi bitta belgi o'zgarsa -> null", async () => {
    const v = createTelegramVerifier({ botToken: BOT, maxAgeSec: 10_000_000, now: () => 1_700_000_050 });
    assert.equal(await v.verify(parseInitData(pyInitData(PY_HASH.replace(/.$/, "0")))), null);
    assert.equal(await v.verify(parseInitData(pyInitData().replace("AAH", "AAI"))), null);
  });
  await t("to'g'ri imzo -> identifikator", async () => {
    const id = await verifier.verify(parseInitData(fresh(777)));
    assert.equal(id?.telegramId, "777"); assert.equal(id?.firstName, "Ali");
  });
  await t("boshqa bot tokeni bilan imzolangan -> null", async () => {
    const other = ["9876543210", "y".repeat(35)].join(":");
    assert.equal(await verifier.verify(parseInitData(sign({ auth_date: String(NOW - 5), user: userJson(1) }, other))), null);
  });
  await t("user JSON o'zgartirilsa (id almashtirish) -> null", async () => {
    const raw = fresh(5);
    const forged = new URLSearchParams(raw);
    forged.set("user", userJson(6)); // hash o'zgarmagan
    assert.equal(await verifier.verify(parseInitData(forged.toString())), null);
  });
  await t("qo'shilgan maydon (role=admin) imzoni buzadi -> null", async () => {
    const forged = new URLSearchParams(fresh(5)); forged.set("role", "admin");
    assert.equal(await verifier.verify(parseInitData(forged.toString())), null);
  });
  await t("eskirgan auth_date -> null; chegara ichida -> ok", async () => {
    assert.equal(await verifier.verify(parseInitData(sign({ auth_date: String(NOW - 3601), user: userJson(1) }))), null);
    assert.ok(await verifier.verify(parseInitData(sign({ auth_date: String(NOW - 3600), user: userJson(1) }))));
  });
  await t("kelajakdagi auth_date (>1 daqiqa) -> null", async () => {
    assert.equal(await verifier.verify(parseInitData(sign({ auth_date: String(NOW + 3600), user: userJson(1) }))), null);
  });
  await t("user bo'lmagan to'g'ri imzolangan initData -> null", async () => {
    assert.equal(await verifier.verify(parseInitData(sign({ auth_date: String(NOW - 5), query_id: "AAH" }))), null);
  });
  await t("bo'sh bot token -> xato (jim ishlamaydi)", () => {
    assert.throws(() => createTelegramVerifier({ botToken: "", maxAgeSec: 60 }));
  });

  // ---------- JWT ----------
  const jwt = createJwtTokenService({ secret: SECRET, ttlSec: 900, now: () => NOW });
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const forge = (header: unknown, payload: unknown, secret = SECRET) => {
    const u = `${b64(header)}.${b64(payload)}`;
    return `${u}.${createHmac("sha256", secret).update(u).digest("base64url")}`;
  };
  const GOOD = { iss: "sutbozor", sub: "u1", sid: "s1", iat: NOW, exp: NOW + 900 };
  const HDR = { alg: "HS256", typ: "JWT" };

  await t("jwt: chiqarish va tekshirish", async () => {
    const { token, expiresAt } = await jwt.issue("u1", "s1");
    assert.equal(expiresAt, NOW + 900);
    assert.deepEqual(await jwt.verify(token), { userId: "u1", sessionId: "s1", expiresAt: NOW + 900 });
  });
  await t("jwt: payload'da rol yo'q", async () => {
    const { token } = await jwt.issue("u1", "s1");
    const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString());
    assert.deepEqual(Object.keys(payload).sort(), ["exp", "iat", "iss", "sid", "sub"]);
  });
  await t("jwt: o'zgartirilgan payload/imzo -> null", async () => {
    const { token } = await jwt.issue("u1", "s1");
    const [h, , s] = token.split(".") as [string, string, string];
    assert.equal(await jwt.verify(`${h}.${b64({ ...GOOD, sub: "admin" })}.${s}`), null);
    assert.equal(await jwt.verify(token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA")), null);
  });
  await t("jwt: alg=none va boshqa algoritm rad etiladi", async () => {
    assert.equal(await jwt.verify(`${b64({ alg: "none", typ: "JWT" })}.${b64(GOOD)}.`), null);
    assert.equal(await jwt.verify(forge({ alg: "HS512", typ: "JWT" }, GOOD)), null);
    assert.equal(await jwt.verify(forge({ alg: "none", typ: "JWT" }, GOOD)), null);
  });
  await t("jwt: boshqa kalit bilan imzolangan -> null", async () => {
    assert.equal(await jwt.verify(forge(HDR, GOOD, "z".repeat(40))), null);
    assert.ok(await jwt.verify(forge(HDR, GOOD)));
  });
  await t("jwt: muddati o'tgan / kelajakda / noto'g'ri da'volar -> null", async () => {
    assert.equal(await jwt.verify(forge(HDR, { ...GOOD, exp: NOW })), null);
    assert.equal(await jwt.verify(forge(HDR, { ...GOOD, exp: NOW - 1 })), null);
    assert.equal(await jwt.verify(forge(HDR, { ...GOOD, iat: NOW + 3600, exp: NOW + 4500 })), null);
    assert.equal(await jwt.verify(forge(HDR, { ...GOOD, iss: "evil" })), null);
    assert.equal(await jwt.verify(forge(HDR, { ...GOOD, sub: 1 })), null);
    assert.equal(await jwt.verify(forge(HDR, { ...GOOD, sid: "" })), null);
    assert.equal(await jwt.verify(forge(HDR, { ...GOOD, exp: "9999999999" })), null);
    assert.equal(await jwt.verify(forge(HDR, [1, 2])), null);
  });
  await t("jwt: axlat va g'alati kirishlar -> null", async () => {
    for (const bad of ["", "a.b", "a.b.c.d", "....", "x".repeat(5000), "%%%.%%%.%%%", "null"]) assert.equal(await jwt.verify(bad), null);
    assert.equal(await jwt.verify(undefined as unknown as string), null);
  });
  await t("jwt: qisqa kalit va noto'g'ri ttl -> xato", () => {
    assert.throws(() => createJwtTokenService({ secret: "short", ttlSec: 60 }));
    assert.throws(() => createJwtTokenService({ secret: SECRET, ttlSec: 0 }));
  });
  await t("jwt: muddat tugagach avval to'g'ri token endi null", async () => {
    let now = NOW; const s = createJwtTokenService({ secret: SECRET, ttlSec: 60, now: () => now });
    const { token } = await s.issue("u1", "s1");
    assert.ok(await s.verify(token)); now += 61; assert.equal(await s.verify(token), null);
  });

  // ---------- Login oqimi ----------
  const mkUser = (id: string, role: User["role"], status: User["status"] = "ACTIVE"): User => ({
    id, name: "N", phone: "+998900000000", email: "a@b.c", role, businessId: role === "business" ? "b1" : null,
    supplierId: role === "supplier" ? "s1" : null, status, createdAt: "2026-01-01T00:00:00.000Z", lastLoginAt: null,
  });
  const store = (links: Record<string, string | null>): TelegramAccountStore & { upserts: string[] } => {
    const upserts: string[] = [];
    return {
      upserts,
      async findByTelegramId() { return null; },
      async upsertProfile(identity) {
        upserts.push(identity.telegramId);
        const acc: TelegramAccount = {
          id: "a-" + identity.telegramId, telegramId: identity.telegramId, username: identity.username, firstName: identity.firstName,
          lastName: identity.lastName, photoUrl: identity.photoUrl, languageCode: identity.languageCode,
          userId: links[identity.telegramId] ?? null, firstSeenAt: "2026-01-01T00:00:00.000Z", lastLoginAt: null,
        };
        return acc;
      },
    };
  };
  const users = (list: User[]): UserLookup => ({ async findById(id) { return list.find((u) => u.id === id) ?? null; } });
  const login = (ctl: ReturnType<typeof createAuthController>, initData: string) =>
    (ctl.telegramLogin as (r: unknown) => Promise<{ data: { accessToken: string; user: { role: string } } }>)({ body: { initData } });

  const ctlFull = (links: Record<string, string | null>, list: User[]) =>
    createAuthController({ telegramVerifier: verifier, accounts: store(links), users: users(list), tokens: jwt });

  await t("login: bog'langan faol foydalanuvchi -> token, rol BAZADAN", async () => {
    const ctl = ctlFull({ "111": "u-biz" }, [mkUser("u-biz", "business")]);
    // initData ichida role=admin bo'lsa ham (imzolangan bo'lsa ham) rol baza tomondan:
    const res = await login(ctl, fresh(111, { start_param: "role-admin" }));
    assert.equal(res.data.user.role, "business");
    assert.deepEqual(await jwt.verify(res.data.accessToken), { userId: "u-biz", sessionId: (await jwt.verify(res.data.accessToken))!.sessionId, expiresAt: NOW + 900 });
  });
  await t("login: bog'lanmagan hisob -> 403 ACCOUNT_NOT_LINKED, token yo'q", async () => {
    const ctl = ctlFull({}, [mkUser("u1", "admin")]);
    assert.equal(await errOf(() => login(ctl, fresh(222))), "ACCOUNT_NOT_LINKED:403");
  });
  await t("login: bog'langan, lekin foydalanuvchi o'chgan -> 403", async () => {
    const ctl = ctlFull({ "111": "ghost" }, []);
    assert.equal(await errOf(() => login(ctl, fresh(111))), "ACCOUNT_NOT_LINKED:403");
  });
  await t("login: BLOCKED / PENDING -> 403 FORBIDDEN", async () => {
    for (const st of ["BLOCKED", "PENDING"] as const) {
      const ctl = ctlFull({ "111": "u1" }, [mkUser("u1", "supplier", st)]);
      assert.equal(await errOf(() => login(ctl, fresh(111))), "FORBIDDEN:403");
    }
  });
  await t("login: noto'g'ri imzo -> 401 va baza yozilmaydi", async () => {
    const st = store({ "111": "u1" });
    const ctl = createAuthController({ telegramVerifier: verifier, accounts: st, users: users([mkUser("u1", "admin")]), tokens: jwt });
    const forged = new URLSearchParams(fresh(111)); forged.set("auth_date", String(NOW - 1));
    assert.equal(await errOf(() => login(ctl, forged.toString())), "UNAUTHENTICATED:401");
    assert.deepEqual(st.upserts, []);
  });
  await t("login: eskirgan initData -> 401", async () => {
    const ctl = ctlFull({ "111": "u1" }, [mkUser("u1", "admin")]);
    assert.equal(await errOf(() => login(ctl, sign({ auth_date: String(NOW - 99999), user: userJson(111) }))), "UNAUTHENTICATED:401");
  });
  await t("login: sirlar sozlanmagan (accounts/tokens yo'q) -> 501", async () => {
    const noTokens = createAuthController({ telegramVerifier: verifier, accounts: store({}), users: users([]) });
    assert.equal(await errOf(() => login(noTokens, fresh(111))), "NOT_IMPLEMENTED:501");
    const noAccounts = createAuthController({ telegramVerifier: verifier, tokens: jwt, users: users([]) });
    assert.equal(await errOf(() => login(noAccounts, fresh(111))), "NOT_IMPLEMENTED:501");
  });
  await t("login: profil yangilanadi, lekin bog'lanmagan hisobga huquq berilmaydi", async () => {
    const st = store({}); const ctl = createAuthController({ telegramVerifier: verifier, accounts: st, users: users([]), tokens: jwt });
    await errOf(() => login(ctl, fresh(333)));
    assert.deepEqual(st.upserts, ["333"]);
  });

  // ---------- Bearer strategiya: token -> foydalanuvchi (rol bazadan) ----------
  const reqWith = (h?: string) => ({ headers: h === undefined ? {} : { authorization: h } }) as never;
  await t("bearer: to'g'ri token -> AuthUser; rol bazadan", async () => {
    const strategy = createBearerStrategy({ tokens: jwt, users: users([mkUser("u9", "supplier")]) });
    const { token } = await jwt.issue("u9", "s");
    const u = await strategy.authenticate(reqWith(`Bearer ${token}`));
    assert.equal(u?.id, "u9"); assert.equal(u?.role, "supplier"); assert.equal(u?.supplierId, "s1");
  });
  await t("bearer: sarlavha yo'q / noto'g'ri shakl / yaroqsiz token -> null", async () => {
    const strategy = createBearerStrategy({ tokens: jwt, users: users([mkUser("u9", "admin")]) });
    const { token } = await jwt.issue("u9", "s");
    for (const h of [undefined, "", token, `Basic ${token}`, `bearer ${token}`, `Bearer ${token} x`, "Bearer abc"]) {
      assert.equal(await strategy.authenticate(reqWith(h)), null, String(h));
    }
  });
  await t("bearer: foydalanuvchi o'chirilgan -> null (401)", async () => {
    const strategy = createBearerStrategy({ tokens: jwt, users: users([]) });
    const { token } = await jwt.issue("gone", "s");
    assert.equal(await strategy.authenticate(reqWith(`Bearer ${token}`)), null);
  });
  await t("to'liq zanjir: bloklangan foydalanuvchi token bilan ham 403", async () => {
    const strategy = createBearerStrategy({ tokens: jwt, users: users([mkUser("u9", "admin", "BLOCKED")]) });
    setAuthStrategy(strategy);
    const { token } = await jwt.issue("u9", "s");
    assert.equal(await errOf(() => authenticate(reqWith(`Bearer ${token}`))), "FORBIDDEN:403");
  });
  await t("to'liq zanjir: login tokeni bilan authenticate() o'tadi", async () => {
    const ctl = ctlFull({ "111": "u-sup" }, [mkUser("u-sup", "supplier")]);
    setAuthStrategy(createBearerStrategy({ tokens: jwt, users: users([mkUser("u-sup", "supplier")]) }));
    const res = await login(ctl, fresh(111));
    const req: any = reqWith(`Bearer ${res.data.accessToken}`);
    const u = await authenticate(req);
    assert.equal(u.role, "supplier"); assert.equal(req.user.id, "u-sup");
  });

  console.log(`auth: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
