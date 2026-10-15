import type { FastifyReply, FastifyRequest } from "fastify";
import { actorOf } from "../middleware/auth";
import type { CreateRatingBody } from "../schemas/rating.schemas";
import type { RatingService } from "../services/rating.service";
import { ok } from "../utils/response";

/** Baholar: hozircha faqat yaratish (o'rtacha bal supplier/biznes yozuvida ko'rinadi). Body route'dagi validate() dan o'tgan. */
export function ratingController(service: RatingService) {
  return {
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      const created = await service.create(actorOf(request), request.body as CreateRatingBody);
      reply.code(201);
      return ok(created);
    },
  };
}
export type RatingController = ReturnType<typeof ratingController>;
