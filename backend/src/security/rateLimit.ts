import { env } from "../config/env";

/**
 * Rate limit arxitekturasi. Uch siyosat: global (barcha so'rovlar), auth (login/token, eng qattiq), write (o'zgartiruvchi amallar).
 * - Global limit app.ts da hamma route'ga qo'llanadi (IP bo'yicha, onRequest bosqichida: autentifikatsiyadan oldin).
 * - Route'ga siyosat: `{ config: routeLimit(policies.auth) }` ko'rinishida qo'shiladi.
 * - Bitta server uchun xotiradagi hisoblagich yetadi. Bir nechta nusxa (instance) bo'lsa @fastify/rate-limit'ning
 *   `redis` opsiyasi bilan umumiy saqlash ulanadi (siyosatlar o'zgarmaydi).
 * - Foydalanuvchi bo'yicha limit (autentifikatsiyadan keyin) keyingi bosqichda route preHandler sifatida qo'shiladi: `perUserKey`.
 */
export interface RateLimitPolicy {
  max: number;
  windowSec: number;
}

export type RateLimitPolicyName = "global" | "auth" | "write";

export function buildPolicies(cfg: {
  RATE_LIMIT_MAX: number;
  RATE_LIMIT_AUTH_MAX: number;
  RATE_LIMIT_WRITE_MAX: number;
  RATE_LIMIT_WINDOW_SEC: number;
}): Record<RateLimitPolicyName, RateLimitPolicy> {
  const windowSec = cfg.RATE_LIMIT_WINDOW_SEC;
  return {
    global: { max: cfg.RATE_LIMIT_MAX, windowSec },
    auth: { max: Math.min(cfg.RATE_LIMIT_AUTH_MAX, cfg.RATE_LIMIT_MAX), windowSec },
    write: { max: Math.min(cfg.RATE_LIMIT_WRITE_MAX, cfg.RATE_LIMIT_MAX), windowSec },
  };
}

/** Route opsiyasi: `app.get(path, { config: routeLimit(policy) }, handler)`. */
export const routeLimit = (policy: RateLimitPolicy) => ({
  rateLimit: { max: policy.max, timeWindow: policy.windowSec * 1000 },
});

/** Autentifikatsiyadan oldin kalit: IP. (trustProxy to'g'ri sozlangan bo'lishi shart.) */
export const ipKey = (request: { ip: string }): string => request.ip;
/** Autentifikatsiyadan keyin kalit: foydalanuvchi, bo'lmasa IP. */
export const perUserKey = (request: { ip: string; user?: { id: string } }): string => request.user?.id ?? request.ip;

export const policies = buildPolicies(env);
