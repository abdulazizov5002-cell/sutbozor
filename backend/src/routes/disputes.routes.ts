import type { FastifyPluginAsync } from "fastify";
import type { DisputeController } from "../controllers/dispute.controller";
import { authenticate } from "../middleware/auth";
import { idParamSchema } from "../schemas/common";
import { openDisputeBody, updateDisputeStatusBody } from "../schemas/dispute.schemas";
import { policies, routeLimit } from "../security/rateLimit";
import { validate } from "../validation/validate";
import { entityRoutes } from "./entity.routes";

/**
 * /api/disputes: GET (o'qish) + POST (business/supplier nizo ochadi) + POST /:id (admin holatni o'zgartiradi).
 * Tartib: autentifikatsiya (401) -> validatsiya (400) -> servis (huquq 403, egalik 404, holat 409). Yozishga `write` limit.
 */
export const disputeRoutes =
  (controller: DisputeController): FastifyPluginAsync =>
  async (app) => {
    await app.register(entityRoutes(controller));
    app.post("/", { bodyLimit: 4096, config: routeLimit(policies.write), preHandler: [authenticate, validate({ body: openDisputeBody })] }, controller.open);
    app.post(
      "/:id",
      { bodyLimit: 2048, config: routeLimit(policies.write), preHandler: [authenticate, validate({ params: idParamSchema, body: updateDisputeStatusBody })] },
      controller.update,
    );
  };
