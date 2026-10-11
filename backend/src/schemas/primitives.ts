import { z } from "zod";
import {
  DISPUTE_REASONS, DELIVERY_MODES, PAYMENT_METHODS, PAYMENT_SCHEDULES, PRODUCT_NAMES, ROLES,
} from "../config/constants";
import { todayInBusinessZone } from "../utils/date";
import "../validation/errorMap";

/** Qayta ishlatiladigan sxema bo'laklari. Request sxemalari (order/payment/dispute/...) shulardan quriladi. */

// Matn: bo'sh joylar kesiladi, uzunlik tekshiriladi. NUL belgisi PostgreSQL'da xato beradi, shuning uchun rad etiladi.
const noNul = (s: string): boolean => !s.includes("\u0000");
export const text = (min: number, max: number) =>
  z.string().trim().min(min).max(max).refine(noNul, "Matnda ruxsat etilmagan belgi bor.");
/** Ixtiyoriy matn: berilmasa bo'sh qator. */
export const optionalText = (max: number) =>
  z.string().trim().max(max).refine(noNul, "Matnda ruxsat etilmagan belgi bor.").default("");

export const uuid = z.string().trim().uuid();
export const email = z.string().trim().toLowerCase().max(254).email();
/** O'zbekiston raqami: bo'shliq, tire va qavslar olib tashlanadi, natija +998XXXXXXXXX. */
export const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-()]/g, ""))
  .pipe(z.string().regex(/^\+998\d{9}$/, "Telefon raqami +998XXXXXXXXX formatida bo'lishi kerak."));
export const personName = text(2, 100);

/** Pul: butun so'm. Frontend/JSON da number, bazada BigInt (repository chegarasida aylantiriladi). */
export const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const positiveMoney = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
/** Litr/kg miqdori: musbat, 2 ta kasrgacha. */
export const quantity = z.number().positive().max(100_000).multipleOf(0.01);
export const nonNegativeQuantity = z.number().min(0).max(100_000).multipleOf(0.01);
export const days = z.number().int().min(1).max(365);

/** YYYY-MM-DD va haqiqatan mavjud sana (2026-02-30 rad etiladi). */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Sana YYYY-MM-DD formatida bo'lishi kerak.")
  .refine((s) => {
    // Format noto'g'ri bo'lsa, yuqoridagi regex xabari yetarli: ikkinchi (ortiqcha) xabar chiqarilmaydi.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return true;
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Bunday sana mavjud emas.");
export const pastOrToday = isoDate.refine((s) => s <= todayInBusinessZone(), "Sana kelajakda bo'lishi mumkin emas.");
export const todayOrFuture = isoDate.refine((s) => s >= todayInBusinessZone(), "Sana o'tib ketgan bo'lishi mumkin emas.");
export const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Vaqt SS:DD (masalan 06:30) formatida bo'lishi kerak.");

export const productName = z.enum(PRODUCT_NAMES);
export const paymentSchedule = z.enum(PAYMENT_SCHEDULES);
export const deliveryMode = z.enum(DELIVERY_MODES);
export const paymentMethod = z.enum(PAYMENT_METHODS);
export const disputeReason = z.enum(DISPUTE_REASONS);
export const role = z.enum(ROLES);

/** Body uchun: noma'lum maydonlar rad etiladi (masalan, foydalanuvchi `role` yoki `status` yuborib huquqini oshira olmaydi). */
export const strictObject = z.strictObject;
