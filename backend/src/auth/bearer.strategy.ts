import type { FastifyRequest } from "fastify";
import type { AuthStrategy } from "../middleware/auth";
import type { AuthUser } from "../types/fastify";
import type { SessionStore, TokenService, UserLookup } from "./ports";

/** Authorization: Bearer <token>. Qat'iy format: boshqa shakl yoki juda uzun qiymat darhol rad etiladi. */
const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]{10,4096})$/;

/**
 * Bearer token strategiyasi. Muhim: foydalanuvchining roli va HOLATI har so'rovda bazadan olinadi (tokendan emas),
 * shuning uchun bloklangan foydalanuvchi token amal qilishidan qat'i nazar darhol 403 oladi (authenticate() ACTIVE bo'lmaganni rad etadi).
 * Bekor qilingan sessiya (logout, bloklash) ham darhol o'tmaydi.
 * `null` qaytsa authenticate() 401 beradi. Kutilmagan xatolar (baza) yuqoriga chiqadi (500/503), 401 ga aylantirilmaydi.
 */
export function createBearerStrategy(deps: { tokens: TokenService; users: UserLookup; sessions?: SessionStore }): AuthStrategy {
  return {
    async authenticate(request: FastifyRequest): Promise<AuthUser | null> {
      const header = request.headers.authorization;
      if (typeof header !== "string") return null;
      const match = BEARER.exec(header);
      if (!match?.[1]) return null;

      const payload = await deps.tokens.verify(match[1]);
      if (!payload) return null;
      if (deps.sessions && !(await deps.sessions.isActive(payload.sessionId))) return null;

      const user = await deps.users.findById(payload.userId);
      if (!user) return null;
      return { id: user.id, name: user.name, role: user.role, status: user.status, businessId: user.businessId, supplierId: user.supplierId };
    },
  };
}
