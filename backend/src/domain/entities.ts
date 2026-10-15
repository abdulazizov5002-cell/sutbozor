import type {
  ContractStatus, DeliveryMode, DeliveryStatus, DisputeReason, DisputeStatus, NotificationType,
  OrderItemStatus, PaymentSchedule, PaymentStatus, Role, UserStatus,
} from "../config/constants";
import type { Money } from "./money";

/**
 * Domain entity'lar: frontenddagi (index.html) real shakllarning serverdagi ko'rinishi.
 * `id` ichki identifikator (bazada kalit), `publicId` foydalanuvchiga ko'rinadigan kod (SB-1001, PAY-7, CT-3, DSP-2).
 * Sana: ISODate = YYYY-MM-DD (Asia/Tashkent), vaqt: ISODateTime = UTC ISO 8601.
 */
export type ISODate = string;
export type ISODateTime = string;

export interface User {
  id: string;
  name: string;
  phone: string;
  /** Ixtiyoriy: ro'yxatdan o'tishda faqat telefon majburiy (Postgres'da bir nechta NULL unique'ga to'sqinlik qilmaydi). */
  email: string | null;
  role: Role;
  businessId: string | null;
  supplierId: string | null;
  status: UserStatus;
  createdAt: ISODateTime;
  lastLoginAt: ISODateTime | null;
}

export interface Business {
  id: string;
  name: string;
  type: string;
  area: string;
  address: string;
  rating: number;
  ratingCount: number;
  createdAt: ISODateTime;
}

export interface Supplier {
  id: string;
  name: string;
  area: string;
  deliveryRadiusKm: number;
  rating: number;
  ratingCount: number;
  createdAt: ISODateTime;
}

export interface Product {
  id: string;
  supplierId: string;
  name: string;
  unit: "L" | "kg";
  availableToday: number;
  dailyCapacity: number;
  pricePerUnit: Money;
}

/** Frontendda order.parts[]: buyurtmaning bitta supplier qismi. */
export interface OrderItem {
  id: string;
  orderId: string;
  supplierId: string;
  quantityPerDay: number;
  pricePerUnit: Money;
  status: OrderItemStatus;
  deliveryStatus: DeliveryStatus;
  daysDelivered: number;
  contractId: string | null;
}

export interface Order {
  id: string;
  publicId: string;
  businessId: string;
  product: string;
  quantityPerDay: number;
  days: number;
  deliveryMode: DeliveryMode;
  paymentSchedule: PaymentSchedule;
  prepTime: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  items: OrderItem[];
}

export interface Contract {
  id: string;
  publicId: string;
  orderId: string | null;
  businessId: string;
  supplierId: string;
  product: string;
  quantityPerDay: number;
  unit: "L" | "kg";
  pricePerUnit: Money;
  days: number;
  startDate: ISODate;
  endDate: ISODate;
  paymentSchedule: PaymentSchedule;
  deliveryMode: DeliveryMode;
  status: ContractStatus;
  createdAt: ISODateTime;
}

export interface Payment {
  id: string;
  publicId: string;
  orderId: string;
  contractId: string;
  businessId: string;
  supplierId: string;
  amount: Money;
  currency: "UZS";
  paymentPeriod: PaymentSchedule;
  periodNo: number;
  fromDay: number;
  toDay: number;
  days: number;
  dueDate: ISODate;
  paidAt: ISODate | null;
  paymentMethod: string | null;
  transactionId: string | null;
  status: PaymentStatus;
  note: string;
  /** Komissiya summasi: hozircha doim 0. grossAmount === supplierAmount (invariants.ts). */
  platformCommission: Money;
  grossAmount: Money;
  supplierAmount: Money;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Dispute {
  id: string;
  publicId: string;
  orderId: string;
  paymentId: string | null;
  contractId: string | null;
  openedBy: Extract<Role, "business" | "supplier">;
  openedById: string;
  businessId: string;
  supplierId: string;
  reason: DisputeReason;
  description: string;
  status: DisputeStatus;
  createdAt: ISODateTime;
  resolvedAt: ISODateTime | null;
  resolution: string | null;
  resolvedBy: string | null;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: ISODateTime;
}

export interface AuditLog {
  id: string;
  ts: ISODateTime;
  actorId: string | null;
  actorName: string;
  actorRole: Role | "system";
  action: string;
  objectType: string;
  objectId: string;
  description: string;
}
export type NewAuditLog = Omit<AuditLog, "id" | "ts"> & { ts?: ISODateTime };

/**
 * Tasdiqlangan Telegram identifikatori. Foydalanuvchi (User) va uning ROLI bu yerdan EMAS, bazadagi `User` dan olinadi:
 * hisob `userId` ga bog'lanmaguncha (administrator yoki ro'yxatdan o'tish jarayoni orqali) hech qanday huquq berilmaydi.
 * Profil maydonlari (username, ism, rasm) faqat kriptografik tekshiruvdan o'tgan ma'lumotdan yoziladi.
 */
export interface TelegramAccount {
  id: string;
  telegramId: string; // bazada BigInt, API da string (aniqlik yo'qolmasligi uchun)
  username: string | null;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
  languageCode: string | null;
  userId: string | null;
  firstSeenAt: ISODateTime;
  lastLoginAt: ISODateTime | null;
}
