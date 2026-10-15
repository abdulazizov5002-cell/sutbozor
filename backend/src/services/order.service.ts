import type { NewAuditLog, Order } from "../domain/entities";
import { canAccessOrder, ownerScope, viewOrder } from "../policies/ownership";
import type { NewNotification, OrderRepository } from "../repositories/ports";
import type { CreateOrderBody, OrderItemActionBody } from "../schemas/order.schemas";
import type { AuthUser } from "../types/fastify";
import { badRequest, conflict, forbidden, notFound } from "../utils/errors";
import { hasPermission } from "./permission.service";
import { createScopedReadService, type ReadService } from "./scopedRead.service";

export interface OrderService extends ReadService<Order> {
  create(actor: AuthUser, input: CreateOrderBody): Promise<Order>;
  act(actor: AuthUser, orderId: string, itemId: string, input: OrderItemActionBody): Promise<Order>;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Buyurtmalar (D bosqichi): business supplierni o'zi tanlaydi; supplier o'z qismini qabul/rad etadi; business SENT qismini bekor qiladi.
 * Server qoidalari: narx HAR DOIM supplier mahsulotidan olinadi; miqdor kunlik hajmdan oshmaydi; faqat faol supplier;
 * begona buyurtma uchun 404; tartib: validatsiya (400) -> huquq (403) -> egalik (404) -> holat (409).
 * Shartnoma, yetkazish va to'lov E/F bosqichlarida (qabul qilish hozircha faqat holatni ACTIVE qiladi).
 */
export function createOrderService(repo: OrderRepository): OrderService {
  const reader = createScopedReadService<Order>({
    repo, anyOf: ["orders.view"], scope: ownerScope, canAccess: canAccessOrder, view: viewOrder,
  });
  const audit = (actor: AuthUser, action: string, o: Order, description: string): NewAuditLog => ({
    actorId: actor.id, actorName: actor.name ?? actor.id, actorRole: actor.role, action, objectType: "order", objectId: o.id, description,
  });

  return {
    ...reader,
    async create(actor, input) {
      if (actor.status !== "ACTIVE") throw forbidden("Hisob faol emas.");
      if (!hasPermission(actor.role, "orders.create")) throw forbidden();
      if (!actor.businessId) throw forbidden("Hisob biznesga biriktirilmagan.");

      const offerings = await repo.findOfferings(input.items.map((i) => i.supplierId), input.product);
      const byId = new Map(offerings.map((o) => [o.supplierId, o]));
      const items = input.items.map((it) => {
        const offer = byId.get(it.supplierId);
        if (!offer) {
          throw badRequest("Tanlangan supplier bu mahsulotni taklif qilmaydi yoki faol emas.", { supplierId: it.supplierId });
        }
        if (it.quantityPerDay > offer.dailyCapacity) {
          throw badRequest(`Miqdor supplierning kunlik hajmidan (${offer.dailyCapacity}) oshib ketdi.`, { supplierId: it.supplierId });
        }
        return { supplierId: it.supplierId, quantityPerDay: it.quantityPerDay, pricePerUnit: offer.pricePerUnit };
      });
      const total = round2(items.reduce((sum, i) => sum + i.quantityPerDay, 0));
      const who = actor.name ?? "Biznes";

      return repo.create(
        {
          businessId: actor.businessId, product: input.product, quantityPerDay: total, days: input.days,
          deliveryMode: input.deliveryMode, paymentSchedule: input.paymentSchedule, prepTime: input.prepTime, items,
        },
        {
          audit: (o) => audit(actor, "order.create", o, `Buyurtma ${o.publicId}: ${o.product}, ${items.length} ta supplier, ${o.days} kun`),
          notify: (o): NewNotification => ({
            type: "order.new", title: "Yangi buyurtma",
            message: `${who} dan yangi buyurtma ${o.publicId}: ${o.product}, ${o.days} kun. Qabul qiling yoki rad eting.`,
          }),
        },
      );
    },

    async act(actor, orderId, itemId, input) {
      const { action, reason } = input;
      // Huquq (403): accept/reject faqat supplier, cancel faqat business.
      const needed = action === "accept" ? "orders.accept" : action === "reject" ? "orders.reject" : "orders.create";
      if (actor.status !== "ACTIVE") throw forbidden("Hisob faol emas.");
      if (!hasPermission(actor.role, needed)) throw forbidden();
      const isSupplierAction = action !== "cancel";
      if (isSupplierAction ? !actor.supplierId : !actor.businessId) throw forbidden("Hisob biriktirilmagan.");

      // Egalik (404): begona yoki yo'q buyurtma/qism bir xil javob beradi.
      const order = await repo.findById(orderId);
      if (!order || !canAccessOrder(actor, order)) throw notFound();
      const item = order.items.find((i) => i.id === itemId);
      if (!item || (isSupplierAction && item.supplierId !== actor.supplierId)) throw notFound();

      // Holat (409)
      if (item.status !== "SENT") throw conflict("Bu qism allaqachon ko'rib chiqilgan. Sahifani yangilang.");

      const who = actor.name ?? (isSupplierAction ? "Supplier" : "Biznes");
      const verb = { accept: "qabul qildi", reject: "rad etdi", cancel: "bekor qildi" }[action];
      const notify = (o: Order): NewNotification => ({
        type: action === "accept" ? "order.accepted" : action === "reject" ? "order.rejected" : "order.cancelled",
        title: action === "accept" ? "Buyurtma qabul qilindi" : action === "reject" ? "Buyurtma rad etildi" : "Buyurtma bekor qilindi",
        message: `${who} ${o.publicId} buyurtmasini ${verb}.${reason ? ` Sabab: ${reason}` : ""}`,
      });

      const updated = await repo.transitionItem(
        {
          orderId, itemId, to: action === "accept" ? "ACTIVE" : "CANCELLED",
          ...(isSupplierAction ? { supplierId: actor.supplierId! } : { businessId: actor.businessId! }),
        },
        {
          audit: (o) => audit(actor, `order.${action}`, o, `Buyurtma ${o.publicId} qismi: ${verb}${reason ? ` (${reason})` : ""}`),
          recipient: isSupplierAction ? { businessId: order.businessId } : { supplierId: item.supplierId },
          notify,
        },
      );
      if (!updated) throw conflict("Bu qism allaqachon ko'rib chiqilgan. Sahifani yangilang.");
      return viewOrder(actor, updated);
    },
  };
}
