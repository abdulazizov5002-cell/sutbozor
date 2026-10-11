import type { TelegramVerifier } from "./auth/ports";
import { createUnimplementedTelegramVerifier } from "./auth/telegram/verifier";
import { createAuthController } from "./controllers/auth.controller";
import { entityController } from "./controllers/entity.controller";
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
}

export function buildContainer(repositories: Repositories = notImplementedRepositories(), options: ContainerOptions = {}) {
  const services = createServices(repositories);
  const controllers = {
    users: entityController(services.users),
    businesses: entityController(services.businesses),
    suppliers: entityController(services.suppliers),
    products: entityController(services.products),
    orders: entityController(services.orders),
    contracts: entityController(services.contracts),
    payments: entityController(services.payments),
    disputes: entityController(services.disputes),
    notifications: entityController(services.notifications),
    auditLogs: entityController(services.audit),
    auth: createAuthController({ telegramVerifier: options.telegramVerifier ?? createUnimplementedTelegramVerifier() }),
  };
  return { services, controllers };
}

export type Container = ReturnType<typeof buildContainer>;
