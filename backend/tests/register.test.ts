import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createJwtTokenService } from "../src/auth/jwt";
import type { NewRegistration, RegistrationStore, TelegramAccountStore } from "../src/auth/ports";
import { createTelegramVerifier } from "../src/auth/telegram/verifier";
import { createAuthController } from "../src/controllers/auth.controller";
import type { TelegramAccount, User } from "../src/domain/entities";
import { createPrismaRegistrationStore } from "../src/repositories/prisma/registration";
import { registerBody } from "../src/schemas/auth.schemas";
import { AppError, conflict } from "../src/utils/errors";

let pass = 0, fail = 0;
const t = async (name: string, fn: () => unknown | Promise<unknown>) => {
  try { await fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, (e as Error).message); }
};
const errOf = async (fn: () => Promise<unknown>) => {
  try { await fn(); return "ok"; } catch (e) { const a = e as AppError; return `${a.code ?? a.message}:${a.statusCode ?? ""}`; }
};

// Soxta (haqiqiy emas) qiymatlar: ish vaqtida quriladi.
const BOT = ["1234567890", "x".repeat(35)].join(":");
const SECRET = "k".repeat(40);
const NOW = 1_700_000_100;
const sign = (fields: Record<string, string>, token = BOT) => {
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  return new URLSearchParams({ ...fields, hash: createHmac("sha256", secret).update(dcs).digest("hex") }).toString();
};
const fresh = (id = 111) => sign({ auth_date: String(NOW - 10), user: JSON.stringify({ id, first_name: "Ali" }) });
const verifier = createTelegramVerifier({ botToken: BOT, maxAgeSec: 3600, now: () => NOW });
const jwt = createJwtTokenService({ secret: SECRET, ttlSec: 900, now: () => NOW });

const bizBody = (over: Record<string, unknown> = {}) => ({
  initData: fresh(111), role: "business", name: "Ali Valiyev", phone: "+998 90 123-45-67",
  organization: { name: "Nur kafe", type: "Kafe", area: "Navbahor", address: "Navoiy ko'chasi 5" }, ...over,
});
const supBody = (over: Record<string, unknown> = {}) => ({
  initData: fresh(222), role: "supplier", name: "Vali Aliyev", phone: "+998901234568", email: "Vali@Mail.UZ",
  organization: { name: "Aliyevlar xo'jaligi", area: "Do'stlik", deliveryRadiusKm: 5 }, ...over,
});

