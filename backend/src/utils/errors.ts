export const ERROR_CODES = {
  BAD_REQUEST: "BAD_REQUEST",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  RATE_LIMITED: "RATE_LIMITED",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  AUTH_NOT_CONFIGURED: "AUTH_NOT_CONFIGURED",
  INVALID_INIT_DATA: "INVALID_INIT_DATA",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

/** Foydalanuvchiga ko'rsatilishi xavfsiz bo'lgan xato. Faqat shu klassning message'i javobga chiqadi. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message = "So'rov noto'g'ri.", details?: unknown) =>
  new AppError(400, ERROR_CODES.BAD_REQUEST, message, details);
export const unauthorized = (message = "Tizimga kirish talab qilinadi.") =>
  new AppError(401, ERROR_CODES.UNAUTHENTICATED, message);
export const forbidden = (message = "Bu amal uchun ruxsat yo'q.") => new AppError(403, ERROR_CODES.FORBIDDEN, message);
export const notFound = (message = "So'ralgan resurs topilmadi.") => new AppError(404, ERROR_CODES.NOT_FOUND, message);
export const conflict = (message: string) => new AppError(409, ERROR_CODES.CONFLICT, message);
export const notImplemented = (message = "Bu funksiya keyingi bosqichda ishga tushiriladi.") =>
  new AppError(501, ERROR_CODES.NOT_IMPLEMENTED, message);

/**
 * Autentifikatsiya strategiyalari yaroqsiz yoki muddati o'tgan token uchun shuni tashlaydi (401).
 * Boshqa xatolar (baza ishlamayapti va h.k.) o'zgarishsiz yuqoriga chiqadi: 500/503, foydalanuvchi tizimdan chiqarib yuborilmasin.
 */
export class AuthenticationError extends AppError {
  constructor(message = "Tizimga kirish talab qilinadi.") {
    super(401, ERROR_CODES.UNAUTHENTICATED, message);
    this.name = "AuthenticationError";
  }
}
