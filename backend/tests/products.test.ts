import assert from "node:assert/strict";
import { createPrismaRepositories } from "../src/repositories/prisma";
import { createProductService } from "../src/services/product.service";
import { createProductBody, updateProductBody } from "../src/schemas/product.schemas";
import type { AuthUser } from "../src/types/fastify";
import type { AppError } from "../src/utils/errors";
import { fakeProductRepo, prod } from "./helpers/fakeProductRepo";

let pass = 0, fail = 0;
const t = async (name: string, fn: () => unknown | Promise<unknown>) => {
  try { await fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, (e as Error).message); }
};
const errOf = async (fn: () => Promise<unknown>) => {
  try { await fn(); return "ok"; } catch (e) { const a = e as AppError; return `${a.code ?? a.message}:${a.statusCode ?? ""}`; }
};

const supA: AuthUser = { id: "uA", name: "Ali", role: "supplier", status: "ACTIVE", supplierId: "sA", businessId: null };
const supB: AuthUser = { id: "uB", role: "supplier", status: "ACTIVE", supplierId: "sB", businessId: null };
const biz: AuthUser = { id: "uC", role: "business", status: "ACTIVE", businessId: "bC", supplierId: null };
const adm: AuthUser = { id: "uD", role: "admin", status: "ACTIVE", businessId: null, supplierId: null };
const P_A = "00000000-0000-4000-8000-0000000000a1";
const P_B = "00000000-0000-4000-8000-0000000000b1";
const world = () => fakeProductRepo([prod(P_A, "sA"), prod(P_B, "sB", "Qatiq")]);
const body = (over: Record<string, unknown> = {}) => ({ name: "Qaymoq", pricePerUnit: 30000, dailyCapacity: 4, availableToday: 3, ...over });

