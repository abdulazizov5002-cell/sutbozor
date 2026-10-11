import type { FastifyRequest } from "fastify";
import { ZodError, type ZodIssue, type ZodTypeAny } from "zod";

export interface RequestSchemas {
  params?: ZodTypeAny;
  query?: ZodTypeAny;
  body?: ZodTypeAny;
}

type Parts = { params?: unknown; query?: unknown; body?: unknown };

/**
 * params, query va body'ni birga tekshiradi va BARCHA xatolarni bitta ZodError'da yig'adi
 * (yo'llar `params.id`, `query.page`, `body.items.0.qty` ko'rinishida). Muvaffaqiyatda tozalangan
 * (kesilgan, o'zgartirilgan, ortiqcha maydonsiz) qiymatlarni qaytaradi.
 */
export function validateRequest(request: Parts, schemas: RequestSchemas): Parts {
  const issues: ZodIssue[] = [];
  const out: Parts = {};
  for (const part of ["params", "query", "body"] as const) {
    const schema = schemas[part];
    if (!schema) continue;
    const input = request[part];
    if (part === "body" && (input === undefined || input === null)) {
      issues.push({ code: "custom", path: ["body"], message: "So'rov tanasi (JSON) yuborilmagan." });
      continue;
    }
    const result = schema.safeParse(input ?? {});
    if (result.success) out[part] = result.data;
    else issues.push(...result.error.issues.map((i) => ({ ...i, path: [part, ...i.path] })));
  }
  if (issues.length > 0) throw new ZodError(issues);
  return out;
}

/** Fastify preHandler: tekshiradi va request.params/query/body ni tozalangan qiymat bilan almashtiradi. */
export function validate(schemas: RequestSchemas) {
  return async (request: FastifyRequest): Promise<void> => {
    const out = validateRequest(request, schemas);
    if ("params" in out) request.params = out.params;
    if ("query" in out) request.query = out.query;
    if ("body" in out) request.body = out.body;
  };
}
