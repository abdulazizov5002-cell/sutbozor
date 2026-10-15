import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { MaintenanceService } from "../services/maintenance.service";
import { AppError, ERROR_CODES, unauthorized } from "../utils/errors";
import { ok } from "../utils/response";

const digest = (s: string): Buffer => createHash("sha256").update(s).digest();

/**
 * Ichki (cron) endpointlar. `x-cron-secret` sarlavhasi CRON_SECRET bilan vaqt bo'yicha bir xil taqqoslanadi.
 * CRON_SECRET berilmagan bo'lsa endpoint ishlamaydi (501, fail-closed). Sir javobga yoki log'ga chiqmaydi.
 */
export function maintenanceController(service: MaintenanceService, cronSecret?: string) {
  const guard = (request: FastifyRequest): void => {
    if (!cronSecret) throw new AppError(501, ERROR_CODES.NOT_IMPLEMENTED, "Rejalashtirilgan ishlar sozlanmagan (CRON_SECRET yo'q).");
    const given = request.headers["x-cron-secret"];
    if (typeof given !== "string" || !timingSafeEqual(digest(given), digest(cronSecret))) throw unauthorized("Ruxsat yo'q.");
  };
  return {
    overdueSweep: async (request: FastifyRequest) => {
      guard(request);
      return ok(await service.sweepOverduePayments());
    },
  };
}
export type MaintenanceController = ReturnType<typeof maintenanceController>;
