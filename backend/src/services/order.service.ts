import { PRODUCT_UNITS, type DeliveryMode, type DeliveryStatus, type NotificationType, type OrderItemStatus, type Permission, type ProductName } from "../config/constants";
import type { NewAuditLog, Order } from "../domain/entities";
import { canAccessOrder, ownerScope, viewOrder } from "../policies/ownership";
import type { NewNotification, OrderRepository } from "../repositories/ports";
import type { CreateOrderBody, OrderItemAction, OrderItemActionBody } from "../schemas/order.schemas";
import type { AuthUser } from "../types/fastify";
import { addDays, todayInBusinessZone } from "../utils/date";
import { badRequest, conflict, forbidden, notFound } from "../utils/errors";
import { hasPermission } from "./permission.service";
import { createScopedReadService, type ReadService } from "./scopedRead.service";

export interface OrderService extends ReadService<Order> {
  create(actor: AuthUser, input: CreateOrderBody): Promise<Order>;
  act(actor: AuthUser, orderId: string, itemId: string, input: OrderItemActionBody): Promise<Order>;
}

/** Bitta harakat qoidasi: kim, qaysi huquq bilan, qaysi holatdan qaysi holatga o'tkazadi. */
interface ActionSpec {
  who: "supplier" | "business";
  perm: Permission;
  status: OrderItemStatus;
  delivery?: DeliveryStatus;
  mode?: DeliveryMode;
  to: { status?: OrderItemStatus; deliveryStatus?: DeliveryStatus };
  /** accept: shartnoma yaratadi. */
  contract?: boolean;
  /** Yetkazish hisobi bosqichi (ports.ts: OrderItemTransition.delivery). */
  stage?: "mark" | "confirm" | "both";
  verb: string;
  note?: { type: NotificationType; title: string; text: string };
}
const ACTIONS: Record<OrderItemAction, ActionSpec> = {
  accept: { who: "supplier", perm: "orders.accept", status: "SENT", to: { status: "ACTIVE" }, contract: true, verb: "qabul qilindi",
    note: { type: "order.accepted", title: "Buyurtma qabul qilindi", text: "buyurtmangizni qabul qildi. Shartnoma yaratildi." } },
  reject: { who: "supplier", perm: "orders.reject", status: "SENT", to: { status: "CANCELLED" }, verb: "rad etildi",
    note: { type: "order.rejected", title: "Buyurtma rad etildi", text: "buyurtmangizni rad etdi." } },
  cancel: { who: "business", perm: "orders.create", status: "SENT", to: { status: "CANCELLED" }, verb: "bekor qilindi",
    note: { type: "order.cancelled", title: "Buyurtma bekor qilindi", text: "buyurtmani bekor qildi." } },
  prepare: { who: "supplier", perm: "delivery.update", status: "ACTIVE", delivery: "SCHEDULED", to: { deliveryStatus: "PREPARING" }, verb: "tayyorlash boshlandi" },
  ready: { who: "supplier", perm: "delivery.update", status: "ACTIVE", delivery: "PREPARING", to: { deliveryStatus: "READY" }, verb: "tayyor",
    note: { type: "delivery.ready", title: "Mahsulot tayyor", text: "mahsulot tayyor." } },
  depart: { who: "supplier", perm: "delivery.update", status: "ACTIVE", delivery: "READY", mode: "supplier", to: { deliveryStatus: "IN_TRANSIT" }, verb: "yo'lga chiqdi" },
  deliver: { who: "supplier", perm: "delivery.update", status: "ACTIVE", delivery: "IN_TRANSIT", mode: "supplier", to: { deliveryStatus: "DELIVERED" }, stage: "mark", verb: "yetkazildi (xaridor tasdig'i kutilmoqda)",
    note: { type: "delivery.done", title: "Mahsulot yetkazildi", text: "mahsulotni yetkazdi. Qabul qilganingizni tasdiqlang." } },
  receive: { who: "business", perm: "orders.create", status: "ACTIVE", delivery: "DELIVERED", to: {}, stage: "confirm", verb: "qabul qilindi",
    note: { type: "delivery.done", title: "Mahsulot qabul qilindi", text: "mahsulotni qabul qildi." } },
  pickup: { who: "business", perm: "orders.create", status: "ACTIVE", delivery: "READY", mode: "pickup", to: {}, stage: "both", verb: "olib ketildi",
    note: { type: "delivery.done", title: "Mahsulot olib ketildi", text: "mahsulotni olib ketdi." } },
  pause: { who: "supplier", perm: "delivery.update", status: "ACTIVE", delivery: "SCHEDULED", to: { status: "PAUSED" }, verb: "to'xtatildi",
    note: { type: "order.paused", title: "Yetkazish to'xtatildi", text: "yetkazishni to'xtatdi." } },
  resume: { who: "supplier", perm: "delivery.update", status: "PAUSED", to: { status: "ACTIVE" }, verb: "davom ettirildi",
    note: { type: "order.resumed", title: "Yetkazish davom etadi", text: "yetkazishni davom ettirdi." } },
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Buyurtmalar (D bosqichi): business supplierni o'zi tanlaydi; supplier o'z qismini qabul/rad etadi; business SENT qismini bekor qiladi.
 * Server qoidalari: narx HAR DOIM supplier mahsulotidan olinadi; miqdor kunlik hajmdan oshmaydi; faqat faol supplier;
 * begona buyurtma uchun 404; tartib: validatsiya (400) -> huquq (403) -> egalik (404) -> holat (409).
 * E bosqichi: qabul qilish shartnoma (CT-<n>) yaratadi; yetkazish kunlik sikl (tayyorlash -> tayyor -> yo'lda -> yetkazildi),
 * bir kunda bir marta; muddat tugagach qism va shartnoma COMPLETED. To'lov F bosqichida.
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
      const spec = ACTIONS[action];
      // Huquq (403): har harakat o'z roli va permissioniga ega.
      if (actor.status !== "ACTIVE") throw forbidden("Hisob faol emas.");
      if (!hasPermission(actor.role, spec.perm)) throw forbidden();
      const supplierSide = spec.who === "supplier";
      if (supplierSide ? !actor.supplierId : !actor.businessId) throw forbidden("Hisob biriktirilmagan.");

      // Egalik (404): begona yoki yo'q buyurtma/qism bir xil javob beradi.
      let order = await repo.findById(orderId);
      if (!order || !canAccessOrder(actor, order)) throw notFound();
      let item = order.items.find((i) => i.id === itemId);
      if (!item || (supplierSide && item.supplierId !== actor.supplierId)) throw notFound();

      const today = todayInBusinessZone();
      // Avtomatik tasdiqlash: xaridor yetkazilgan kunni o'sha kuni tasdiqlamagan bo'lsa, keyingi harakat oldidan kun hisobga olinadi.
      if (action !== "receive" && item.status === "ACTIVE" && item.deliveryStatus === "DELIVERED" && item.lastDeliveredOn && item.lastDeliveredOn < today) {
        const auto = await repo.transitionItem(
          {
            orderId, itemId, from: { status: "ACTIVE", deliveryStatus: "DELIVERED" }, to: {}, delivery: { today, stage: "confirm" },
            ...(supplierSide ? { supplierId: actor.supplierId! } : { businessId: actor.businessId! }),
          },
          {
            audit: (o) => audit(actor, "order.auto_receive", o, `Buyurtma ${o.publicId} qismi: yetkazish ${item!.lastDeliveredOn} kuni avtomatik tasdiqlandi`),
            recipient: {}, notify: () => null,
          },
        );
        if (auto) {
          order = auto;
          item = order.items.find((i) => i.id === itemId) ?? item;
        } else {
          // Poyga: boshqa so'rov allaqachon tasdiqlagan bo'lishi mumkin; yangi holatni o'qiymiz.
          order = (await repo.findById(orderId)) ?? order;
          item = order.items.find((i) => i.id === itemId) ?? item;
        }
      }

      // Holat (409)
      const stale = "Bu amal hozirgi holatda mumkin emas. Sahifani yangilang.";
      if (item.status !== spec.status || (spec.delivery && item.deliveryStatus !== spec.delivery)) throw conflict(stale);
      if (spec.mode && order.deliveryMode !== spec.mode) throw conflict("Bu amal buyurtmaning yetkazish turiga mos emas.");
      if ((spec.stage === "mark" || spec.stage === "both") && item.lastDeliveredOn === today) throw conflict("Bugungi yetkazish allaqachon qayd etilgan.");

      const who = actor.name ?? (supplierSide ? "Supplier" : "Biznes");
      const note = spec.note;
      const notify = (o: Order): NewNotification | null =>
        note ? { type: note.type, title: note.title, message: `${who} ${o.publicId}: ${note.text}${reason ? ` Sabab: ${reason}` : ""}` } : null;

      const updated = await repo.transitionItem(
        {
          orderId, itemId, from: { status: spec.status, ...(spec.delivery ? { deliveryStatus: spec.delivery } : {}) }, to: spec.to,
          ...(supplierSide ? { supplierId: actor.supplierId! } : { businessId: actor.businessId! }),
          ...(spec.contract ? { contract: { unit: PRODUCT_UNITS[order.product as ProductName], startDate: today, endDate: addDays(today, order.days - 1) } } : {}),
          ...(spec.stage ? { delivery: { today, stage: spec.stage } } : {}),
        },
        {
          audit: (o) => audit(actor, `order.${action}`, o, `Buyurtma ${o.publicId} qismi: ${spec.verb}${reason ? ` (${reason})` : ""}`),
          recipient: supplierSide ? { businessId: order.businessId } : { supplierId: item.supplierId },
          notify,
        },
      );
      if (!updated) throw conflict(stale);
      return viewOrder(actor, updated);
    },
  };
}
