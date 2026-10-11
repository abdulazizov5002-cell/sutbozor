import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { authenticate } from "../middleware/auth";
import { idParamSchema, paginationSchema } from "../schemas/common";
import { validate } from "../validation/validate";

interface EntityController {
  list: (request: FastifyRequest) => Promise<unknown>;
  getById: (request: FastifyRequest) => Promise<unknown>;
}

/** GET / va GET /:id. Tartib: autentifikatsiya -> so'rov validatsiyasi (400) -> servis (ruxsat va egalik). */
export const entityRoutes =
  (controller: EntityController): FastifyPluginAsync =>
  async (app) => {
    app.get("/", { preHandler: [authenticate, validate({ query: paginationSchema })] }, controller.list);
    app.get("/:id", { preHandler: [authenticate, validate({ params: idParamSchema })] }, controller.getById);
  };
