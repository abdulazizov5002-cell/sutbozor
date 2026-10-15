import type { Repositories } from "../repositories/ports";
import {
  canAccessContract, canAccessNotification,
  notificationScope, ownerScope,
} from "../policies/ownership";
import { createAuditService } from "./audit.service";
import { createDisputeService } from "./dispute.service";
import { createOrderService } from "./order.service";
import { createPaymentService } from "./payment.service";
import { createProductService } from "./product.service";
import { createScopedReadService } from "./scopedRead.service";
import { createUserService } from "./user.service";

/**
 * Entity servislari. O'qish hammasida (ruxsat + egalik bilan); yozish mahsulotlarda va buyurtmalarda.
 * Qolganlari (buyurtma, shartnoma, to'lov, nizo, bildirishnoma) keyingi bosqichlarda shu servislarga qo'shiladi.
 */
export function createServices(r: Repositories) {
  return {
    users: createUserService(r.users),
    businesses: createScopedReadService({ repo: r.businesses, anyOf: ["businesses.view"], scope: () => ({}), canAccess: () => true }),
    suppliers: createScopedReadService({ repo: r.suppliers, anyOf: ["suppliers.view", "market.view"], scope: () => ({}), canAccess: () => true }),
    products: createProductService(r.products),
    orders: createOrderService(r.orders),
    contracts: createScopedReadService({ repo: r.contracts, anyOf: ["contracts.view", "contracts.create"], scope: ownerScope, canAccess: canAccessContract }),
    payments: createPaymentService(r.payments),
    disputes: createDisputeService({ disputes: r.disputes, orders: r.orders, payments: r.payments, contracts: r.contracts }),
    notifications: createScopedReadService({ repo: r.notifications, anyOf: [], scope: notificationScope, canAccess: canAccessNotification }),
    audit: createAuditService(r.audit),
  };
}

export type Services = ReturnType<typeof createServices>;