(async () => {
  // ---------- Sxema ----------
  await t("sxema: to'g'ri yaratish body", () => assert.ok(createProductBody.safeParse(body()).success));
  await t("sxema: supplierId/unit/id yuborish rad etiladi (strict)", () => {
    for (const k of ["supplierId", "unit", "id", "status"]) assert.equal(createProductBody.safeParse(body({ [k]: "x" })).success, false, k);
  });
  await t("sxema: noma'lum mahsulot nomi, 0/manfiy/kasr narx, manfiy miqdor, yetishmayotgan maydon rad etiladi", () => {
    assert.equal(createProductBody.safeParse(body({ name: "Pishloq" })).success, false);
    for (const p of [0, -5, 1.5, "100", Number.MAX_SAFE_INTEGER + 1]) assert.equal(createProductBody.safeParse(body({ pricePerUnit: p })).success, false, String(p));
    assert.equal(createProductBody.safeParse(body({ dailyCapacity: -1 })).success, false);
    assert.equal(createProductBody.safeParse(body({ availableToday: 1.234 })).success, false);
    const { availableToday: _a, ...rest } = body(); assert.equal(createProductBody.safeParse(rest).success, false);
  });
  await t("sxema: yangilash: bo'sh, nom, 0 narx, noma'lum maydon rad etiladi; bitta maydon ok", () => {
    assert.equal(updateProductBody.safeParse({}).success, false);
    assert.equal(updateProductBody.safeParse({ name: "Sut" }).success, false);
    assert.equal(updateProductBody.safeParse({ pricePerUnit: 0 }).success, false);
    assert.equal(updateProductBody.safeParse({ supplierId: "x", pricePerUnit: 5 }).success, false);
    assert.ok(updateProductBody.safeParse({ availableToday: 0 }).success);
  });

  // ---------- Servis: yaratish ----------
  await t("create: supplier -> supplierId tokendan, birlik nomdan (Qaymoq=L), audit", async () => {
    const w = world(); const svc = createProductService(w.repo);
    const p = await svc.create(supA, createProductBody.parse(body()));
    assert.equal(p.supplierId, "sA"); assert.equal(p.unit, "L"); assert.equal(p.pricePerUnit, 30000);
    assert.equal(w.audits.length, 1);
    assert.deepEqual({ ...w.audits[0] }, {
      actorId: "uA", actorName: "Ali", actorRole: "supplier", action: "product.create", objectType: "product", objectId: p.id, description: "Mahsulot qo'shildi: Qaymoq",
    });
  });
  await t("create: kg mahsulotlar (Suzma, Tvorog, Sariyog')", async () => {
    const w = world(); const svc = createProductService(w.repo);
    for (const n of ["Suzma", "Tvorog", "Sariyog'"]) assert.equal((await svc.create(supA, createProductBody.parse(body({ name: n })))).unit, "kg", n);
  });
  await t("create: nom bo'lmasa audit'da actorName = id", async () => {
    const w = world(); await createProductService(w.repo).create(supB, createProductBody.parse(body()));
    assert.equal(w.audits[0]!.actorName, "uB");
  });
  await t("create: business va admin -> 403, hech narsa yozilmaydi", async () => {
    const w = world(); const svc = createProductService(w.repo);
    for (const u of [biz, adm]) assert.equal(await errOf(() => svc.create(u, createProductBody.parse(body()))), "FORBIDDEN:403");
    assert.equal(w.items.length, 2); assert.equal(w.audits.length, 0);
  });
  await t("create: faol bo'lmagan yoki supplierga biriktirilmagan -> 403", async () => {
    const svc = createProductService(world().repo);
    assert.equal(await errOf(() => svc.create({ ...supA, status: "BLOCKED" }, createProductBody.parse(body()))), "FORBIDDEN:403");
    assert.equal(await errOf(() => svc.create({ ...supA, supplierId: null }, createProductBody.parse(body()))), "FORBIDDEN:403");
  });
  await t("create: takror (supplier, nom) -> 409", async () => {
    const svc = createProductService(world().repo);
    assert.equal(await errOf(() => svc.create(supA, createProductBody.parse(body({ name: "Sut" })))), "CONFLICT:409");
  });

  // ---------- Servis: yangilash / o'chirish ----------
  await t("update: o'z mahsuloti -> yangilanadi, audit maydon nomlari bilan (qiymatsiz)", async () => {
    const w = world(); const svc = createProductService(w.repo);
    const p = await svc.update(supA, P_A, updateProductBody.parse({ pricePerUnit: 15000, availableToday: 7 }));
    assert.equal(p.pricePerUnit, 15000); assert.equal(p.availableToday, 7); assert.equal(p.dailyCapacity, 10);
    assert.equal(w.audits[0]!.action, "product.update"); assert.match(w.audits[0]!.description, /bugungi miqdor, narx/);
    assert.ok(!w.audits[0]!.description.includes("15000"));
  });
  await t("update: begona mahsulot -> 404 (IDOR), o'zgarmaydi; yo'q mahsulot -> 404", async () => {
    const w = world(); const svc = createProductService(w.repo);
    assert.equal(await errOf(() => svc.update(supA, P_B, updateProductBody.parse({ pricePerUnit: 1 }))), "NOT_FOUND:404");
    assert.equal(w.items.find((p) => p.id === P_B)!.pricePerUnit, 12000);
    assert.equal(await errOf(() => svc.update(supA, "00000000-0000-4000-8000-00000000ffff", updateProductBody.parse({ pricePerUnit: 1 }))), "NOT_FOUND:404");
    assert.equal(w.audits.length, 0);
  });
  await t("update/remove: business va admin -> 403", async () => {
    const svc = createProductService(world().repo);
    for (const u of [biz, adm]) {
      assert.equal(await errOf(() => svc.update(u, P_A, updateProductBody.parse({ pricePerUnit: 1 }))), "FORBIDDEN:403");
      assert.equal(await errOf(() => svc.remove(u, P_A)), "FORBIDDEN:403");
    }
  });
  await t("update: tekshiruvdan keyin yozuv yo'qolsa (poyga) -> 404", async () => {
    const w = world(); const svc = createProductService({ ...w.repo, update: async () => null });
    assert.equal(await errOf(() => svc.update(supA, P_A, updateProductBody.parse({ pricePerUnit: 1 }))), "NOT_FOUND:404");
  });
  await t("remove: o'zinikini o'chiradi (audit), begonasini 404", async () => {
    const w = world(); const svc = createProductService(w.repo);
    assert.equal(await errOf(() => svc.remove(supA, P_B)), "NOT_FOUND:404"); assert.equal(w.items.length, 2);
    await svc.remove(supA, P_A);
    assert.deepEqual(w.items.map((p) => p.id), [P_B]);
    assert.equal(w.audits[0]!.action, "product.delete"); assert.equal(w.audits[0]!.objectId, P_A);
  });
  await t("remove: poyga (repo null) -> 404", async () => {
    const svc = createProductService({ ...world().repo, remove: async () => null });
    assert.equal(await errOf(() => svc.remove(supA, P_A)), "NOT_FOUND:404");
  });

  // ---------- Servis: o'qish (mavjud qoidalar buzilmagan) ----------
  await t("o'qish: biznes bozorni (scope bo'sh), supplier faqat o'zinikini ko'radi", async () => {
    const w = world(); const svc = createProductService(w.repo);
    assert.equal((await svc.list(biz, { page: 1, limit: 20 })).total, 2);
    assert.equal((await svc.list(supA, { page: 1, limit: 20 })).total, 1);
    assert.deepEqual(w.scopes, [{}, { supplierId: "sA" }]);
    assert.equal(await errOf(() => svc.getById(supA, P_B)), "NOT_FOUND:404");
    assert.equal((await svc.getById(biz, P_B)).id, P_B);
  });

  // ---------- Prisma ombori (soxta $transaction) ----------
  const fakePrisma = (opts: { failAt?: string; error?: unknown } = {}) => {
    const ops: string[] = []; const seen: Record<string, any> = {}; let rolled = false;
    const fail = (n: string) => { if (opts.failAt === n) throw opts.error; };
    const row = (d: any) => ({ id: "p1", supplierId: "sA", name: "Sut", unit: "L", availableToday: 1, dailyCapacity: 2, pricePerUnit: 100n, ...d });
    const tx = {
      product: {
        async create(a: any) { ops.push("product.create"); seen.create = a; fail("product"); return row(a.data); },
        async update(a: any) { ops.push("product.update"); seen.update = a; fail("product"); return row(a.data); },
        async delete(a: any) { ops.push("product.delete"); seen.delete = a; fail("product"); return row({ id: a.where.id }); },
      },
      auditLog: { async create(a: any) { ops.push("audit.create"); seen.audit = a; fail("audit"); return {}; } },
    };
    const prisma = { async $transaction(fn: (t: unknown) => Promise<unknown>) { try { return await fn(tx); } catch (e) { rolled = true; throw e; } } };
    return { repo: createPrismaRepositories(prisma as never).products, ops, seen, rolled: () => rolled };
  };
  const audit = (p: { id: string }) => ({ actorId: "uA", actorName: "Ali", actorRole: "supplier", action: "x", objectType: "product", objectId: p.id, description: "d" });
  const NEW = { supplierId: "sA", name: "Sut", unit: "L" as const, availableToday: 1, dailyCapacity: 2, pricePerUnit: 12000 };

  await t("prisma create: narx BigInt, tranzaksiyada mahsulot -> audit", async () => {
    const f = fakePrisma(); const p = await f.repo.create(NEW, audit);
    assert.deepEqual(f.ops, ["product.create", "audit.create"]);
    assert.equal(f.seen.create.data.pricePerUnit, 12000n); assert.equal(f.seen.create.data.supplierId, "sA");
    assert.equal(p.id, "p1"); assert.equal(f.seen.audit.data.objectId, "p1"); assert.equal(f.seen.audit.data.ts, undefined);
  });
  await t("prisma create: P2002 -> 409; boshqa xato o'zgarishsiz", async () => {
    const dup = fakePrisma({ failAt: "product", error: Object.assign(new Error("u"), { code: "P2002" }) });
    assert.equal(await errOf(() => dup.repo.create(NEW, audit)), "CONFLICT:409");
    const other = fakePrisma({ failAt: "product", error: new Error("connection lost") });
    await assert.rejects(() => other.repo.create(NEW, audit), /connection lost/);
  });
  await t("prisma create: audit xatosi -> tranzaksiya bekor (mahsulot ham saqlanmaydi)", async () => {
    const f = fakePrisma({ failAt: "audit", error: new Error("audit down") });
    await assert.rejects(() => f.repo.create(NEW, audit), /audit down/); assert.ok(f.rolled());
  });
  await t("prisma update: faqat berilgan maydonlar; narx BigInt; P2025 -> null", async () => {
    const f = fakePrisma(); await f.repo.update("p1", { pricePerUnit: 500 }, audit);
    assert.deepEqual(f.seen.update, { where: { id: "p1" }, data: { pricePerUnit: 500n } });
    await f.repo.update("p1", { availableToday: 0 }, audit); assert.deepEqual(f.seen.update.data, { availableToday: 0 });
    const gone = fakePrisma({ failAt: "product", error: Object.assign(new Error("nf"), { code: "P2025" }) });
    assert.equal(await gone.repo.update("p1", { dailyCapacity: 1 }, audit), null);
  });
  await t("prisma remove: o'chiradi + audit; P2025 -> null", async () => {
    const f = fakePrisma(); const p = await f.repo.remove("p9", audit);
    assert.equal(p!.id, "p9"); assert.deepEqual(f.ops, ["product.delete", "audit.create"]);
    const gone = fakePrisma({ failAt: "product", error: Object.assign(new Error("nf"), { code: "P2025" }) });
    assert.equal(await gone.repo.remove("p9", audit), null);
  });

  console.log(`products: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
