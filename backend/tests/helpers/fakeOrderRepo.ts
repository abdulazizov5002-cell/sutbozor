import type { NewAuditLog, Order } from "../../src/domain/entities";
import type { NewNotification, Offering, OrderRepository, Recipient, Scope } from "../../src/repositories/ports";

/** Xotiradagi soxta buyurtma ombori (faqat testlar uchun): audit, bildirishnoma va uzatilgan shartlarni yozib boradi. */
export function fakeOrderRepo(seed: Order[] = [], offerings: (Offering & { product: string })[] = []) {
  const orders = [...seed];
  const audits: NewAuditLog[] = [];
  const notes: { recipient: Recipient | "suppliers"; content: NewNotification }[] = [];
  const transitions: unknown[] = [];
  const created: unknown[] = [];
  const scopes: Scope[] = [];
  let seq = 1000;
  const repo: OrderRepository = {
    async findById(id) { return orders.find((o) => o.id === id) ?? null; },
    async list(scope, { page, limit }) {
      scopes.push(scope);
      const rows = orders.filter((o) =>
        (!scope.businessId || o.businessId === scope.businessId) &&
        (!scope.supplierId || o.items.some((i) => i.supplierId === scope.supplierId)));
      return { items: rows, total: rows.length, page, limit };
    },
    async findOfferings(ids, product) {
      return offerings.filter((o) => o.product === product && ids.includes(o.supplierId))
        .map(({ supplierId, pricePerUnit, dailyCapacity }) => ({ supplierId, pricePerUnit, dailyCapacity }));
    },
    async create(input, hooks) {
      created.push(input);
      const n = ++seq;
      const order: Order = {
        id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, publicId: `SB-${n + 1}`, businessId: input.businessId,
        product: input.product, quantityPerDay: input.quantityPerDay, days: input.days, deliveryMode: input.deliveryMode,
        paymentSchedule: input.paymentSchedule, prepTime: input.prepTime, createdAt: "2026-10-15T00:00:00.000Z", updatedAt: "2026-10-15T00:00:00.000Z",
        items: input.items.map((i, k) => ({
          id: `00000000-0000-4000-9000-${String(n * 10 + k).padStart(12, "0")}`, orderId: "", supplierId: i.supplierId,
          quantityPerDay: i.quantityPerDay, pricePerUnit: i.pricePerUnit, status: "SENT", deliveryStatus: "SCHEDULED", daysDelivered: 0, contractId: null,
        })),
      };
      order.items.forEach((i) => { i.orderId = order.id; });
      orders.push(order);
      audits.push(hooks.audit(order));
      notes.push({ recipient: "suppliers", content: hooks.notify(order) });
      return order;
    },
    async transitionItem(input, hooks) {
      transitions.push(input);
      const o = orders.find((x) => x.id === input.orderId);
      const it = o?.items.find((i) => i.id === input.itemId);
      if (!o || !it || it.status !== "SENT") return null;
      if (input.supplierId && it.supplierId !== input.supplierId) return null;
      if (input.businessId && o.businessId !== input.businessId) return null;
      it.status = input.to;
      audits.push(hooks.audit(o));
      notes.push({ recipient: hooks.recipient, content: hooks.notify(o) });
      return o;
    },
  };
  return { repo, orders, audits, notes, transitions, created, scopes };
}

export const OFFER = (supplierId: string, product = "Sut", pricePerUnit = 12000, dailyCapacity = 10) =>
  ({ supplierId, product, pricePerUnit, dailyCapacity });
