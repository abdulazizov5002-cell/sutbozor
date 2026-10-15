import type { PrismaClient } from "@prisma/client";
import { conflict, notFound } from "../../utils/errors";
import type { NewAuditLog } from "../../domain/entities";
import { queueDelivery, withDelivery, type NotificationDelivery } from "./delivery";
import { buildPaymentPlan, deliveryPayment, type PlannedPayment } from "../../domain/paymentPlan";
import type { DisputeRepository, RatingRepository, UserRepository, ListParams, NewNotification, OrderRepository, Page, PaymentRepository, ProductRepository, ReadRepository, Repositories, Recipient, Scope } from "../ports";
import {
  mapAuditLog, mapBusiness, mapContract, mapDispute, mapNotification, mapOrder, mapPayment, mapProduct, mapRating, mapSupplier, mapUser, money, toBigInt,
} from "./mappers";

/** Prisma delegate'ining bizga kerak qismi (strukturaviy tur, har qanday model delegate'i mos keladi). */
interface Delegate {
  findUnique(args: any): Promise<any>;
  findMany(args: any): Promise<any[]>;
  count(args: any): Promise<number>;
}

interface ReadConfig<T> {
  delegate: Delegate;
  map: (row: any) => T;
  /** Egalik sharti: Scope -> WHERE. Natija keyin kesilmaydi, filtr so'rovning o'zida bo'ladi. */
  where?: (scope: Scope) => Record<string, unknown>;
  include?: Record<string, unknown>;
  orderBy: Record<string, "asc" | "desc">;
}

function readRepository<T>(cfg: ReadConfig<T>): ReadRepository<T> {
  return {
    async findById(id) {
      const row = await cfg.delegate.findUnique({ where: { id }, ...(cfg.include ? { include: cfg.include } : {}) });
      return row ? cfg.map(row) : null;
    },
    async list(scope: Scope, { page, limit }: ListParams): Promise<Page<T>> {
      const where = cfg.where ? cfg.where(scope) : {};
      const [rows, total] = await Promise.all([
        cfg.delegate.findMany({
          where, orderBy: cfg.orderBy, skip: (page - 1) * limit, take: limit,
          ...(cfg.include ? { include: cfg.include } : {}),
        }),
        cfg.delegate.count({ where }),
      ]);
      return { items: rows.map(cfg.map), total, page, limit };
    },
  };
}

const party = (s: Scope) => ({
  ...(s.businessId ? { businessId: s.businessId } : {}),
  ...(s.supplierId ? { supplierId: s.supplierId } : {}),
});

/** Prisma bilan ishlaydigan repository'lar. container/buildApp({ repositories }) ga beriladi. */
export function createPrismaRepositories(base: PrismaClient, options: { delivery?: NotificationDelivery } = {}): Repositories {
  // Bildirishnoma yaratilgan tranzaksiya COMMIT bo'lgandan keyin tashqi kanalga (Telegram) yetkaziladi; delivery bo'lmasa prisma o'zgarmaydi.
  const prisma = withDelivery(base, options.delivery);
  const db = prisma as unknown as Record<string, Delegate & { updateMany(args: any): Promise<{ count: number }>; create(args: any): Promise<any> }>;
  return {
    users: {
      ...readRepository({ delegate: db.user!, map: mapUser, orderBy: { createdAt: "asc" } }),
      ...userWrites(prisma),
    },
    businesses: readRepository({ delegate: db.business!, map: mapBusiness, orderBy: { name: "asc" } }),
    suppliers: readRepository({ delegate: db.supplier!, map: mapSupplier, orderBy: { name: "asc" } }),
    products: {
      ...readRepository({
        delegate: db.product!, map: mapProduct, orderBy: { name: "asc" },
        where: (s) => (s.supplierId ? { supplierId: s.supplierId } : {}),
      }),
      ...productWrites(prisma),
    },
    orders: {
      ...readRepository({
        delegate: db.order!, map: mapOrder, include: { items: true }, orderBy: { createdAt: "desc" },
        where: (s) => ({
          ...(s.businessId ? { businessId: s.businessId } : {}),
          ...(s.supplierId ? { items: { some: { supplierId: s.supplierId } } } : {}),
        }),
      }),
      ...orderWrites(prisma),
    },
    contracts: readRepository({ delegate: db.contract!, map: mapContract, orderBy: { createdAt: "desc" }, where: party }),
    payments: {
      ...readRepository({ delegate: db.payment!, map: mapPayment, orderBy: { dueDate: "asc" }, where: party }),
      async markOverdue(today) {
        const r = await db.payment!.updateMany({
          where: { status: "PENDING", dueDate: { lt: new Date(`${today}T00:00:00.000Z`) } },
          data: { status: "OVERDUE" },
        });
        return r.count;
      },
      ...paymentWrites(prisma),
    },
    disputes: {
      ...readRepository({ delegate: db.dispute!, map: mapDispute, orderBy: { createdAt: "desc" }, where: party }),
      ...disputeWrites(prisma),
    },
    ratings: ratingWrites(prisma),
    notifications: {
      ...readRepository({
        delegate: db.notification!, map: mapNotification, orderBy: { createdAt: "desc" },
        where: (s) => (s.userId ? { userId: s.userId } : {}),
      }),
      async markAllRead(userId) {
        const r = await db.notification!.updateMany({ where: { userId, read: false }, data: { read: true } });
        return r.count;
      },
      async markRead(userId, id) {
        const r = await db.notification!.updateMany({ where: { id, userId }, data: { read: true } });
        return r.count === 1;
      },
    },
    audit: {
      ...readRepository({ delegate: db.auditLog!, map: mapAuditLog, orderBy: { ts: "desc" } }),
      async append(entry) {
        const { ts, ...rest } = entry;
        return mapAuditLog(await db.auditLog!.create({ data: { ...rest, ...(ts ? { ts: new Date(ts) } : {}) } }));
      },
    },
  };
}

