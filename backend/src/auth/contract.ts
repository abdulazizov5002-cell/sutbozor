import type { Permission, Role, UserStatus } from "../config/constants";

/**
 * Frontend va backend o'rtasidagi autentifikatsiya shartnomasi. Frontend shu endpointlarga o'tgach,
 * brauzerdagi admin login, rol tekshiruvi va "faqat-frontend" autentifikatsiya olib tashlanadi (docs/SECURITY.md).
 */
export interface MeResponse {
  id: string;
  role: Role;
  status: UserStatus;
  businessId: string | null;
  supplierId: string | null;
  /** FAQAT interfeysni ko'rsatish uchun (tugmani yashirish). Haqiqiy ruxsat serverda har so'rovda tekshiriladi. */
  permissions: readonly Permission[];
}

export interface LoginResponse {
  accessToken: string;
  expiresAt: number;
  user: MeResponse;
}

export const AUTH_ENDPOINTS = {
  me: { method: "GET", path: "/api/auth/me", status: "tayyor (strategiya ulangach ishlaydi)" },
  telegramLogin: { method: "POST", path: "/api/auth/telegram", status: "tayyorlov: tuzilma tekshiriladi, tasdiqlash 501 (keyingi bosqichda HMAC)" },
  adminLogin: { method: "POST", path: "/api/auth/admin/login", status: "keyingi bosqich (alohida qattiq limit, 2FA)" },
  refresh: { method: "POST", path: "/api/auth/refresh", status: "keyingi bosqich" },
  logout: { method: "POST", path: "/api/auth/logout", status: "keyingi bosqich (sessiyani bekor qiladi)" },
} as const;
