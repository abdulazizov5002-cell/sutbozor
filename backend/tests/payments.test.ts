import assert from "node:assert/strict";
import { createPrismaRepositories } from "../src/repositories/prisma";
import { paymentActionBody } from "../src/schemas/payment.schemas";
import { createPaymentService } from "../src/services/payment.service";
import type { AuthUser } from "../src/types/fastify";
import type { AppError } from "../src/utils/errors";
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
const biz: AuthUser = { id: "uC", name: "Kafe", role: "business", status: "ACTIVE", businessId: "bC", supplierId: null };
const biz2: AuthUser = { id: "uE", role: "business", status: "ACTIVE", businessId: "bE", supplierId: null };
const adm: AuthUser = { id: "uD", role: "admin", status: "ACTIVE", businessId: null, supplierId: null };
const P1 = "00000000-0000-4000-8000-0000000000a1";
const P2 = "00000000-0000-4000-8000-0000000000a2";
const world = (over: Parameters<typeof pay>[1] = {}) => fakePaymentRepo([pay(P1, over), pay(P2, { transactionId: "TX-BAND", status: "PAID" })]);
const submit = (over: Record<string, unknown> = {}) => ({ action: "submit", method: "Bank o'tkazmasi", transactionId: "TX-1001", paidOn: "2026-10-14", ...over });

