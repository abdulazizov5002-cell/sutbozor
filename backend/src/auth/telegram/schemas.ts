import { z } from "zod";

/** Telegram `user` JSON'ini tekshiradi. Noma'lum maydonlar (masalan `role`) tashlab yuboriladi, ular hech qachon o'tmaydi. */
const noControlChars = (s: string): boolean => !/[\u0000-\u001F\u007F]/.test(s);

const name = z.string().trim().min(1).max(64).refine(noControlChars, "Boshqaruv belgilari ruxsat etilmaydi.");
const optionalName = z
  .string()
  .trim()
  .max(64)
  .refine(noControlChars, "Boshqaruv belgilari ruxsat etilmaydi.")
  .transform((s) => (s === "" ? undefined : s))
  .optional();

/** Rasm manzili <img src> ga tushishi mumkin: faqat https va Telegram'ning o'z domenlari. */
const PHOTO_HOST = /^(t\.me|([a-z0-9-]+\.)*telegram-cdn\.org|([a-z0-9-]+\.)*telegram\.org)$/i;
const photoUrl = z
  .string()
  .max(512)
  .refine((u) => {
    try {
      const x = new URL(u);
      return x.protocol === "https:" && !x.username && !x.password && PHOTO_HOST.test(x.hostname);
    } catch {
      return false;
    }
  }, "photo_url faqat Telegram'ning https manzili bo'lishi kerak.");

export const telegramUserSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  first_name: name,
  last_name: optionalName,
  username: z.string().regex(/^[A-Za-z0-9_]{1,32}$/).optional(),
  language_code: z.string().max(16).regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/).optional(),
  photo_url: photoUrl.optional(),
});
