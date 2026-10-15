/**
 * Frontend (index.html) dagi mavjud biznes tuzilmasining server nusxasi.
 * Qiymatlar frontenddagi ROLE_PERMS, CONFIG va status ro'yxatlari bilan bir xil saqlanadi.
 * O'zgartirsangiz frontend bilan birga o'zgartiring.
 */

/** Platforma komissiyasi: hozircha 0%. Muhit o'zgaruvchisidan olinmaydi, tasodifan o'zgarmasligi uchun. */
export const PLATFORM_COMMISSION_PERCENT = 0 as const;
/** Frontendda "so'm", bazada ISO kodi. */
export const CURRENCY = "UZS" as const;
export const PAYMENT_PERIOD_DAYS = 7 as const;
/** Biznes vaqt zonasi: "bugun" va muddatlar shu zona bo'yicha hisoblanadi. */
export const TIMEZONE = "Asia/Tashkent" as const;

export const ROLES = ["business", "supplier", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Route himoyasida ishlatiladigan rol nomlari (requireRole("ADMIN")). Ichki qiymatlar ROLES bilan bir xil (kichik harf). */
export const ROLE_NAMES = { ADMIN: "admin", BUSINESS: "business", SUPPLIER: "supplier" } as const satisfies Record<string, Role>;
export type RoleName = keyof typeof ROLE_NAMES;

export const USER_STATUSES = ["ACTIVE", "BLOCKED", "PENDING"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * Yangi ro'yxatdan o'tgan hisobning boshlang'ich holati. Qaror: avtomatik faol (admin tasdiqlamaydi).
 * Telefon raqami tasdiqlanmaydi, shuning uchun soxta hisoblar ochilishi mumkin. Admin tasdiqlashini yoqish uchun "PENDING" qilinadi
 * (login PENDING'ga 403 beradi), lekin admin tasdiqlash endpointlari ham qo'shilishi shart.
 */
export const REGISTRATION_INITIAL_STATUS: UserStatus = "ACTIVE";

export const PERMISSIONS = {
  admin: [
    "dashboard.view", "orders.view", "payments.view", "payments.manage", "contracts.view", "contracts.manage",
    "businesses.view", "suppliers.view", "disputes.manage", "audit.view", "settings.manage", "users.manage",
  ],
  business: [
    "market.view", "orders.create", "orders.view", "payments.view", "payments.submit",
    "contracts.create", "profile.manage", "disputes.create",
  ],
  supplier: [
    "products.manage", "orders.view", "orders.accept", "orders.reject", "delivery.update", "payments.view",
    "payments.confirm", "contracts.view", "disputes.create", "profile.manage",
  ],
} as const satisfies Record<Role, readonly string[]>;

export type Permission = (typeof PERMISSIONS)[Role][number];

export const PAYMENT_STATUSES = ["PENDING", "PAYMENT_SUBMITTED", "PAID", "OVERDUE", "CANCELLED", "DISPUTED"] as const;
export const PAYMENT_SCHEDULES = ["DELIVERY", "WEEKLY", "MONTHLY", "PREPAID"] as const;
export const CONTRACT_STATUSES = ["DRAFT", "PENDING", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"] as const;
/** Buyurtmaning supplier qismi (frontendda order.parts[]), bazada OrderItem. */
export const ORDER_ITEM_STATUSES = ["SENT", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"] as const;
export const DELIVERY_STATUSES = ["SCHEDULED", "PREPARING", "READY", "IN_TRANSIT", "DELIVERED"] as const;
export const DELIVERY_MODES = ["supplier", "pickup"] as const;
export const DISPUTE_STATUSES = ["OPEN", "UNDER_REVIEW", "RESOLVED", "REJECTED", "CLOSED"] as const;
export const DISPUTE_REASONS = ["NOT_DELIVERED", "WRONG_QTY", "QUALITY", "PAYMENT", "LATE", "PRICE", "OTHER"] as const;
export const NOTIFICATION_TYPES = [
  "order.new", "order.accepted", "order.rejected", "order.cancelled", "order.paused", "order.resumed", "delivery.ready", "delivery.done", "payment.due",
  "payment.submitted", "payment.confirmed", "payment.overdue", "payment.unconfirmed", "dispute.open", "dispute.resolved", "contract.cancelled",
] as const;

/** Keyingi bosqichlarda ishga tushadigan API modullari. */
export const API_MODULES = [
  "auth", "users", "suppliers", "businesses", "products", "orders",
  "contracts", "payments", "disputes", "notifications", "admin",
] as const;
export type ApiModule = (typeof API_MODULES)[number];

/** Qiymat turlari (yuqoridagi ro'yxatlardan olinadi, qo'lda takrorlanmaydi). */
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type PaymentSchedule = (typeof PAYMENT_SCHEDULES)[number];
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export type OrderItemStatus = (typeof ORDER_ITEM_STATUSES)[number];
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export type DeliveryMode = (typeof DELIVERY_MODES)[number];
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];
export type DisputeReason = (typeof DISPUTE_REASONS)[number];
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Mahsulotlar va qo'lda to'lov usullari (frontenddagi CAT va PaymentProviders.manual.methods bilan bir xil). */
export const PRODUCT_NAMES = ["Sut", "Qatiq", "Qaymoq", "Suzma", "Tvorog", "Sariyog'"] as const;
export type ProductName = (typeof PRODUCT_NAMES)[number];
/** Birlik mahsulot nomidan serverda aniqlanadi (mijoz yubormaydi). Frontenddagi CAT bilan bir xil. */
export const PRODUCT_UNITS = {
  Sut: "L", Qatiq: "L", Qaymoq: "L", Suzma: "kg", Tvorog: "kg", "Sariyog'": "kg",
} as const satisfies Record<ProductName, "L" | "kg">;
export const PAYMENT_METHODS = ["Naqd", "Bank o'tkazmasi", "Karta → karta"] as const;
