import type { FastifyRequest } from "fastify";
import type { MeResponse } from "../auth/contract";
import type { TelegramVerifier } from "../auth/ports";
import { parseInitData } from "../auth/telegram/initData";
import { actorOf } from "../middleware/auth";
import type { TelegramLoginBody } from "../schemas/auth.schemas";
import { permissionsOf } from "../services/permission.service";
import { AuthenticationError, notImplemented } from "../utils/errors";
import { ok } from "../utils/response";

export function createAuthController(deps: { telegramVerifier: TelegramVerifier }) {
  return {
    /** GET /api/auth/me: kimligi va ruxsatlari (interfeys uchun). Autentifikatsiya preHandler'da. */
    me: async (request: FastifyRequest) => {
      const u = actorOf(request);
      const body: MeResponse = {
        id: u.id,
        role: u.role,
        status: u.status,
        businessId: u.businessId ?? null,
        supplierId: u.supplierId ?? null,
        permissions: permissionsOf(u.role),
      };
      return ok(body);
    },

    /**
     * POST /api/auth/telegram. Tayyorlov bosqichi: tuzilma tekshiriladi, tasdiqlash portga topshiriladi, sessiya BERILMAYDI.
     * Tartib: body (strict, faqat initData) -> parseInitData (tasdiqlanmagan) -> verifier (kriptografik tekshiruv) -> [keyingi bosqich].
     * Keyingi bosqichda: identifikator bo'yicha TelegramAccount va User topiladi, ROL BAZADAN olinadi, sessiya/token beriladi.
     */
    telegramLogin: async (request: FastifyRequest) => {
      const { initData } = request.body as TelegramLoginBody;
      const parsed = parseInitData(initData);
      const identity = await deps.telegramVerifier.verify(parsed);
      if (!identity) throw new AuthenticationError("Telegram ma'lumotlari tasdiqlanmadi.");
      throw notImplemented("Telegram sessiyasi keyingi bosqichda ishga tushiriladi.");
    },
  };
}
