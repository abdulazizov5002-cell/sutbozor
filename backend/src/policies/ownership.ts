import type { Contract, Dispute, Notification, Order, Payment, Product } from "../domain/entities";
import type { Scope } from "../repositories/ports";
import type { AuthUser } from "../types/fastify";
import { forbidden } from "../utils/errors";

/**
 * Egalik qoidalari (frontenddagi mavjud mantiqning serverdagi nusxasi):
 * biznes faqat o'z yozuvlarini, supplier faqat o'zi ishtirok etganini, admin hammasini ko'radi.
 * Har bir qoida ro'yxat uchun Scope (WHERE sharti) va bitta yozuv uchun canAccess sifatida beriladi.
 */
export function ownerScope(actor: AuthUser): Scope {
  if (actor.role === "admin") return {};
  if (actor.role === "business") {
    if (!actor.businessId) throw forbidden("Hisob biznesga biriktirilmagan.");
    return { businessId: actor.businessId };
  }
  if (!actor.supplierId) throw forbidden("Hisob supplierga biriktirilmagan.");
  return { supplierId: actor.supplierId };
}

type Party = { businessId: string; supplierId: string };

export const canAccessParty = (actor: AuthUser, x: Party): boolean =>
  actor.role === "admin" ||
  (actor.role === "business" && !!actor.businessId && x.businessId === actor.businessId) ||
  (actor.role === "supplier" && !!actor.supplierId && x.supplierId === actor.supplierId);

export const canAccessPayment = (actor: AuthUser, x: Payment): boolean => canAccessParty(actor, x);
export const canAccessContract = (actor: AuthUser, x: Contract): boolean => canAccessParty(actor, x);
export const canAccessDispute = (actor: AuthUser, x: Dispute): boolean => canAccessParty(actor, x);

export const canAccessOrder = (actor: AuthUser, o: Order): boolean =>
  actor.role === "admin" ||
  (actor.role === "business" && !!actor.businessId && o.businessId === actor.businessId) ||
  (actor.role === "supplier" && !!actor.supplierId && o.items.some((i) => i.supplierId === actor.supplierId));

/** Supplier buyurtmaning faqat o'z qismini ko'radi (boshqa supplierlar va narxlari yashiriladi). */
export const viewOrder = (actor: AuthUser, o: Order): Order =>
  actor.role === "supplier" ? { ...o, items: o.items.filter((i) => i.supplierId === actor.supplierId) } : o;

export const notificationScope = (actor: AuthUser): Scope => ({ userId: actor.id });
export const canAccessNotification = (actor: AuthUser, n: Notification): boolean => n.userId === actor.id;

/** Mahsulot: supplier faqat o'zinikini, biznes (bozor) hammasini ko'radi. */
export const productScope = (actor: AuthUser): Scope =>
  actor.role === "supplier" ? ownerScope(actor) : {};
export const canAccessProduct = (actor: AuthUser, p: Product): boolean =>
  actor.role !== "supplier" || (!!actor.supplierId && p.supplierId === actor.supplierId);
