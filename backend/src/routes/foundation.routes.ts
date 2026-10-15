import type { FastifyPluginAsync } from "fastify";
import { API_MODULES, type ApiModule } from "../config/constants";
import type { Container } from "../container";
import { foundationController } from "../controllers/foundation.controller";
import { requireAuth, requireRole } from "../middleware/auth";
import { registerBody, telegramLoginBody } from "../schemas/auth.schemas";
import { policies, routeLimit } from "../security/rateLimit";
import { validate } from "../validation/validate";
import { entityRoutes } from "./entity.routes";
import { productRoutes } from "./products.routes";

/** Entity'siz modul (auth, admin): hozircha GET / faqat 501 NOT_IMPLEMENTED qaytaradi. */
export const moduleRoutes =
  (module: ApiModule, extra?: FastifyPluginAsync): FastifyPluginAsync =>
  async (app) => {
    // /api/auth: qattiq limit (parol tanlashdan himoya). Boshqa modullar global limitda.
    const config = module === "auth" ? routeLimit(policies.auth) : undefined;
    app.get("/", { config }, foundationController.notImplemented(module));
    if (extra) await app.register(extra);
  };

export const foundationRoutes =
  (c: Container): FastifyPluginAsync =>
  async (app) => {
    app.get("/", foundationController.index);
    const entities: Partial<Record<ApiModule, FastifyPluginAsync>> = {
      users: entityRoutes(c.controllers.users),
      businesses: entityRoutes(c.controllers.businesses),
      suppliers: entityRoutes(c.controllers.suppliers),
      products: productRoutes(c.controllers.products),
      orders: entityRoutes(c.controllers.orders),
      contracts: entityRoutes(c.controllers.contracts),
      payments: entityRoutes(c.controllers.payments),
      disputes: entityRoutes(c.controllers.disputes),
      notifications: entityRoutes(c.controllers.notifications),
    };
    for (const module of API_MODULES) {
      const routes = entities[module];
      if (routes) {
        await app.register(routes, { prefix: `/${module}` });
      } else if (module === "admin") {
        // Admin: audit log o'qish (audit.view). Dashboard va boshqalar keyingi bosqichda.
        const audit: FastifyPluginAsync = async (a) => {
          // Zanjirli himoya: butun admin sohasi faqat ADMIN roli uchun (permission tekshiruvi service'da qoladi).
          a.addHook("preHandler", requireRole("ADMIN"));
          await a.register(entityRoutes(c.controllers.auditLogs), { prefix: "/audit-logs" });
        };
        await app.register(moduleRoutes(module, audit), { prefix: `/${module}` });
      } else if (module === "auth") {
        const me: FastifyPluginAsync = async (a) => {
          a.get("/me", { preHandler: requireAuth(), config: routeLimit(policies.auth) }, c.controllers.auth.me);
          // Login ommaviy (token yo'q): qattiq limit, kichik body (8 KB), strict body (faqat initData).
          a.post(
            "/telegram",
            { bodyLimit: 8192, config: routeLimit(policies.auth), preHandler: validate({ body: telegramLoginBody }) },
            c.controllers.auth.telegramLogin,
          );
          // Ro'yxatdan o'tish ommaviy (initData bilan): qattiq limit, kichik body, strict body.
          a.post(
            "/register",
            { bodyLimit: 8192, config: routeLimit(policies.auth), preHandler: validate({ body: registerBody }) },
            c.controllers.auth.register,
          );
        };
        await app.register(moduleRoutes(module, me), { prefix: `/${module}` });
      } else {
        await app.register(moduleRoutes(module), { prefix: `/${module}` });
      }
    }
  };
