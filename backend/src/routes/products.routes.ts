import type { FastifyPluginAsync } from "fastify";
import type { ProductController } from "../controllers/product.controller";
import { authenticate } from "../middleware/auth";
import { idParamSchema } from "../schemas/common";
import { createProductBody, updateProductBody } from "../schemas/product.schemas";
import { policies, routeLimit } from "../security/rateLimit";
import { validate } from "../validation/validate";
import { entityRoutes } from "./entity.routes";

/**
 * /api/products: GET (umumiy o'qish) + POST/PATCH/DELETE (faqat supplier, servisda tekshiriladi).
 * Tartib: autentifikatsiya (401) -> validatsiya (400) -> servis (huquq 403, egalik 404). Yozishga `write` limit va kichik body (4 KB).
 */
export const productRoutes =
  (controller: ProductController): FastifyPluginAsync =>
  async (app) => {
    await app.register(entityRoutes(controller));
    const config = routeLimit(policies.write);
    app.post("/", { bodyLimit: 4096, config, preHandler: [authenticate, validate({ body: createProductBody })] }, controller.create);
    app.patch(
      "/:id",
      { bodyLimit: 4096, config, preHandler: [authenticate, validate({ params: idParamSchema, body: updateProductBody })] },
      controller.update,
    );
    app.delete("/:id", { config, preHandler: [authenticate, validate({ params: idParamSchema })] }, controller.remove);
  };
