/** Baholash servisi: tomon/baholanuvchi aktyordan, faqat COMPLETED, takror 409, tartib 403 -> 404 -> 409. */
import assert from "node:assert/strict";
import { createRatingService } from "../src/services/rating.service";
import { createRatingBody } from "../src/schemas/rating.schemas";
import { fakeRatingRepo } from "./helpers/fakeRatingRepo";
import { createPrismaRepositories } from "../src/repositories/prisma";
import type { AuthUser } from "../src/types/fastify";

let pass = 0, fail = 0;
const t = async (name: string, fn: () => unknown | Promise<unknown>) => {
  try { await fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, (e as Error).message); }
};
const code = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (e) { const x = e as { code?: string; statusCode?: number }; return `${x.code}:${x.statusCode}`; } };

const biz: AuthUser = { id: "uC", name: "Kafe", role: "business", status: "ACTIVE", businessId: "bC", supplierId: null };
const bizOther: AuthUser = { ...biz, id: "uE", businessId: "bE" };
const supA: AuthUser = { id: "uA", name: "Ali", role: "supplier", status: "ACTIVE", supplierId: "sA", businessId: null };
const supB: AuthUser = { ...supA, id: "uB", supplierId: "sB" };
const adm: AuthUser = { id: "uD", name: "Admin", role: "admin", status: "ACTIVE", businessId: null, supplierId: null };
const order = {
  id: "o1", publicId: "SB-1001", businessId: "bC",
  items: [
    { id: "i1", orderId: "o1", supplierId: "sA", status: "COMPLETED" },
    { id: "i2", orderId: "o1", supplierId: "sB", status: "ACTIVE" },
  ],
};
const orders = { async findById(id: string) { return id === "o1" ? order : null; } } as never;
const mk = () => { const r = fakeRatingRepo(); return { r, svc: createRatingService({ ratings: r.repo, orders }) }; };
const body = (over: Record<string, unknown> = {}) => createRatingBody.parse({ orderId: "00000000-0000-4000-8000-000000000001", itemId: "00000000-0000-4000-8000-000000000002", score: 5, ...over });
const inp = (itemId: string, score = 5, comment = "") => ({ orderId: "o1", itemId, score, comment });

