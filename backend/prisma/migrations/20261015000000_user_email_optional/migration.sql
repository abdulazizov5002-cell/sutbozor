-- Ro'yxatdan o'tishda faqat telefon majburiy, email ixtiyoriy.
-- Bir nechta NULL email PostgreSQL'da UNIQUE'ga to'sqinlik qilmaydi (unique faqat kiritilgan email'lar uchun).
-- Idempotent: ustun allaqachon NULL ruxsat etsa ham xato bermaydi (qo'lda SQL bilan qo'llangan bo'lsa ham `migrate deploy` ishlaydi).
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
