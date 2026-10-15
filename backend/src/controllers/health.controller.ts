import type { FastifyReply } from "fastify";
import { checkReadiness, getHealth } from "../services/health.service";

/** GET /api/health javobi talab bo'yicha o'ralmaydi: { status, service }. Bazani tekshirmaydi (faqat server tirikmi). */
export const healthController = {
  get: async () => getHealth(),
};

/** GET /api/ready: server + baza. 200 yoki 503 (o'ralmagan: { status, service, database }). */
export const readyController = (ping?: () => Promise<void>) => ({
  get: async (_request: unknown, reply: FastifyReply) => {
    const r = await checkReadiness(ping);
    reply.code(r.statusCode);
    return r.body;
  },
});
