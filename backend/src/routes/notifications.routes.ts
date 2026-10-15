import type { FastifyPluginAsync } from "fastify";
import type { NotificationController } from "../controllers/notification.controller";
import { authenticate } from "../middleware/auth";
import { idParamSchema } from "../schemas/common";
import { strictObject } from "../schemas/primitives";
import { policies, routeLimit } from "../security/rateLimit";
import { validate } from "../validation/validate";
import { entityRoutes } from "./entity.routes";

const emptyBody = strictObject({});

/**
 * /api/notifications: GET (o'qish, faqat o'zinikini) + POST /read-all + POST /:id/read.
 * Tartib: autentifikatsiya (401) -> validatsiya (400) -> servis (404 begona/yo'q). Yozishga `write` limit.
 */
export const notificationRoutes =
  (controller: NotificationController): FastifyPluginAsync =>
  async (app) => {
    await app.register(entityRoutes(controller));
    app.post("/read-all", { bodyLimit: 64, config: routeLimit(policies.write), preHandler: [authenticate, validate({ body: emptyBody })] }, controller.markAllRead);
    app.post("/:id/read", { bodyLimit: 64, config: routeLimit(policies.write), preHandler: [authenticate, validate({ params: idParamSchema, body: emptyBody })] }, controller.markRead);
  };
