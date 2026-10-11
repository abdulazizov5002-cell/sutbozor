import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { LoginResponse, MeResponse } from "../auth/contract";
import type { TelegramAccountStore, TelegramVerifier, TokenService, UserLookup } from "../auth/ports";
import { parseInitData } from "../auth/telegram/initData";
import { actorOf } from "../middleware/auth";
import type { TelegramLoginBody } from "../schemas/auth.schemas";
import { permissionsOf } from "../services/permission.service";
import { AppError, AuthenticationError, ERROR_CODES, forbidden, notImplemented } from "../utils/errors";
import { ok } from "../utils/response";

export interface AuthControllerDeps {
  telegramVerifier: TelegramVerifier;
  /** Quyidagi uchtasi bo'lmasa (baza yoki JWT_SECRET sozlanmagan) kirish fail-closed: 501, token berilmaydi. */
  accounts?: TelegramAccountStore | undefined;
  users?: UserLookup | undefined;
  tokens?: TokenService | undefined;
}

export function createAuthController(deps: AuthControllerDeps) {
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
     * POST /api/auth/telegram. Tartib (har qadam avvalgisi o'tgandan keyingina bajariladi):
     *  1. body strict (faqat initData), parseInitData: tuzilma (tasdiqlanmagan).
     *  2. verifier: HMAC + auth_date yangiligi. Muvaffaqiyatsiz -> 401.
     *  3. TelegramAccount profili yangilanadi (rolga tegmaydi).
     *  4. Hisob foydalanuvchiga bog'langanmi? Yo'q -> 403 ACCOUNT_NOT_LINKED, token berilmaydi.
     *  5. User bazadan olinadi; ROL va HOLAT faqat shu yerdan. Faol emas -> 403.
     *  6. Qisqa muddatli token beriladi (rol tokenda yo'q).
     */
    telegramLogin: async (request: FastifyRequest) => {
      const { initData } = request.body as TelegramLoginBody;
      const parsed = parseInitData(initData);
      const identity = await deps.telegramVerifier.verify(parsed);
      if (!identity) throw new AuthenticationError("Telegram ma'lumotlari tasdiqlanmadi.");

      const { accounts, users, tokens } = deps;
      if (!accounts || !users || !tokens) throw notImplemented("Telegram sessiyasi sozlanmagan.");

      const account = await accounts.upsertProfile(identity);
      if (!account.userId) {
        throw new AppError(403, ERROR_CODES.ACCOUNT_NOT_LINKED, "Telegram hisobingiz hali foydalanuvchiga bog'lanmagan.");
      }
      const user = await users.findById(account.userId);
      if (!user) {
        throw new AppError(403, ERROR_CODES.ACCOUNT_NOT_LINKED, "Telegram hisobingiz hali foydalanuvchiga bog'lanmagan.");
      }
      if (user.status !== "ACTIVE") throw forbidden("Hisob faol emas.");

      const { token, expiresAt } = await tokens.issue(user.id, randomUUID());
      const body: LoginResponse = {
        accessToken: token,
        expiresAt,
        user: {
          id: user.id,
          role: user.role,
          status: user.status,
          businessId: user.businessId,
          supplierId: user.supplierId,
          permissions: permissionsOf(user.role),
        },
      };
      return ok(body);
    },
  };
}
