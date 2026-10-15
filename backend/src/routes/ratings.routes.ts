import type { FastifyPluginAsync } from "fastify";
import type { RatingController } from "../controllers/rating.controller";
import { authenticate } from "../middleware/auth";
import { createRatingBody } from "../schemas/rating.schemas";
import { policies, routeLimit } from "../security/rateLimit";
import { validate } from "../validation/validate";

/** /api/ratings: POST (business/supplier yakunlangan buyurtma qismini baholaydi). GET yo'q: o'rtacha bal supplier/biznes yozuvida. */
export const ratingRoutes =
  (controller: RatingController): FastifyPluginAsync =>
  async (app) => {
    app.post("/", { bodyLimit: 2048, config: routeLimit(policies.write), preHandler: [authenticate, validate({ body: createRatingBody })] }, controller.create);
  };
