import type { NewAuditLog, Payment } from "../../src/domain/entities";
import type { NewNotification, PaymentRepository, Recipient, Scope } from "../../src/repositories/ports";
import { conflict } from "../../src/utils/errors";

/** Xotiradagi soxta to'lov ombori (faqat testlar uchun). */
export function fakePaymentRepo(seed: Payment[] = []) {
  const items = [...seed];
  const audits: NewAuditLog[] = [];
  const notes: { recipient: Recipient; content: NewNotification }[] = [];
  const overdueCalls: string[] = [];
  const transitions: unknown[] = [];
  const scopes: Scope[] = [];
  const repo: PaymentRepository = {
    async findById(id) { return items.find((p) => p.id === id) ?? null; },
    async list(scope, { page, limit }) {
      scopes.push(scope);
      const rows = items.filter((p) => (!scope.businessId || p.businessId === scope.businessId) && (!scope.supplierId || p.supplierId === scope.supplierId));
      return { items: rows, total: rows.length, page, limit };
    },
    async markOverdue(today) {
      overdueCalls.push(today);
      let n = 0;
      for (const p of items) if (p.status === "PENDING" && p.dueDate < today) { p.status = "OVERDUE"; n++; }
      return n;
    },
    async transition(input, hooks) {
      transitions.push(input);
      const p = items.find((x) => x.id === input.id);
      if (!p || !input.from.includes(p.status)) return null;
      if (input.businessId && p.businessId !== input.businessId) return null;
      if (input.supplierId && p.supplierId !== input.supplierId) return null;
      if (input.set?.transactionId && items.some((x) => x.id !== p.id && x.transactionId === input.set!.transactionId)) {
        throw conflict("Bu tranzaksiya raqami allaqachon boshqa to'lov uchun ishlatilgan.");
      }
      p.status = input.to;
      if (input.set?.paymentMethod !== undefined) p.paymentMethod = input.set.paymentMethod;
      if (input.set?.transactionId !== undefined) p.transactionId = input.set.transactionId;
      if (input.set?.paidAt !== undefined) p.paidAt = input.set.paidAt;
      if (input.set?.note !== undefined) p.note = input.set.note;
      audits.push(hooks.audit(p));
      notes.push({ recipient: hooks.recipient, content: hooks.notify(p) });
      return p;
    },
  };
  return { repo, items, audits, notes, overdueCalls, transitions, scopes };
}

export const pay = (id: string, over: Partial<Payment> = {}): Payment => ({
  id, publicId: `PAY-${id.slice(-4)}`, orderId: "o1", contractId: "c1", businessId: "bC", supplierId: "sA", amount: 180000, currency: "UZS",
  paymentPeriod: "WEEKLY", periodNo: 1, fromDay: 1, toDay: 7, days: 7, dueDate: "2999-01-01", paidAt: null, paymentMethod: null, transactionId: null,
  status: "PENDING", note: "", platformCommission: 0, grossAmount: 180000, supplierAmount: 180000, createdAt: "2026-10-15T00:00:00.000Z", updatedAt: "2026-10-15T00:00:00.000Z", ...over,
});
