-- CreateEnum
CREATE TYPE "Role" AS ENUM ('business', 'supplier', 'admin');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'PENDING');

-- CreateEnum
CREATE TYPE "Unit" AS ENUM ('L', 'kg');

-- CreateEnum
CREATE TYPE "DeliveryMode" AS ENUM ('supplier', 'pickup');

-- CreateEnum
CREATE TYPE "PaymentSchedule" AS ENUM ('DELIVERY', 'WEEKLY', 'MONTHLY', 'PREPAID');

-- CreateEnum
CREATE TYPE "OrderItemStatus" AS ENUM ('SENT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('SCHEDULED', 'PREPARING', 'READY', 'IN_TRANSIT', 'DELIVERED');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'PENDING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAYMENT_SUBMITTED', 'PAID', 'OVERDUE', 'CANCELLED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DisputeReason" AS ENUM ('NOT_DELIVERED', 'WRONG_QTY', 'QUALITY', 'PAYMENT', 'LATE', 'PRICE', 'OTHER');

-- CreateEnum
CREATE TYPE "RatingSide" AS ENUM ('TO_SUPPLIER', 'TO_BUSINESS');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "businessId" TEXT,
    "supplierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "deliveryRadiusKm" INTEGER NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "Unit" NOT NULL,
    "availableToday" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "dailyCapacity" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "pricePerUnit" BIGINT NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "quantityPerDay" DECIMAL(10,2) NOT NULL,
    "days" INTEGER NOT NULL,
    "deliveryMode" "DeliveryMode" NOT NULL,
    "paymentSchedule" "PaymentSchedule" NOT NULL,
    "prepTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "quantityPerDay" DECIMAL(10,2) NOT NULL,
    "pricePerUnit" BIGINT NOT NULL,
    "status" "OrderItemStatus" NOT NULL DEFAULT 'SENT',
    "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'SCHEDULED',
    "daysDelivered" INTEGER NOT NULL DEFAULT 0,
    "contractId" TEXT,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "orderId" TEXT,
    "businessId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "quantityPerDay" DECIMAL(10,2) NOT NULL,
    "unit" "Unit" NOT NULL,
    "pricePerUnit" BIGINT NOT NULL,
    "days" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "paymentSchedule" "PaymentSchedule" NOT NULL,
    "deliveryMode" "DeliveryMode" NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "paymentPeriod" "PaymentSchedule" NOT NULL,
    "periodNo" INTEGER NOT NULL,
    "fromDay" INTEGER NOT NULL,
    "toDay" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "paidAt" DATE,
    "paymentMethod" TEXT,
    "transactionId" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT NOT NULL DEFAULT '',
    "platformCommission" BIGINT NOT NULL DEFAULT 0,
    "grossAmount" BIGINT NOT NULL,
    "supplierAmount" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT,
    "contractId" TEXT,
    "openedBy" "Role" NOT NULL,
    "openedById" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "reason" "DisputeReason" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "resolvedBy" TEXT,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "side" "RatingSide" NOT NULL,
    "scores" JSONB NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequences" (
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sequences_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "telegram_accounts" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "photoUrl" TEXT,
    "languageCode" TEXT,
    "userId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "telegram_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_businessId_idx" ON "users"("businessId");

-- CreateIndex
CREATE INDEX "users_supplierId_idx" ON "users"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "products_supplierId_name_key" ON "products"("supplierId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "orders_publicId_key" ON "orders"("publicId");

-- CreateIndex
CREATE INDEX "orders_businessId_idx" ON "orders"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_contractId_key" ON "order_items"("contractId");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_supplierId_idx" ON "order_items"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_publicId_key" ON "contracts"("publicId");

-- CreateIndex
CREATE INDEX "contracts_businessId_idx" ON "contracts"("businessId");

-- CreateIndex
CREATE INDEX "contracts_supplierId_idx" ON "contracts"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_publicId_key" ON "payments"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_transactionId_key" ON "payments"("transactionId");

-- CreateIndex
CREATE INDEX "payments_status_dueDate_idx" ON "payments"("status", "dueDate");

-- CreateIndex
CREATE INDEX "payments_businessId_idx" ON "payments"("businessId");

-- CreateIndex
CREATE INDEX "payments_supplierId_idx" ON "payments"("supplierId");

-- CreateIndex
CREATE INDEX "payments_contractId_idx" ON "payments"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "disputes_publicId_key" ON "disputes"("publicId");

-- CreateIndex
CREATE INDEX "disputes_status_idx" ON "disputes"("status");

-- CreateIndex
CREATE INDEX "disputes_businessId_idx" ON "disputes"("businessId");

-- CreateIndex
CREATE INDEX "disputes_supplierId_idx" ON "disputes"("supplierId");

-- CreateIndex
CREATE INDEX "notifications_userId_read_idx" ON "notifications"("userId", "read");

-- CreateIndex
CREATE INDEX "audit_logs_ts_idx" ON "audit_logs"("ts");

-- CreateIndex
CREATE INDEX "audit_logs_objectType_objectId_idx" ON "audit_logs"("objectType", "objectId");

-- CreateIndex
CREATE UNIQUE INDEX "ratings_orderItemId_side_key" ON "ratings"("orderItemId", "side");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_accounts_telegramId_key" ON "telegram_accounts"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_accounts_userId_key" ON "telegram_accounts"("userId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_accounts" ADD CONSTRAINT "telegram_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prisma sxemasida ifodalab bo'lmaydigan qoidalar. Birinchi migratsiyaga (init) qo'shiladi:
--   npx prisma migrate dev --name init --create-only   -> hosil bo'lgan migration.sql oxiriga shu faylni qo'shing -> npx prisma migrate dev
-- Jadval va ustun nomlari Prisma'ning (@@map) nomlari; ustunlar camelCase bo'lgani uchun qo'shtirnoqda.

-- 0% komissiya: platforma komissiya olmaydi, supplier to'liq summani oladi.
ALTER TABLE payments ADD CONSTRAINT payments_zero_commission
  CHECK ("platformCommission" = 0 AND "grossAmount" = "amount" AND "supplierAmount" = "grossAmount" - "platformCommission");
ALTER TABLE payments ADD CONSTRAINT payments_amount_nonneg CHECK ("amount" >= 0);
ALTER TABLE payments ADD CONSTRAINT payments_days_valid CHECK ("fromDay" >= 1 AND "toDay" >= "fromDay" AND "days" >= 1);

-- Manfiy narx va miqdor mumkin emas.
ALTER TABLE products ADD CONSTRAINT products_nonneg CHECK ("pricePerUnit" >= 0 AND "availableToday" >= 0 AND "dailyCapacity" >= 0);
ALTER TABLE orders ADD CONSTRAINT orders_valid CHECK ("quantityPerDay" > 0 AND "days" BETWEEN 1 AND 365);
ALTER TABLE order_items ADD CONSTRAINT order_items_valid CHECK ("quantityPerDay" > 0 AND "pricePerUnit" >= 0 AND "daysDelivered" >= 0);
ALTER TABLE contracts ADD CONSTRAINT contracts_valid CHECK ("quantityPerDay" > 0 AND "pricePerUnit" >= 0 AND "days" BETWEEN 1 AND 365 AND "endDate" >= "startDate");

-- Foydalanuvchi bitta tomonga tegishli: business roli faqat businessId, supplier roli faqat supplierId, admin ikkalasisiz.
ALTER TABLE users ADD CONSTRAINT users_role_link CHECK (
  (role = 'business' AND "businessId" IS NOT NULL AND "supplierId" IS NULL) OR
  (role = 'supplier' AND "supplierId" IS NOT NULL AND "businessId" IS NULL) OR
  (role = 'admin'    AND "businessId" IS NULL     AND "supplierId" IS NULL));

-- Audit log o'zgarmas: UPDATE va DELETE taqiqlangan.
CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_logs jadvali faqat qo''shish uchun (append-only)'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

-- Telegram ID musbat son (Telegram foydalanuvchi ID'si 0 yoki manfiy bo'lmaydi).
ALTER TABLE telegram_accounts ADD CONSTRAINT telegram_accounts_id_positive CHECK ("telegramId" > 0);
