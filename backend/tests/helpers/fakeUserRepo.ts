import type { NewAuditLog, User } from "../../src/domain/entities";
import type { UserRepository } from "../../src/repositories/ports";

/** Xotiradagi soxta foydalanuvchi ombori (faqat testlar uchun). */
export function fakeUserRepo(seed: User[] = []) {
  const items = seed.map((u) => ({ ...u }));
  const audits: NewAuditLog[] = [];
  const transitions: unknown[] = [];
  const repo: UserRepository = {
    async findById(id) { return items.find((u) => u.id === id) ?? null; },
    async list(_scope, { page, limit }) { return { items, total: items.length, page, limit }; },
    async transitionStatus(input, hooks) {
      transitions.push(input);
      const u = items.find((x) => x.id === input.id);
      if (!u || !input.from.includes(u.status) || u.role === input.excludeRole) return null;
      u.status = input.to;
      audits.push(hooks.audit(u));
      return u;
    },
  };
  return { repo, items, audits, transitions };
}

export const usr = (id: string, over: Partial<User> = {}): User => ({
  id, name: `Foydalanuvchi ${id.slice(-2)}`, phone: `+99890${id.slice(-7).replace(/\D/g, "0").padStart(7, "0")}`, email: null, role: "business",
  businessId: "bC", supplierId: null, status: "ACTIVE", createdAt: "2026-10-15T00:00:00.000Z", lastLoginAt: null, ...over,
});
