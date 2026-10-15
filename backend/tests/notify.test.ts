import assert from "node:assert/strict";
import { createTelegramDelivery } from "../src/notify/telegramDelivery";
import { createPrismaRepositories } from "../src/repositories/prisma";
import type { DeliveryBatch } from "../src/repositories/prisma/delivery";

let pass = 0, fail = 0;
const t = async (name: string, fn: () => unknown | Promise<unknown>) => {
  try { await fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, (e as Error).message); }
};
const tick = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const TOKEN = "123456789" + ":" + "SECRET_TOKEN_VALUE_abcdefghijk"; // sinov uchun soxta qiymat (skaner naqshiga tushmasligi uchun bo'lingan)

(async () => {
  // ---------- Telegram yuboruvchi ----------
  const mkFetch = (status = 200) => {
    const calls: { url: string; body: any }[] = [];
    const fetchFn = (async (url: string, init: any) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: status >= 200 && status < 300, status }; }) as unknown as typeof fetch;
    return { calls, fetchFn };
  };
  await t("yuboradi: chat id lar takrorsiz, oddiy matn (parse_mode yo'q), sarlavha + xabar", async () => {
    const f = mkFetch(); const d = createTelegramDelivery({ botToken: TOKEN, fetchFn: f.fetchFn, lookupChatIds: async () => ["111", "222", "111"] });
    d.deliver([{ userIds: ["u1", "u2"], title: "Yangi buyurtma", message: "SB-1001 <b>x</b>" }]); await tick();
    assert.equal(f.calls.length, 2); assert.deepEqual(f.calls.map((c) => c.body.chat_id).sort(), ["111", "222"]);
    assert.equal(f.calls[0]!.body.text, "🔔 Yangi buyurtma\nSB-1001 <b>x</b>"); assert.ok(!("parse_mode" in f.calls[0]!.body));
    assert.equal(f.calls[0]!.url, `https://api.telegram.org/bot${TOKEN}/sendMessage`);
  });
  await t("bog'langan hisob yo'q -> so'rov ketmaydi; juda uzun matn kesiladi", async () => {
    const f = mkFetch(); createTelegramDelivery({ botToken: TOKEN, fetchFn: f.fetchFn, lookupChatIds: async () => [] }).deliver([{ userIds: ["u1"], title: "T", message: "M" }]); await tick();
    assert.equal(f.calls.length, 0);
    const g = mkFetch(); createTelegramDelivery({ botToken: TOKEN, fetchFn: g.fetchFn, lookupChatIds: async () => ["1"] }).deliver([{ userIds: ["u1"], title: "T", message: "x".repeat(9000) }]); await tick();
    assert.ok(g.calls[0]!.body.text.length <= 3900);
  });
  await t("xatolar tashlanmaydi; 403 jim; boshqa status va tarmoq xatosi log'ga, token log'ga chiqmaydi", async () => {
    const logs: unknown[] = [];
    const f403 = mkFetch(403); createTelegramDelivery({ botToken: TOKEN, fetchFn: f403.fetchFn, lookupChatIds: async () => ["1"], onError: (i) => logs.push(i) }).deliver([{ userIds: ["u"], title: "T", message: "M" }]); await tick();
    assert.equal(logs.length, 0);
    const f500 = mkFetch(500); createTelegramDelivery({ botToken: TOKEN, fetchFn: f500.fetchFn, lookupChatIds: async () => ["1"], onError: (i) => logs.push(i) }).deliver([{ userIds: ["u"], title: "T", message: "M" }]); await tick();
    const net = (async () => { throw new Error(`connect failed ${TOKEN}`); }) as unknown as typeof fetch;
    createTelegramDelivery({ botToken: TOKEN, fetchFn: net, lookupChatIds: async () => ["1"], onError: (i) => logs.push(i) }).deliver([{ userIds: ["u"], title: "T", message: "M" }]); await tick();
    createTelegramDelivery({ botToken: TOKEN, fetchFn: f500.fetchFn, lookupChatIds: async () => { throw new Error("db"); }, onError: (i) => logs.push(i) }).deliver([{ userIds: ["u"], title: "T", message: "M" }]); await tick();
    assert.deepEqual(logs, [{ stage: "send", status: 500 }, { stage: "send" }, { stage: "lookup" }]); assert.ok(!JSON.stringify(logs).includes("SECRET"));
  });

  // ---------- Commit'dan keyin yetkazish (outbox) ----------
  const fakePrisma = (opts: { failAt?: string } = {}) => {
    const tx = {
      payment: {
        async updateMany() { return { count: 1 }; },
        async findUnique(a: any) { return { id: a.where.id, publicId: "PAY-1001", orderId: "o1", contractId: "c1", businessId: "bC", supplierId: "sA", amount: 1n, currency: "UZS", paymentPeriod: "WEEKLY", periodNo: 1, fromDay: 1, toDay: 7, days: 7, dueDate: new Date(0), paidAt: null, paymentMethod: null, transactionId: null, status: "PAID", note: "", platformCommission: 0n, grossAmount: 1n, supplierAmount: 1n, createdAt: new Date(0), updatedAt: new Date(0) }; },
      },
      auditLog: { async create() { if (opts.failAt === "audit") throw new Error("audit down"); return {}; } },
      user: { async findMany() { return [{ id: "u1" }, { id: "u2" }]; } },
      notification: { async createMany() { return {}; } },
    };
    let committed = 0;
    const prisma = { async $transaction(fn: (t: unknown) => Promise<unknown>) { const r = await fn(tx); committed++; return r; }, other: "x" };
    return { prisma, committed: () => committed };
  };
  const hooks = {
    audit: (p: { id: string }) => ({ actorId: "u", actorName: "n", actorRole: "supplier" as const, action: "payment.paid", objectType: "payment", objectId: p.id, description: "d" }),
    recipient: { businessId: "bC" }, notify: () => ({ type: "payment.confirmed" as const, title: "To'lov tasdiqlandi", message: "PAY-1001" }),
  };
  await t("COMMIT'dan keyin bir marta yetkaziladi (foydalanuvchilar, sarlavha, matn)", async () => {
    const got: DeliveryBatch[][] = []; const f = fakePrisma();
    const repo = createPrismaRepositories(f.prisma as never, { delivery: { deliver: (b) => got.push(b) } }).payments;
    await repo.transition({ id: "p1", from: ["PAYMENT_SUBMITTED"], to: "PAID" }, hooks);
    assert.equal(got.length, 1); assert.deepEqual(got[0], [{ userIds: ["u1", "u2"], title: "To'lov tasdiqlandi", message: "PAY-1001" }]); assert.equal(f.committed(), 1);
  });
  await t("rollback bo'lsa (audit xatosi) hech narsa yuborilmaydi", async () => {
    const got: DeliveryBatch[][] = []; const f = fakePrisma({ failAt: "audit" });
    const repo = createPrismaRepositories(f.prisma as never, { delivery: { deliver: (b) => got.push(b) } }).payments;
    await assert.rejects(() => repo.transition({ id: "p1", from: ["PAYMENT_SUBMITTED"], to: "PAID" }, hooks), /audit down/);
    assert.equal(got.length, 0);
  });
  await t("yetkazuvchi xato tashlasa ham amal muvaffaqiyatli; delivery berilmasa o'zgarishsiz", async () => {
    const f = fakePrisma();
    const repo = createPrismaRepositories(f.prisma as never, { delivery: { deliver: () => { throw new Error("boom"); } } }).payments;
    assert.equal((await repo.transition({ id: "p1", from: ["PAYMENT_SUBMITTED"], to: "PAID" }, hooks))!.status, "PAID");
    const g = fakePrisma(); const plain = createPrismaRepositories(g.prisma as never).payments;
    assert.equal((await plain.transition({ id: "p1", from: ["PAYMENT_SUBMITTED"], to: "PAID" }, hooks))!.status, "PAID");
  });

  console.log(`notify: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
