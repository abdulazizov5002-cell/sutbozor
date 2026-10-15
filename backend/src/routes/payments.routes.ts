import type { FastifyPluginAsync } from "fastify";
import type { PaymentController } from "../controllers/payment.controller";
import { authenticate } from "../middleware/auth";
import { idParamSchema } from "../schemas/common";
import { paymentActionBody } from "../schemas/payment.schemas";
import { policies, routeLimit } from "../security/rateLimit";
import { validate } from "../validation/validate";
import { entityRoutes } from "./entity.routes";

/**
 * /api/payments: GET (o'qish) + POST /:id (submit: business, confirm/reject: supplier).
 * Tartib: autentifikatsiya (401) -> validatsiya (400) -> servis (huquq 403, egalik 404, holat 409). Yozishga `write` limit.
 */
export const paymentRoutes =
  (controller: PaymentController): FastifyPluginAsync =>
  async (app) => {
    await app.register(entityRoutes(controller));
    app.post(
      "/:id",
      { bodyLimit: 2048, config: routeLimit(policies.write), preHandler: [authenticate, validate({ params: idParamSchema, body: paymentActionBody })] },
      controller.act,
    );
  };