/** Prisma xato kodi (klassni import qilmaymiz): P2002 unique buzilishi, P2025 yozuv topilmadi. */
const prismaCode = (e: unknown): string | null =>
  typeof e === "object" && e !== null && typeof (e as { code?: unknown }).code === "string" ? (e as { code: string }).code : null;

const auditData = (a: NewAuditLog) => ({
  actorId: a.actorId, actorName: a.actorName, actorRole: a.actorRole, action: a.action,
  objectType: a.objectType, objectId: a.objectId, description: a.description,
});

/** Mahsulot yozish amallari: o'zgarish va audit yozuvi bitta tranzaksiyada (biri xato bersa hech biri saqlanmaydi). */
function productWrites(prisma: PrismaClient): Pick<ProductRepository, "create" | "update" | "remove"> {
  return {
    async create(input, audit) {
      try {
        return await prisma.$transaction(async (tx) => {
          const row = await tx.product.create({
            data: {
              supplierId: input.supplierId, name: input.name, unit: input.unit,
              availableToday: input.availableToday, dailyCapacity: input.dailyCapacity, pricePerUnit: toBigInt(input.pricePerUnit),
            },
          });
          const product = mapProduct(row);
          await tx.auditLog.create({ data: auditData(audit(product)) });
          return product;
        });
      } catch (e) {
        if (prismaCode(e) === "P2002") throw conflict("Bu mahsulot allaqachon qo'shilgan. Mavjudini tahrirlang.");
        throw e;
      }
    },
    async update(id, patch, audit) {
      try {
        return await prisma.$transaction(async (tx) => {
          const row = await tx.product.update({
            where: { id },
            data: {
              ...(patch.availableToday !== undefined ? { availableToday: patch.availableToday } : {}),
              ...(patch.dailyCapacity !== undefined ? { dailyCapacity: patch.dailyCapacity } : {}),
              ...(patch.pricePerUnit !== undefined ? { pricePerUnit: toBigInt(patch.pricePerUnit) } : {}),
            },
          });
          const product = mapProduct(row);
          await tx.auditLog.create({ data: auditData(audit(product)) });
          return product;
        });
      } catch (e) {
        if (prismaCode(e) === "P2025") return null;
        throw e;
      }
    },
    async remove(id, audit) {
      try {
        return await prisma.$transaction(async (tx) => {
          const product = mapProduct(await tx.product.delete({ where: { id } }));
          await tx.auditLog.create({ data: auditData(audit(product)) });
          return product;
        });
      } catch (e) {
        if (prismaCode(e) === "P2025") return null;
        throw e;
      }
    },
  };
}

