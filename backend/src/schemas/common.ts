import { z } from "zod";
import { uuid } from "./primitives";

export const idParamSchema = z.strictObject({ id: uuid });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Sxema bo'yicha tekshiradi va tozalangan qiymatni qaytaradi. Xato bo'lsa ZodError (global handler 400 ga aylantiradi). */
export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  return schema.parse(data);
}
