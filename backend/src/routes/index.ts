import type { FastifyPluginAsync } from "fastify";
import type { Container } from "../container";
import { foundationRoutes } from "./foundation.routes";
import { healthRoutes } from "./health.routes";

/** Barcha route'lar /api prefiksi ostida ro'yxatdan o'tadi (app.ts). */
export const createApiRoutes =
  (container: Container): FastifyPluginAsync =>
  async (app) => {
    await app.register(healthRoutes);
    await app.register(foundationRoutes(container));
  };