/** Bildirishnoma oluvchilar: faqat FAOL foydalanuvchilar (bloklanganlarga yuborilmaydi). */
const recipientWhere = (r: Recipient) => ({
  status: "ACTIVE" as const,
  ...(r.admins ? { role: "admin" as const } : {}),
  ...(r.businessId ? { businessId: r.businessId } : {}),
  ...(r.supplierId ? { supplierId: r.supplierId } : {}),
});

/** Tranzaksiya ichida: oluvchilarga bildirishnoma qatorlari. */
async function notifyUsers(tx: any, where: ReturnType<typeof recipientWhere>, content: NewNotification): Promise<void> {
  const users: { id: string }[] = await tx.user.findMany({ where, select: { id: true } });
  if (users.length === 0) return;
  await tx.notification.createMany({
    data: users.map((u) => ({ userId: u.id, type: content.type, title: content.title, message: content.message })),
  });
  queueDelivery(tx, { userIds: users.map((u) => u.id), title: content.title, message: content.message });
}

/**
 * Buyurtma yozish amallari. Buyurtma, qismlar, SB-<n> raqami, audit va bildirishnomalar BITTA tranzaksiyada:
 * biri xato bersa hech biri saqlanmaydi. Qism holati faqat SENT dan o'tadi (updateMany sharti): poyga holatida ikki marta o'tmaydi.
 */
