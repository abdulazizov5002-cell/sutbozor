import type { FastifyReply, FastifyRequest } from "fastify";
import { LOG_REDACT_PATHS } from "../security/config";
import { scrub, scrubString, sanitizeUrl, serializeError } from "./redact";

/**
 * Pino sozlamalari. Asosiy qoida: so'rov TANASI, SARLAVHALARI va javob tanasi hech qachon log'ga yozilmaydi.
 * Log'ga faqat: so'rov id, usul, marshrut shabloni, tozalangan yo'l, status, davomiylik, (kirgan bo'lsa) userId va rol.
 * Qo'shimcha himoya: har qanday log chaqiruvi (obyekt, matn, xato) logMethod hook'ida tozalanadi.
 */
export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

export function buildLoggerOptions(level: LogLevel) {
  return {
    level,
    redact: { paths: LOG_REDACT_PATHS, censor: "[REDACTED]" },
    serializers: {
      err: serializeError,
      // Fastify ichki xabarlari uchun: sarlavha/tana kirmaydi.
      req: (req: { method?: string; url?: string; id?: string }) => ({ id: req.id, method: req.method, url: sanitizeUrl(req.url) }),
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
    },
    hooks: {
      // Turlar ataylab `any`: pino'ning LogFn (ko'p imzoli) turi qat'iy imzo bilan mos kelmasligi mumkin; mantiq pastda tekshiriladi.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logMethod(this: any, args: any[], method: (...a: any[]) => void) {
        const next = args.map((a, i) => {
          if (a instanceof Error) return i === 0 ? { err: a } : serializeError(a);
          if (typeof a === "string") return scrubString(a);
          if (a && typeof a === "object") {
            // req/res/err ni serializer'lar qayta ishlaydi (xom Fastify obyektlarini aylanib chiqmaymiz). Qolgan hammasi tozalanadi.
            const { req, res, err, ...rest } = a as Record<string, unknown>;
            return {
              ...(scrub(rest) as Record<string, unknown>),
              ...(req !== undefined ? { req } : {}),
              ...(res !== undefined ? { res } : {}),
              ...(err !== undefined ? { err: err instanceof Error ? err : scrub(err) } : {}),
            };
          }
          return a;
        });
        return method.apply(this, next);
      },
    },
  };
}

/** Har so'rov tugaganda BITTA xavfsiz yozuv. Fastify'ning o'zining req/res yozuvlari o'chiriladi (disableRequestLogging). */
export function logRequestCompleted(request: FastifyRequest, reply: FastifyReply): void {
  const user = request.user;
  const level = reply.statusCode >= 500 ? "error" : reply.statusCode >= 400 ? "warn" : "info";
  request.log[level](
    {
      event: "request.completed",
      method: request.method,
      // Marshrut shabloni (/api/orders/:id) tanlanadi: haqiqiy ID'lar va query log'ga tushmaydi. Topilmasa tozalangan yo'l.
      route: request.routeOptions?.url ?? sanitizeUrl(request.url).split("?")[0],
      query: request.url.includes("?") ? sanitizeUrl(request.url).split("?")[1] : undefined,
      statusCode: reply.statusCode,
      ms: Math.round(reply.elapsedTime),
      ...(user ? { userId: user.id, role: user.role } : {}),
    },
    "request completed",
  );
}
