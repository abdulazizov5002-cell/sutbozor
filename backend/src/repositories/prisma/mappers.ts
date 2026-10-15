import type {
  AuditLog, Business, Contract, Dispute, Notification, Order, OrderItem, Payment, Product, Rating, Supplier, User,
} from "../../domain/entities";
import { isMoney, type Money } from "../../domain/money";

/**
 * Prisma qatorlari -> domain obyektlari. Qator turlari sxemaga mos strukturaviy interfeyslar
 * (generatsiya qilingan Prisma turlariga bog'lanmaydi, shuning uchun `prisma generate` siz ham tekshiriladi).
 * Muhim: BigInt (so'm) <-> number aylantirish FAQAT shu yerda.
 */
type DecimalLike = number | { toString(): string };

export function money(value: bigint | number): Money {
  if (typeof value === "bigint" && (value > BigInt(Number.MAX_SAFE_INTEGER) || value < 0n)) {
    throw new Error("Pul summasi xavfsiz diapazondan tashqarida.");
  }
  const n = Number(value);
  if (!isMoney(n)) throw new Error("Pul summasi butun va manfiy bo'lmagan son bo'lishi kerak.");
  return n;
}

/** Yozish amallari uchun (keyingi bosqich): number -> BigInt. */
export function toBigInt(value: Money): bigint {
  if (!isMoney(value)) throw new Error("Pul summasi butun va manfiy bo'lmagan son bo'lishi kerak.");
  return BigInt(value);
}

const num = (d: DecimalLike): number => Number(d);
const iso = (d: Date): string => d.toISOString();
const day = (d: Date): string => d.toISOString().slice(0, 10); // DATE ustunlari UTC yarim tunda keladi

export const mapUser = (r: {
  id: string; name: string; phone: string; email: string | null; role: User["role"]; status: User["status"];
  businessId: string | null; supplierId: string | null; createdAt: Date; lastLoginAt: Date | null;
}): User => ({
  id: r.id, name: r.name, phone: r.phone, email: r.email, role: r.role, businessId: r.businessId,
  supplierId: r.supplierId, status: r.status, createdAt: iso(r.createdAt), lastLoginAt: r.lastLoginAt ? iso(r.lastLoginAt) : null,
});

export const mapBusiness = (r: {
  id: string; name: string; type: string; area: string; address: string; rating: number; ratingCount: number; createdAt: Date;
}): Business => ({ ...r, createdAt: iso(r.createdAt) });

export const mapSupplier = (r: {
  id: string; name: string; area: string; deliveryRadiusKm: number; rating: number; ratingCount: number; createdAt: Date;
}): Supplier => ({ ...r, createdAt: iso(r.createdAt) });

export const mapProduct = (r: {
  id: string; supplierId: string; name: string; unit: Product["unit"]; availableToday: DecimalLike;
  dailyCapacity: DecimalLike; pricePerUnit: bigint;
}): Product => ({
  id: r.id, supplierId: r.supplierId, name: r.name, unit: r.unit, availableToday: num(r.availableToday),
  dailyCapacity: num(r.dailyCapacity), pricePerUnit: money(r.pricePerUnit),
});

export const mapOrderItem = (r: {
  id: string; orderId: string; supplierId: string; quantityPerDay: DecimalLike; pricePerUnit: bigint;
  status: OrderItem["status"]; deliveryStatus: OrderItem["deliveryStatus"]; daysDelivered: number;
  lastDeliveredOn: Date | null; contractId: string | null;
}): OrderItem => ({
  id: r.id, orderId: r.orderId, supplierId: r.supplierId, quantityPerDay: num(r.quantityPerDay),
  pricePerUnit: money(r.pricePerUnit), status: r.status, deliveryStatus: r.deliveryStatus,
  daysDelivered: r.daysDelivered, lastDeliveredOn: r.lastDeliveredOn ? day(r.lastDeliveredOn) : null, contractId: r.contractId,
});

