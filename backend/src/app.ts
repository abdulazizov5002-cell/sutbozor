import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { buildLoggerOptions, logRequestCompleted } from "./logging/logger";
import { corsOrigins, env, isProd } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import "./validation/errorMap";
import type { TelegramVerifier } from "./auth/ports";
import { buildContainer } from "./container";
import type { Repositories } from "./repositories/ports";
import { createApiRoutes } from "./routes";
import { buildCorsOptions, buildHelmetOptions, NO_STORE_HEADERS } from "./security/config";
import { ipKey, policies } from "./security/rateLimit";

export interface BuildAppOptions {
  /** Database bosqichida Prisma repository'lari shu yerga beriladi. Berilmasa, har bir chaqiruv 501 qaytaradi. */
  repositories?: Repositories;
  /** Keyingi bosqichda haqiqiy Telegram tasdiqlovchisi. Berilmasa, Telegram kirishi 501 qaytaradi. */
  telegramVerifier?: TelegramVerifier;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: buildLoggerOptions(env.LOG_LEVEL),
    disableRequestLogging: true, // o'rniga logRequestCompleted (tana va sarlavhasiz)
    genReqId: () => randomUUID(),
    trustProxy: env.TRUST_PROXY,
    bodyLimit: env.BODY_LIMIT_BYTES, // katta so'rov 413 bilan rad etiladi (errorHandler)
    requestTimeout: env.REQUEST_TIMEOUT_MS, // sekin yuboruvchi (slowloris) ulanishni band qilmasin
    maxParamLength: 100,
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });
  app.addHook("onResponse", async (request, reply) => logRequestCompleted(request, reply));
  // Javoblar keshlanmasin (shaxsiy va moliyaviy ma'lumot).
  app.addHook("onSend", async (_request, reply) => {
    for (const [k, v] of Object.entries(NO_STORE_HEADERS)) reply.header(k, v);
  });

  await app.register(helmet, buildHelmetOptions(isProd));
  await app.register(cors, buildCorsOptions(corsOrigins));
  await app.register(rateLimit, {
    max: policies.global.max,
    timeWindow: policies.global.windowSec * 1000,
    keyGenerator: ipKey,
  });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  await app.register(createApiRoutes(buildContainer(options.repositories, options.telegramVerifier ? { telegramVerifier: options.telegramVerifier } : {})), { prefix: "/api" });
  return app;
}
