import { buildApp } from "./app";
import { createBearerStrategy } from "./auth/bearer.strategy";
import { createJwtTokenService } from "./auth/jwt";
import { createTelegramVerifier } from "./auth/telegram/verifier";
import { env } from "./config/env";
import { setAuthStrategy } from "./middleware/auth";
import { disconnectPrisma, getPrisma } from "./lib/prisma";
import { createPrismaRepositories } from "./repositories/prisma";
import { createTelegramDelivery } from "./notify/telegramDelivery";
import { createTelegramChatLookup } from "./repositories/prisma/telegramRecipients";
import { createPrismaRegistrationStore } from "./repositories/prisma/registration";
import { createPrismaTelegramAccountStore } from "./repositories/prisma/telegramAccount";

async function main(): Promise<void> {
  // DATABASE_URL berilgan bo'lsa Prisma repository'lari ulanadi, aks holda entity endpointlari 501 qaytaradi.
  // Telegram orqali bildirishnoma: faqat TELEGRAM_NOTIFICATIONS=true va token + baza bo'lsa. Xatolar faqat log'ga (token chiqmaydi).
  let warn: (o: object, m: string) => void = () => {};
  const delivery =
    env.TELEGRAM_NOTIFICATIONS && env.TELEGRAM_BOT_TOKEN && env.DATABASE_URL
      ? createTelegramDelivery({
          botToken: env.TELEGRAM_BOT_TOKEN,
          lookupChatIds: createTelegramChatLookup(getPrisma()),
          onError: (info) => warn(info, "telegram bildirishnomasi yuborilmadi"),
        })
      : undefined;
  const repositories = env.DATABASE_URL ? createPrismaRepositories(getPrisma(), delivery ? { delivery } : {}) : undefined;

  // Autentifikatsiya: har bir qism o'z sirri bo'lsagina yoqiladi. Aks holda tegishli endpoint fail-closed (501) qoladi.
  const tokens = env.JWT_SECRET ? createJwtTokenService({ secret: env.JWT_SECRET, ttlSec: env.ACCESS_TOKEN_TTL_MIN * 60 }) : undefined;
  const telegramVerifier = env.TELEGRAM_BOT_TOKEN
    ? createTelegramVerifier({ botToken: env.TELEGRAM_BOT_TOKEN, maxAgeSec: env.TELEGRAM_INIT_DATA_MAX_AGE_SEC })
    : undefined;
  const telegramAccounts = repositories ? createPrismaTelegramAccountStore(getPrisma()) : undefined;
  const registrations = repositories ? createPrismaRegistrationStore(getPrisma()) : undefined;
  // Bearer tekshiruvi: token (JWT_SECRET) va foydalanuvchi (baza) bo'lsa. Rol va holat har so'rovda bazadan olinadi.
  if (repositories && tokens) setAuthStrategy(createBearerStrategy({ tokens, users: repositories.users }));

  const app = await buildApp({
    repositories,
    ...(telegramVerifier ? { telegramVerifier } : {}),
    ...(telegramAccounts ? { telegramAccounts } : {}),
    ...(tokens ? { tokens } : {}),
    ...(registrations ? { registrations } : {}),
    ...(env.CRON_SECRET ? { cronSecret: env.CRON_SECRET } : {}),
  });
  warn = (o, m) => app.log.warn(o, m);
  app.log.info({ telegramNotifications: Boolean(delivery) }, "bildirishnoma kanallari");
  if (!repositories) app.log.warn("DATABASE_URL berilmagan: ma'lumotlar bazasi ulanmagan.");
  app.log.info(
    { database: Boolean(repositories), telegramVerifier: Boolean(telegramVerifier), jwt: Boolean(tokens) },
    "autentifikatsiya holati",
  );
  if (repositories && (!telegramVerifier || !tokens)) {
    app.log.warn("TELEGRAM_BOT_TOKEN yoki JWT_SECRET berilmagan: Telegram orqali kirish o'chiq (501).");
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "server to'xtatilmoqda");
    try {
      await app.close();
      if (repositories) await disconnectPrisma();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "to'xtatishda xato");
      process.exit(1);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => app.log.error({ err: reason }, "unhandledRejection"));

  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch((err: unknown) => {
  console.error("Server ishga tushmadi:", err instanceof Error ? err.message : "noma'lum xato");
  process.exit(1);
});
