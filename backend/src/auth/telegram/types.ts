/**
 * Telegram WebApp initData uchun turlar. MUHIM chegara:
 *  - UntrustedTelegramInitData: foydalanuvchi yuborgan, imzosi HALI tekshirilmagan ma'lumot. Undan shaxs yoki huquq aniqlanmaydi.
 *  - VerifiedTelegramIdentity: faqat TelegramVerifier (kriptografik tekshiruv, keyingi bosqich) muvaffaqiyatli o'tgach hosil bo'ladi.
 * Hech qaysi tur `role` ni saqlamaydi: rol faqat serverda, bazadagi User'dan aniqlanadi.
 */

/** Telegram `user` obyekti (WebAppUser). Boshqa (noma'lum) maydonlar tashlab yuboriladi. */
export interface TelegramUserProfile {
  id: number;
  first_name: string;
  last_name?: string | undefined;
  username?: string | undefined;
  language_code?: string | undefined;
  photo_url?: string | undefined;
}

export interface UntrustedTelegramInitData {
  readonly trusted: false;
  /** initData ning barcha maydonlari (hash ham). Imzoni tekshirish uchun kerak, shaxsni aniqlash uchun ISHLATILMAYDI. */
  readonly fields: Readonly<Record<string, string>>;
  readonly hash: string;
  readonly authDate: number; // epoch, soniya
  readonly queryId?: string;
  readonly startParam?: string;
  readonly user?: TelegramUserProfile;
  /** HMAC hisoblanadigan satr: hash'dan tashqari barcha maydonlar, alifbo tartibida, `key=value` va `\n` bilan. */
  readonly dataCheckString: string;
}

export interface VerifiedTelegramIdentity {
  telegramId: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
  languageCode: string | null;
  authDate: number;
}
