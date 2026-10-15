import type { Notification } from "../domain/entities";
import { canAccessNotification, notificationScope } from "../policies/ownership";
import type { NotificationRepository } from "../repositories/ports";
import type { AuthUser } from "../types/fastify";
import { forbidden, notFound } from "../utils/errors";
import { createScopedReadService, type ReadService } from "./scopedRead.service";

export interface NotificationService extends ReadService<Notification> {
  markAllRead(actor: AuthUser): Promise<{ updated: number }>;
  markRead(actor: AuthUser, id: string): Promise<Notification>;
}

/**
 * Bildirishnomalar: foydalanuvchi faqat o'zinikini ko'radi va o'qilgan qiladi (begona yoki yo'q id -> 404, IDOR himoyasi).
 * Bildirishnomalarni yaratish boshqa servislarning (buyurtma, to'lov, nizo) tranzaksiyasi ichida bo'ladi, shu yerda yaratish yo'q.
 */
export function createNotificationService(repo: NotificationRepository): NotificationService {
  const reader = createScopedReadService<Notification>({ repo, anyOf: [], scope: notificationScope, canAccess: canAccessNotification });
  const guard = (actor: AuthUser): void => {
    if (actor.status !== "ACTIVE") throw forbidden("Hisob faol emas.");
  };
  return {
    getById: reader.getById,
    list: reader.list,
    async markAllRead(actor) {
      guard(actor);
      return { updated: await repo.markAllRead(actor.id) };
    },
    async markRead(actor, id) {
      guard(actor);
      const n = await repo.findById(id);
      if (!n || !canAccessNotification(actor, n)) throw notFound();
      if (n.read) return n;
      if (!(await repo.markRead(actor.id, id))) throw notFound();
      return { ...n, read: true };
    },
  };
}
