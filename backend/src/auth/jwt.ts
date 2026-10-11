import { createHmac, timingSafeEqual } from "node:crypto";
import type { TokenPayload, TokenService } from "./ports";

/**
 * HS256 JWT, faqat node:crypto bilan (tashqi kutubxonasiz). Qat'iy qoidalar:
 *  - sarlavha aynan {"alg":"HS256","typ":"JWT"} bo'lishi shart: "none" yoki boshqa algoritm rad etiladi (algoritm almashtirish hujumi);
 *  - imzo doimiy vaqtda solishtiriladi;
 *  - da'volar: iss, sub (userId), sid (sessiya id), iat, exp. ROL tokenga YOZILMAYDI: u har so'rovda bazadan olinadi;
 *  - muddati o'tgan, kelajakda chiqarilgan (1 daqiqadan ortiq) yoki noto'g'ri shakldagi token -> null (401).
 * Kalit (JWT_SECRET) faqat muhit o'zgaruvchisidan. Kamida 32 belgi (env.ts tekshiradi, bu yerda ham).
 */
const ISSUER = "sutbozor";
const HEADER = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
const B64URL = /^[A-Za-z0-9_-]+$/;
const CLOCK_SKEW_SEC = 60;

export interface JwtOptions {
  secret: string;
  ttlSec: number;
  now?: () => number; // epoch, soniya (test uchun)
}

export function createJwtTokenService(options: JwtOptions): TokenService {
  if (typeof options.secret !== "string" || options.secret.length < 32) {
    throw new Error("createJwtTokenService: JWT_SECRET kamida 32 belgi bo'lishi kerak.");
  }
  if (!Number.isInteger(options.ttlSec) || options.ttlSec < 1) throw new Error("createJwtTokenService: ttlSec musbat butun son bo'lishi kerak.");
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const sign = (input: string) => createHmac("sha256", options.secret).update(input).digest();

  return {
    async issue(userId, sessionId) {
      const iat = now();
      const expiresAt = iat + options.ttlSec;
      const payload = Buffer.from(JSON.stringify({ iss: ISSUER, sub: userId, sid: sessionId, iat, exp: expiresAt })).toString("base64url");
      const unsigned = `${HEADER}.${payload}`;
      return { token: `${unsigned}.${sign(unsigned).toString("base64url")}`, expiresAt };
    },

    async verify(token): Promise<TokenPayload | null> {
      if (typeof token !== "string" || token.length > 4096) return null;
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const [h, p, s] = parts as [string, string, string];
      if (h !== HEADER || !B64URL.test(p) || !B64URL.test(s)) return null;

      const given = Buffer.from(s, "base64url");
      const expected = sign(`${h}.${p}`);
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

      let claims: unknown;
      try {
        claims = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
      } catch {
        return null;
      }
      if (typeof claims !== "object" || claims === null) return null;
      const c = claims as Record<string, unknown>;
      if (c.iss !== ISSUER || typeof c.sub !== "string" || typeof c.sid !== "string" || !c.sub || !c.sid) return null;
      if (!Number.isInteger(c.iat) || !Number.isInteger(c.exp)) return null;
      const iat = c.iat as number;
      const exp = c.exp as number;
      const t = now();
      if (exp <= t || iat > t + CLOCK_SKEW_SEC || exp <= iat) return null;
      return { userId: c.sub, sessionId: c.sid, expiresAt: exp };
    },
  };
}