(async () => {
  await t("sxema: 1..5 butun, ortiqcha maydon rad", () => {
    assert.throws(() => body({ score: 0 })); assert.throws(() => body({ score: 6 })); assert.throws(() => body({ score: 4.5 }));
    assert.throws(() => body({ side: "TO_BUSINESS" })); assert.throws(() => body({ comment: "x".repeat(501) }));
    assert.equal(body({ score: 3 }).comment, "");
  });
  await t("biznes supplierni baholaydi: tomon TO_SUPPLIER, baholanuvchi item supplieri, bildirishnoma supplierga", async () => {
    const { r, svc } = mk(); const x = await svc.create(biz, inp("i1", 4, "yaxshi"));
    assert.equal(x.score, 4); assert.deepEqual(r.created[0], { orderItemId: "i1", side: "TO_SUPPLIER", rateeId: "sA", score: 4, comment: "yaxshi" });
    assert.deepEqual(r.notes[0]!.recipient, { supplierId: "sA" }); assert.match(r.notes[0]!.content.message, /4\/5/); assert.equal(r.audits[0]!.action, "rating.created");
  });
  await t("supplier biznesni baholaydi: tomon TO_BUSINESS, baholanuvchi order.businessId", async () => {
    const { r, svc } = mk(); await svc.create(supA, inp("i1", 2));
    assert.deepEqual(r.created[0], { orderItemId: "i1", side: "TO_BUSINESS", rateeId: "bC", score: 2, comment: "" });
    assert.deepEqual(r.notes[0]!.recipient, { businessId: "bC" });
  });
  await t("yakunlanmagan qism -> 409", async () => { const { svc } = mk(); assert.equal(await code(svc.create(biz, inp("i2"))), "CONFLICT:409"); });
  await t("takroriy baho -> 409; qarshi tomon baholay oladi", async () => {
    const { svc } = mk(); await svc.create(biz, inp("i1"));
    assert.equal(await code(svc.create(biz, inp("i1", 1))), "CONFLICT:409"); assert.equal(await code(svc.create(supA, inp("i1"))), "OK");
  });
  await t("begona: boshqa biznes, boshqa supplier, yo'q buyurtma/qism -> 404", async () => {
    const { svc } = mk();
    assert.equal(await code(svc.create(bizOther, inp("i1"))), "NOT_FOUND:404");
    assert.equal(await code(svc.create(supB, inp("i1"))), "NOT_FOUND:404");
    assert.equal(await code(svc.create(biz, { orderId: "zzz", itemId: "i1", score: 5, comment: "" })), "NOT_FOUND:404");
    assert.equal(await code(svc.create(biz, inp("nope"))), "NOT_FOUND:404");
  });
  await t("admin va faol bo'lmagan hisob -> 403", async () => {
    const { svc } = mk();
    assert.equal(await code(svc.create(adm, inp("i1"))), "FORBIDDEN:403");
    assert.equal(await code(svc.create({ ...biz, status: "BLOCKED" }, inp("i1"))), "FORBIDDEN:403");
  });

  // ---------- Prisma qatlami (soxta tranzaksiya): o'rtacha bal, takror (P2002), poyga qayta urinishi ----------
  const mkDb = (o: { dup?: boolean; raceOnce?: boolean; noTarget?: boolean; failAudit?: boolean } = {}) => {
    const state = { supplier: { rating: 4, ratingCount: 3 } as { rating: number; ratingCount: number } | null, audits: 0, notes: 0, updates: 0 };
    if (o.noTarget) state.supplier = null;
    let raced = false;
    const tx = {
      rating: { async create(a: any) { if (o.dup) throw Object.assign(new Error("unique"), { code: "P2002" }); return { id: "r1", orderItemId: a.data.orderItemId, side: a.data.side, scores: a.data.scores, comment: a.data.comment, createdAt: new Date(0) }; } },
      supplier: {
        async findUnique() { return state.supplier ? { ...state.supplier } : null; },
        async updateMany(a: any) {
          state.updates++;
          if (o.raceOnce && !raced) { raced = true; state.supplier!.ratingCount += 1; state.supplier!.rating = 4.5; return { count: 0 }; }
          if (state.supplier!.ratingCount !== a.where.ratingCount) return { count: 0 };
          Object.assign(state.supplier!, a.data); return { count: 1 };
        },
      },
      auditLog: { async create() { if (o.failAudit) throw new Error("audit down"); state.audits++; return {}; } },
      user: { async findMany() { return [{ id: "u1" }]; } },
      notification: { async createMany() { state.notes++; return {}; } },
    };
    const prisma = { async $transaction(fn: (t: unknown) => Promise<unknown>) { return fn(tx); } };
    return { state, repo: createPrismaRepositories(prisma as never).ratings };
  };
  const hooks = {
    audit: () => ({ actorId: "u", actorName: "n", actorRole: "business" as const, action: "rating.created", objectType: "rating", objectId: "r1", description: "d" }),
    recipient: { supplierId: "sA" }, notify: () => ({ type: "rating.received" as const, title: "T", message: "M" }),
  };
  const input = { orderItemId: "i1", side: "TO_SUPPLIER" as const, rateeId: "sA", score: 5, comment: "" };
  await t("prisma: o'rtacha (4*3+5)/4 = 4.25, soni 4, audit va bildirishnoma yoziladi", async () => {
    const d = mkDb(); const r = await d.repo.create(input, hooks);
    assert.equal(r.score, 5); assert.deepEqual(d.state.supplier, { rating: 4.25, ratingCount: 4 }); assert.equal(d.state.audits, 1); assert.equal(d.state.notes, 1);
  });
  await t("prisma: takror (P2002) -> 409, o'rtacha o'zgarmaydi", async () => {
    const d = mkDb({ dup: true }); assert.equal(await code(d.repo.create(input, hooks)), "CONFLICT:409");
    assert.deepEqual(d.state.supplier, { rating: 4, ratingCount: 3 }); assert.equal(d.state.updates, 0);
  });
  await t("prisma: poyga - qayta o'qib urinadi, ikkala bal hisobga olinadi", async () => {
    const d = mkDb({ raceOnce: true }); await d.repo.create(input, hooks);
    assert.deepEqual(d.state.supplier, { rating: Math.round(((4.5 * 4 + 5) / 5) * 100) / 100, ratingCount: 5 }); assert.equal(d.state.updates, 2);
  });
  await t("prisma: baholanuvchi yo'q -> 404; audit xatosi tranzaksiyani buzadi", async () => {
    assert.equal(await code(mkDb({ noTarget: true }).repo.create(input, hooks)), "NOT_FOUND:404");
    await assert.rejects(() => mkDb({ failAudit: true }).repo.create(input, hooks), /audit down/);
  });
  console.log(`ratings: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
