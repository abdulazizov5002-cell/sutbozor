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
    assert.equal(orderItemActionBody.safeParse({ action: "refund" }).success, false);
    for (const a of ["prepare", "ready", "depart", "deliver", "receive", "pickup", "resume"]) assert.ok(orderItemActionBody.safeParse({ action: a }).success, a);
    assert.equal(orderItemActionBody.safeParse({ action: "pause" }).success, false);
    assert.ok(orderItemActionBody.safeParse({ action: "pause", reason: "Sigir kasal" }).success);
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
    const tr = w.transitions[0] as any;
    assert.deepEqual({ ...tr, contract: undefined }, { orderId: o.id, itemId: a.id, from: { status: "SENT" }, to: { status: "ACTIVE" }, supplierId: SA, contract: undefined });
    assert.equal(tr.contract.unit, "L"); assert.equal(w.contracts.length, 1);
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
    assert.deepEqual(w.transitions[0], { orderId: o.id, itemId: b.id, from: { status: "SENT" }, to: { status: "CANCELLED" }, businessId: "bC" });
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
  const fakePrisma = (opts: { failAt?: string; error?: Error; changed?: number; users?: Record<string, string[]>; seqValue?: number; item?: Record<string, unknown>; days?: number } = {}) => {
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
            items: a.data.items.create.map((i: any, k: number) => ({ id: `i${k}`, orderId: "o1", deliveryStatus: "SCHEDULED", daysDelivered: 0, lastDeliveredOn: null, contractId: null, status: "SENT", ...i })),
          };
        },
        async findUnique(a: any) {
          ops.push("order.findUnique");
          return { id: "o1", publicId: "SB-1001", businessId: "bC", product: "Sut", quantityPerDay: 5, days: opts.days ?? 3, deliveryMode: "supplier", paymentSchedule: "WEEKLY", prepTime: "06:30", createdAt: new Date(0), updatedAt: new Date(0),
            items: [{ id: a.where.id === "o1" ? "i0" : "x", orderId: "o1", supplierId: SA, quantityPerDay: 5, pricePerUnit: 12000n, status: "ACTIVE", deliveryStatus: "SCHEDULED", daysDelivered: 0, lastDeliveredOn: null, contractId: null, ...opts.item }] };
        },
      },
      orderItem: {
        async updateMany(a: any) { maybeFail("orderItem.updateMany"); seen.update = a; return { count: opts.changed ?? 1 }; },
        async update(a: any) { maybeFail("orderItem.update"); seen.itemUpdate = a; return {}; },
      },
      contract: {
        async create(a: any) { maybeFail("contract.create"); seen.contract = a; return { id: "c1" }; },
        async update(a: any) { maybeFail("contract.update"); seen.contractUpdate = a; return {}; },
      },
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
  const TR = { orderId: "o1", itemId: "i0", supplierId: SA };
  const rh = { ...hooks, recipient: { businessId: "bC" } };
  await t("prisma accept: holat + shartnoma (CT-raqam, narx snapshot, sanalar) + qismga bog'lanish + audit + bildirishnoma", async () => {
    const f = fakePrisma({ users: { bC: ["u9"] }, seqValue: 1003, item: { status: "SENT" } });
    const o = await f.repo.transitionItem({ ...TR, from: { status: "SENT" }, to: { status: "ACTIVE" }, contract: { unit: "L", startDate: "2026-10-15", endDate: "2026-10-17" } }, rh);
    assert.equal(o!.id, "o1");
    assert.deepEqual(f.seen.update, { where: { id: "i0", orderId: "o1", status: "SENT", supplierId: SA }, data: { status: "ACTIVE" } });
    assert.deepEqual(f.ops, ["order.findUnique", "orderItem.updateMany", "sequence.upsert", "contract.create", "orderItem.update", "order.findUnique", "audit.create", "user.findMany", "notification.createMany"]);
    assert.deepEqual(f.seen.seq.where, { name: "contract" });
    const c = f.seen.contract.data;
    assert.equal(c.publicId, "CT-1003"); assert.equal(c.pricePerUnit, 12000n); assert.equal(c.status, "ACTIVE"); assert.equal(c.supplierId, SA); assert.equal(c.businessId, "bC");
    assert.equal(c.unit, "L"); assert.equal(c.days, 3); assert.equal(c.startDate.toISOString(), "2026-10-15T00:00:00.000Z"); assert.equal(c.endDate.toISOString(), "2026-10-17T00:00:00.000Z");
    assert.deepEqual(f.seen.itemUpdate, { where: { id: "i0" }, data: { contractId: "c1" } });
    assert.deepEqual(f.seen.userQueries[0].where, { status: "ACTIVE", businessId: "bC" });
  });
  await t("prisma cancel: businessId sharti order orqali", async () => {
    const g = fakePrisma(); await g.repo.transitionItem({ orderId: "o1", itemId: "i0", businessId: "bC", from: { status: "SENT" }, to: { status: "CANCELLED" } }, { ...hooks, recipient: { supplierId: SA } });
    assert.deepEqual(g.seen.update.where, { id: "i0", orderId: "o1", status: "SENT", order: { businessId: "bC" } });
    assert.equal(g.ops.includes("contract.create"), false);
  });
  await t("prisma: count 0 -> null, hech narsa yozilmaydi", async () => {
    const f = fakePrisma({ changed: 0 });
    assert.equal(await f.repo.transitionItem({ ...TR, from: { status: "SENT" }, to: { status: "ACTIVE" } }, rh), null);
    assert.deepEqual(f.ops, ["order.findUnique", "orderItem.updateMany"]);
  });
  await t("prisma yetkazish bosqichi: deliveryStatus sharti, faqat deliveryStatus o'zgaradi, shartnomaga tegmaydi; bildirishnoma null -> yaratilmaydi", async () => {
    const f = fakePrisma({ users: { bC: ["u9"] }, item: { contractId: "c1" } });
    await f.repo.transitionItem({ ...TR, from: { status: "ACTIVE", deliveryStatus: "SCHEDULED" }, to: { deliveryStatus: "PREPARING" } }, { ...rh, notify: () => null });
    assert.deepEqual(f.seen.update, { where: { id: "i0", orderId: "o1", status: "ACTIVE", deliveryStatus: "SCHEDULED", supplierId: SA }, data: { deliveryStatus: "PREPARING" } });
    assert.equal(f.ops.includes("contract.update"), false); assert.equal(f.ops.includes("notification.createMany"), false); assert.equal(f.ops.includes("user.findMany"), false);
  });
  await t("prisma to'xtatish/davom: shartnoma holati ham o'zgaradi", async () => {
    const f = fakePrisma({ item: { contractId: "c1" } });
    await f.repo.transitionItem({ ...TR, from: { status: "ACTIVE", deliveryStatus: "SCHEDULED" }, to: { status: "PAUSED" } }, rh);
    assert.deepEqual(f.seen.contractUpdate, { where: { id: "c1" }, data: { status: "PAUSED" } });
    const g = fakePrisma({ item: { contractId: "c1", status: "PAUSED" } });
    await g.repo.transitionItem({ ...TR, from: { status: "PAUSED" }, to: { status: "ACTIVE" } }, rh);
    assert.deepEqual(g.seen.contractUpdate, { where: { id: "c1" }, data: { status: "ACTIVE" } });
  });
  await t("prisma deliver (mark): faqat sana + DELIVERED, kun hisoblanmaydi, bir kunda bir marta sharti", async () => {
    const f = fakePrisma({ days: 3, item: { daysDelivered: 1, deliveryStatus: "IN_TRANSIT", contractId: "c1" } });
    await f.repo.transitionItem({ ...TR, from: { status: "ACTIVE", deliveryStatus: "IN_TRANSIT" }, to: { deliveryStatus: "DELIVERED" }, delivery: { today: "2026-10-16", stage: "mark" } }, rh);
    assert.deepEqual(f.seen.update.where.OR, [{ lastDeliveredOn: null }, { lastDeliveredOn: { lt: new Date("2026-10-16T00:00:00.000Z") } }]);
    assert.deepEqual(Object.keys(f.seen.update.data).sort(), ["deliveryStatus", "lastDeliveredOn"]);
    assert.equal(f.seen.update.data.deliveryStatus, "DELIVERED"); assert.equal(f.seen.update.data.lastDeliveredOn.toISOString(), "2026-10-16T00:00:00.000Z");
    assert.equal(f.ops.includes("contract.update"), false);
  });
  await t("prisma receive (confirm): +1 kun, kun sharti yo'q (sana allaqachon belgilangan), keyingi kun SCHEDULED", async () => {
    const f = fakePrisma({ days: 3, item: { daysDelivered: 1, deliveryStatus: "DELIVERED", contractId: "c1" } });
    await f.repo.transitionItem({ ...TR, from: { status: "ACTIVE", deliveryStatus: "DELIVERED" }, to: {}, delivery: { today: "2026-10-16", stage: "confirm" } }, rh);
    assert.equal(f.seen.update.where.OR, undefined);
    assert.equal(f.seen.update.data.daysDelivered, 2); assert.equal(f.seen.update.data.deliveryStatus, "SCHEDULED"); assert.equal(f.seen.update.data.status, "ACTIVE");
    assert.equal(f.seen.update.data.lastDeliveredOn, undefined); assert.equal(f.ops.includes("contract.update"), false);
  });
  await t("prisma pickup (both): sana + kun hisobi, bir kunda bir marta sharti", async () => {
    const f = fakePrisma({ days: 3, item: { daysDelivered: 0, deliveryStatus: "READY" } });
    await f.repo.transitionItem({ orderId: "o1", itemId: "i0", businessId: "bC", from: { status: "ACTIVE", deliveryStatus: "READY" }, to: {}, delivery: { today: "2026-10-16", stage: "both" } }, { ...rh, recipient: { supplierId: SA } });
    assert.ok(f.seen.update.where.OR); assert.equal(f.seen.update.data.daysDelivered, 1); assert.equal(f.seen.update.data.lastDeliveredOn.toISOString(), "2026-10-16T00:00:00.000Z");
  });
  await t("prisma receive: oxirgi kun -> qism va shartnoma COMPLETED", async () => {
    const f = fakePrisma({ days: 3, item: { daysDelivered: 2, deliveryStatus: "DELIVERED", contractId: "c1" } });
    await f.repo.transitionItem({ ...TR, from: { status: "ACTIVE", deliveryStatus: "DELIVERED" }, to: {}, delivery: { today: "2026-10-17", stage: "confirm" } }, rh);
    assert.equal(f.seen.update.data.daysDelivered, 3); assert.equal(f.seen.update.data.status, "COMPLETED"); assert.equal(f.seen.update.data.deliveryStatus, "DELIVERED");
    assert.deepEqual(f.seen.contractUpdate, { where: { id: "c1" }, data: { status: "COMPLETED" } });
  });
  await t("prisma: shartnoma xatosi -> butun tranzaksiya bekor", async () => {
    const f = fakePrisma({ failAt: "contract.create", error: new Error("db down"), item: { status: "SENT" } });
    await assert.rejects(() => f.repo.transitionItem({ ...TR, from: { status: "SENT" }, to: { status: "ACTIVE" }, contract: { unit: "L", startDate: "2026-10-15", endDate: "2026-10-17" } }, rh), /db down/);
    assert.ok(f.rolled());
  });

  // ---------- E bosqichi: servis (shartnoma va yetkazish sikli) ----------
  const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });
  const flow = async (mode: "supplier" | "pickup" = "supplier", days = 2) => {
    const w = world(); const svc = createOrderService(w.repo);
    const o = await svc.create(biz, createOrderBody.parse(body({ deliveryMode: mode, days, items: [{ supplierId: SA, quantityPerDay: 5 }] })));
    const it = o.items[0]!; const act = (u: AuthUser, action: string, reason = "") => svc.act(u, o.id, it.id, { action, reason } as never);
    return { w, svc, o, it, act };
  };
  await t("accept: shartnoma bugundan boshlanadi, muddat days-1 kun, birlik nomdan", async () => {
    const { w, act } = await flow("supplier", 30); await act(supA, "accept");
    const c = w.contracts[0]!; assert.equal(c.startDate, TODAY); assert.equal(c.unit, "L"); assert.equal(c.supplierId, SA); assert.equal(c.status, "ACTIVE");
    const end = new Date(`${TODAY}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 29); assert.equal(c.endDate, end.toISOString().slice(0, 10));
  });
  await t("yetkazish sikli (yetkazib berish): prepare -> ready -> depart -> deliver; kun hisobi +1, bildirishnomalar", async () => {
    const { w, it, act } = await flow(); await act(supA, "accept"); w.notes.length = 0;
    await act(supA, "prepare"); assert.equal(it.deliveryStatus, "PREPARING");
    await act(supA, "ready"); assert.equal(it.deliveryStatus, "READY"); assert.equal(w.notes.at(-1)!.content.type, "delivery.ready");
    await act(supA, "depart"); assert.equal(it.deliveryStatus, "IN_TRANSIT");
    await act(supA, "deliver"); assert.equal(it.daysDelivered, 0); assert.equal(it.deliveryStatus, "DELIVERED"); assert.equal(it.lastDeliveredOn, TODAY); // xaridor tasdig'igacha kun hisoblanmaydi
    assert.equal(w.notes.at(-1)!.content.type, "delivery.done"); assert.deepEqual(w.notes.at(-1)!.recipient, { businessId: "bC" });
    await act(biz, "receive"); assert.equal(it.daysDelivered, 1); assert.equal(it.deliveryStatus, "SCHEDULED"); assert.equal(it.status, "ACTIVE");
    assert.deepEqual(w.notes.at(-1)!.recipient, { supplierId: SA }); assert.equal(w.notes.length, 3); // prepare va depart uchun bildirishnoma yo'q
  });
  await t("bir kunda ikkinchi yetkazish -> 409 (kun hisobi aldanmaydi)", async () => {
    const { it, act } = await flow(); await act(supA, "accept");
    for (const a of ["prepare", "ready", "depart", "deliver"]) await act(supA, a);
    await act(biz, "receive");
    for (const a of ["prepare", "ready", "depart"]) await act(supA, a);
    assert.equal(await errOf(() => act(supA, "deliver")), "CONFLICT:409"); assert.equal(it.daysDelivered, 1);
  });
  await t("oxirgi kun yetkazilgach qism va shartnoma COMPLETED", async () => {
    const { w, it, act } = await flow("supplier", 1); await act(supA, "accept");
    for (const a of ["prepare", "ready", "depart", "deliver"]) await act(supA, a);
    assert.equal(it.status, "ACTIVE"); assert.equal(w.contracts[0]!.status, "ACTIVE"); // tasdiqlanmaguncha yakunlanmaydi
    await act(biz, "receive");
    assert.equal(it.status, "COMPLETED"); assert.equal(it.deliveryStatus, "DELIVERED"); assert.equal(w.contracts[0]!.status, "COMPLETED");
    assert.equal(await errOf(() => act(supA, "prepare")), "CONFLICT:409");
  });
  await t("olib ketish rejimi: depart/deliver mumkin emas; ready -> business pickup; supplierga bildirishnoma", async () => {
    const { w, it, act } = await flow("pickup"); await act(supA, "accept"); await act(supA, "prepare"); await act(supA, "ready");
    assert.equal(await errOf(() => act(supA, "depart")), "CONFLICT:409"); assert.equal(await errOf(() => act(supA, "deliver")), "CONFLICT:409");
    assert.equal(await errOf(() => act(supA, "pickup")), "FORBIDDEN:403");
    await act(biz, "pickup"); assert.equal(it.daysDelivered, 1); assert.deepEqual(w.notes.at(-1)!.recipient, { supplierId: SA });
  });
  await t("yetkazib berish rejimida pickup -> 409; sirasiz harakat -> 409 (ready'dan oldin depart, accept'dan oldin prepare)", async () => {
    const { it, act } = await flow(); assert.equal(await errOf(() => act(supA, "prepare")), "CONFLICT:409");
    await act(supA, "accept"); assert.equal(await errOf(() => act(supA, "depart")), "CONFLICT:409"); assert.equal(await errOf(() => act(supA, "ready")), "CONFLICT:409");
    await act(supA, "prepare"); await act(supA, "ready"); assert.equal(await errOf(() => act(biz, "pickup")), "CONFLICT:409"); assert.equal(it.daysDelivered, 0);
  });
  await t("pause: faqat SCHEDULED holatda (yo'lda emas), sabab bilan; resume qaytaradi; shartnoma holati ergashadi", async () => {
    const { w, it, act } = await flow(); await act(supA, "accept"); await act(supA, "prepare");
    assert.equal(await errOf(() => act(supA, "pause", "kasal")), "CONFLICT:409"); // tayyorlash paytida to'xtatib bo'lmaydi
    const f2 = await flow(); await f2.act(supA, "accept");
    await f2.act(supA, "pause", "Sigir kasal"); assert.equal(f2.it.status, "PAUSED"); assert.equal(f2.w.contracts[0]!.status, "PAUSED"); assert.equal(f2.w.notes.at(-1)!.content.type, "order.paused");
    assert.equal(await errOf(() => f2.act(supA, "prepare")), "CONFLICT:409");
    await f2.act(supA, "resume"); assert.equal(f2.it.status, "ACTIVE"); assert.equal(f2.w.contracts[0]!.status, "ACTIVE");
    assert.ok(w && it);
  });
  await t("receive: faqat biznes, faqat DELIVERED holatda; yetkazilmaguncha 409; supplier/admin/begona -> 403/404", async () => {
    const { it, act } = await flow(); await act(supA, "accept");
    assert.equal(await errOf(() => act(biz, "receive")), "CONFLICT:409");
    for (const a of ["prepare", "ready", "depart", "deliver"]) await act(supA, a);
    assert.equal(await errOf(() => act(supA, "receive")), "FORBIDDEN:403"); assert.equal(await errOf(() => act(adm, "receive")), "FORBIDDEN:403");
    assert.equal(await errOf(() => act(biz2, "receive")), "NOT_FOUND:404"); assert.equal(it.daysDelivered, 0);
    await act(biz, "receive"); assert.equal(await errOf(() => act(biz, "receive")), "CONFLICT:409"); assert.equal(it.daysDelivered, 1);
  });
  await t("avtomatik tasdiqlash: o'tgan kuni yetkazilgan va tasdiqlanmagan kun keyingi harakatda hisoblanadi (audit bilan)", async () => {
    const { w, it, act } = await flow("supplier", 3); await act(supA, "accept");
    for (const a of ["prepare", "ready", "depart", "deliver"]) await act(supA, a);
    it.lastDeliveredOn = "2000-01-01"; // kecha emas, kelishuv: bugundan oldin
    await act(supA, "prepare");
    assert.equal(it.daysDelivered, 1); assert.equal(it.deliveryStatus, "PREPARING");
    assert.ok(w.audits.some((a) => a.action === "order.auto_receive")); assert.ok(w.audits.some((a) => a.action === "order.prepare"));
  });
  await t("avtomatik tasdiqlash: oxirgi kun bo'lsa qism COMPLETED bo'ladi va yangi tayyorlash 409", async () => {
    const { w, it, act } = await flow("supplier", 1); await act(supA, "accept");
    for (const a of ["prepare", "ready", "depart", "deliver"]) await act(supA, a);
    it.lastDeliveredOn = "2000-01-01";
    assert.equal(await errOf(() => act(supA, "prepare")), "CONFLICT:409");
    assert.equal(it.status, "COMPLETED"); assert.equal(w.contracts[0]!.status, "COMPLETED"); assert.equal(it.daysDelivered, 1);
  });
  await t("bugun yetkazilgan, hali tasdiqlanmagan bo'lsa avtomatik tasdiqlanmaydi (supplier prepare qila olmaydi)", async () => {
    const { it, act } = await flow(); await act(supA, "accept");
    for (const a of ["prepare", "ready", "depart", "deliver"]) await act(supA, a);
    assert.equal(await errOf(() => act(supA, "prepare")), "CONFLICT:409"); assert.equal(it.daysDelivered, 0);
  });
  await t("E huquqlar: biznes yetkazish harakatini, supplier pickup qila olmaydi; begona supplier -> 404; admin -> 403", async () => {
    const { act } = await flow(); await act(supA, "accept");
    for (const a of ["prepare", "ready", "depart", "deliver", "pause", "resume"]) assert.equal(await errOf(() => act(biz, a, "sababli")), "FORBIDDEN:403", a);
    for (const a of ["prepare", "pickup"]) assert.equal(await errOf(() => act(adm, a)), "FORBIDDEN:403", a);
    assert.equal(await errOf(() => act(supB, "prepare")), "NOT_FOUND:404");
  });

  console.log(`orders: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
