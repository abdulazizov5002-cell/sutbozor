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
  telegramLogin: { method: "POST", path: "/api/auth/telegram", status: "tayyor: HMAC + auth_date tekshiruvi, bazadagi bog'langan foydalanuvchiga qisqa muddatli JWT. TELEGRAM_BOT_TOKEN, JWT_SECRET va baza bo'lmasa 501" },
  register: { method: "POST", path: "/api/auth/register", status: "tayyor: initData tasdiqlanadi, rol faqat business|supplier, tashkilot + foydalanuvchi + Telegram bog'lash bitta tranzaksiyada, 201 va token. Telefon/email band bo'lsa 409" },
  adminLogin: { method: "POST", path: "/api/auth/admin/login", status: "keyingi bosqich (alohida qattiq limit, 2FA)" },
  refresh: { method: "POST", path: "/api/auth/refresh", status: "keyingi bosqich" },
  logout: { method: "POST", path: "/api/auth/logout", status: "keyingi bosqich (sessiyani bekor qiladi)" },
} as const;
