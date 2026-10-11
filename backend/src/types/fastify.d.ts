import type { Role, UserStatus } from "../config/constants";

/** Autentifikatsiyadan o'tgan foydalanuvchi. Kelajakda JWT/session'dan to'ldiriladi. */
export interface AuthUser {
  id: string;
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
