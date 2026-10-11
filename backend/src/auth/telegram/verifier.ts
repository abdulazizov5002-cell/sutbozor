import { AppError, ERROR_CODES } from "../../utils/errors";
import type { TelegramVerifier } from "../ports";

/**
 * Hozirgi verifier: FAIL-CLOSED. Hech qanday initData'ni qabul qilmaydi (har doim 501), shuning uchun hozir hech kim Telegram orqali kira olmaydi.
 *
 * Keyingi bosqichda shu interfeysning haqiqiy implementatsiyasi yoziladi (Telegram hujjati bo'yicha):
 *   secretKey = HMAC_SHA256(key = "WebAppData", message = TELEGRAM_BOT_TOKEN)
 *   expected  = HMAC_SHA256(key = secretKey,    message = data.dataCheckString)  (hex)
 *   timingSafeEqual(expected, data.hash) bo'lishi shart (doimiy vaqtda solishtirish)
 *   isFresh(data.authDate, now, TELEGRAM_INIT_DATA_MAX_AGE_SEC) bo'lishi shart
 *   muvaffaqiyatda: identityFromVerified(data); aks holda null (401).
 * Bot tokeni faqat muhit o'zgaruvchisidan olinadi, hech qachon log yoki javobga chiqmaydi.
 * Amalga oshirishdan oldin joriy rasmiy hujjat va test vektorlari bilan solishtiring.
 */
export function createUnimplementedTelegramVerifier(): TelegramVerifier {
  return {
    async verify() {
      throw new AppError(501, ERROR_CODES.NOT_IMPLEMENTED, "Telegram orqali kirish keyingi bosqichda ishga tushiriladi.");
    },
  };
}
