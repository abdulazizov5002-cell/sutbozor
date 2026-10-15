import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { LoginResponse, MeResponse } from "../auth/contract";
import type { RegistrationStore, TelegramAccountStore, TelegramVerifier, TokenService, UserLookup } from "../auth/ports";
import { parseInitData } from "../auth/telegram/initData";
import { actorOf } from "../middleware/auth";
import { REGISTRATION_INITIAL_STATUS, TERMS_VERSION, type UserStatus } from "../config/constants";
import type { RegisterBody, TelegramLoginBody } from "../schemas/auth.schemas";
import { permissionsOf } from "../services/permission.service";
import { AppError, AuthenticationError, conflict, ERROR_CODES, forbidden, notImplemented } from "../utils/errors";
import { ok } from "../utils/response";

export interface AuthControllerDeps {
  telegramVerifier: TelegramVerifier;
  /** Quyidagi uchtasi bo'lmasa (baza yoki JWT_SECRET sozlanmagan) kirish fail-closed: 501, token berilmaydi. */
  accounts?: TelegramAccountStore | undefined;
  users?: UserLookup | undefined;
  tokens?: TokenService | undefined;
  /** Ro'yxatdan o'tish ombori (baza). Yo'q bo'lsa register 501. */
  registrations?: RegistrationStore | undefined;
  /** Yangi hisob holati (standart: REGISTRATION_INITIAL_STATUS). Testlar uchun almashtiriladi. */
  registrationStatus?: UserStatus | undefined;
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

    /**
     * POST /api/auth/register. Tartib:
     *  1. body strict + rol faqat business|supplier (zod). initData tuzilmasi, HMAC + auth_date: muvaffaqiyatsiz -> 401.
     *  2. Telegram profili yangilanadi. Hisob allaqachon bog'langan bo'lsa -> 409 (ikkinchi hisob ochib bo'lmaydi).
     *  3. Tashkilot + User + bog'lash + audit BITTA tranzaksiyada. Telefon/email band -> 409.
     *  4. Holat serverdan (REGISTRATION_INITIAL_STATUS). Faol bo'lsagina token beriladi (login bilan bir xil shakl).
     * Rol, holat va kimlik mijozdan olinmaydi: faqat tasdiqlangan initData va server qoidalari.
     */
    register: async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as RegisterBody;
      const parsed = parseInitData(body.initData);
      const identity = await deps.telegramVerifier.verify(parsed);
      if (!identity) throw new AuthenticationError("Telegram ma'lumotlari tasdiqlanmadi.");

      const { accounts, registrations, tokens } = deps;
      if (!accounts || !registrations || !tokens) throw notImplemented("Ro'yxatdan o'tish sozlanmagan.");

      const account = await accounts.upsertProfile(identity);
      if (account.userId) throw conflict("Siz allaqachon ro'yxatdan o'tgansiz. Tizimga kiring.");

      const common = {
        telegramAccountId: account.id,
        name: body.name,
        phone: body.phone,
        email: body.email ?? null,
        status: deps.registrationStatus ?? REGISTRATION_INITIAL_STATUS,
        termsVersion: TERMS_VERSION,
      };
      const user = await registrations.register(
        body.role === "business"
          ? { ...common, role: "business", organization: body.organization }
          : { ...common, role: "supplier", organization: body.organization },
      );
      if (user.status !== "ACTIVE") throw forbidden("Hisobingiz yaratildi va tasdiqlanishini kutmoqda.");

      const { token, expiresAt } = await tokens.issue(user.id, randomUUID());
      const res: LoginResponse = {
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
      reply.code(201);
      return ok(res);
    },
  };
}
