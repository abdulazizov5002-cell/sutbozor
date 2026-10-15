import type { PaymentRepository } from "../repositories/ports";
import { todayInBusinessZone } from "../utils/date";

export interface MaintenanceService {
  /** Muddati o'tgan to'lovlarni OVERDUE qiladi (+ bildirishnoma, audit). O'zgargan sonni qaytaradi. */
  sweepOverduePayments(): Promise<{ overdue: number }>;
}

/** Rejalashtirilgan ishlar (Render Cron Job chaqiradi). Biznes mantig'i repository'da, bu yerda faqat sana (Asia/Tashkent) beriladi. */
export function createMaintenanceService(d: { payments: PaymentRepository }): MaintenanceService {
  return {
    async sweepOverduePayments() {
      return { overdue: await d.payments.markOverdue(todayInBusinessZone()) };
    },
  };
}
