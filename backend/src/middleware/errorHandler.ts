import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AppError, ERROR_CODES } from "../utils/errors";
import { fail, type ErrorBody } from "../utils/response";

const STATUS_MAP: Record<number, { code: string; message: string }> = {
  400: { code: ERROR_CODES.BAD_REQUEST, message: "So'rov noto'g'ri." },
  401: { code: ERROR_CODES.UNAUTHENTICATED, message: "Tizimga kirish talab qilinadi." },
  403: { code: ERROR_CODES.FORBIDDEN, message: "Bu amal uchun ruxsat yo'q." },
  404: { code: ERROR_CODES.NOT_FOUND, message: "So'ralgan manzil topilmadi." },
  409: { code: ERROR_CODES.CONFLICT, message: "So'rov mavjud holat bilan ziddiyatda." },
  413: { code: ERROR_CODES.PAYLOAD_TOO_LARGE, message: "So'rov hajmi juda katta." },
  415: { code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE, message: "Ma'lumot turi qo'llab-quvvatlanmaydi." },
  429: { code: ERROR_CODES.RATE_LIMITED, message: "So'rovlar juda ko'p. Birozdan keyin urinib ko'ring." },
};

/** Tashqi xizmat (baza, provayder) vaqtincha ishlamasa 5xx statusi saqlanadi, lekin matni umumiy bo'ladi. */
const UNAVAILABLE = [502, 503, 504];

const INTERNAL: ErrorBody = fail(ERROR_CODES.INTERNAL_ERROR, "Ichki server xatosi. Keyinroq urinib ko'ring.");

/**
 * Istalgan xatoni standart javobga aylantiradi.
 * XAVFSIZLIK: faqat AppError va ZodError'ning matni chiqariladi. Boshqa xatolarning message,
 * stack va ichki ma'lumotlari javobga HECH QACHON chiqmaydi (faqat serverda log qilinadi).
 */
export function toErrorResponse(error: unknown): { status: number; body: ErrorBody } {
  if (error instanceof ZodError) {
    // Javob hajmini cheklaymiz va qiymatlarni aks ettirmaymiz: faqat maydon yo'li, xabar va xato turi.
    const details = error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), message: i.message, code: i.code }));
    const first = details[0];
    const summary = first ? `Yuborilgan ma'lumotlar noto'g'ri: ${first.path ? first.path + ": " : ""}${first.message}` : "Yuborilgan ma'lumotlar noto'g'ri.";
    return { status: 400, body: fail(ERROR_CODES.VALIDATION_ERROR, summary, details) };
  }
  if (error instanceof AppError) {
    return { status: error.statusCode, body: fail(error.code, error.message, error.details) };
  }
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    const mapped = STATUS_MAP[status] ?? STATUS_MAP[400]!;
    return { status, body: fail(mapped.code, mapped.message) };
  }
  if (typeof status === "number" && UNAVAILABLE.includes(status)) {
    return { status, body: fail(ERROR_CODES.SERVICE_UNAVAILABLE, "Xizmat vaqtincha mavjud emas. Keyinroq urinib ko'ring.") };
  }
  return { status: 500, body: INTERNAL };
}

export function errorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply): void {
  const { status, body } = toErrorResponse(error);
  if (status >= 500 && !(error instanceof AppError)) {
    // To'liq xato faqat server log'ida qoladi.
    request.log.error({ err: error }, "unhandled error");
  }
  void reply.status(status).send(body);
}

export function notFoundHandler(_request: FastifyRequest, reply: FastifyReply): void {
  void reply.status(404).send(fail(ERROR_CODES.NOT_FOUND, "So'ralgan manzil topilmadi."));
}
