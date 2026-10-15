import { z } from "zod";
import { email, personName, phone, strictObject, text } from "./primitives";

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

/** Bo'sh qator ("") berilsa ixtiyoriy maydon berilmagan hisoblanadi. */
const optionalEmail = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), email.optional());

const registerCommon = {
  initData: z.string().min(10).max(4096),
  name: personName,
  phone,
  email: optionalEmail,
};

/**
 * Ro'yxatdan o'tish (Telegram initData bilan). Rol faqat `business` yoki `supplier`: `admin` tanlab bo'lmaydi (discriminator'da yo'q).
 * strictObject: `status`, `userId`, `telegramId`, `businessId` kabi maydonlar yuborilsa 400. Kimlik initData'dan, holat serverdan.
 */
export const registerBody = z.discriminatedUnion("role", [
  strictObject({
    ...registerCommon,
    role: z.literal("business"),
    organization: strictObject({ name: text(2, 100), type: text(2, 50), area: text(2, 60), address: text(2, 200) }),
  }),
  strictObject({
    ...registerCommon,
    role: z.literal("supplier"),
    organization: strictObject({ name: text(2, 100), area: text(2, 60), deliveryRadiusKm: z.number().int().min(1).max(100) }),
  }),
]);

export type RegisterBody = z.infer<typeof registerBody>;
