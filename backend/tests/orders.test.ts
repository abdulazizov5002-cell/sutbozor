import assert from "node:assert/strict";
import { createPrismaRepositories } from "../src/repositories/prisma";
import { createOrderBody, orderItemActionBody } from "../src/schemas/order.schemas";
import { createOrderService } from "../src/services/order.service";
import type { AuthUser } from "../src/types/fastify";
import type { AppError } from "../src/utils/errors";
import { fakeOrderRepo, OFFER } from "./helpers/fakeOrderRepo";

let pass = 0, fail = 0;
const t = async (name: string, fn: () => unknown | Promise<unknown>) => {
  try { await fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, (e as Error).message); }
};
const errOf = async (fn: () => Promise<unknown>) => {
  try { await fn(); return "ok"; } catch (e) { const a = e as AppError; return `${a.code ?? a.message}:${a.statusCode ?? ""}`; }
};

const SA = "00000000-0000-4000-8000-00000000000a";
const SB = "00000000-0000-4000-8000-00000000000b";
const SC = "00000000-0000-4000-8000-00000000000c";
const supA: AuthUser = { id: "uA", name: "Ali", role: "supplier", status: "ACTIVE", supplierId: SA, businessId: null };
const supB: AuthUser = { id: "uB", role: "supplier", status: "ACTIVE", supplierId: SB, businessId: null };
const biz: AuthUser = { id: "uC", name: "Kafe", role: "business", status: "ACTIVE", businessId: "bC", supplierId: null };
const biz2: AuthUser = { id: "uE", role: "business", status: "ACTIVE", businessId: "bE", supplierId: null };
const adm: AuthUser = { id: "uD", role: "admin", status: "ACTIVE", businessId: null, supplierId: null };
const body = (over: Record<string, unknown> = {}) => ({
  product: "Sut", days: 30, deliveryMode: "supplier", paymentSchedule: "WEEKLY",
  items: [{ supplierId: SA, quantityPerDay: 5 }], ...over,
});
const world = () => fakeOrderRepo([], [OFFER(SA), OFFER(SB, "Sut", 11000, 4), OFFER(SC, "Qatiq")]);
const place = async (w: ReturnType<typeof world>, input = body()) => createOrderService(w.repo).create(biz, createOrderBody.parse(input));

