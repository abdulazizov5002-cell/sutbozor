import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError, ERROR_CODES } from "../../utils/errors";
import type { TelegramVerifier } from "../ports";
import { identityFromVerified, isFresh } from "./initData";

/**
 * FAIL-CLOSED verifier: hech qanday initData'ni qabul qilmaydi (har doim 501).
 * TELEGRAM_BOT_TOKEN berilmaganda ishlatiladi, shuning uchun token yo'q serverda hech kim Telegram orqali kira olmaydi.
 */
export function createUnimplementedTelegramVerifier(): TelegramVerifier {
  return {
    async verify() {
      throw new AppError(501, ERROR_CODES.NOT_IMPLEMENTED, "Telegram orqali kirish sozlanmagan.");
    },
  };
}

export interface TelegramVerifierOptions {
  /** Bot tokeni: faqat muhit o'zgaruvchisidan. Log yoki javobga hech qachon chiqmaydi. */
  botToken: string;
  /** auth_date shu soniyadan eski bo'lsa rad etiladi. */
  maxAgeSec: number;
  /** Test uchun soatni almashtirish. Standart: haqiqiy vaqt. */
  now?: () => number; // epoch, soniya
}

/**
 * Telegram Mini App initData'ni kriptografik tekshiradi (rasmiy hujjat: "Validating data received via the Mini App"):
 *   secretKey = HMAC_SHA256(key = "WebAppData", message = botToken)
 *   expected  = HMAC_SHA256(key = secretKey,    message = dataCheckString)   (hex)
 * dataCheckString: `hash` dan tashqari barcha maydonlar, alifbo tartibida, `key=value` va "\n" bilan (parseInitData shuni hosil qiladi).
 * Solishtirish doimiy vaqtda (timingSafeEqual). Keyin auth_date yangiligi tekshiriladi.
 * Har qanday nomuvofiqlik uchun null (401): sabab (imzo noto'g'ri yoki eskirgan) tashqariga farqlanmaydi.
 * `user` bo'lmagan initData (masalan, kanal/guruh konteksti) ham rad etiladi: bizga shaxs kerak.
 */
export function createTelegramVerifier(options: TelegramVerifierOptions): TelegramVerifier {
  if (!options.botToken) throw new Error("createTelegramVerifier: botToken majburiy.");
  const secretKey = createHmac("sha256", "WebAppData").update(options.botToken).digest();
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));

  return {
    async verify(data) {
      const expected = createHmac("sha256", secretKey).update(data.dataCheckString).digest();
      // parseInitData hash'ni /^[0-9a-f]{64}$/ ga tekshirgan: 32 bayt. Uzunlik farqi bo'lsa ham xavfsiz rad etamiz.
      const received = Buffer.from(data.hash, "hex");
      if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
      if (!isFresh(data.authDate, now(), options.maxAgeSec)) return null;
      return identityFromVerified(data);
    },
  };
}
