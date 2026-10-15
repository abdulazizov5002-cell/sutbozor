import type { PrismaClient } from "@prisma/client";

/** Foydalanuvchi id'lari -> Telegram chat id'lari (faqat bog'langan hisoblar). Mini App foydalanuvchisi uchun chat id = Telegram user id. */
export function createTelegramChatLookup(prisma: PrismaClient): (userIds: string[]) => Promise<string[]> {
  return async (userIds) => {
    if (userIds.length === 0) return [];
    const rows: { telegramId: bigint }[] = await (prisma as any).telegramAccount.findMany({
      where: { userId: { in: userIds } },
      select: { telegramId: true },
    });
    return rows.map((r) => String(r.telegramId));
  };
}
