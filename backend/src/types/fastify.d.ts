import type { Role, UserStatus } from "../config/constants";

/** Autentifikatsiyadan o'tgan foydalanuvchi. Kelajakda JWT/session'dan to'ldiriladi. */
export interface AuthUser {
  id: string;
  /** Audit yozuvi uchun (bazadagi User.name). */
  name?: string;
  role: Role;
  status: UserStatus;
  businessId?: string | null;
  supplierId?: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}
