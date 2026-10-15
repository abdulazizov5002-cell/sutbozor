import assert from "node:assert/strict";
import type { Contract, Order } from "../src/domain/entities";
import { createPrismaRepositories } from "../src/repositories/prisma";
import { openDisputeBody, updateDisputeStatusBody } from "../src/schemas/dispute.schemas";
import { createDisputeService } from "../src/services/dispute.service";
import type { AuthUser } from "../src/types/fastify";
import type { AppError } from "../src/utils/errors";
import { dsp, fakeDisputeRepo } from "./helpers/fakeDisputeRepo";
import { fakePaymentRepo, pay } from "./helpers/fakePaymentRepo";

let pass = 0, fail = 0;
const t = async (name: string, fn: () => unknown | Promise<unknown>) => {
  try { await fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, (e as Error).message); }
};
const errOf = async (fn: () => Promise<unknown>) => {
  try { await fn(); return "ok"; } catch (e) { const a = e as AppError; return `${a.code ?? a.message}:${a.statusCode ?? ""}`; }
};

const supA: AuthUser = { id: "uA", name: "Ali", role: "supplier", status: "ACTIVE", supplierId: "sA", businessId: null };
const supB: AuthUser = { id: "uB", role: "supplier", status: "ACTIVE", supplierId: "sB", businessId: null };
const supX: AuthUser = { id: "uX", role: "supplier", status: "ACTIVE", supplierId: "sX", businessId: null };
const biz: AuthUser = { id: "uC", name: "Kafe", role: "business", status: "ACTIVE", businessId: "bC", supplierId: null };
const biz2: AuthUser = { id: "uE", role: "business", status: "ACTIVE", businessId: "bE", supplierId: null };
const adm: AuthUser = { id: "uD", name: "Admin", role: "admin", status: "ACTIVE", businessId: null, supplierId: null };
const O1 = "00000000-0000-4000-8000-0000000000c1"; // ikki supplierli
const O2 = "00000000-0000-4000-8000-0000000000c2"; // bitta supplierli
const O3 = "00000000-0000-4000-8000-0000000000c3"; // boshqa buyurtma
const P1 = "00000000-0000-4000-8000-0000000000a1";
const P3 = "00000000-0000-4000-8000-0000000000a3";
const C1 = "00000000-0000-4000-8000-0000000000b1";
const D1 = "00000000-0000-4000-8000-0000000000d1";

const item = (supplierId: string, orderId: string) => ({
  id: `i-${supplierId}`, orderId, supplierId, quantityPerDay: 5, pricePerUnit: 12000, status: "ACTIVE" as const, deliveryStatus: "SCHEDULED" as const,
  daysDelivered: 0, lastDeliveredOn: null, contractId: null,
});
const order = (id: string, publicId: string, suppliers: string[]): Order => ({
  id, publicId, businessId: "bC", product: "Sut", quantityPerDay: 5, days: 30, deliveryMode: "supplier", paymentSchedule: "WEEKLY", prepTime: "",
  createdAt: "2026-10-15T00:00:00.000Z", updatedAt: "2026-10-15T00:00:00.000Z", items: suppliers.map((s) => item(s, id)),
});
const orders = [order(O1, "SB-1001", ["sA", "sB"]), order(O2, "SB-1002", ["sA"]), order(O3, "SB-1003", ["sB"])];
const orderRepo = { async findById(id: string) { return orders.find((o) => o.id === id) ?? null; } } as never;
const contract = (id: string, orderId: string, supplierId: string): Contract => ({
  id, publicId: "CT-1001", orderId, businessId: "bC", supplierId, product: "Sut", quantityPerDay: 5, unit: "L", pricePerUnit: 12000, days: 30,
  startDate: "2026-10-15", endDate: "2026-11-13", paymentSchedule: "WEEKLY", deliveryMode: "supplier", status: "ACTIVE", createdAt: "2026-10-15T00:00:00.000Z",
});
const contractRepo = { async findById(id: string) { return id === C1 ? contract(C1, O1, "sB") : null; } } as never;

