import type { FastifyRequest } from "fastify";
import { ROLE_NAMES, type Permission, type RoleName } from "../config/constants";
import { hasPermission } from "../services/permission.service";
import type { AuthUser } from "../types/fastify";
import { AppError, ERROR_CODES, forbidden, unauthorized } from "../utils/errors";

/**
 * Authentication -> User -> Role -> Permission zanjiri.
 * Hozir hech qanday autentifikatsiya usuli ulanmagan. Telegram initData (keyingi bosqich) yoki JWT/session
 * shu interfeysni amalga oshiradi va setAuthStrategy() bilan ulanadi. Himoyalangan route'lar o'zgarmaydi.
 */
export interface AuthStrategy {
  /** So'rovdan foydalanuvchini aniqlaydi. Aniqlay olmasa null qaytaradi. */
  authenticate(request: FastifyRequest): Promise<AuthUser | null>;
}

let strategy: AuthStrategy | null = null;

export function setAuthStrategy(next: AuthStrategy): void {
  strategy = next;
}

export async function authenticate(request: FastifyRequest): Promise<AuthUser> {
  // Bir so'rovda ikki middleware (requireAuth + requireRole) bo'lsa, strategiya (baza) ikki marta chaqirilmasin.
  // request.user faqat shu funksiya tomonidan, ACTIVE tekshiruvidan keyin o'rnatiladi.
  if (request.user) return request.user;
  if (!strategy) {
    throw new AppError(501, ERROR_CODES.AUTH_NOT_CONFIGURED, "Autentifikatsiya hali sozlanmagan.");
  }
  const user = await strategy.authenticate(request);
  if (!user) throw unauthorized();
  if (user.status !== "ACTIVE") throw forbidden("Hisob faol emas.");
  request.user = user;
  return user;
}

/** Route preHandler: foydalanuvchi aniqlanadi va BARCHA kerakli permissionlarga ega bo'lishi shart. */
export function requirePermission(...needed: Permission[]) {
  return async (request: FastifyRequest): Promise<void> => {
    const user = await authenticate(request);
    if (!needed.every((p) => hasPermission(user.role, p))) throw forbidden();
  };
}

/** authenticate() ishlagandan keyin so'rov egasini qaytaradi. */
export function actorOf(request: FastifyRequest): AuthUser {
  if (!request.user) throw unauthorized();
  return request.user;
}

/**
 * requireAuth(): faqat autentifikatsiya. Tokensiz/yaroqsiz -> 401, hisob faol emas -> 403,
 * strategiya ulanmagan -> 501 (fail-closed: hech kim o'tmaydi).
 */
export const requireAuth = () => async (request: FastifyRequest): Promise<void> => {
  await authenticate(request);
};

/**
 * requireRole("ADMIN") / requireRole("BUSINESS", "SUPPLIER"): avval autentifikatsiya (401), keyin rol (403).
 * Rol HAR DOIM serverda aniqlangan AuthUser'dan olinadi (bazadagi User), so'rov tanasi, sarlavha yoki tokendagi da'vodan emas.
 * Noto'g'ri sozlash (bo'sh ro'yxat, noma'lum nom) route ro'yxatdan o'tayotganda xato beradi, ya'ni jim ochiq qolmaydi.
 * Rol huquqlarning o'rnini bosmaydi: egalik va permission tekshiruvlari service qatlamida qoladi.
 */
export function requireRole(...names: RoleName[]) {
  if (names.length === 0) throw new Error("requireRole: kamida bitta rol ko'rsatilishi shart.");
  const allowed = new Set<string>();
  for (const n of names) {
    const role = Object.hasOwn(ROLE_NAMES, n) ? ROLE_NAMES[n] : undefined;
    if (!role) throw new Error(`requireRole: noma'lum rol "${String(n)}".`);
    allowed.add(role);
  }
  return async (request: FastifyRequest): Promise<void> => {
    const user = await authenticate(request);
    if (!allowed.has(user.role)) throw forbidden();
  };
}
