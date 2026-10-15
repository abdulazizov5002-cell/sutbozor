import "dotenv/config";
import { z } from "zod";

/**
 * Muhit sozlamalarini yagona joyda tekshiradi. Xato bo'lsa server ishga tushmaydi.
 * Maxfiy qiymatlar (DATABASE_URL va h.k.) hech qachon log'ga yoki javobga chiqarilmaydi.
 */
const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().min(1).default("0.0.0.0"),
    // Developmentda ixtiyoriy (berilmasa entity endpointlari 501), productionda majburiy.
    DATABASE_URL: z.string().url().optional(),
    CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    BODY_LIMIT_BYTES: z.coerce.number().int().min(1024).max(10_485_760).default(1_048_576),
    REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(30_000),
    RATE_LIMIT_WINDOW_SEC: z.coerce.number().int().min(1).max(3600).default(60),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
    /** Login va boshqa autentifikatsiya endpointlari uchun qattiqroq limit (parol tanlashdan himoya). */
    RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).default(10),
    /** Yozish amallari (POST/PATCH/DELETE) uchun limit. */
    RATE_LIMIT_WRITE_MAX: z.coerce.number().int().min(1).default(30),
    // Autentifikatsiya sirlari: faqat muhit o'zgaruvchisida, kodda yo'q. Auth bosqichida majburiy qilinadi.
    JWT_SECRET: z.string().min(32, "JWT_SECRET kamida 32 belgi bo'lishi kerak.").optional(),
    ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().min(1).max(1440).default(15),
    /** Rejalashtirilgan ishlar (Render Cron Job) uchun umumiy sir: `x-cron-secret` sarlavhasi. Berilmasa /api/internal/* 501 (fail-closed). */
    CRON_SECRET: z.string().min(32, "CRON_SECRET kamida 32 belgi bo'lishi kerak.").optional(),
    TELEGRAM_BOT_TOKEN: z.string().min(20, "TELEGRAM_BOT_TOKEN juda qisqa.").optional(),
    /** "true" bo'lsa yangi bildirishnomalar Telegram bot orqali ham yuboriladi (TELEGRAM_BOT_TOKEN va baza kerak). Standart: o'chiq. */
    TELEGRAM_NOTIFICATIONS: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    /** initData necha soniya yangi hisoblanadi (auth_date bo'yicha). Eskirgan ma'lumot qayta ishlatilishidan himoya. */
    TELEGRAM_INIT_DATA_MAX_AGE_SEC: z.coerce.number().int().min(60).max(604_800).default(86_400),
    TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
  })
  .superRefine((value, ctx) => {
    if (value.TELEGRAM_NOTIFICATIONS && (!value.TELEGRAM_BOT_TOKEN || !value.DATABASE_URL)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["TELEGRAM_NOTIFICATIONS"], message: "TELEGRAM_NOTIFICATIONS=true uchun TELEGRAM_BOT_TOKEN va DATABASE_URL kerak." });
    }
    if (value.NODE_ENV === "production" && !value.DATABASE_URL) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["DATABASE_URL"], message: "Productionda DATABASE_URL majburiy." });
    }
    const origins = value.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
    origins.forEach((o, i) => {
      if (o === "*") return; // productionda pastda alohida rad etiladi
      let ok = false;
      try {
        const u = new URL(o);
        ok = (u.protocol === "http:" || u.protocol === "https:") && u.origin === o;
        if (ok && value.NODE_ENV === "production" && u.protocol !== "https:") {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["CORS_ORIGIN"], message: `Productionda ${i + 1}-manzil https bo'lishi kerak.` });
        }
      } catch {
        ok = false;
      }
      if (!ok) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["CORS_ORIGIN"], message: `${i + 1}-manzil noto'g'ri (to'g'ri shakl: https://app.example.com, oxirida "/" va yo'lsiz).` });
      }
    });
    if (value.NODE_ENV === "production" && value.CORS_ORIGIN.split(",").some((o) => o.trim() === "*")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ORIGIN"],
        message: "Productionda CORS_ORIGIN='*' bo'lishi mumkin emas, aniq manzillarni yozing.",
      });
    }
  });

// Bo'sh qiymat (KEY=) berilmagan deb hisoblanadi.
const raw = Object.fromEntries(Object.entries(process.env as Record<string, string | undefined>).map(([k, v]) => [k, v === "" ? undefined : v]));
const parsed = schema.safeParse(raw);

if (!parsed.success) {
  // Faqat o'zgaruvchi nomi va xato sababi chiqariladi, qiymatlar emas.
  const lines = parsed.error.issues.map((i) => `- ${i.path.join(".") || "env"}: ${i.message}`);
  console.error(`Muhit sozlamalari noto'g'ri:\n${lines.join("\n")}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
export const corsOrigins: string[] = env.CORS_ORIGIN.split(",")
  .map((o) => o.trim())
  .filter(Boolean);
