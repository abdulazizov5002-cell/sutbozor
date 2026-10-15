import type { FastifyPluginAsync } from "fastify";
import { healthController, readyController } from "../controllers/health.controller";

/** /api/health: server tirik. /api/ready: server + baza (monitoring uchun, `ping` berilmasa 503). */
export const healthRoutes =
  (ping?: () => Promise<void>): FastifyPluginAsync =>
  async (app) => {
    app.get("/health", healthController.get);
    app.get("/ready", readyController(ping).get);
  };
