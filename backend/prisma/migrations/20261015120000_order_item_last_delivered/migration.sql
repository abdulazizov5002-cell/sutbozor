-- E bosqichi: bir kunda bir marta yetkazishni qayd etish uchun oxirgi yetkazilgan sana.
-- Idempotent: qo'lda SQL bilan qo'llangan bo'lsa ham `migrate deploy` xato bermaydi.
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "lastDeliveredOn" DATE;