(async () => {
  // ---------- Sxema ----------
  await t("sxema: to'g'ri business body, telefon normallashadi, email yo'q", () => {
    const r = registerBody.safeParse(bizBody());
    assert.ok(r.success);
    if (r.success) { assert.equal(r.data.phone, "+998901234567"); assert.equal(r.data.email, undefined); }
  });
  await t("sxema: supplier email kichik harfga o'tadi; bo'sh email = berilmagan", () => {
    const r = registerBody.safeParse(supBody());
    assert.ok(r.success); if (r.success) assert.equal(r.data.email, "vali@mail.uz");
    const e = registerBody.safeParse(supBody({ email: "" }));
    assert.ok(e.success); if (e.success) assert.equal(e.data.email, undefined);
  });
  await t("sxema: role=admin rad etiladi", () => {
    assert.equal(registerBody.safeParse(bizBody({ role: "admin" })).success, false);
    assert.equal(registerBody.safeParse(bizBody({ role: undefined })).success, false);
  });
  await t("sxema: ortiqcha maydonlar (status, userId, telegramId, businessId) rad etiladi", () => {
    for (const k of ["status", "userId", "telegramId", "businessId", "permissions"]) {
      assert.equal(registerBody.safeParse(bizBody({ [k]: "x" })).success, false, k);
    }
    assert.equal(registerBody.safeParse(bizBody({ organization: { ...bizBody().organization, rating: 5 } })).success, false);
  });
  await t("sxema: rol tashkilot shakliga mos bo'lishi shart", () => {
    assert.equal(registerBody.safeParse(supBody({ organization: bizBody().organization })).success, false);
    assert.equal(registerBody.safeParse(bizBody({ organization: supBody().organization })).success, false);
  });
  await t("sxema: noto'g'ri telefon/email/radius rad etiladi", () => {
    assert.equal(registerBody.safeParse(bizBody({ phone: "12345" })).success, false);
    assert.equal(registerBody.safeParse(bizBody({ phone: "+99890123456" })).success, false);
    assert.equal(registerBody.safeParse(bizBody({ email: "nomalum" })).success, false);
    for (const r of [0, 1.5, 101, "5"]) {
      assert.equal(registerBody.safeParse(supBody({ organization: { ...supBody().organization, deliveryRadiusKm: r } })).success, false, String(r));
    }
  });

  // ---------- Controller ----------
  const accountOf = (tgId: string, userId: string | null = null): TelegramAccount => ({
    id: "acc-" + tgId, telegramId: tgId, username: null, firstName: "Ali", lastName: null, photoUrl: null,
    languageCode: null, userId, firstSeenAt: "2026-01-01T00:00:00.000Z", lastLoginAt: null,
  });
  const accounts = (links: Record<string, string> = {}) => {
    const upserts: string[] = [];
    const s: TelegramAccountStore & { upserts: string[] } = {
      upserts, async findByTelegramId() { return null; },
      async upsertProfile(i) { upserts.push(i.telegramId); return accountOf(i.telegramId, links[i.telegramId] ?? null); },
    };
    return s;
  };
  const regStore = (fail?: AppError) => {
    const calls: NewRegistration[] = [];
    const s: RegistrationStore & { calls: NewRegistration[] } = {
      calls,
      async register(input) {
        calls.push(input);
        if (fail) throw fail;
        const user: User = {
          id: "u-new", name: input.name, phone: input.phone, email: input.email, role: input.role,
          businessId: input.role === "business" ? "b-new" : null, supplierId: input.role === "supplier" ? "s-new" : null,
          status: input.status, createdAt: "2026-01-01T00:00:00.000Z", lastLoginAt: null,
        };
        return user;
      },
    };
    return s;
  };
  const replyStub = () => { const r = { status: 0, code(n: number) { r.status = n; return r; } }; return r; };
  const reg = (ctl: ReturnType<typeof createAuthController>, body: unknown, reply = replyStub()) =>
    (ctl.register as (r: unknown, p: unknown) => Promise<{ data: { accessToken: string; user: { role: string; status: string; businessId: string | null; supplierId: string | null } } }>)({ body: registerBody.parse(body) }, reply);
  const mk = (acc = accounts(), store = regStore(), extra: Record<string, unknown> = {}) =>
    ({ acc, store, ctl: createAuthController({ telegramVerifier: verifier, accounts: acc, registrations: store, tokens: jwt, ...extra }) });

  await t("register: business -> 201, token, rol server qoidasidan, tashkilot nusxalanadi", async () => {
    const { ctl, store } = mk(); const reply = replyStub();
    const res = await reg(ctl, bizBody(), reply);
    assert.equal(reply.status, 201);
    assert.equal(res.data.user.role, "business"); assert.equal(res.data.user.status, "ACTIVE"); assert.equal(res.data.user.businessId, "b-new");
    const payload = await jwt.verify(res.data.accessToken);
    assert.equal(payload?.userId, "u-new");
    assert.equal(store.calls.length, 1);
    const c = store.calls[0]!;
    assert.equal(c.telegramAccountId, "acc-111"); assert.equal(c.status, "ACTIVE"); assert.equal(c.email, null);
    assert.equal(c.phone, "+998901234567"); assert.equal(c.organization.name, "Nur kafe");
  });
  await t("register: supplier -> supplierId, email saqlanadi", async () => {
    const { ctl, store } = mk(); const res = await reg(ctl, supBody());
    assert.equal(res.data.user.role, "supplier"); assert.equal(res.data.user.supplierId, "s-new");
    assert.equal(store.calls[0]!.email, "vali@mail.uz");
  });
  await t("register: noto'g'ri imzo -> 401, hech narsa yozilmaydi", async () => {
    const { ctl, store, acc } = mk();
    const forged = new URLSearchParams(fresh(111)); forged.set("auth_date", String(NOW - 1));
    assert.equal(await errOf(() => reg(ctl, bizBody({ initData: forged.toString() }))), "UNAUTHENTICATED:401");
    assert.equal(store.calls.length, 0); assert.deepEqual(acc.upserts, []);
  });
  await t("register: eskirgan initData -> 401", async () => {
    const { ctl, store } = mk();
    const old = sign({ auth_date: String(NOW - 99999), user: JSON.stringify({ id: 111, first_name: "Ali" }) });
    assert.equal(await errOf(() => reg(ctl, bizBody({ initData: old }))), "UNAUTHENTICATED:401");
    assert.equal(store.calls.length, 0);
  });
  await t("register: hisob allaqachon bog'langan -> 409, register chaqirilmaydi", async () => {
    const { ctl, store } = mk(accounts({ "111": "u-old" }));
    assert.equal(await errOf(() => reg(ctl, bizBody())), "CONFLICT:409");
    assert.equal(store.calls.length, 0);
  });
  await t("register: telefon/email band (ombor 409) -> 409 token yo'q", async () => {
    const { ctl } = mk(accounts(), regStore(conflict("Bu telefon raqami allaqachon ro'yxatdan o'tgan.")));
    assert.equal(await errOf(() => reg(ctl, bizBody())), "CONFLICT:409");
  });
  await t("register: sozlanmagan (ombor/token/hisob yo'q) -> 501", async () => {
    const a = createAuthController({ telegramVerifier: verifier, accounts: accounts(), tokens: jwt });
    assert.equal(await errOf(() => reg(a, bizBody())), "NOT_IMPLEMENTED:501");
    const b = createAuthController({ telegramVerifier: verifier, accounts: accounts(), registrations: regStore() });
    assert.equal(await errOf(() => reg(b, bizBody())), "NOT_IMPLEMENTED:501");
    const c = createAuthController({ telegramVerifier: verifier, registrations: regStore(), tokens: jwt });
    assert.equal(await errOf(() => reg(c, bizBody())), "NOT_IMPLEMENTED:501");
  });
  await t("register: PENDING rejimida token berilmaydi (403), lekin hisob yaratiladi", async () => {
    const { ctl, store } = mk(accounts(), regStore(), { registrationStatus: "PENDING" });
    assert.equal(await errOf(() => reg(ctl, bizBody())), "FORBIDDEN:403");
    assert.equal(store.calls.length, 1); assert.equal(store.calls[0]!.status, "PENDING");
  });

  // ---------- Prisma ombori (soxta $transaction bilan, tartib va xato xaritasi) ----------
  type Op = string;
  const fakePrisma = (opts: { linkedCount?: number; failAt?: string; error?: unknown } = {}) => {
    const ops: Op[] = []; const data: Record<string, any> = {};
    const maybeFail = (name: string) => { if (opts.failAt === name) throw opts.error; };
    const tx = {
      business: { async create(a: any) { ops.push("business.create"); data.business = a.data; maybeFail("business"); return { id: "b1" }; } },
      supplier: { async create(a: any) { ops.push("supplier.create"); data.supplier = a.data; maybeFail("supplier"); return { id: "s1" }; } },
      user: {
        async create(a: any) {
          ops.push("user.create"); data.user = a.data; maybeFail("user");
          return { id: "u1", ...a.data, businessId: a.data.businessId ?? null, supplierId: a.data.supplierId ?? null, createdAt: new Date("2026-01-01T00:00:00Z"), lastLoginAt: null };
        },
      },
      telegramAccount: { async updateMany(a: any) { ops.push("tg.link"); data.link = a; maybeFail("link"); return { count: opts.linkedCount ?? 1 }; } },
      auditLog: { async create(a: any) { ops.push("audit.create"); data.audit = a.data; maybeFail("audit"); return {}; } },
    };
    let rolledBack = false;
    const prisma = { async $transaction(fn: (tx: unknown) => Promise<unknown>) { try { return await fn(tx); } catch (e) { rolledBack = true; throw e; } } };
    return { store: createPrismaRegistrationStore(prisma as never), ops, data, rolled: () => rolledBack };
  };
  const bizReg: NewRegistration = {
    telegramAccountId: "acc-1", name: "Ali", phone: "+998901234567", email: null, status: "ACTIVE", role: "business",
    organization: { name: "Nur", type: "Kafe", area: "A", address: "B" },
  };
  const supReg: NewRegistration = {
    telegramAccountId: "acc-2", name: "Vali", phone: "+998901234568", email: "v@m.uz", status: "ACTIVE", role: "supplier",
    organization: { name: "Xo'jalik", area: "A", deliveryRadiusKm: 5 },
  };

  await t("ombor: business tartibi: tashkilot -> user -> bog'lash -> audit, businessId bog'lanadi", async () => {
    const f = fakePrisma(); const u = await f.store.register(bizReg);
    assert.deepEqual(f.ops, ["business.create", "user.create", "tg.link", "audit.create"]);
    assert.equal(f.data.user.businessId, "b1"); assert.equal(f.data.user.supplierId, undefined);
    assert.equal(u.role, "business"); assert.equal(u.businessId, "b1"); assert.equal(u.email, null);
    assert.deepEqual(f.data.link, { where: { id: "acc-1", userId: null }, data: { userId: "u1" } });
    assert.equal(f.data.audit.action, "auth.register"); assert.equal(f.data.audit.actorId, "u1");
    assert.ok(!JSON.stringify(f.data.audit).includes("+998"), "audit'da telefon yo'q");
  });
  await t("ombor: supplier -> supplierId, email saqlanadi", async () => {
    const f = fakePrisma(); const u = await f.store.register(supReg);
    assert.deepEqual(f.ops, ["supplier.create", "user.create", "tg.link", "audit.create"]);
    assert.equal(f.data.user.supplierId, "s1"); assert.equal(f.data.user.businessId, undefined);
    assert.equal(u.supplierId, "s1"); assert.equal(u.email, "v@m.uz");
  });
  await t("ombor: hisob allaqachon bog'langan (count=0) -> 409 va tranzaksiya bekor, audit yozilmaydi", async () => {
    const f = fakePrisma({ linkedCount: 0 });
    assert.equal(await errOf(() => f.store.register(bizReg)), "CONFLICT:409");
    assert.ok(f.rolled()); assert.ok(!f.ops.includes("audit.create"));
  });
  await t("ombor: P2002 phone -> 409 telefon xabari; email -> email xabari", async () => {
    const p = (target: unknown) => Object.assign(new Error("unique"), { code: "P2002", meta: { target } });
    const a = fakePrisma({ failAt: "user", error: p(["phone"]) });
    await assert.rejects(() => a.store.register(bizReg), (e: AppError) => e.statusCode === 409 && /telefon/.test(e.message));
    const b = fakePrisma({ failAt: "user", error: p("users_email_key") });
    await assert.rejects(() => b.store.register(bizReg), (e: AppError) => e.statusCode === 409 && /email/.test(e.message));
    const c = fakePrisma({ failAt: "user", error: p(undefined) });
    await assert.rejects(() => c.store.register(bizReg), (e: AppError) => e.statusCode === 409);
  });
  await t("ombor: boshqa xatolar (baza uzildi) o'zgarishsiz yuqoriga chiqadi (409 ga aylanmaydi)", async () => {
    const f = fakePrisma({ failAt: "user", error: new Error("connection lost") });
    await assert.rejects(() => f.store.register(bizReg), (e: Error) => e.message === "connection lost" && !(e instanceof AppError));
  });

  console.log(`register: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
