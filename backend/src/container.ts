import type { RegistrationStore, TelegramAccountStore, TelegramVerifier, TokenService } from "./auth/ports";
import { createUnimplementedTelegramVerifier } from "./auth/telegram/verifier";
import { createAuthController } from "./controllers/auth.controller";
import { disputeController } from "./controllers/dispute.controller";
import { maintenanceController } from "./controllers/maintenance.controller";
import { ratingController } from "./controllers/rating.controller";
import { entityController } from "./controllers/entity.controller";
import { orderController } from "./controllers/order.controller";
import { notificationController } from "./controllers/notification.controller";
import { paymentController } from "./controllers/payment.controller";
import { userController } from "./controllers/user.controller";
import { productController } from "./controllers/product.controller";
import { notImplementedRepositories } from "./repositories/notImplemented";
import type { Repositories } from "./repositories/ports";
import { createServices } from "./services";

/**
 * Composition root: repository -> service -> controller zanjiri shu yerda yig'iladi.
 * Database bosqichida Prisma repository'lari shu funksiyaga beriladi, boshqa kod o'zgarmaydi.
 */
export interface ContainerOptions {
  /** Keyingi bosqichda haqiqiy Telegram tasdiqlovchisi shu yerga beriladi. Standart: har doim 501 (fail-closed). */
  telegramVerifier?: TelegramVerifier;
  /** Telegram hisoblari ombori (Prisma). Berilmasa kirish 501. */
  telegramAccounts?: TelegramAccountStore;
  /** Sessiya tokenlari (JWT). Berilmasa kirish 501. */
  tokens?: TokenService;
  /** Ro'yxatdan o'tish ombori (Prisma). Berilmasa register 501. */
  registrations?: RegistrationStore;
  /** Cron sirri (CRON_SECRET). Berilmasa /api/internal/* 501. */
  cronSecret?: string;
}

export function buildContainer(repositories: Repositories = notImplementedRepositories(), options: ContainerOptions = {}) {
  const services = createServices(repositories);
  const controllers = {
    users: userController(services.users),
    businesses: entityController(services.businesses),
    suppliers: entityController(services.suppliers),
    products: productController(services.products),
    orders: orderController(services.orders),
    contracts: entityController(services.contracts),
    payments: paymentController(services.payments),
    disputes: disputeController(services.disputes),
    ratings: ratingController(services.ratings),
    notifications: notificationController(services.notifications),
    auditLogs: entityController(services.audit),
    maintenance: maintenanceController(services.maintenance, options.cronSecret),
    auth: createAuthController({
      telegramVerifier: options.telegramVerifier ?? createUnimplementedTelegramVerifier(),
      accounts: options.telegramAccounts,
      users: repositories.users,
      tokens: options.tokens,
      registrations: options.registrations,
    }),
  };
  return { services, controllers };
}

export type Container = ReturnType<typeof buildContainer>;