function orderWrites(prisma: PrismaClient): Pick<OrderRepository, "findOfferings" | "create" | "transitionItem"> {
  const db = prisma as any;
  return {
    async findOfferings(supplierIds, product) {
      const rows: { supplierId: string; pricePerUnit: bigint; dailyCapacity: unknown }[] = await db.product.findMany({
        where: { name: product, supplierId: { in: supplierIds }, supplier: { users: { some: { status: "ACTIVE" } } } },
        select: { supplierId: true, pricePerUnit: true, dailyCapacity: true },
      });
      return rows.map((r) => ({ supplierId: r.supplierId, pricePerUnit: money(r.pricePerUnit), dailyCapacity: Number(r.dailyCapacity) }));
    },
    async create(input, hooks) {
      return withSequenceRetry(() =>
        prisma.$transaction(async (tx) => {
          const n = await nextNumber(tx, "order");
          const row = await tx.order.create({
            data: {
              publicId: `SB-${n}`, businessId: input.businessId, product: input.product,
              quantityPerDay: input.quantityPerDay, days: input.days, deliveryMode: input.deliveryMode,
              paymentSchedule: input.paymentSchedule, prepTime: input.prepTime,
              items: {
                create: input.items.map((i) => ({
                  supplierId: i.supplierId, quantityPerDay: i.quantityPerDay, pricePerUnit: toBigInt(i.pricePerUnit),
                })),
              },
            },
            include: { items: true },
          });
          const order = mapOrder(row);
          await tx.auditLog.create({ data: auditData(hooks.audit(order)) });
          const supplierIds = [...new Set(order.items.map((i) => i.supplierId))];
          for (const supplierId of supplierIds) await notifyUsers(tx, recipientWhere({ supplierId }), hooks.notify(order));
          return order;
        }),
      );
    },
    async transitionItem(input, hooks) {
      return withSequenceRetry(() =>
        prisma.$transaction(async (tx) => {
          const before = await tx.order.findUnique({ where: { id: input.orderId }, include: { items: true } });
          const item = before?.items.find((i) => i.id === input.itemId);
          if (!before || !item) return null;

          // Yetkazish hisobi: mark — faqat sana; confirm/both — +1 kun; oxirgi kunda COMPLETED, aks holda keyingi kun uchun SCHEDULED.
          const stage = input.delivery?.stage;
          const marks = stage === "mark" || stage === "both";
          const counts = stage === "confirm" || stage === "both";
          const counted = counts ? item.daysDelivered + 1 : null;
          const completes = counted !== null && counted >= before.days;
          const data = {
            ...(input.to.status ? { status: input.to.status } : {}),
            ...(input.to.deliveryStatus ? { deliveryStatus: input.to.deliveryStatus } : {}),
            ...(marks ? { lastDeliveredOn: new Date(`${input.delivery!.today}T00:00:00.000Z`) } : {}),
            ...(counted !== null
              ? {
                  daysDelivered: counted,
                  status: completes ? ("COMPLETED" as const) : item.status,
                  deliveryStatus: completes ? ("DELIVERED" as const) : ("SCHEDULED" as const),
                }
              : {}),
          };
          const changed = await tx.orderItem.updateMany({
            where: {
              id: input.itemId, orderId: input.orderId, status: input.from.status,
              ...(input.from.deliveryStatus ? { deliveryStatus: input.from.deliveryStatus } : {}),
              ...(input.supplierId ? { supplierId: input.supplierId } : {}),
              ...(input.businessId ? { order: { businessId: input.businessId } } : {}),
              ...(marks
                ? { OR: [{ lastDeliveredOn: null }, { lastDeliveredOn: { lt: new Date(`${input.delivery!.today}T00:00:00.000Z`) } }] }
                : {}),
            },
            data,
          });
          if (changed.count !== 1) return null;

          if (input.contract) {
            const n = await nextNumber(tx, "contract");
            const contract = await tx.contract.create({
              data: {
                publicId: `CT-${n}`, orderId: before.id, businessId: before.businessId, supplierId: item.supplierId,
                product: before.product, quantityPerDay: item.quantityPerDay, unit: input.contract.unit, pricePerUnit: item.pricePerUnit,
                days: before.days, startDate: new Date(`${input.contract.startDate}T00:00:00.000Z`),
                endDate: new Date(`${input.contract.endDate}T00:00:00.000Z`), paymentSchedule: before.paymentSchedule,
                deliveryMode: before.deliveryMode, status: "ACTIVE",
              },
            });
            await tx.orderItem.update({ where: { id: input.itemId }, data: { contractId: contract.id } });
            // To'lov jadvali (DELIVERY bo'lsa bo'sh: har yetkazilgan kun uchun alohida yaratiladi).
            const plan = buildPaymentPlan({
              schedule: before.paymentSchedule, days: before.days, quantityPerDay: Number(item.quantityPerDay),
              pricePerUnit: money(item.pricePerUnit), startDate: input.contract.startDate,
            });
            await createPayments(tx, plan, {
              orderId: before.id, contractId: contract.id, businessId: before.businessId, supplierId: item.supplierId, schedule: before.paymentSchedule,
            });
          } else if (item.contractId) {
            // To'xtatish/davom ettirish/yakunlash shartnoma holatiga ham o'tadi.
            const next = completes ? "COMPLETED" : input.to.status;
            if (next === "ACTIVE" || next === "PAUSED" || next === "COMPLETED") {
              await tx.contract.update({ where: { id: item.contractId }, data: { status: next } });
            }
          }

          // DELIVERY jadvali: xaridor tasdiqlagan har kun uchun alohida to'lov.
          if (counted !== null && before.paymentSchedule === "DELIVERY" && item.contractId) {
            await createPayments(
              tx,
              [deliveryPayment({ dayNo: counted, quantityPerDay: Number(item.quantityPerDay), pricePerUnit: money(item.pricePerUnit), today: input.delivery!.today })],
              { orderId: before.id, contractId: item.contractId, businessId: before.businessId, supplierId: item.supplierId, schedule: before.paymentSchedule },
            );
          }

          const row = await tx.order.findUnique({ where: { id: input.orderId }, include: { items: true } });
          if (!row) return null;
          const order = mapOrder(row);
          await tx.auditLog.create({ data: auditData(hooks.audit(order)) });
          const content = hooks.notify(order);
          if (content) await notifyUsers(tx, recipientWhere(hooks.recipient), content);
          return order;
        }),
      );
    },
  };
}

/**
 * Ketma-ket raqam (SB-<n>, CT-<n>, PAY-<n>): `sequences` jadvalidagi qator tranzaksiya ichida oshiriladi (qator qulfi).
 * `count` ta raqam birdan band qilinadi, birinchisi qaytariladi. Birinchi yaratishda ikki so'rov to'qnashsa P2002 bo'ladi:
 * withSequenceRetry qayta urinadi.
 */
async function nextNumbers(tx: any, name: "order" | "contract" | "payment" | "dispute", count: number): Promise<number> {
  const seq = await tx.sequence.upsert({ where: { name }, create: { name, value: 1000 + count }, update: { value: { increment: count } } });
  return (seq.value as number) - count + 1;
}
const nextNumber = (tx: any, name: "order" | "contract" | "payment" | "dispute"): Promise<number> => nextNumbers(tx, name, 1);

