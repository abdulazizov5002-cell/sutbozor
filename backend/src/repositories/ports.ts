import type {
  AuditLog, Business, Contract, Dispute, ISODate, NewAuditLog, Notification, Order, Payment, Product, Supplier, User,
} from "../domain/entities";

/**
 * Repository interfeyslari (ports). Service qatlami faqat shularga tayanadi.
 * Database bosqichida Prisma implementatsiyalari yoziladi va container'ga ulanadi, service/controller o'zgarmaydi.
 */
export interface ListParams {
  page: number;
  limit: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Egalik filtri. Repository uni SO'ROVGA (WHERE) qo'shishi shart, natijani keyin kesmasligi kerak.
 * businessId: shu biznesning yozuvlari. supplierId: shu supplier ishtirok etgan yozuvlar. userId: shu foydalanuvchiniki.
 * Bo'sh obyekt = cheklov yo'q (admin).
 */
export interface Scope {
  businessId?: string;
  supplierId?: string;
  userId?: string;
}

export interface ReadRepository<T> {
  findById(id: string): Promise<T | null>;
  list(scope: Scope, params: ListParams): Promise<Page<T>>;
}

export type UserRepository = ReadRepository<User>;
export type BusinessRepository = ReadRepository<Business>;
export type SupplierRepository = ReadRepository<Supplier>;
export interface NewProduct {
  supplierId: string;
  name: string;
  unit: Product["unit"];
  availableToday: number;
  dailyCapacity: number;
  pricePerUnit: Product["pricePerUnit"];
}
export type ProductPatch = Partial<Pick<Product, "availableToday" | "dailyCapacity" | "pricePerUnit">>;

/**
 * Mahsulot: o'qish + yozish. Har yozish audit yozuvi bilan BITTA tranzaksiyada (`audit` natijadan yozuv quradi).
 * create: (supplierId, name) band bo'lsa 409 tashlaydi. update/remove: topilmasa null.
 */
export interface ProductRepository extends ReadRepository<Product> {
  create(input: NewProduct, audit: (created: Product) => NewAuditLog): Promise<Product>;
  update(id: string, patch: ProductPatch, audit: (updated: Product) => NewAuditLog): Promise<Product | null>;
  remove(id: string, audit: (removed: Product) => NewAuditLog): Promise<Product | null>;
}
export type OrderRepository = ReadRepository<Order>; // Order items bilan birga (aggregate)
export type ContractRepository = ReadRepository<Contract>;
export type DisputeRepository = ReadRepository<Dispute>;

export interface PaymentRepository extends ReadRepository<Payment> {
  /** Rejalashtirilgan ish (cron) uchun: muddati o'tgan PENDING to'lovlarni OVERDUE qiladi, o'zgargan sonni qaytaradi. */
  markOverdue(today: ISODate): Promise<number>;
}

export interface NotificationRepository extends ReadRepository<Notification> {
  markAllRead(userId: string): Promise<void>;
}

/** Audit log faqat qo'shiladi (append-only): update va delete yo'q. */
export interface AuditLogRepository extends ReadRepository<AuditLog> {
  append(entry: NewAuditLog): Promise<AuditLog>;
}

export interface Repositories {
  users: UserRepository;
  businesses: BusinessRepository;
  suppliers: SupplierRepository;
  products: ProductRepository;
  orders: OrderRepository;
  contracts: ContractRepository;
  payments: PaymentRepository;
  disputes: DisputeRepository;
  notifications: NotificationRepository;
  audit: AuditLogRepository;
}
