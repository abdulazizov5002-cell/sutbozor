import type { FastifyReply, FastifyRequest } from "fastify";
import { actorOf } from "../middleware/auth";
import { idParamSchema, parse } from "../schemas/common";
import type { OpenDisputeBody } from "../schemas/dispute.schemas";
import type { DisputeService, DisputeUpdate } from "../services/dispute.service";
import { ok } from "../utils/response";
import { entityController } from "./entity.controller";

/** Nizolar: umumiy o'qish + ochish (business/supplier) + holat o'zgartirish (admin). Body route'dagi validate() dan o'tgan. */
export function disputeController(service: DisputeService) {
  return {
    ...entityController(service),
    open: async (request: FastifyRequest, reply: FastifyReply) => {
      const created = await service.open(actorOf(request), request.body as OpenDisputeBody);
      reply.code(201);
      return ok(created);
    },
    update: async (request: FastifyRequest) =>
      ok(await service.update(actorOf(request), parse(idParamSchema, request.params).id, request.body as DisputeUpdate)),
  };
}
export type DisputeController = ReturnType<typeof disputeController>;