const world = (seed = [] as ReturnType<typeof dsp>[]) => {
  const dr = fakeDisputeRepo(seed);
  const pr = fakePaymentRepo([pay(P1, { orderId: O1, supplierId: "sA" }), pay(P3, { orderId: O3, supplierId: "sB" })]);
  const svc = createDisputeService({ disputes: dr.repo, orders: orderRepo, payments: pr.repo, contracts: contractRepo });
  return { dr, svc };
};
// Test supplier id'lari UUID emas: supplierId sxemadan o'tkazilmaydi, parse'dan keyin qo'shiladi.
const open = (over: Record<string, unknown> = {}) => {
  const { supplierId, ...rest } = over;
  return { ...openDisputeBody.parse({ orderId: O1, reason: "PAYMENT", description: "Pul tushmadi", ...rest }), ...(supplierId ? { supplierId: String(supplierId) } : {}) };
};

(async () => {
  // ---------- Sxema ----------
  await t("sxema: ochish to'g'ri; ortiqcha maydon (status/openedBy) rad etiladi", () => {
    assert.ok(openDisputeBody.safeParse({ orderId: O1, reason: "PAYMENT", description: "Pul tushmadi" }).success);
    assert.ok(!openDisputeBody.safeParse({ orderId: O1, reason: "PAYMENT", description: "Pul tushmadi", status: "RESOLVED" }).success);
    assert.ok(!openDisputeBody.safeParse({ orderId: O1, reason: "PAYMENT", description: "Pul tushmadi", openedBy: "admin" }).success);
    assert.ok(!openDisputeBody.safeParse({ orderId: O1, reason: "PAYMENT", description: "yo'q" }).success);
    assert.ok(!openDisputeBody.safeParse({ orderId: "x", reason: "PAYMENT", description: "Pul tushmadi" }).success);
  });
  await t("sxema: hal qilish/rad etishda yechim majburiy, ko'rib chiqishda emas", () => {
    assert.ok(!updateDisputeStatusBody.safeParse({ status: "RESOLVED" }).success);
    assert.ok(!updateDisputeStatusBody.safeParse({ status: "REJECTED", resolution: "x" }).success);
    assert.ok(updateDisputeStatusBody.safeParse({ status: "RESOLVED", resolution: "Pul qaytariladi" }).success);
    assert.ok(updateDisputeStatusBody.safeParse({ status: "UNDER_REVIEW" }).success);
    assert.ok(!updateDisputeStatusBody.safeParse({ status: "OPEN" }).success);
  });

  // ---------- Ochish ----------
  await t("biznes to'lov bo'yicha ochadi: supplier to'lovdan, bildirishnoma supplier + adminlarga", async () => {
    const w = world(); const d = await w.svc.open(biz, open({ paymentId: P1 }));
    assert.equal(d.supplierId, "sA"); assert.equal(d.businessId, "bC"); assert.equal(d.openedBy, "business"); assert.equal(d.openedById, "uC"); assert.equal(d.paymentId, P1);
    assert.deepEqual(w.dr.notes[0]!.recipients, [{ supplierId: "sA" }, { admins: true }]); assert.equal(w.dr.notes[0]!.content.type, "dispute.open");
    assert.equal(w.dr.audits[0]!.action, "dispute.opened");
  });
  await t("supplier ochadi: o'zi supplier, qarshi tomon biznes + adminlar", async () => {
    const w = world(); const d = await w.svc.open(supA, open());
    assert.equal(d.supplierId, "sA"); assert.equal(d.businessId, "bC"); assert.equal(d.openedBy, "supplier");
    assert.deepEqual(w.dr.notes[0]!.recipients, [{ businessId: "bC" }, { admins: true }]);
  });
  await t("biznes: bitta supplierli buyurtmada supplierId shart emas; ikkitasida shart (400); noto'g'ri supplier 404", async () => {
    const w = world();
    assert.equal((await w.svc.open(biz, open({ orderId: O2 }))).supplierId, "sA");
    assert.equal(await errOf(() => w.svc.open(biz, open())), "BAD_REQUEST:400");
    assert.equal((await w.svc.open(biz, open({ supplierId: "sB" }))).supplierId, "sB");
    assert.equal(await errOf(() => w.svc.open(biz, open({ supplierId: "sX" }))), "NOT_FOUND:404");
  });
  await t("shartnoma bo'yicha: supplier shartnomadan olinadi; to'lov bilan mos kelmasa 400", async () => {
    const w = world();
    assert.equal((await w.svc.open(biz, open({ contractId: C1 }))).supplierId, "sB");
    assert.equal(await errOf(() => w.svc.open(biz, open({ paymentId: P1, contractId: C1 }))), "BAD_REQUEST:400");
  });
  await t("egalik: begona biznes/supplier, boshqa buyurtmaning to'lovi, yo'q buyurtma -> 404", async () => {
    const w = world();
    assert.equal(await errOf(() => w.svc.open(biz2, open())), "NOT_FOUND:404");
    assert.equal(await errOf(() => w.svc.open(supX, open())), "NOT_FOUND:404");
    assert.equal(await errOf(() => w.svc.open(supB, open({ orderId: O2 }))), "NOT_FOUND:404");
    assert.equal(await errOf(() => w.svc.open(biz, open({ paymentId: P3 }))), "NOT_FOUND:404");
    assert.equal(await errOf(() => w.svc.open(supA, open({ paymentId: P3 }))), "NOT_FOUND:404");
    assert.equal(await errOf(() => w.svc.open(biz, open({ orderId: "00000000-0000-4000-8000-00000000dead" }))), "NOT_FOUND:404");
    assert.equal(w.dr.created.length, 0);
  });
  await t("huquq: admin ocha olmaydi (403), faol bo'lmagan 403", async () => {
    const w = world();
    assert.equal(await errOf(() => w.svc.open(adm, open())), "FORBIDDEN:403");
    assert.equal(await errOf(() => w.svc.open({ ...biz, status: "BLOCKED" } as AuthUser, open())), "FORBIDDEN:403");
    assert.equal(w.dr.created.length, 0);
  });
  await t("takror: shu to'lov bo'yicha ochiq nizo bor -> 409; hal bo'lgach yangisi mumkin", async () => {
    const w = world(); await w.svc.open(biz, open({ paymentId: P1 }));
    assert.equal(await errOf(() => w.svc.open(supA, open({ paymentId: P1 }))), "CONFLICT:409");
    w.dr.items[0]!.status = "RESOLVED";
    assert.equal(await errOf(() => w.svc.open(supA, open({ paymentId: P1 }))), "ok");
  });

  // ---------- Admin holat o'zgartirishi ----------
  await t("admin: OPEN -> UNDER_REVIEW -> RESOLVED (yechim, resolvedBy), ikkala tomonga bildirishnoma", async () => {
    const w = world([dsp(D1)]); const svc = w.svc;
    assert.equal((await svc.update(adm, D1, { status: "UNDER_REVIEW", resolution: "" })).status, "UNDER_REVIEW");
    const r = await svc.update(adm, D1, { status: "RESOLVED", resolution: "Pul qaytariladi" });
    assert.equal(r.status, "RESOLVED"); assert.equal(r.resolution, "Pul qaytariladi"); assert.equal(r.resolvedBy, "uD"); assert.ok(r.resolvedAt);
    assert.deepEqual(w.dr.notes[1]!.recipients, [{ businessId: "bC" }, { supplierId: "sA" }]); assert.equal(w.dr.notes[1]!.content.type, "dispute.resolved");
    assert.equal(w.dr.notes[0]!.content.type, "dispute.open");
    assert.equal((await svc.update(adm, D1, { status: "CLOSED", resolution: "" })).status, "CLOSED");
  });
  await t("admin: noto'g'ri o'tish -> 409 (OPEN -> CLOSED, RESOLVED -> UNDER_REVIEW), repo chaqirilmaydi", async () => {
    const w = world([dsp(D1)]);
    assert.equal(await errOf(() => w.svc.update(adm, D1, { status: "CLOSED", resolution: "" })), "CONFLICT:409");
    w.dr.items[0]!.status = "RESOLVED";
    assert.equal(await errOf(() => w.svc.update(adm, D1, { status: "UNDER_REVIEW", resolution: "" })), "CONFLICT:409");
    assert.equal(await errOf(() => w.svc.update(adm, D1, { status: "RESOLVED", resolution: "Yana" })), "CONFLICT:409");
    assert.equal(w.dr.transitions.length, 0);
  });
  await t("admin bo'lmaganlar 403, yo'q nizo 404, poyga (repo null) 409", async () => {
    const w = world([dsp(D1)]);
    for (const u of [biz, supA]) assert.equal(await errOf(() => w.svc.update(u, D1, { status: "UNDER_REVIEW", resolution: "" })), "FORBIDDEN:403");
    assert.equal(await errOf(() => w.svc.update(adm, "00000000-0000-4000-8000-00000000dead", { status: "UNDER_REVIEW", resolution: "" })), "NOT_FOUND:404");
    const racy = createDisputeService({ disputes: { ...w.dr.repo, transition: async () => null }, orders: orderRepo, payments: fakePaymentRepo().repo, contracts: contractRepo });
    assert.equal(await errOf(() => racy.update(adm, D1, { status: "UNDER_REVIEW", resolution: "" })), "CONFLICT:409");
  });
  await t("o'qish: biznes/supplier faqat o'zinikini, admin hammasini; begona 404", async () => {
    const w = world([dsp(D1), dsp("00000000-0000-4000-8000-0000000000d2", { businessId: "bE", supplierId: "sB" })]);
    assert.equal((await w.svc.list(biz, { page: 1, limit: 20 })).total, 1);
    assert.equal((await w.svc.list(supB, { page: 1, limit: 20 })).total, 1);
    assert.equal((await w.svc.list(adm, { page: 1, limit: 20 })).total, 2);
    assert.equal(await errOf(() => w.svc.getById(biz2, D1)), "NOT_FOUND:404");
    assert.equal((await w.svc.getById(supA, D1)).id, D1);
  });

  // ---------- Prisma qatlami ----------
  const row = (over: Record<string, unknown> = {}) => ({
    id: D1, publicId: "DS-1001", orderId: O1, paymentId: null, contractId: null, openedBy: "business", openedById: "uC", businessId: "bC", supplierId: "sA",
    reason: "PAYMENT", description: "Pul tushmadi", status: "OPEN", createdAt: new Date(0), resolvedAt: null, resolution: null, resolvedBy: null, ...over,
  });
  const fakePrisma = (opts: { open?: boolean; changed?: number; users?: Record<string, string[]>; admins?: string[]; failWith?: Error } = {}) => {
    const seen: Record<string, any> = { userWheres: [] }; const ops: string[] = [];
    const tx = {
      dispute: {
        async findFirst(a: any) { ops.push("dispute.findFirst"); seen.dup = a; return opts.open ? { id: "x" } : null; },
        async create(a: any) { ops.push("dispute.create"); seen.create = a; if (opts.failWith) throw opts.failWith; return row({ ...a.data }); },
        async updateMany(a: any) { ops.push("dispute.updateMany"); seen.update = a; return { count: opts.changed ?? 1 }; },
        async findUnique() { ops.push("dispute.findUnique"); return row({ status: "RESOLVED", resolution: "ok", resolvedAt: new Date(0) }); },
      },
      sequence: { async upsert() { ops.push("sequence.upsert"); return { value: 1003 }; } },
      auditLog: { async create(a: any) { ops.push("audit.create"); seen.audit = a; return {}; } },
      user: {
        async findMany(a: any) {
          ops.push("user.findMany"); seen.userWheres.push(a.where);
          const ids = a.where.role === "admin" ? (opts.admins ?? []) : (opts.users?.[a.where.businessId ?? a.where.supplierId] ?? []);
          return ids.map((id) => ({ id }));
        },
      },
      notification: { async createMany(a: any) { ops.push("notification.createMany"); (seen.notes ??= []).push(a); return {}; } },
    };
    const prisma = { async $transaction(fn: (t: unknown) => Promise<unknown>) { return fn(tx); } };
    return { repo: createPrismaRepositories(prisma as never).disputes, seen, ops };
  };
  const input = { orderId: O1, paymentId: P1, contractId: null, openedBy: "business" as const, openedById: "uC", businessId: "bC", supplierId: "sA", reason: "PAYMENT" as const, description: "Pul tushmadi" };
  const hooks = {
    audit: (x: { id: string }) => ({ actorId: "u", actorName: "n", actorRole: "business" as const, action: "dispute.opened", objectType: "dispute", objectId: x.id, description: "d" }),
    recipients: [{ supplierId: "sA" }, { admins: true }], notify: () => ({ type: "dispute.open" as const, title: "T", message: "M" }),
  };
  await t("prisma create: takror tekshiruvi, DS-<n> raqami, audit, supplier va adminlarga bildirishnoma (hammasi bitta tranzaksiyada)", async () => {
    const f = fakePrisma({ users: { sA: ["u1", "u2"] }, admins: ["uD"] });
    const d = await f.repo.create(input, hooks);
    assert.equal(d.publicId, "DS-1003"); assert.equal(f.seen.create.data.publicId, "DS-1003"); assert.equal(f.seen.create.data.status, undefined);
    assert.deepEqual(f.ops, ["dispute.findFirst", "sequence.upsert", "dispute.create", "audit.create", "user.findMany", "notification.createMany", "user.findMany", "notification.createMany"]);
    assert.deepEqual(f.seen.dup.where, { orderId: O1, supplierId: "sA", paymentId: P1, status: { in: ["OPEN", "UNDER_REVIEW"] } });
    assert.deepEqual(f.seen.userWheres, [{ status: "ACTIVE", supplierId: "sA" }, { status: "ACTIVE", role: "admin" }]);
    assert.deepEqual(f.seen.notes[1].data.map((x: any) => x.userId), ["uD"]);
  });
  await t("prisma create: ochiq nizo bor -> 409 va hech narsa yozilmaydi; P2002 raqam to'qnashuvi qayta uriniladi; boshqa xato o'zgarishsiz", async () => {
    const dup = fakePrisma({ open: true }); assert.equal(await errOf(() => dup.repo.create(input, hooks)), "CONFLICT:409"); assert.deepEqual(dup.ops, ["dispute.findFirst"]);
    const race = fakePrisma({ failWith: Object.assign(new Error("u"), { code: "P2002" }) }); assert.equal(await errOf(() => race.repo.create(input, hooks)), "CONFLICT:409");
    assert.equal(race.ops.filter((o) => o === "dispute.create").length, 3);
    const other = fakePrisma({ failWith: new Error("connection lost") });
    await assert.rejects(() => other.repo.create(input, hooks), /connection lost/);
  });
  await t("prisma transition: holat sharti, RESOLVED da resolvedAt+resolution+resolvedBy; UNDER_REVIEW da resolvedAt yo'q; count 0 -> null", async () => {
    const f = fakePrisma({ users: { bC: ["u9"], sA: ["u1"] } });
    const x = await f.repo.transition({ id: D1, from: ["OPEN", "UNDER_REVIEW"], to: "RESOLVED", resolution: "ok", resolvedBy: "uD" }, { ...hooks, recipients: [{ businessId: "bC" }, { supplierId: "sA" }] });
    assert.equal(x!.status, "RESOLVED");
    assert.deepEqual(f.seen.update.where, { id: D1, status: { in: ["OPEN", "UNDER_REVIEW"] } });
    assert.equal(f.seen.update.data.status, "RESOLVED"); assert.equal(f.seen.update.data.resolution, "ok"); assert.equal(f.seen.update.data.resolvedBy, "uD"); assert.ok(f.seen.update.data.resolvedAt instanceof Date);
    assert.equal(f.seen.notes.length, 2);
    const g = fakePrisma(); await g.repo.transition({ id: D1, from: ["OPEN"], to: "UNDER_REVIEW" }, hooks);
    assert.deepEqual(g.seen.update.data, { status: "UNDER_REVIEW" });
    const none = fakePrisma({ changed: 0 }); assert.equal(await none.repo.transition({ id: D1, from: ["OPEN"], to: "UNDER_REVIEW" }, hooks), null); assert.deepEqual(none.ops, ["dispute.updateMany"]);
  });

  console.log(`disputes: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
