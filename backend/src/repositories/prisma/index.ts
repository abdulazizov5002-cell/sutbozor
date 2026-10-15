import type { PrismaClient } from "@prisma/client";
import { conflict } from "../../utils/errors";
import type { NewAuditLog } from "../../domain/entities";
import type { ListParams, Page, ProductRepository, ReadRepository, Repositories, Scope } from "../ports";
import {
  mapAuditLog, mapBusiness, mapContract, mapDispute, mapNotification, mapOrder, mapPayment, mapProduct, mapSupplier, mapUser, toBigInt,
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
    orders: readRepository({
      delegate: db.order!, map: mapOrder, include: { items: true }, orderBy: { createdAt: "desc" },
      where: (s) => ({
        ...(s.businessId ? { businessId: s.businessId } : {}),
        ...(s.supplierId ? { items: { some: { supplierId: s.supplierId } } } : {}),
      }),
    }),
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
