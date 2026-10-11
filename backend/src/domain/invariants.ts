import { PLATFORM_COMMISSION_PERCENT } from "../config/constants";
import type { Payment } from "./entities";
import { isMoney } from "./money";

/**
 * 0% komissiya invarianti: platforma komissiya olmaydi, supplier to'liq summani oladi.
 * Payment yaratishda/yangilashda chaqiriladi; bazada ham CHECK constraint bilan takrorlanadi.
 * Buzilish bo'lsa sabab matni qaytadi, aks holda null.
 */
export function commissionViolation(
  p: Pick<Payment, "amount" | "grossAmount" | "platformCommission" | "supplierAmount">,
): string | null {
  if (![p.amount, p.grossAmount, p.platformCommission, p.supplierAmount].every(isMoney)) return "Summa butun va manfiy bo'lmasligi kerak.";
  if (PLATFORM_COMMISSION_PERCENT === 0 && p.platformCommission !== 0) return "Platforma komissiyasi 0 bo'lishi kerak.";
  if (p.grossAmount !== p.amount) return "grossAmount amount ga teng bo'lishi kerak.";
  if (p.supplierAmount !== p.grossAmount - p.platformCommission) return "supplierAmount = grossAmount - komissiya bo'lishi kerak.";
  return null;
}
