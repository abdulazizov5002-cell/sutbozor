import type { PrismaClient } from "@prisma/client";
import type { TelegramAccountStore } from "../../auth/ports";
import type { TelegramAccount } from "../../domain/entities";

/** Telegram ID: faqat musbat butun son qatori (bazada BigInt). Boshqa shakl bazaga umuman yetib bormaydi. */
const TELEGRAM_ID = /^[1-9]\d{0,15}$/;
export const telegramIdToBigInt = (id: string): bigint => {
  if (!TELEGRAM_ID.test(id)) throw new Error("Noto'g'ri Telegram ID.");
  return BigInt(id);
};

interface Row {
  id: string; telegramId: bigint; username: string | null; firstName: string; lastName: string | null;
  photoUrl: string | null; languageCode: string | null; userId: string | null; firstSeenAt: Date; lastLoginAt: Date | null;
}

export const mapTelegramAccount = (r: Row): TelegramAccount => ({
  id: r.id,
  telegramId: r.telegramId.toString(),
  username: r.username,
  firstName: r.firstName,
  lastName: r.lastName,
  photoUrl: r.photoUrl,
  languageCode: r.languageCode,
  userId: r.userId,
  firstSeenAt: r.firstSeenAt.toISOString(),
  lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
});

interface TgDelegate {
  findUnique(args: any): Promise<Row | null>;
  upsert(args: any): Promise<Row>;
}

/**
 * upsertProfile faqat PROFIL maydonlarini yozadi. `userId` (rol bog'lanishi) HECH QACHON shu yerda o'zgarmaydi:
 * update qismida u yo'q, create qismida ham yo'q (null bo'lib qoladi). Bog'lash alohida, admin/ro'yxatdan o'tish jarayonida.
 */
export function createPrismaTelegramAccountStore(prisma: PrismaClient): TelegramAccountStore {
  const tg = (prisma as unknown as { telegramAccount: TgDelegate }).telegramAccount;
  return {
    async findByTelegramId(telegramId) {
      const row = await tg.findUnique({ where: { telegramId: telegramIdToBigInt(telegramId) } });
      return row ? mapTelegramAccount(row) : null;
    },
    async upsertProfile(identity) {
      const profile = {
        username: identity.username,
        firstName: identity.firstName,
        lastName: identity.lastName,
        photoUrl: identity.photoUrl,
        languageCode: identity.languageCode,
        lastLoginAt: new Date(),
      };
      const telegramId = telegramIdToBigInt(identity.telegramId);
      const row = await tg.upsert({ where: { telegramId }, update: profile, create: { telegramId, ...profile } });
      return mapTelegramAccount(row);
    },
  };
}