export const mapOrder = (r: {
  id: string; publicId: string; businessId: string; product: string; quantityPerDay: DecimalLike; days: number;
  deliveryMode: Order["deliveryMode"]; paymentSchedule: Order["paymentSchedule"]; prepTime: string;
  createdAt: Date; updatedAt: Date; items: Parameters<typeof mapOrderItem>[0][];
}): Order => ({
  id: r.id, publicId: r.publicId, businessId: r.businessId, product: r.product, quantityPerDay: num(r.quantityPerDay),
  days: r.days, deliveryMode: r.deliveryMode, paymentSchedule: r.paymentSchedule, prepTime: r.prepTime,
  createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt), items: r.items.map(mapOrderItem),
});

export const mapContract = (r: {
  id: string; publicId: string; orderId: string | null; businessId: string; supplierId: string; product: string;
  quantityPerDay: DecimalLike; unit: Contract["unit"]; pricePerUnit: bigint; days: number; startDate: Date; endDate: Date;
  paymentSchedule: Contract["paymentSchedule"]; deliveryMode: Contract["deliveryMode"]; status: Contract["status"]; createdAt: Date;
}): Contract => ({
  id: r.id, publicId: r.publicId, orderId: r.orderId, businessId: r.businessId, supplierId: r.supplierId, product: r.product,
  quantityPerDay: num(r.quantityPerDay), unit: r.unit, pricePerUnit: money(r.pricePerUnit), days: r.days,
  startDate: day(r.startDate), endDate: day(r.endDate), paymentSchedule: r.paymentSchedule, deliveryMode: r.deliveryMode,
  status: r.status, createdAt: iso(r.createdAt),
});

export const mapPayment = (r: {
  id: string; publicId: string; orderId: string; contractId: string; businessId: string; supplierId: string; amount: bigint;
  currency: string; paymentPeriod: Payment["paymentPeriod"]; periodNo: number; fromDay: number; toDay: number; days: number;
  dueDate: Date; paidAt: Date | null; paymentMethod: string | null; transactionId: string | null; status: Payment["status"];
  note: string; platformCommission: bigint; grossAmount: bigint; supplierAmount: bigint; createdAt: Date; updatedAt: Date;
}): Payment => ({
  id: r.id, publicId: r.publicId, orderId: r.orderId, contractId: r.contractId, businessId: r.businessId, supplierId: r.supplierId,
  amount: money(r.amount), currency: "UZS", paymentPeriod: r.paymentPeriod, periodNo: r.periodNo, fromDay: r.fromDay,
  toDay: r.toDay, days: r.days, dueDate: day(r.dueDate), paidAt: r.paidAt ? day(r.paidAt) : null, paymentMethod: r.paymentMethod,
  transactionId: r.transactionId, status: r.status, note: r.note, platformCommission: money(r.platformCommission),
  grossAmount: money(r.grossAmount), supplierAmount: money(r.supplierAmount), createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt),
});

export const mapDispute = (r: {
  id: string; publicId: string; orderId: string; paymentId: string | null; contractId: string | null; openedBy: Dispute["openedBy"];
  openedById: string; businessId: string; supplierId: string; reason: Dispute["reason"]; description: string;
  status: Dispute["status"]; createdAt: Date; resolvedAt: Date | null; resolution: string | null; resolvedBy: string | null;
}): Dispute => ({ ...r, createdAt: iso(r.createdAt), resolvedAt: r.resolvedAt ? iso(r.resolvedAt) : null });

export const mapNotification = (r: {
  id: string; userId: string; type: string; title: string; message: string; read: boolean; createdAt: Date;
}): Notification => ({ ...r, type: r.type as Notification["type"], createdAt: iso(r.createdAt) });

export const mapAuditLog = (r: {
  id: string; ts: Date; actorId: string | null; actorName: string; actorRole: string; action: string;
  objectType: string; objectId: string; description: string;
}): AuditLog => ({ ...r, ts: iso(r.ts), actorRole: r.actorRole as AuditLog["actorRole"] });

export const mapRating = (r: {
  id: string; orderItemId: string; side: Rating["side"]; scores: unknown; comment: string; createdAt: Date;
}): Rating => {
  const overall = (r.scores as { overall?: unknown } | null)?.overall;
  if (typeof overall !== "number") throw new Error("Rating.scores.overall noto'g'ri.");
  return { id: r.id, orderItemId: r.orderItemId, side: r.side, score: overall, comment: r.comment, createdAt: iso(r.createdAt) };
};
