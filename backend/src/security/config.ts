/**
 * Xavfsizlik sozlamalari bitta joyda (sof funksiyalar, shuning uchun alohida tekshiriladi).
 * app.ts faqat shularni plaginlarga beradi.
 */
export interface CorsOptions {
  origin: string | string[];
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: boolean;
  maxAge: number;
  optionsSuccessStatus: number;
}

/**
 * CORS: faqat ro'yxatdagi manzillarga ruxsat. `credentials: false`: cookie ishlatilmaydi (Bearer token).
 * Cookie'li autentifikatsiyaga o'tilsa credentials true qilinadi va origin ro'yxati majburiy bo'ladi ("*" bilan mumkin emas).
 * `Origin: null` (lokal file://) ruxsat etilmaydi: lokal sinov uchun http://localhost:PORT dan foydalaning.
 */
export function buildCorsOptions(origins: readonly string[]): CorsOptions {
  return {
    origin: origins.includes("*") ? "*" : [...origins],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["x-request-id", "x-ratelimit-limit", "x-ratelimit-remaining", "retry-after"],
    credentials: false,
    maxAge: 600,
    optionsSuccessStatus: 204,
  };
}

/**
 * Xavfsizlik sarlavhalari (Helmet). Bu API faqat JSON qaytaradi, shuning uchun CSP hamma narsani taqiqlaydi:
 * brauzer javobni sahifa sifatida ochsa ham skript, frame yoki forma ishlamaydi.
 * HSTS faqat productionda (HTTPS orqasida) yoqiladi.
 */
export function buildHelmetOptions(isProd: boolean) {
  return {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] },
    },
    referrerPolicy: { policy: "no-referrer" as const },
    hsts: isProd ? { maxAge: 15_552_000, includeSubDomains: true } : false,
  };
}

/** Javob kesh qilinmasin: API javoblarida shaxsiy va moliyaviy ma'lumot bor. */
export const NO_STORE_HEADERS = { "Cache-Control": "no-store", Pragma: "no-cache" } as const;

/** Log'ga tushmasligi kerak bo'lgan sarlavha va maydonlar. */
export const LOG_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  "req.body.password",
  "req.body.initData",
  'req.headers["x-telegram-init-data"]',
  'req.headers["x-api-key"]',
  "*.password",
  "*.initData",
  "*.secret",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
];
