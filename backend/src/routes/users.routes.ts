import type { FastifyPluginAsync } from "fastify";
import type { UserController } from "../controllers/user.controller";
import { authenticate } from "../middleware/auth";
import { idParamSchema } from "../schemas/common";
import { updateUserStatusBody } from "../schemas/user.schemas";
import { policies, routeLimit } from "../security/rateLimit";
import { validate } from "../validation/validate";
import { entityRoutes } from "./entity.routes";

/**
 * /api/users: GET (o'qish, admin) + POST /:id (admin bloklaydi/faollashtiradi).
 * Tartib: autentifikatsiya (401) -> validatsiya (400) -> servis (huquq 403, mavjudlik 404, qoida/holat 409). Yozishga `write` limit.
 */
export const userRoutes =
  (controller: UserController): FastifyPluginAsync =>
  async (app) => {
    await app.register(entityRoutes(controller));
    app.post(
      "/:id",
      { bodyLimit: 1024, config: routeLimit(policies.write), preHandler: [authenticate, validate({ params: idParamSchema, body: updateUserStatusBody })] },
      controller.setStatus,
    );
  };
