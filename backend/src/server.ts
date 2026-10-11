import { buildApp } from "./app";
import { env } from "./config/env";
import { disconnectPrisma, getPrisma } from "./lib/prisma";
import { createPrismaRepositories } from "./repositories/prisma";

async function main(): Promise<void> {
  // DATABASE_URL berilgan bo'lsa Prisma repository'lari ulanadi, aks holda entity endpointlari 501 qaytaradi.
  const repositories = env.DATABASE_URL ? createPrismaRepositories(getPrisma()) : undefined;
  const app = await buildApp({ repositories });
  if (!repositories) app.log.warn("DATABASE_URL berilmagan: ma'lumotlar bazasi ulanmagan.");

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