(async () => {
  // ---------- Sxema ----------
  await t("sxema: submit to'g'ri; note standart bo'sh", () => {
    const r = paymentActionBody.safeParse(submit()); assert.ok(r.success); assert.equal((r.data as { note: string }).note, "");
  });
  await t("sxema: summa/status yuborish rad etiladi (strict); noto'g'ri usul, qisqa tranzaksiya, kelajak sana rad", () => {
    for (const k of ["amount", "status", "supplierId", "paidAt"]) assert.equal(paymentActionBody.safeParse(submit({ [k]: 1 })).success, false, k);
    assert.equal(paymentActionBody.safeParse(submit({ method: "Click" })).success, false);
    assert.equal(paymentActionBody.safeParse(submit({ transactionId: "ab" })).success, false);
    assert.equal(paymentActionBody.safeParse(submit({ paidOn: "2999-01-01" })).success, false);
    assert.equal(paymentActionBody.safeParse(submit({ paidOn: "2026-02-30" })).success, false);
  });
  await t("sxema: confirm/reject; reject sababsiz rad; noma'lum harakat rad", () => {
    assert.ok(paymentActionBody.safeParse({ action: "confirm" }).success);
    assert.equal(paymentActionBody.safeParse({ action: "confirm", reason: "x" }).success, false);
    assert.equal(paymentActionBody.safeParse({ action: "reject" }).success, false);
    assert.equal(paymentActionBody.safeParse({ action: "reject", reason: "ab" }).success, false);
    assert.ok(paymentActionBody.safeParse({ action: "reject", reason: "Pul kelmadi" }).success);
    assert.equal(paymentActionBody.safeParse({ action: "refund" }).success, false);
  });

  // ---------- Servis ----------
  await t("submit: biznes PENDING -> PAYMENT_SUBMITTED; usul/tranzaksiya/sana yoziladi; supplierga bildirishnoma + audit", async () => {
    const w = world(); const svc = createPaymentService(w.repo);
    const p = await svc.act(biz, P1, paymentActionBody.parse(submit({ note: "Ertalab o'tkazdim" })));
    assert.equal(p.status, "PAYMENT_SUBMITTED"); assert.equal(p.transactionId, "TX-1001"); assert.equal(p.paidAt, "2026-10-14"); assert.equal(p.paymentMethod, "Bank o'tkazmasi");
    assert.equal(p.note, "Ertalab o'tkazdim"); assert.equal(p.amount, 180000); // summa o'zgarmagan
    assert.deepEqual(w.notes[0]!.recipient, { supplierId: "sA" }); assert.equal(w.notes[0]!.content.type, "payment.submitted");
    assert.equal(w.audits[0]!.action, "payment.submitted"); assert.equal(w.audits[0]!.actorRole, "business");
    assert.deepEqual((w.transitions[0] as { businessId: string }).businessId, "bC");
  });
  await t("submit: OVERDUE va DISPUTED holatdan ham mumkin; PAID/SUBMITTED/CANCELLED dan 409", async () => {
    for (const st of ["OVERDUE", "DISPUTED"] as const) {
      const w = world({ status: st }); assert.equal((await createPaymentService(w.repo).act(biz, P1, paymentActionBody.parse(submit()))).status, "PAYMENT_SUBMITTED", st);
    }
    for (const st of ["PAID", "PAYMENT_SUBMITTED", "CANCELLED"] as const) {
      const w = world({ status: st }); assert.equal(await errOf(() => createPaymentService(w.repo).act(biz, P1, paymentActionBody.parse(submit()))), "CONFLICT:409", st);
    }
  });
  await t("submit: tranzaksiya raqami boshqa to'lovda band -> 409, holat o'zgarmaydi", async () => {
    const w = world(); const svc = createPaymentService(w.repo);
    assert.equal(await errOf(() => svc.act(biz, P1, paymentActionBody.parse(submit({ transactionId: "TX-BAND" })))), "CONFLICT:409");
    assert.equal(w.items[0]!.status, "PENDING");
  });
  await t("confirm: supplier PAYMENT_SUBMITTED -> PAID; biznesga bildirishnoma; sabab/audit", async () => {
    const w = world({ status: "PAYMENT_SUBMITTED" }); const p = await createPaymentService(w.repo).act(supA, P1, { action: "confirm" });
    assert.equal(p.status, "PAID"); assert.deepEqual(w.notes[0]!.recipient, { businessId: "bC" }); assert.equal(w.notes[0]!.content.type, "payment.confirmed");
    assert.equal(w.audits[0]!.action, "payment.paid"); assert.equal((w.transitions[0] as { supplierId: string }).supplierId, "sA");
  });
  await t("confirm/reject: faqat yuborilgan to'lovga (PENDING, PAID dan 409)", async () => {
    for (const st of ["PENDING", "OVERDUE", "PAID", "DISPUTED"] as const) {
      const w = world({ status: st }); const svc = createPaymentService(w.repo);
      assert.equal(await errOf(() => svc.act(supA, P1, { action: "confirm" })), "CONFLICT:409", st);
      assert.equal(await errOf(() => svc.act(supA, P1, { action: "reject", reason: "sababi" })), "CONFLICT:409", st);
    }
  });
  await t("reject: DISPUTED, sabab izohga yoziladi, biznesga bildirishnoma; keyin biznes qayta yubora oladi", async () => {
    const w = world({ status: "PAYMENT_SUBMITTED" }); const svc = createPaymentService(w.repo);
    const p = await svc.act(supA, P1, { action: "reject", reason: "Pul kelmadi" });
    assert.equal(p.status, "DISPUTED"); assert.equal(p.note, "Pul kelmadi"); assert.equal(w.notes[0]!.content.type, "payment.rejected"); assert.match(w.notes[0]!.content.message, /Pul kelmadi/);
    assert.equal((await svc.act(biz, P1, paymentActionBody.parse(submit({ transactionId: "TX-2" })))).status, "PAYMENT_SUBMITTED");
  });
  await t("huquq: supplier submit, biznes confirm/reject, admin hammasi -> 403", async () => {
    const w = world({ status: "PAYMENT_SUBMITTED" }); const svc = createPaymentService(w.repo);
    assert.equal(await errOf(() => svc.act(supA, P1, paymentActionBody.parse(submit()))), "FORBIDDEN:403");
    assert.equal(await errOf(() => svc.act(biz, P1, { action: "confirm" })), "FORBIDDEN:403");
    assert.equal(await errOf(() => svc.act(biz, P1, { action: "reject", reason: "sababi" })), "FORBIDDEN:403");
    for (const a of [paymentActionBody.parse(submit()), { action: "confirm" as const }]) assert.equal(await errOf(() => svc.act(adm, P1, a)), "FORBIDDEN:403");
    assert.equal(w.items[0]!.status, "PAYMENT_SUBMITTED"); assert.equal(w.transitions.length, 0);
  });
  await t("faol bo'lmagan hisob -> 403", async () => {
    const w = world(); assert.equal(await errOf(() => createPaymentService(w.repo).act({ ...biz, status: "BLOCKED" } as AuthUser, P1, paymentActionBody.parse(submit()))), "FORBIDDEN:403");
  });
  await t("egalik: begona biznes/supplier va yo'q id -> 404 (IDOR)", async () => {
    const w = world({ status: "PAYMENT_SUBMITTED" }); const svc = createPaymentService(w.repo);
    assert.equal(await errOf(() => svc.act(biz2, P1, paymentActionBody.parse(submit()))), "NOT_FOUND:404");
    assert.equal(await errOf(() => svc.act(supB, P1, { action: "confirm" })), "NOT_FOUND:404");
    assert.equal(await errOf(() => svc.act(biz, "00000000-0000-4000-8000-00000000dead", paymentActionBody.parse(submit()))), "NOT_FOUND:404");
    assert.equal(w.items[0]!.status, "PAYMENT_SUBMITTED"); assert.equal(w.transitions.length, 0);
  });
  await t("poyga: repo null qaytarsa -> 409", async () => {
    const w = world(); const svc = createPaymentService({ ...w.repo, transition: async () => null });
    assert.equal(await errOf(() => svc.act(biz, P1, paymentActionBody.parse(submit()))), "CONFLICT:409");
  });
  await t("o'qish: muddati o'tgan PENDING -> OVERDUE (lazy), egalik bo'yicha ko'rinadi; markOverdue xatosi o'qishni to'xtatmaydi", async () => {
    const w = fakePaymentRepo([pay(P1, { dueDate: "2000-01-01" }), pay(P2, { dueDate: "2999-01-01" })]); const svc = createPaymentService(w.repo);
    const l = await svc.list(biz, { page: 1, limit: 20 }); assert.deepEqual(l.items.map((x) => x.status), ["OVERDUE", "PENDING"]); assert.equal(w.overdueCalls.length, 1);
    assert.equal((await svc.getById(supA, P1)).status, "OVERDUE");
    assert.equal(await errOf(() => svc.getById(biz2, P1)), "NOT_FOUND:404");
    const broken = createPaymentService({ ...w.repo, markOverdue: async () => { throw new Error("db"); } });
    assert.equal((await broken.list(biz, { page: 1, limit: 20 })).total, 2);
  });

  // ---------- Prisma qatlami ----------
  const fakePrisma = (opts: { changed?: number; failWith?: Error; users?: Record<string, string[]> } = {}) => {
    const seen: Record<string, any> = {}; const ops: string[] = [];
    const tx = {
      payment: {
        async updateMany(a: any) { ops.push("payment.updateMany"); seen.update = a; if (opts.failWith) throw opts.failWith; return { count: opts.changed ?? 1 }; },
        async findUnique(a: any) { ops.push("payment.findUnique"); return { id: a.where.id, publicId: "PAY-1001", orderId: "o1", contractId: "c1", businessId: "bC", supplierId: "sA", amount: 180000n, currency: "UZS", paymentPeriod: "WEEKLY", periodNo: 1, fromDay: 1, toDay: 7, days: 7, dueDate: new Date(0), paidAt: null, paymentMethod: null, transactionId: null, status: "PAID", note: "", platformCommission: 0n, grossAmount: 180000n, supplierAmount: 180000n, createdAt: new Date(0), updatedAt: new Date(0) }; },
      },
      auditLog: { async create(a: any) { ops.push("audit.create"); seen.audit = a; return {}; } },
      user: { async findMany(a: any) { ops.push("user.findMany"); seen.userWhere = a.where; return (opts.users?.[a.where.businessId ?? a.where.supplierId] ?? []).map((id) => ({ id })); } },
      notification: { async createMany(a: any) { ops.push("notification.createMany"); seen.notes = a; return {}; } },
    };
    const prisma = { async $transaction(fn: (t: unknown) => Promise<unknown>) { return fn(tx); } };
    return { repo: createPrismaRepositories(prisma as never).payments, seen, ops };
  };
  const hooks = {
    audit: (p: { id: string }) => ({ actorId: "u", actorName: "n", actorRole: "supplier", action: "payment.paid", objectType: "payment", objectId: p.id, description: "d" }),
    recipient: { businessId: "bC" }, notify: () => ({ type: "payment.confirmed" as const, title: "T", message: "M" }),
  };
  await t("prisma transition: holat sharti (from), egalik, faqat berilgan maydonlar, audit + bildirishnoma", async () => {
    const f = fakePrisma({ users: { bC: ["u9"] } });
    const p = await f.repo.transition({ id: P1, from: ["PAYMENT_SUBMITTED"], to: "PAID", supplierId: "sA" }, hooks);
    assert.equal(p!.status, "PAID"); assert.equal(p!.amount, 180000);
    assert.deepEqual(f.seen.update, { where: { id: P1, status: { in: ["PAYMENT_SUBMITTED"] }, supplierId: "sA" }, data: { status: "PAID" } });
    assert.deepEqual(f.ops, ["payment.updateMany", "payment.findUnique", "audit.create", "user.findMany", "notification.createMany"]);
    assert.deepEqual(f.seen.userWhere, { status: "ACTIVE", businessId: "bC" });
  });
  await t("prisma submit: usul, tranzaksiya, sana (DATE), izoh yoziladi; biznes sharti", async () => {
    const f = fakePrisma();
    await f.repo.transition({ id: P1, from: ["PENDING", "OVERDUE", "DISPUTED"], to: "PAYMENT_SUBMITTED", businessId: "bC", set: { paymentMethod: "Naqd", transactionId: "TX-9", paidAt: "2026-10-14", note: "n" } }, hooks);
    assert.deepEqual(f.seen.update.where, { id: P1, status: { in: ["PENDING", "OVERDUE", "DISPUTED"] }, businessId: "bC" });
    assert.equal(f.seen.update.data.paymentMethod, "Naqd"); assert.equal(f.seen.update.data.transactionId, "TX-9"); assert.equal(f.seen.update.data.paidAt.toISOString(), "2026-10-14T00:00:00.000Z"); assert.equal(f.seen.update.data.note, "n");
  });
  await t("prisma: count 0 -> null (hech narsa yozilmaydi); P2002 -> 409; boshqa xato o'zgarishsiz", async () => {
    const none = fakePrisma({ changed: 0 }); assert.equal(await none.repo.transition({ id: P1, from: ["PAYMENT_SUBMITTED"], to: "PAID" }, hooks), null); assert.deepEqual(none.ops, ["payment.updateMany"]);
    const dup = fakePrisma({ failWith: Object.assign(new Error("u"), { code: "P2002" }) });
    assert.equal(await errOf(() => dup.repo.transition({ id: P1, from: ["PENDING"], to: "PAYMENT_SUBMITTED", set: { transactionId: "X" } }, hooks)), "CONFLICT:409");
    const other = fakePrisma({ failWith: new Error("connection lost") });
    await assert.rejects(() => other.repo.transition({ id: P1, from: ["PENDING"], to: "PAID" }, hooks), /connection lost/);
  });

  console.log(`payments: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
