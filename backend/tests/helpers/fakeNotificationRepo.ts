import type { Notification } from "../../src/domain/entities";
import type { NotificationRepository } from "../../src/repositories/ports";

/** Xotiradagi soxta bildirishnoma ombori (faqat testlar uchun). */
export function fakeNotificationRepo(seed: Notification[] = []) {
  const items = seed.map((n) => ({ ...n }));
  const repo: NotificationRepository = {
    async findById(id) { return items.find((n) => n.id === id) ?? null; },
    async list(scope, { page, limit }) {
      const rows = items.filter((n) => !scope.userId || n.userId === scope.userId);
      return { items: rows, total: rows.length, page, limit };
    },
    async markAllRead(userId) { let c = 0; for (const n of items) if (n.userId === userId && !n.read) { n.read = true; c++; } return c; },
    async markRead(userId, id) { const n = items.find((x) => x.id === id && x.userId === userId); if (!n) return false; n.read = true; return true; },
  };
  return { repo, items };
}

export const note = (id: string, userId: string, over: Partial<Notification> = {}): Notification => ({
  id, userId, type: "order.new", title: "Yangi buyurtma", message: "SB-1001", read: false, createdAt: "2026-10-15T00:00:00.000Z", ...over,
});