/** To'lov yozuvlari (faqat yozib borish): komissiya 0%, amount = grossAmount = supplierAmount (bazada CHECK ham bor). */
async function createPayments(
  tx: any,
  plan: PlannedPayment[],
  meta: { orderId: string; contractId: string; businessId: string; supplierId: string; schedule: string },
): Promise<void> {
  if (plan.length === 0) return;
  const first = await nextNumbers(tx, "payment", plan.length);
  await tx.payment.createMany({
    data: plan.map((x, i) => ({
      publicId: `PAY-${first + i}`, orderId: meta.orderId, contractId: meta.contractId, businessId: meta.businessId, supplierId: meta.supplierId,
      amount: toBigInt(x.amount), currency: "UZS", paymentPeriod: meta.schedule, periodNo: x.periodNo, fromDay: x.fromDay, toDay: x.toDay, days: x.days,
      dueDate: new Date(`${x.dueDate}T00:00:00.000Z`), status: "PENDING",
      platformCommission: 0n, grossAmount: toBigInt(x.amount), supplierAmount: toBigInt(x.amount),
    })),
  });
}

/** To'lov holatini o'tkazish: holat, audit va bildirishnoma bitta tranzaksiyada. Tranzaksiya raqami takrori -> 409. */
function paymentWrites(prisma: PrismaClient): Pick<PaymentRepository, "transition"> {
  return {
    async transition(input, hooks) {
      try {
        return await prisma.$transaction(async (tx) => {
          const set = input.set ?? {};
          const changed = await tx.payment.updateMany({
            where: {
              id: input.id, status: { in: input.from },
              ...(input.businessId ? { businessId: input.businessId } : {}),
              ...(input.supplierId ? { supplierId: input.supplierId } : {}),
            },
            data: {
              status: input.to,
              ...(set.paymentMethod !== undefined ? { paymentMethod: set.paymentMethod } : {}),
              ...(set.transactionId !== undefined ? { transactionId: set.transactionId } : {}),
              ...(set.paidAt !== undefined ? { paidAt: new Date(`${set.paidAt}T00:00:00.000Z`) } : {}),
              ...(set.note !== undefined ? { note: set.note } : {}),
            },
          });
          if (changed.count !== 1) return null;
          const row = await tx.payment.findUnique({ where: { id: input.id } });
          if (!row) return null;
          const payment = mapPayment(row);
          await tx.auditLog.create({ data: auditData(hooks.audit(payment)) });
          await notifyUsers(tx, recipientWhere(hooks.recipient), hooks.notify(payment));
          return payment;
        });
      } catch (e) {
        if (prismaCode(e) === "P2002") throw conflict("Bu tranzaksiya raqami allaqachon boshqa to'lov uchun ishlatilgan.");
        throw e;
      }
    },
  };
}

/** Foydalanuvchi holatini o'zgartirish (bloklash/faollashtirish): updateMany `status in from` va `role != excludeRole` sharti bilan, audit bilan bitta tranzaksiyada. */
function userWrites(prisma: PrismaClient): Pick<UserRepository, "transitionStatus"> {
  return {
    async transitionStatus(input, hooks) {
      return prisma.$transaction(async (tx: any) => {
        const changed = await tx.user.updateMany({
          where: { id: input.id, status: { in: input.from }, role: { not: input.excludeRole } },
          data: { status: input.to },
        });
        if (changed.count !== 1) return null;
        const row = await tx.user.findUnique({ where: { id: input.id } });
        if (!row) return null;
        const user = mapUser(row);
        await tx.auditLog.create({ data: auditData(hooks.audit(user)) });
        return user;
      });
    },
  };
}

/**
 * Nizolar (F bosqichi). Ochish: DS-<n> raqami, audit va bildirishnomalar bitta tranzaksiyada; bir xil (buyurtma, supplier, to'lov)
 * bo'yicha ochiq nizo bo'lsa 409. Holat o'tkazish: updateMany `status in from` sharti bilan (poyga holatida ikkinchi so'rov null oladi).
 */
