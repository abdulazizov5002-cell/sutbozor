import type { FastifyPluginAsync } from "fastify";
import type { MaintenanceController } from "../controllers/maintenance.controller";
import { policies, routeLimit } from "../security/rateLimit";

/**
 * /api/internal: faqat rejalashtirilgan ishlar uchun (foydalanuvchi tokeni emas, `x-cron-secret`).
 * POST /api/internal/overdue-sweep: muddati o'tgan to'lovlarni belgilaydi va xaridorga xabar beradi (bir necha marta chaqirish xavfsiz).
 */
export const internalRoutes =
  (controller: MaintenanceController): FastifyPluginAsync =>
  async (app) => {
    app.post("/overdue-sweep", { bodyLimit: 64, config: routeLimit(policies.write) }, controller.overdueSweep);
  };
