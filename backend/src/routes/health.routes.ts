import type { FastifyPluginAsync } from "fastify";
import { healthController } from "../controllers/health.controller";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", healthController.get);
};
