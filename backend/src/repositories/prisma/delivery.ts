import type { PrismaClient } from "@prisma/client";

/** Bitta bildirishnoma qaysi foydalanuvchilarga yetkazilishi kerak (Telegram kabi tashqi kanal uchun). */
export interface DeliveryBatch {
  userIds: string[];
  title: string;
  message: string;
}

/** Tashqi kanalga yetkazish. `deliver` hech qachon xato tashlamasligi va kutdirmasligi kerak (fire-and-forget). */
export interface NotificationDelivery {
  deliver(batches: DeliveryBatch[]): void;
}

/** Tranzaksiya (tx) -> shu tranzaksiyada yaratilgan bildirishnomalar. Faqat COMMIT'dan keyin yuboriladi. */
const outbox = new WeakMap<object, DeliveryBatch[]>();

/** notifyUsers chaqiradi: tranzaksiya muvaffaqiyatli tugasagina yuboriladigan partiyani navbatga qo'yadi. */
export function queueDelivery(tx: object, batch: DeliveryBatch): void {
  if (batch.userIds.length > 0) outbox.get(tx)?.push(batch);
}

/**
 * `$transaction` ni o'raydi: tranzaksiya COMMIT bo'lgandan KEYIN navbatdagi bildirishnomalarni `delivery` ga beradi.
 * Xato (rollback) bo'lsa hech narsa yuborilmaydi. `delivery` berilmasa prisma o'zgarishsiz qaytadi.
 */
export function withDelivery(prisma: PrismaClient, delivery?: NotificationDelivery): PrismaClient {
  if (!delivery) return prisma;
  const original = (prisma as any).$transaction.bind(prisma) as (fn: (tx: any) => Promise<unknown>, ...rest: unknown[]) => Promise<unknown>;
  const wrapped = async (fn: (tx: any) => Promise<unknown>, ...rest: unknown[]): Promise<unknown> => {
    let batches: DeliveryBatch[] = [];
    const result = await original(async (tx: any) => {
      const mine: DeliveryBatch[] = [];
      outbox.set(tx, mine);
      const r = await fn(tx);
      batches = mine;
      return r;
    }, ...rest);
    if (batches.length > 0) {
      try { delivery.deliver(batches); } catch { /* yetkazish xatosi asosiy amalni buzmaydi */ }
    }
    return result;
  };
  return new Proxy(prisma, { get: (target, prop, receiver) => (prop === "$transaction" ? wrapped : Reflect.get(target, prop, receiver)) });
}