function disputeWrites(prisma: PrismaClient): Pick<DisputeRepository, "create" | "transition"> {
  return {
    async create(input, hooks) {
      return withSequenceRetry(() =>
        prisma.$transaction(async (tx: any) => {
          const open = await tx.dispute.findFirst({
            where: {
              orderId: input.orderId, supplierId: input.supplierId, paymentId: input.paymentId, status: { in: ["OPEN", "UNDER_REVIEW"] },
            },
            select: { id: true },
          });
          if (open) throw conflict("Bu masala bo'yicha nizo allaqachon ochilgan va hali hal qilinmagan.");
          const n = await nextNumber(tx, "dispute");
          const row = await tx.dispute.create({
            data: {
              publicId: `DS-${n}`, orderId: input.orderId, paymentId: input.paymentId, contractId: input.contractId,
              openedBy: input.openedBy, openedById: input.openedById, businessId: input.businessId, supplierId: input.supplierId,
              reason: input.reason, description: input.description,
            },
          });
          const dispute = mapDispute(row);
          await tx.auditLog.create({ data: auditData(hooks.audit(dispute)) });
          const content = hooks.notify(dispute);
          for (const r of hooks.recipients) await notifyUsers(tx, recipientWhere(r), content);
          return dispute;
        }),
      );
    },
    async transition(input, hooks) {
      return prisma.$transaction(async (tx: any) => {
        const decided = input.to === "RESOLVED" || input.to === "REJECTED";
        const changed = await tx.dispute.updateMany({
          where: { id: input.id, status: { in: input.from } },
          data: {
            status: input.to,
            ...(input.resolution !== undefined ? { resolution: input.resolution } : {}),
            ...(input.resolvedBy !== undefined ? { resolvedBy: input.resolvedBy } : {}),
            ...(decided ? { resolvedAt: new Date() } : {}),
          },
        });
        if (changed.count !== 1) return null;
        const row = await tx.dispute.findUnique({ where: { id: input.id } });
        if (!row) return null;
        const dispute = mapDispute(row);
        await tx.auditLog.create({ data: auditData(hooks.audit(dispute)) });
        const content = hooks.notify(dispute);
        for (const r of hooks.recipients) await notifyUsers(tx, recipientWhere(r), content);
        return dispute;
      });
    },
  };
}

async function withSequenceRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (e) {
      if (prismaCode(e) === "P2002") {
        if (attempt < 2) continue;
        throw conflict("Raqamni berib bo'lmadi. Qayta urinib ko'ring.");
      }
      throw e;
    }
  }
}

/**
 * Baho: yozuv + baholangan tomonning o'rtacha bali/soni + audit + bildirishnoma bitta tranzaksiyada.
 * Takroriy baho (orderItemId + side unique, P2002) -> 409. O'rtacha `updateMany ... ratingCount = eski` sharti bilan yangilanadi:
 * ikki baho bir vaqtda kelsa ikkinchisi qayta o'qib urinadi (bal yo'qolmaydi).
 */
function ratingWrites(prisma: PrismaClient): RatingRepository {
  return {
    async create(input, hooks) {
      return prisma.$transaction(async (tx: any) => {
        let row;
        try {
          row = await tx.rating.create({
            data: { orderItemId: input.orderItemId, side: input.side, scores: { overall: input.score }, comment: input.comment },
          });
        } catch (e) {
          if (prismaCode(e) === "P2002") throw conflict("Siz bu buyurtmani allaqachon baholagansiz.");
          throw e;
        }
        const target = input.side === "TO_SUPPLIER" ? tx.supplier : tx.business;
        for (let attempt = 0; ; attempt++) {
          const cur = await target.findUnique({ where: { id: input.rateeId }, select: { rating: true, ratingCount: true } });
          if (!cur) throw notFound();
          const count = cur.ratingCount + 1;
          const average = Math.round(((cur.rating * cur.ratingCount + input.score) / count) * 100) / 100;
          const r = await target.updateMany({ where: { id: input.rateeId, ratingCount: cur.ratingCount }, data: { rating: average, ratingCount: count } });
          if (r.count === 1) break;
          if (attempt >= 4) throw conflict("Server band, qayta urinib ko'ring.");
        }
        const rating = mapRating(row);
        await tx.auditLog.create({ data: auditData(hooks.audit(rating)) });
        await notifyUsers(tx, recipientWhere(hooks.recipient), hooks.notify(rating));
        return rating;
      });
    },
  };
}
