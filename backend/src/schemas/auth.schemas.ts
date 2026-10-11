import { z } from "zod";
import { strictObject } from "./primitives";

/** Admin kirishi (keyingi bosqichda ulanadi). Parol kesilmaydi (trim yo'q), uzunlik chegarasi xeshlash orqali DoS'dan himoya qiladi. */
export const adminLoginBody = strictObject({
  username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/, "Faqat harf, raqam va . _ - belgilari ruxsat etiladi."),
  password: z.string().min(8).max(128),
});

/**
 * Telegram Mini App kirishi. FAQAT initData qabul qilinadi (strictObject): `role`, `userId`, `telegramId` kabi maydonlar yuborilsa 400.
 * Foydalanuvchi kimligi va roli mijoz yuborgan qiymatdan emas, tasdiqlangan initData va bazadan aniqlanadi.
 */
export const telegramLoginBody = strictObject({
  initData: z.string().min(10).max(4096),
});

export type TelegramLoginBody = z.infer<typeof telegramLoginBody>;
