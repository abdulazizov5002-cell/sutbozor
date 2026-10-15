import type { PrismaClient } from "@prisma/client";
import { conflict } from "../../utils/errors";
import type { NewAuditLog } from "../../domain/entities";
import type { ListParams, NewNotification, OrderRepository, Page, ProductRepository, ReadRepository, Repositories, Recipient, Scope } from "../ports";
import {
  mapAuditLog, mapBusiness, mapContract, mapDispute, mapNotification, mapOrder, mapPayment, mapProduct, mapSupplier, mapUser, money, toBigInt,
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
export function createPrismaRepositories(prisma: PrismaClient): Repositories {
  const db = prisma as unknown as Record<string, Delegate & { updateMany(args: any): Promise<{ count: number }>; create(args: any): Promise<any> }>;
  return {
    users: readRepository({ delegate: db.user!, map: mapUser, orderBy: { createdAt: "asc" } }),
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
    },
    disputes: readRepository({ delegate: db.dispute!, map: mapDispute, orderBy: { createdAt: "desc" }, where: party }),
    notifications: {
      ...readRepository({
        delegate: db.notification!, map: mapNotification, orderBy: { createdAt: "desc" },
        where: (s) => (s.userId ? { userId: s.userId } : {}),
      }),
      async markAllRead(userId) {
        await db.notification!.updateMany({ where: { userId, read: false }, data: { read: true } });
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
          } else if (item.contractId) {
            // To'xtatish/davom ettirish/yakunlash shartnoma holatiga ham o'tadi.
            const next = completes ? "COMPLETED" : input.to.status;
            if (next === "ACTIVE" || next === "PAUSED" || next === "COMPLETED") {
              await tx.contract.update({ where: { id: item.contractId }, data: { status: next } });
            }
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
 * Ketma-ket raqam (SB-<n>, CT-<n>): `sequences` jadvalidagi qator tranzaksiya ichida oshiriladi (qator qulfi).
 * Birinchi yaratishda ikki so'rov to'qnashsa P2002 bo'ladi: withSequenceRetry qayta urinadi.
 */
async function nextNumber(tx: any, name: "order" | "contract"): Promise<number> {
  const seq = await tx.sequence.upsert({ where: { name }, create: { name, value: 1001 }, update: { value: { increment: 1 } } });
  return seq.value as number;
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
