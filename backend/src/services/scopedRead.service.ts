import type { Permission } from "../config/constants";
import type { ListParams, Page, ReadRepository, Scope } from "../repositories/ports";
import type { AuthUser } from "../types/fastify";
import { forbidden, notFound } from "../utils/errors";
import { hasAnyPermission } from "./permission.service";

export interface ReadService<T> {
  getById(actor: AuthUser, id: string): Promise<T>;
  list(actor: AuthUser, params: ListParams): Promise<Page<T>>;
}

export interface ScopedReadConfig<T> {
  repo: ReadRepository<T>;
  /** Kamida bittasi bo'lishi shart; bo'sh ro'yxat = faqat faol foydalanuvchi. */
  anyOf: readonly Permission[];
  /** Ro'yxat uchun egalik sharti (repository WHERE ga qo'shadi). */
  scope: (actor: AuthUser) => Scope;
  /** Bitta yozuv uchun egalik tekshiruvi. */
  canAccess: (actor: AuthUser, item: T) => boolean;
  /** Foydalanuvchiga ko'rsatiladigan shakl (masalan, supplier uchun yashirilgan qismlar). */
  view?: (actor: AuthUser, item: T) => T;
}

/**
 * Ruxsat + egalik tekshiruvi bilan o'qish servisi. Controller faqat shuni chaqiradi.
 * Boshqa odamning yozuvi uchun 404 qaytariladi (403 emas): yozuv mavjudligi sizib chiqmasligi uchun (IDOR himoyasi).
 */
export function createScopedReadService<T>(cfg: ScopedReadConfig<T>): ReadService<T> {
  const guard = (actor: AuthUser): void => {
    if (actor.status !== "ACTIVE") throw forbidden("Hisob faol emas.");
    if (!hasAnyPermission(actor.role, cfg.anyOf)) throw forbidden();
  };
  const show = (actor: AuthUser, item: T): T => (cfg.view ? cfg.view(actor, item) : item);

  return {
    async getById(actor, id) {
      guard(actor);
      const item = await cfg.repo.findById(id);
      if (!item || !cfg.canAccess(actor, item)) throw notFound();
      return show(actor, item);
    },
    async list(actor, params) {
      guard(actor);
      const page = await cfg.repo.list(cfg.scope(actor), params);
      return { ...page, items: page.items.map((i) => show(actor, i)) };
    },
  };
}
