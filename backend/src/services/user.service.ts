import type { User } from "../domain/entities";
import type { UserRepository } from "../repositories/ports";
import type { UpdateUserStatusBody } from "../schemas/user.schemas";
import type { AuthUser } from "../types/fastify";
import { conflict, forbidden, notFound } from "../utils/errors";
import { hasPermission } from "./permission.service";
import { createScopedReadService, type ReadService } from "./scopedRead.service";

export interface UserService extends ReadService<User> {
  setStatus(actor: AuthUser, id: string, input: UpdateUserStatusBody): Promise<User>;
}

/**
 * Foydalanuvchilar: o'qish (users.manage) + bloklash/faollashtirish (faqat admin, users.manage).
 * Himoya: o'zini bloklab bo'lmaydi, adminni bu yo'l bilan bloklab bo'lmaydi (tizimdan chiqib ketmaslik uchun).
 * Bloklangan foydalanuvchi keyingi so'rovdayoq 403 oladi: rol va holat har so'rovda bazadan o'qiladi.
 * Tartib: validatsiya (400) -> huquq (403) -> mavjudlik (404) -> qoida/holat (409).
 */
export function createUserService(repo: UserRepository): UserService {
  const reader = createScopedReadService<User>({ repo, anyOf: ["users.manage"], scope: () => ({}), canAccess: () => true });
  return {
    getById: reader.getById,
    list: reader.list,

    async setStatus(actor, id, input) {
      if (actor.status !== "ACTIVE") throw forbidden("Hisob faol emas.");
      if (actor.role !== "admin" || !hasPermission(actor.role, "users.manage")) throw forbidden();
      const target = await repo.findById(id);
      if (!target) throw notFound();
      if (target.id === actor.id) throw conflict("O'zingizning holatingizni o'zgartirib bo'lmaydi.");
      if (target.role === "admin") throw conflict("Adminning holatini bu yerdan o'zgartirib bo'lmaydi.");
      const stale = "Foydalanuvchining hozirgi holatida bu amalni qilib bo'lmaydi. Sahifani yangilang.";
      const blocking = input.status === "BLOCKED";
      const from = blocking ? (["ACTIVE", "PENDING"] as const) : (["BLOCKED", "PENDING"] as const);
      if (!(from as readonly string[]).includes(target.status)) throw conflict(stale);
      const updated = await repo.transitionStatus(
        { id, from: [...from], to: input.status, excludeRole: "admin" },
        {
          audit: (u) => ({
            actorId: actor.id, actorName: actor.name ?? actor.id, actorRole: actor.role,
            action: blocking ? "user.blocked" : "user.activated", objectType: "user", objectId: u.id,
            description: blocking ? `Foydalanuvchi bloklandi: ${u.name} (${u.role}). Sabab: ${input.reason}` : `Foydalanuvchi faollashtirildi: ${u.name} (${u.role})`,
          }),
        },
      );
      if (!updated) throw conflict(stale);
      return updated;
    },
  };
}
