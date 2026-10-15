import type { FastifyPluginAsync } from "fastify";
import type { OrderController } from "../controllers/order.controller";
import { authenticate } from "../middleware/auth";
import { createOrderBody, orderItemActionBody, orderItemParamsSchema } from "../schemas/order.schemas";
import { policies, routeLimit } from "../security/rateLimit";
import { validate } from "../validation/validate";
import { entityRoutes } from "./entity.routes";

/**
 * /api/orders: GET (o'qish) + POST (business yaratadi) + POST /:id/items/:itemId (accept/reject/cancel).
 * Tartib: autentifikatsiya (401) -> validatsiya (400) -> servis (huquq 403, egalik 404, holat 409). Yozishga `write` limit.
 */
export const orderRoutes =
  (controller: OrderController): FastifyPluginAsync =>
  async (app) => {
    await app.register(entityRoutes(controller));
    const config = routeLimit(policies.write);
    app.post("/", { bodyLimit: 4096, config, preHandler: [authenticate, validate({ body: createOrderBody })] }, controller.create);
    app.post(
      "/:id/items/:itemId",
      { bodyLimit: 2048, config, preHandler: [authenticate, validate({ params: orderItemParamsSchema, body: orderItemActionBody })] },
      controller.act,
    );
  };
