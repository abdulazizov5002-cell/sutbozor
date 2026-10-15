import type { FastifyRequest } from "fastify";
import { actorOf } from "../middleware/auth";
import { idParamSchema, parse } from "../schemas/common";
import type { UpdateUserStatusBody } from "../schemas/user.schemas";
import type { UserService } from "../services/user.service";
import { ok } from "../utils/response";
import { entityController } from "./entity.controller";

/** Foydalanuvchilar: umumiy o'qish + holat o'zgartirish (admin). Body route'dagi validate() dan o'tgan. */
export function userController(service: UserService) {
  return {
    ...entityController(service),
    setStatus: async (request: FastifyRequest) =>
      ok(await service.setStatus(actorOf(request), parse(idParamSchema, request.params).id, request.body as UpdateUserStatusBody)),
  };
}
export type UserController = ReturnType<typeof userController>;
