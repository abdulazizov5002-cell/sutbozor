import type { NewAuditLog, Payment } from "../domain/entities";
import { canAccessPayment, ownerScope } from "../policies/ownership";
import type { NewNotification, PaymentRepository } from "../repositories/ports";
import type { PaymentActionBody } from "../schemas/payment.schemas";
import type { AuthUser } from "../types/fastify";
import { todayInBusinessZone } from "../utils/date";
import { conflict, forbidden, notFound } from "../utils/errors";
import { hasPermission } from "./permission.service";
import { createScopedReadService, type ReadService } from "./scopedRead.service";

export interface PaymentService extends ReadService<Payment> {
  act(actor: AuthUser, id: string, input: PaymentActionBody): Promise<Payment>;
}

const som = (n: number): string => n.toLocaleString("ru-RU").replace(/ /g, " ");

/**
 * To'lovlar (F bosqichi): faqat YOZIB BORISH. SutBozor pul ushlab turmaydi va hech qanday gateway yo'q.
 * To'lov yozuvlarini server yaratadi (shartnoma faollashganda jadval, yoki har yetkazilgan kun uchun); mijoz summa yubormaydi.
 * Holatlar: PENDING|OVERDUE|DISPUTED -> (business submit) PAYMENT_SUBMITTED -> (supplier confirm) PAID, yoki (supplier reject) DISPUTED.
 * Tartib: validatsiya (400) -> huquq (403) -> egalik (404) -> holat (409). Muddati o'tganlar o'qishdan oldin OVERDUE qilinadi (lazy).
 */
export function createPaymentService(repo: PaymentRepository): PaymentService {
  const reader = createScopedReadService<Payment>({
    repo, anyOf: ["payments.view"], scope: ownerScope, canAccess: canAccessPayment,
  });
  const refreshOverdue = async (): Promise<void> => {
    try { await repo.markOverdue(todayInBusinessZone()); } catch { /* o'qish baribir ishlashi kerak; keyingi o'qishda qayta uriniladi */ }
  };
  const audit = (actor: AuthUser, action: string, p: Payment, description: string): NewAuditLog => ({
    actorId: actor.id, actorName: actor.name ?? actor.id, actorRole: actor.role, action, objectType: "payment", objectId: p.id, description,
  });

  return {
    async getById(actor, id) { await refreshOverdue(); return reader.getById(actor, id); },
    async list(actor, params) { await refreshOverdue(); return reader.list(actor, params); },

    async act(actor, id, input) {
      const supplierSide = input.action !== "submit";
      if (actor.status !== "ACTIVE") throw forbidden("Hisob faol emas.");
      if (!hasPermission(actor.role, supplierSide ? "payments.confirm" : "payments.submit")) throw forbidden();
      if (supplierSide ? !actor.supplierId : !actor.businessId) throw forbidden("Hisob biriktirilmagan.");

      const payment = await repo.findById(id);
      if (!payment || !canAccessPayment(actor, payment)) throw notFound();
      // Faqat o'z to'lovi: business o'zining, supplier o'zining (admin bu yerda harakat qila olmaydi: huquqi yo'q).
      if (supplierSide ? payment.supplierId !== actor.supplierId : payment.businessId !== actor.businessId) throw notFound();

      const stale = "Bu to'lovga hozirgi holatda bu amalni qilib bo'lmaydi. Sahifani yangilang.";
      const who = actor.name ?? (supplierSide ? "Supplier" : "Biznes");
      const label = `${payment.publicId} (${som(payment.amount)} so'm)`;
      const common = supplierSide ? { supplierId: actor.supplierId! } : { businessId: actor.businessId! };
      const recipient = supplierSide ? { businessId: payment.businessId } : { supplierId: payment.supplierId };

      if (input.action === "submit") {
        if (!["PENDING", "OVERDUE", "DISPUTED"].includes(payment.status)) throw conflict(stale);
        const updated = await repo.transition(
          {
            id, from: ["PENDING", "OVERDUE", "DISPUTED"], to: "PAYMENT_SUBMITTED", ...common,
            set: { paymentMethod: input.method, transactionId: input.transactionId, paidAt: input.paidOn, note: input.note },
          },
          {
            audit: (p) => audit(actor, "payment.submitted", p, `To'lov ${label}: "To'lov qildim" (${input.method}, ${input.transactionId})`),
            recipient,
            notify: (p): NewNotification => ({
              type: "payment.submitted", title: "To'lov amalga oshirildi",
              message: `${who}: ${p.publicId} uchun ${som(p.amount)} so'm to'lov qildim dedi. Pul kelgan bo'lsa tasdiqlang.`,
            }),
          },
        );
        if (!updated) throw conflict(stale);
        return updated;
      }

      if (payment.status !== "PAYMENT_SUBMITTED") throw conflict("Faqat xaridor yuborgan to'lovni tasdiqlash yoki rad etish mumkin.");
      if (input.action === "confirm") {
        const updated = await repo.transition(
          { id, from: ["PAYMENT_SUBMITTED"], to: "PAID", ...common },
          {
            audit: (p) => audit(actor, "payment.paid", p, `To'lov ${label}: pul kelgani tasdiqlandi`),
            recipient,
            notify: (p): NewNotification => ({
              type: "payment.confirmed", title: "To'lov tasdiqlandi", message: `${who}: ${p.publicId} to'lovi tasdiqlandi.`,
            }),
          },
        );
        if (!updated) throw conflict(stale);
        return updated;
      }
      const updated = await repo.transition(
        { id, from: ["PAYMENT_SUBMITTED"], to: "DISPUTED", ...common, set: { note: input.reason } },
        {
          audit: (p) => audit(actor, "payment.rejected", p, `To'lov ${label}: pul kelmadi (${input.reason})`),
          recipient,
          notify: (p): NewNotification => ({
            type: "payment.rejected", title: "To'lov tasdiqlanmadi",
            message: `${who}: ${p.publicId} uchun pul kelmadi. Sabab: ${input.reason}. Tekshirib, qayta yuboring.`,
          }),
        },
      );
      if (!updated) throw conflict(stale);
      return updated;
    },
  };
}