(async () => {
  // ---------- Sxema ----------
  await t("sxema: to'g'ri body; prepTime standart 06:30", () => {
    const r = createOrderBody.safeParse(body()); assert.ok(r.success); assert.equal(r.data.prepTime, "06:30");
  });
  await t("sxema: narx/status/businessId/radiusKm yuborish rad etiladi (strict)", () => {
    for (const k of ["pricePerUnit", "status", "businessId", "radiusKm"]) assert.equal(createOrderBody.safeParse(body({ [k]: 1 })).success, false, k);
    assert.equal(createOrderBody.safeParse(body({ items: [{ supplierId: SA, quantityPerDay: 5, pricePerUnit: 1 }] })).success, false);
  });
  await t("sxema: bo'sh/ko'p/takror supplier, noto'g'ri uuid, 0/manfiy/kasr miqdor, kun 0/366, noma'lum mahsulot rad etiladi", () => {
    assert.equal(createOrderBody.safeParse(body({ items: [] })).success, false);
    assert.equal(createOrderBody.safeParse(body({ items: Array.from({ length: 11 }, (_, i) => ({ supplierId: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`, quantityPerDay: 1 })) })).success, false);
    assert.equal(createOrderBody.safeParse(body({ items: [{ supplierId: SA, quantityPerDay: 1 }, { supplierId: SA, quantityPerDay: 2 }] })).success, false);
    assert.equal(createOrderBody.safeParse(body({ items: [{ supplierId: "x", quantityPerDay: 1 }] })).success, false);
    for (const q of [0, -1, 1.234, "5"]) assert.equal(createOrderBody.safeParse(body({ items: [{ supplierId: SA, quantityPerDay: q }] })).success, false, String(q));
    for (const d of [0, 366, 1.5]) assert.equal(createOrderBody.safeParse(body({ days: d })).success, false, String(d));
    assert.equal(createOrderBody.safeParse(body({ product: "Pishloq" })).success, false);
    assert.equal(createOrderBody.safeParse(body({ prepTime: "25:00" })).success, false);
  });
  await t("sxema: harakat: reject/cancel sababsiz rad, accept sababsiz ok, noma'lum harakat rad", () => {
    assert.ok(orderItemActionBody.safeParse({ action: "accept" }).success);
    assert.equal(orderItemActionBody.safeParse({ action: "reject" }).success, false);
    assert.equal(orderItemActionBody.safeParse({ action: "reject", reason: "ab" }).success, false);
    assert.ok(orderItemActionBody.safeParse({ action: "reject", reason: "Sut qolmadi" }).success);
    assert.equal(orderItemActionBody.safeParse({ action: "cancel" }).success, false);
    assert.equal(orderItemActionBody.safeParse({ action: "deliver" }).success, false);
    assert.equal(orderItemActionBody.safeParse({ action: "accept", status: "ACTIVE" }).success, false);
  });

  // ---------- Servis: yaratish ----------
  await t("create: narx serverdan (snapshot), jami miqdor yig'indi, qism SENT, audit + bildirishnoma", async () => {
    const w = world();
    const o = await place(w, body({ items: [{ supplierId: SA, quantityPerDay: 5.1 }, { supplierId: SB, quantityPerDay: 3.2 }] }));
    assert.equal(o.businessId, "bC"); assert.equal(o.quantityPerDay, 8.3);
    assert.deepEqual(o.items.map((i) => [i.supplierId, i.pricePerUnit, i.status]), [[SA, 12000, "SENT"], [SB, 11000, "SENT"]]);
    assert.equal(w.audits[0]!.action, "order.create"); assert.equal(w.audits[0]!.actorRole, "business");
    assert.equal(w.notes[0]!.content.type, "order.new"); assert.match(w.notes[0]!.content.message, /Kafe/);
  });
  await t("create: businessId tokendan (bodyda yo'q)", async () => {
    const w = world(); await place(w); assert.equal((w.created[0] as { businessId: string }).businessId, "bC");
  });
  await t("create: supplier mahsulotni sotmaydi / faol emas / yo'q -> 400", async () => {
    const w = world();
    assert.equal(await errOf(() => place(w, body({ items: [{ supplierId: SC, quantityPerDay: 1 }] }))), "BAD_REQUEST:400"); // SC faqat Qatiq
    assert.equal(await errOf(() => place(w, body({ items: [{ supplierId: "00000000-0000-4000-8000-0000000000ff", quantityPerDay: 1 }] }))), "BAD_REQUEST:400");
    assert.equal(w.orders.length, 0);
  });
  await t("create: kunlik hajmdan ortiq -> 400; barcha-yoki-hech narsa (bittasi xato bo'lsa hech biri yaratilmaydi)", async () => {
    const w = world();
    assert.equal(await errOf(() => place(w, body({ items: [{ supplierId: SB, quantityPerDay: 4.01 }] }))), "BAD_REQUEST:400");
    assert.equal(await errOf(() => place(w, body({ items: [{ supplierId: SA, quantityPerDay: 1 }, { supplierId: SB, quantityPerDay: 99 }] }))), "BAD_REQUEST:400");
    assert.equal(w.orders.length, 0);
    assert.ok(await place(w, body({ items: [{ supplierId: SB, quantityPerDay: 4 }] })));
  });
  await t("create: supplier/admin -> 403; faol emas -> 403; biznessiz hisob -> 403", async () => {
    const w = world(); const svc = createOrderService(w.repo); const input = createOrderBody.parse(body());
    assert.equal(await errOf(() => svc.create(supA, input)), "FORBIDDEN:403");
    assert.equal(await errOf(() => svc.create(adm, input)), "FORBIDDEN:403");
    assert.equal(await errOf(() => svc.create({ ...biz, status: "BLOCKED" } as AuthUser, input)), "FORBIDDEN:403");
    assert.equal(await errOf(() => svc.create({ ...biz, businessId: null }, input)), "FORBIDDEN:403");
    assert.equal(w.orders.length, 0);
  });

  // ---------- Servis: harakatlar ----------
  const seeded = async () => {
    const w = world(); const o = await place(w, body({ items: [{ supplierId: SA, quantityPerDay: 5 }, { supplierId: SB, quantityPerDay: 2 }] }));
    w.audits.length = 0; w.notes.length = 0;
    return { w, svc: createOrderService(w.repo), o, a: o.items[0]!, b: o.items[1]! };
  };
  await t("accept: supplier o'z qismini ACTIVE qiladi; bizneska bildirishnoma + audit; boshqa qism tegmaydi", async () => {
    const { w, svc, o, a, b } = await seeded();
    const r = await svc.act(supA, o.id, a.id, { action: "accept", reason: "" });
    assert.equal(r.items.length, 1); assert.equal(r.items[0]!.status, "ACTIVE"); // supplier faqat o'z qismini ko'radi
    assert.equal(b.status, "SENT");
    assert.deepEqual(w.notes[0]!.recipient, { businessId: "bC" }); assert.equal(w.notes[0]!.content.type, "order.accepted");
    assert.equal(w.audits[0]!.action, "order.accept");
    assert.deepEqual(w.transitions[0], { orderId: o.id, itemId: a.id, to: "ACTIVE", supplierId: SA });
  });
  await t("reject: sabab xabarda va auditda; holat CANCELLED", async () => {
    const { w, svc, o, a } = await seeded();
    await svc.act(supA, o.id, a.id, { action: "reject", reason: "Sut qolmadi" });
    assert.equal(a.status, "CANCELLED"); assert.match(w.notes[0]!.content.message, /Sut qolmadi/); assert.match(w.audits[0]!.description, /Sut qolmadi/);
    assert.equal(w.notes[0]!.content.type, "order.rejected");
  });
  await t("cancel: business o'z buyurtmasi qismini SENT paytida bekor qiladi; supplierga bildirishnoma", async () => {
    const { w, svc, o, b } = await seeded();
    const r = await svc.act(biz, o.id, b.id, { action: "cancel", reason: "Kerak emas" });
    assert.equal(b.status, "CANCELLED"); assert.equal(r.items.length, 2);
    assert.deepEqual(w.notes[0]!.recipient, { supplierId: SB }); assert.equal(w.notes[0]!.content.type, "order.cancelled");
    assert.deepEqual(w.transitions[0], { orderId: o.id, itemId: b.id, to: "CANCELLED", businessId: "bC" });
  });
  await t("huquq: business accept/reject qila olmaydi, supplier cancel qila olmaydi, admin hech narsa -> 403", async () => {
    const { svc, o, a } = await seeded();
    assert.equal(await errOf(() => svc.act(biz, o.id, a.id, { action: "accept", reason: "" })), "FORBIDDEN:403");
    assert.equal(await errOf(() => svc.act(biz, o.id, a.id, { action: "reject", reason: "yaxshi emas" })), "FORBIDDEN:403");
    assert.equal(await errOf(() => svc.act(supA, o.id, a.id, { action: "cancel", reason: "yaxshi emas" })), "FORBIDDEN:403");
    for (const action of ["accept", "reject", "cancel"] as const) assert.equal(await errOf(() => svc.act(adm, o.id, a.id, { action, reason: "sababi" })), "FORBIDDEN:403", action);
    assert.equal(a.status, "SENT");
  });
  await t("egalik: begona supplier / begona biznes / boshqa supplierning qismi / yo'q id -> 404 (IDOR)", async () => {
    const { w, svc, o, a, b } = await seeded();
    const supC: AuthUser = { ...supB, supplierId: SC };
    assert.equal(await errOf(() => svc.act(supC, o.id, a.id, { action: "accept", reason: "" })), "NOT_FOUND:404");
    assert.equal(await errOf(() => svc.act(supB, o.id, a.id, { action: "accept", reason: "" })), "NOT_FOUND:404"); // SB, SA qismini qabul qila olmaydi
    assert.equal(await errOf(() => svc.act(biz2, o.id, b.id, { action: "cancel", reason: "begona" })), "NOT_FOUND:404");
    assert.equal(await errOf(() => svc.act(supA, o.id, "00000000-0000-4000-8000-00000000dead", { action: "accept", reason: "" })), "NOT_FOUND:404");
    assert.equal(await errOf(() => svc.act(supA, "00000000-0000-4000-8000-00000000dead", a.id, { action: "accept", reason: "" })), "NOT_FOUND:404");
    assert.equal(a.status, "SENT"); assert.equal(b.status, "SENT"); assert.equal(w.transitions.length, 0);
  });
  await t("holat: ikkinchi marta / qabul qilingandan keyin bekor/rad -> 409", async () => {
    const { svc, o, a } = await seeded();
    await svc.act(supA, o.id, a.id, { action: "accept", reason: "" });
    assert.equal(await errOf(() => svc.act(supA, o.id, a.id, { action: "accept", reason: "" })), "CONFLICT:409");
    assert.equal(await errOf(() => svc.act(supA, o.id, a.id, { action: "reject", reason: "endi kech" })), "CONFLICT:409");
    assert.equal(await errOf(() => svc.act(biz, o.id, a.id, { action: "cancel", reason: "endi kech" })), "CONFLICT:409");
    assert.equal(a.status, "ACTIVE");
  });
  await t("holat: poyga (repo null qaytarsa) -> 409", async () => {
    const { w, o, a } = await seeded();
    const racy = createOrderService({ ...w.repo, transitionItem: async () => null });
    assert.equal(await errOf(() => racy.act(supA, o.id, a.id, { action: "accept", reason: "" })), "CONFLICT:409");
  });
  await t("o'qish: supplier faqat o'z qismini ko'radi (narx/miqdor boshqalarniki yashirin)", async () => {
    const { svc, o } = await seeded();
    const view = await svc.getById(supB, o.id);
    assert.deepEqual(view.items.map((i) => i.supplierId), [SB]);
    assert.equal((await svc.getById(biz, o.id)).items.length, 2);
    assert.equal(await errOf(() => svc.getById(biz2, o.id)), "NOT_FOUND:404");
  });

  // ---------- Prisma qatlami (soxta tranzaksiya) ----------
  const fakePrisma = (opts: { failAt?: string; error?: Error; changed?: number; users?: Record<string, string[]>; seqValue?: number } = {}) => {
    const ops: string[] = []; const seen: Record<string, any> = {}; let rolled = false;
    const maybeFail = (at: string) => { ops.push(at); if (opts.failAt === at) throw opts.error!; };
    const tx = {
      sequence: { async upsert(a: any) { maybeFail("sequence.upsert"); seen.seq = a; return { name: "order", value: opts.seqValue ?? 1001 }; } },
      order: {
        async create(a: any) {
          maybeFail("order.create"); seen.create = a;
          return {
            id: "o1", publicId: a.data.publicId, businessId: a.data.businessId, product: a.data.product, quantityPerDay: a.data.quantityPerDay,
            days: a.data.days, deliveryMode: a.data.deliveryMode, paymentSchedule: a.data.paymentSchedule, prepTime: a.data.prepTime,
            createdAt: new Date(0), updatedAt: new Date(0),
            items: a.data.items.create.map((i: any, k: number) => ({ id: `i${k}`, orderId: "o1", deliveryStatus: "SCHEDULED", daysDelivered: 0, contractId: null, status: "SENT", ...i })),
          };
        },
        async findUnique(a: any) {
          ops.push("order.findUnique");
          return { id: "o1", publicId: "SB-1001", businessId: "bC", product: "Sut", quantityPerDay: 5, days: 3, deliveryMode: "supplier", paymentSchedule: "WEEKLY", prepTime: "06:30", createdAt: new Date(0), updatedAt: new Date(0),
            items: [{ id: a.where.id === "o1" ? "i0" : "x", orderId: "o1", supplierId: SA, quantityPerDay: 5, pricePerUnit: 12000n, status: "ACTIVE", deliveryStatus: "SCHEDULED", daysDelivered: 0, contractId: null }] };
        },
      },
      orderItem: { async updateMany(a: any) { maybeFail("orderItem.updateMany"); seen.update = a; return { count: opts.changed ?? 1 }; } },
      auditLog: { async create(a: any) { maybeFail("audit.create"); seen.audit = a; return {}; } },
      user: { async findMany(a: any) { ops.push("user.findMany"); (seen.userQueries ??= []).push(a); const key = a.where.supplierId ?? a.where.businessId; return (opts.users?.[key] ?? []).map((id) => ({ id })); } },
      notification: { async createMany(a: any) { maybeFail("notification.createMany"); (seen.notes ??= []).push(a); return { count: a.data.length }; } },
    };
    const prisma = { async $transaction(fn: (t: unknown) => Promise<unknown>) { try { return await fn(tx); } catch (e) { rolled = true; throw e; } } };
    return { repo: createPrismaRepositories(prisma as never).orders, ops, seen, rolled: () => rolled };
  };
  const hooks = {
    audit: (o: { id: string }) => ({ actorId: "uC", actorName: "Kafe", actorRole: "business", action: "order.create", objectType: "order", objectId: o.id, description: "d" }),
    notify: () => ({ type: "order.new" as const, title: "T", message: "M" }),
  };
  const NEW = { businessId: "bC", product: "Sut", quantityPerDay: 7, days: 3, deliveryMode: "supplier" as const, paymentSchedule: "WEEKLY" as const, prepTime: "06:30",
    items: [{ supplierId: SA, quantityPerDay: 5, pricePerUnit: 12000 }, { supplierId: SB, quantityPerDay: 2, pricePerUnit: 11000 }] };

  await t("prisma create: tartib, SB-raqam, narx BigInt, har supplier foydalanuvchilariga bildirishnoma", async () => {
    const f = fakePrisma({ users: { [SA]: ["u1", "u2"], [SB]: ["u3"] }, seqValue: 1007 });
    const o = await f.repo.create(NEW, hooks);
    assert.deepEqual(f.ops, ["sequence.upsert", "order.create", "audit.create", "user.findMany", "notification.createMany", "user.findMany", "notification.createMany"]);
    assert.equal(o.publicId, "SB-1007"); assert.equal(f.seen.create.data.publicId, "SB-1007");
    assert.deepEqual(f.seen.seq, { where: { name: "order" }, create: { name: "order", value: 1001 }, update: { value: { increment: 1 } } });
    assert.deepEqual(f.seen.create.data.items.create.map((i: any) => i.pricePerUnit), [12000n, 11000n]);
    assert.equal(f.seen.create.data.businessId, "bC");
    assert.deepEqual(f.seen.userQueries.map((q: any) => q.where), [{ status: "ACTIVE", supplierId: SA }, { status: "ACTIVE", supplierId: SB }]);
    assert.deepEqual(f.seen.notes[0].data.map((n: any) => n.userId), ["u1", "u2"]);
    assert.equal(f.seen.notes[0].data[0].type, "order.new"); assert.equal(f.seen.audit.data.objectId, "o1");
  });
  await t("prisma create: foydalanuvchisiz supplierga bildirishnoma yaratilmaydi (createMany chaqirilmaydi)", async () => {
    const f = fakePrisma(); await f.repo.create(NEW, hooks);
    assert.equal(f.ops.includes("notification.createMany"), false);
  });
  await t("prisma create: bildirishnoma/audit xatosi -> tranzaksiya bekor", async () => {
    const f = fakePrisma({ failAt: "audit.create", error: new Error("audit down") });
    await assert.rejects(() => f.repo.create(NEW, hooks), /audit down/); assert.ok(f.rolled());
    const g = fakePrisma({ failAt: "notification.createMany", error: new Error("notif down"), users: { [SA]: ["u1"] } });
    await assert.rejects(() => g.repo.create(NEW, hooks), /notif down/); assert.ok(g.rolled());
  });
  await t("prisma create: P2002 -> 3 marta urinadi, keyin 409; boshqa xato o'zgarishsiz", async () => {
    const dup = fakePrisma({ failAt: "sequence.upsert", error: Object.assign(new Error("u"), { code: "P2002" }) });
    assert.equal(await errOf(() => dup.repo.create(NEW, hooks)), "CONFLICT:409");
    assert.equal(dup.ops.filter((o) => o === "sequence.upsert").length, 3);
    const other = fakePrisma({ failAt: "order.create", error: new Error("connection lost") });
    await assert.rejects(() => other.repo.create(NEW, hooks), /connection lost/);
  });
  await t("prisma transitionItem: SENT sharti + egalik where; audit + bildirishnoma oluvchi", async () => {
    const f = fakePrisma({ users: { bC: ["u9"] } });
    const o = await f.repo.transitionItem({ orderId: "o1", itemId: "i0", to: "ACTIVE", supplierId: SA }, { ...hooks, recipient: { businessId: "bC" } });
    assert.equal(o!.id, "o1");
    assert.deepEqual(f.seen.update, { where: { id: "i0", orderId: "o1", status: "SENT", supplierId: SA }, data: { status: "ACTIVE" } });
    assert.deepEqual(f.ops, ["orderItem.updateMany", "order.findUnique", "audit.create", "user.findMany", "notification.createMany"]);
    assert.deepEqual(f.seen.userQueries[0].where, { status: "ACTIVE", businessId: "bC" });
    const g = fakePrisma(); await g.repo.transitionItem({ orderId: "o1", itemId: "i0", to: "CANCELLED", businessId: "bC" }, { ...hooks, recipient: { supplierId: SA } });
    assert.deepEqual(g.seen.update.where, { id: "i0", orderId: "o1", status: "SENT", order: { businessId: "bC" } });
  });
  await t("prisma transitionItem: count 0 -> null, hech narsa yozilmaydi", async () => {
    const f = fakePrisma({ changed: 0 });
    assert.equal(await f.repo.transitionItem({ orderId: "o1", itemId: "i0", to: "ACTIVE", supplierId: SA }, { ...hooks, recipient: { businessId: "bC" } }), null);
    assert.deepEqual(f.ops, ["orderItem.updateMany"]);
  });

  console.log(`orders: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
