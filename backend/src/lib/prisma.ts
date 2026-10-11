import { PrismaClient } from "@prisma/client";
import { env } from "../config/env";

let client: PrismaClient | null = null;

/** Yagona PrismaClient (lazy). DATABASE_URL faqat env.ts orqali o'qiladi. */
export function getPrisma(): PrismaClient {
  if (!client) client = new PrismaClient({ datasourceUrl: env.DATABASE_URL, log: ["warn", "error"] });
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
