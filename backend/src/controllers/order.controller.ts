import type { FastifyReply, FastifyRequest } from "fastify";
import { actorOf } from "../middleware/auth";
import { parse } from "../schemas/common";
import { orderItemParamsSchema, type CreateOrderBody, type OrderItemActionBody } from "../schemas/order.schemas";
import type { OrderService } from "../services/order.service";
import { ok } from "../utils/response";
import { entityController } from "./entity.controller";

/** Buyurtmalar: umumiy o'qish + yaratish + qism ustida harakat. Body route'dagi validate() dan o'tgan. */
export function orderController(service: OrderService) {
  return {
    ...entityController(service),
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      const order = await service.create(actorOf(request), request.body as CreateOrderBody);
      reply.code(201);
      return ok(order);
    },
    act: async (request: FastifyRequest) => {
      const { id, itemId } = parse(orderItemParamsSchema, request.params);
      return ok(await service.act(actorOf(request), id, itemId, request.body as OrderItemActionBody));
    },
  };
}
export type OrderController = ReturnType<typeof orderController>;
