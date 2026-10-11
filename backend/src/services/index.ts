import type { Repositories } from "../repositories/ports";
import {
  canAccessContract, canAccessDispute, canAccessNotification, canAccessOrder, canAccessPayment, canAccessProduct,
  notificationScope, ownerScope, productScope, viewOrder,
} from "../policies/ownership";
import { createAuditService } from "./audit.service";
import { createScopedReadService } from "./scopedRead.service";

/**
 * Entity servislari. Hozir faqat o'qish (ruxsat + egalik bilan). Yozish amallari (yaratish, holat o'tishlari)
 * keyingi bosqichlarda shu servislarga qo'shiladi: buyurtmalar, shartnomalar, to'lov, nizo, bildirishnoma.
 */
export function createServices(r: Repositories) {
  return {
    users: createScopedReadService({ repo: r.users, anyOf: ["users.manage"], scope: () => ({}), canAccess: () => true }),
    businesses: createScopedReadService({ repo: r.businesses, anyOf: ["businesses.view"], scope: () => ({}), canAccess: () => true }),
    suppliers: createScopedReadService({ repo: r.suppliers, anyOf: ["suppliers.view", "market.view"], scope: () => ({}), canAccess: () => true }),
    products: createScopedReadService({ repo: r.products, anyOf: ["market.view", "products.manage", "suppliers.view"], scope: productScope, canAccess: canAccessProduct }),
    orders: createScopedReadService({ repo: r.orders, anyOf: ["orders.view"], scope: ownerScope, canAccess: canAccessOrder, view: viewOrder }),
    contracts: createScopedReadService({ repo: r.contracts, anyOf: ["contracts.view", "contracts.create"], scope: ownerScope, canAccess: canAccessContract }),
    payments: createScopedReadService({ repo: r.payments, anyOf: ["payments.view"], scope: ownerScope, canAccess: canAccessPayment }),
    disputes: createScopedReadService({ repo: r.disputes, anyOf: ["disputes.manage", "disputes.create"], scope: ownerScope, canAccess: canAccessDispute }),
    notifications: createScopedReadService({ repo: r.notifications, anyOf: [], scope: notificationScope, canAccess: canAccessNotification }),
    audit: createAuditService(r.audit),
  };
}

export type Services = ReturnType<typeof createServices>;
