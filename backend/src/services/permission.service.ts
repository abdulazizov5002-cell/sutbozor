import { PERMISSIONS, type Permission, type Role } from "../config/constants";

/**
 * Server tomonidagi ruxsat tekshiruvi. Frontenddagi tugmani yashirish xavfsizlik hisoblanmaydi:
 * har bir himoyalangan endpoint requirePermission() orqali shu funksiyani chaqirishi shart.
 */
export function permissionsOf(role: Role): readonly Permission[] {
  return PERMISSIONS[role] as readonly Permission[];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return permissionsOf(role).includes(permission);
}

/** Ro'yxat bo'sh bo'lsa faqat autentifikatsiya talab qilinadi (masalan, o'z bildirishnomalari). */
export function hasAnyPermission(role: Role, anyOf: readonly Permission[]): boolean {
  return anyOf.length === 0 || anyOf.some((p) => hasPermission(role, p));
}
