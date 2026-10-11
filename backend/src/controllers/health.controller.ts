import { getHealth } from "../services/health.service";

/** GET /api/health javobi talab bo'yicha o'rab olinmaydi: { status, service }. */
export const healthController = {
  get: async () => getHealth(),
};
