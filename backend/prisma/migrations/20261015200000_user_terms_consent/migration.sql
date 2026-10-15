-- Foydalanish shartlariga rozilik: vaqt (server soati) va versiya. Eski foydalanuvchilarda NULL.
-- Idempotent: ustun allaqachon bo'lsa ham `migrate deploy` xato bermaydi.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "termsVersion" TEXT;
