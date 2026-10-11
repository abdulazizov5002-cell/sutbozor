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
