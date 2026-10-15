import type { FastifyReply, FastifyRequest } from "fastify";
import { actorOf } from "../middleware/auth";
import { idParamSchema, parse } from "../schemas/common";
import type { CreateProductBody, UpdateProductBody } from "../schemas/product.schemas";
import type { ProductService } from "../services/product.service";
import { ok } from "../utils/response";
import { entityController } from "./entity.controller";

/** Mahsulotlar: umumiy o'qish + yozish. Body route'dagi validate() dan o'tgan (strict, tozalangan). */
export function productController(service: ProductService) {
  return {
    ...entityController(service),
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      const product = await service.create(actorOf(request), request.body as CreateProductBody);
      reply.code(201);
      return ok(product);
    },
    update: async (request: FastifyRequest) =>
      ok(await service.update(actorOf(request), parse(idParamSchema, request.params).id, request.body as UpdateProductBody)),
    remove: async (request: FastifyRequest) => {
      const { id } = parse(idParamSchema, request.params);
      await service.remove(actorOf(request), id);
      return ok({ id });
    },
  };
}
export type ProductController = ReturnType<typeof productController>;
