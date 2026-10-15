import type { NewAuditLog, Rating } from "../domain/entities";
import { canAccessOrder } from "../policies/ownership";
import type { NewNotification, OrderRepository, RatingRepository, Recipient } from "../repositories/ports";
import type { CreateRatingBody } from "../schemas/rating.schemas";
import type { AuthUser } from "../types/fastify";
import { conflict, forbidden, notFound } from "../utils/errors";
import { hasPermission } from "./permission.service";

export interface RatingService {
  create(actor: AuthUser, input: CreateRatingBody): Promise<Rating>;
}

/**
 * Baholash (G3). Faqat YAKUNLANGAN (COMPLETED) buyurtma qismi uchun: biznes supplierni, supplier biznesni baholaydi, har tomon bir marta.
 * Baholanuvchi va tomon serverda aktyor rolidan olinadi (bodyda yo'q). Tartib: 400 -> 403 -> 404 -> 409.
 */
export function createRatingService(d: { ratings: RatingRepository; orders: OrderRepository }): RatingService {
  return {
    async create(actor, input) {
      if (actor.status !== "ACTIVE") throw forbidden("Hisob faol emas.");
      if (actor.role !== "business" && actor.role !== "supplier") throw forbidden();
      if (!hasPermission(actor.role, "orders.view")) throw forbidden();

      const order = await d.orders.findById(input.orderId);
      if (!order || !canAccessOrder(actor, order)) throw notFound();
      const item = order.items.find((i) => i.id === input.itemId);
      if (!item) throw notFound();
      if (actor.role === "supplier" && item.supplierId !== actor.supplierId) throw notFound();
      if (item.status !== "COMPLETED") throw conflict("Baholash faqat yakunlangan buyurtma uchun mumkin.");

      const toSupplier = actor.role === "business";
      const recipient: Recipient = toSupplier ? { supplierId: item.supplierId } : { businessId: order.businessId };
      const who = actor.name ?? (toSupplier ? "Biznes" : "Supplier");
      return d.ratings.create(
        {
          orderItemId: item.id, side: toSupplier ? "TO_SUPPLIER" : "TO_BUSINESS", rateeId: toSupplier ? item.supplierId : order.businessId,
          score: input.score, comment: input.comment,
        },
        {
          audit: (x): NewAuditLog => ({
            actorId: actor.id, actorName: who, actorRole: actor.role, action: "rating.created", objectType: "rating", objectId: x.id,
            description: `${order.publicId} bo'yicha ${x.score}/5 baho berildi`,
          }),
          recipient,
          notify: (x): NewNotification => ({
            type: "rating.received", title: "Yangi baho",
            message: `${who}: ${order.publicId} bo'yicha sizni ${x.score}/5 deb baholadi.${x.comment ? ` Izoh: ${x.comment}` : ""}`,
          }),
        },
      );
    },
  };
}
