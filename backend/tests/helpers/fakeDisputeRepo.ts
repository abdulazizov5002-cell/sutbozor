import type { Dispute, NewAuditLog } from "../../src/domain/entities";
import type { DisputeRepository, NewDispute, NewNotification, Recipient, Scope } from "../../src/repositories/ports";
import { conflict } from "../../src/utils/errors";

/** Xotiradagi soxta nizo ombori (faqat testlar uchun). */
export function fakeDisputeRepo(seed: Dispute[] = []) {
  const items = [...seed];
  const audits: NewAuditLog[] = [];
  const notes: { recipients: Recipient[]; content: NewNotification }[] = [];
  const created: NewDispute[] = [];
  const transitions: unknown[] = [];
  const scopes: Scope[] = [];
  let seq = 1000;
  const repo: DisputeRepository = {
    async findById(id) { return items.find((d) => d.id === id) ?? null; },
    async list(scope, { page, limit }) {
      scopes.push(scope);
      const rows = items.filter((d) => (!scope.businessId || d.businessId === scope.businessId) && (!scope.supplierId || d.supplierId === scope.supplierId));
      return { items: rows, total: rows.length, page, limit };
    },
    async create(input, hooks) {
      created.push(input);
      if (items.some((d) => d.orderId === input.orderId && d.supplierId === input.supplierId && d.paymentId === input.paymentId && ["OPEN", "UNDER_REVIEW"].includes(d.status))) {
        throw conflict("Bu masala bo'yicha nizo allaqachon ochilgan va hali hal qilinmagan.");
      }
      const n = ++seq;
      const d: Dispute = {
        id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, publicId: `DS-${n}`, ...input, status: "OPEN",
        createdAt: "2026-10-15T00:00:00.000Z", resolvedAt: null, resolution: null, resolvedBy: null,
      };
      items.push(d);
      audits.push(hooks.audit(d));
      notes.push({ recipients: hooks.recipients, content: hooks.notify(d) });
      return d;
    },
    async transition(input, hooks) {
      transitions.push(input);
      const d = items.find((x) => x.id === input.id);
      if (!d || !input.from.includes(d.status)) return null;
      d.status = input.to;
      if (input.resolution !== undefined) d.resolution = input.resolution;
      if (input.resolvedBy !== undefined) d.resolvedBy = input.resolvedBy;
      if (input.to === "RESOLVED" || input.to === "REJECTED") d.resolvedAt = "2026-10-16T00:00:00.000Z";
      audits.push(hooks.audit(d));
      notes.push({ recipients: hooks.recipients, content: hooks.notify(d) });
      return d;
    },
  };
  return { repo, items, audits, notes, created, transitions, scopes };
}

export const dsp = (id: string, over: Partial<Dispute> = {}): Dispute => ({
  id, publicId: `DS-${id.slice(-4)}`, orderId: "00000000-0000-4000-8000-0000000000o1".replace("o", "0"), paymentId: null, contractId: null,
  openedBy: "business", openedById: "uC", businessId: "bC", supplierId: "sA", reason: "PAYMENT", description: "Pul tushmadi",
  status: "OPEN", createdAt: "2026-10-15T00:00:00.000Z", resolvedAt: null, resolution: null, resolvedBy: null, ...over,
});
