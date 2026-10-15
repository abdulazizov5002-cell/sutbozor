import type { FastifyRequest } from "fastify";
import { actorOf } from "../middleware/auth";
import { idParamSchema, parse } from "../schemas/common";
import type { NotificationService } from "../services/notification.service";
import { ok } from "../utils/response";
import { entityController } from "./entity.controller";

/** Bildirishnomalar: umumiy o'qish + o'qilgan deb belgilash. */
export function notificationController(service: NotificationService) {
  return {
    ...entityController(service),
    markAllRead: async (request: FastifyRequest) => ok(await service.markAllRead(actorOf(request))),
    markRead: async (request: FastifyRequest) => ok(await service.markRead(actorOf(request), parse(idParamSchema, request.params).id)),
  };
}
export type NotificationController = ReturnType<typeof notificationController>;
