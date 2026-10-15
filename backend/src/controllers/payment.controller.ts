import type { FastifyRequest } from "fastify";
import { actorOf } from "../middleware/auth";
import { idParamSchema, parse } from "../schemas/common";
import type { PaymentActionBody } from "../schemas/payment.schemas";
import type { PaymentService } from "../services/payment.service";
import { ok } from "../utils/response";
import { entityController } from "./entity.controller";

/** To'lovlar: umumiy o'qish + harakat (submit/confirm/reject). Body route'dagi validate() dan o'tgan. */
export function paymentController(service: PaymentService) {
  return {
    ...entityController(service),
    act: async (request: FastifyRequest) =>
      ok(await service.act(actorOf(request), parse(idParamSchema, request.params).id, request.body as PaymentActionBody)),
  };
}
export type PaymentController = ReturnType<typeof paymentController>;
