import type { UserStatus } from "../config/constants";
import type { TelegramAccount, User } from "../domain/entities";
import type { UntrustedTelegramInitData, VerifiedTelegramIdentity } from "./telegram/types";

/**
 * Autentifikatsiya portlari (interfeyslar). Amalga oshirish keyingi bosqichda:
 * Telegram initData tekshiruvi, JWT/sessiya, admin uchun argon2id parol xeshi.
 * Hech qaysi sir (kalit, parol, token) kodda saqlanmaydi: faqat muhit o'zgaruvchilari va baza.
 */
export interface TokenPayload {
  userId: string;
  sessionId: string;
  expiresAt: number; // epoch, soniya
}

export interface TokenService {
  issue(userId: string, sessionId: string): Promise<{ token: string; expiresAt: number }>;
  /** Yaroqsiz, soxta yoki muddati o'tgan token uchun null. */
  verify(token: string): Promise<TokenPayload | null>;
}

export interface SessionStore {
  create(userId: string, meta: { ip?: string; userAgent?: string }): Promise<{ id: string }>;
  isActive(sessionId: string): Promise<boolean>;
  revoke(sessionId: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>; // foydalanuvchi bloklanganda chaqiriladi
}

/** Parol xeshi (argon2id tavsiya etiladi). Faqat admin uchun, Business/Supplier Telegram orqali kiradi. */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}

export interface TelegramVerifier {
  /**
   * Imzoni (HMAC) va auth_date yangiligini tekshiradi. Yaroqsiz bo'lsa null (401).
   * Faqat shu metod muvaffaqiyatli o'tsa identifikator "tasdiqlangan" hisoblanadi.
   */
  verify(data: UntrustedTelegramInitData): Promise<VerifiedTelegramIdentity | null>;
}

/**
 * Tasdiqlangan Telegram hisoblari (keyingi bosqich: Prisma implementatsiyasi). Foydalanuvchining roli bu yerdan emas,
 * `account.userId` orqali topiladigan `User` dan olinadi. Bog'lanmagan hisob hech qanday huquq olmaydi.
 */
export interface TelegramAccountStore {
  findByTelegramId(telegramId: string): Promise<TelegramAccount | null>;
  /** FAQAT TelegramVerifier tasdiqlagan identifikator bilan chaqiriladi; profil maydonlarini yangilaydi. */
  upsertProfile(identity: VerifiedTelegramIdentity): Promise<TelegramAccount>;
}

export interface UserLookup {
  findById(id: string): Promise<User | null>;
}

interface RegistrationCommon {
  /** Tasdiqlangan initData'dan upsertProfile qaytargan hisob. Foydalanuvchi shu hisobga bog'lanadi. */
  telegramAccountId: string;
  name: string;
  phone: string;
  email: string | null;
  status: UserStatus;
}

export type NewRegistration = RegistrationCommon &
  (
    | { role: "business"; organization: { name: string; type: string; area: string; address: string } }
    | { role: "supplier"; organization: { name: string; area: string; deliveryRadiusKm: number } }
  );

/**
 * Ro'yxatdan o'tish: tashkilot (Business/Supplier), User va Telegram hisobiga bog'lash BITTA tranzaksiyada.
 * Telefon/email band bo'lsa yoki hisob allaqachon bog'langan bo'lsa 409 (AppError) tashlaydi va hech narsa yozilmaydi.
 */
export interface RegistrationStore {
  register(input: NewRegistration): Promise<User>;
}
