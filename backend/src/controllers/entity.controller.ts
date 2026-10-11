import type { FastifyRequest } from "fastify";
import { actorOf } from "../middleware/auth";
import { idParamSchema, paginationSchema, parse } from "../schemas/common";
import type { ReadService } from "../services/scopedRead.service";
import { ok } from "../utils/response";

/** Entity uchun umumiy o'qish controller'i: so'rovni tekshiradi, servisni chaqiradi, standart javob beradi. */
export function entityController<T>(service: ReadService<T>) {
  return {
    list: async (request: FastifyRequest) =>
      ok(await service.list(actorOf(request), parse(paginationSchema, request.query))),
    getById: async (request: FastifyRequest) =>
      ok(await service.getById(actorOf(request), parse(idParamSchema, request.params).id)),
  };
}
