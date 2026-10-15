import { PAYMENT_PERIOD_DAYS, type PaymentSchedule } from "../config/constants";
import { addDays } from "../utils/date";
import { isMoney, type Money } from "./money";

/** Rejalashtirilgan to'lov (bazaga yozishdan oldingi holat). Komissiya 0%: amount = grossAmount = supplierAmount. */
export interface PlannedPayment {
  periodNo: number;
  fromDay: number;
  toDay: number;
  days: number;
  amount: Money;
  dueDate: string;
}

/**
 * `days` kunlik yetkazish uchun summa: round(quantityPerDay * pricePerUnit * days) butun so'mda.
 * Miqdor 2 ta kasrgacha (0.01), shuning uchun hisob BigInt'da (float xatosi yo'q): yarim so'm yuqoriga yaxlitlanadi.
 */
export function amountForDays(quantityPerDay: number, pricePerUnit: Money, days: number): Money {
  const hundredths = BigInt(Math.round(quantityPerDay * 100));
  const value = (hundredths * BigInt(pricePerUnit) * BigInt(days) + 50n) / 100n;
  const n = Number(value);
  if (!isMoney(n)) throw new Error("To'lov summasi xavfsiz diapazondan tashqarida.");
  return n;
}

/**
 * To'lov jadvali (shartnoma faollashganda). Qoidalar demo bilan bir xil:
 * - DELIVERY: oldindan jadval yo'q, har yetkazilgan kun uchun alohida to'lov (deliveryPayment).
 * - PREPAID: bitta to'lov butun muddatga, muddati boshlanish kuni.
 * - WEEKLY (7 kun) / MONTHLY (30 kun): oxirgi davr qoldiq kunlarni oladi; muddat = boshlanish + davr oxirgi kuni.
 * Davr summalari jamlama farq bilan hisoblanadi: yig'indi har doim butun muddat summasiga teng (yaxlitlash yo'qolmaydi).
 */
export function buildPaymentPlan(p: {
  schedule: PaymentSchedule;
  days: number;
  quantityPerDay: number;
  pricePerUnit: Money;
  startDate: string;
}): PlannedPayment[] {
  if (p.schedule === "DELIVERY") return [];
  const cum = (d: number): Money => (d <= 0 ? 0 : amountForDays(p.quantityPerDay, p.pricePerUnit, d));
  if (p.schedule === "PREPAID") {
    return [{ periodNo: 1, fromDay: 1, toDay: p.days, days: p.days, amount: cum(p.days), dueDate: p.startDate }];
  }
  const size = p.schedule === "MONTHLY" ? 30 : PAYMENT_PERIOD_DAYS;
  const count = Math.max(1, Math.floor(p.days / size));
  const out: PlannedPayment[] = [];
  for (let k = 0; k < count; k++) {
    const fromDay = k * size + 1;
    const toDay = k === count - 1 ? p.days : (k + 1) * size;
    out.push({
      periodNo: k + 1, fromDay, toDay, days: toDay - fromDay + 1,
      amount: cum(toDay) - cum(fromDay - 1), dueDate: addDays(p.startDate, toDay),
    });
  }
  return out;
}

/** DELIVERY jadvali: yetkazilgan (tasdiqlangan) `dayNo`-kun uchun bitta to'lov, muddati shu kun. */
export function deliveryPayment(p: { dayNo: number; quantityPerDay: number; pricePerUnit: Money; today: string }): PlannedPayment {
  return { periodNo: p.dayNo, fromDay: p.dayNo, toDay: p.dayNo, days: 1, amount: amountForDays(p.quantityPerDay, p.pricePerUnit, 1), dueDate: p.today };
}
