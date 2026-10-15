# Migratsiyalar (baza o'zgarishlari) tartibi

Render `prisma migrate deploy` ni **ishga tushirmaydi** (`build` = `tsc`, `start` = `node dist/server.js`).
Shuning uchun baza o'zgarishi bor har PR'da SQL **qo'lda** qo'llanadi. Yangi kod eski bazada ishlamaydi:
Prisma `users` kabi jadvaldan barcha ustunlarni o'qiydi, ustun yo'q bo'lsa har so'rov `P2022` bilan yiqiladi
(masalan: "The column `users.termsAcceptedAt` does not exist in the current database").

## Tartib (har migratsiyali PR uchun)

1. PR'da yangi papka bor: `backend/prisma/migrations/<vaqt>_<nom>/migration.sql`. Barcha migratsiyalar idempotent (`IF NOT EXISTS`), takror ishga tushirish zarar qilmaydi.
2. **Merge'dan OLDIN** shu SQL'ni Neon'da **asosiy (production) branch**da ishga tushiring.
3. Keyin PR'ni merge qiling. Render yangi kodni chiqaradi.
4. Merge'dan keyin: ilovani qayta oching, `/api/ready` va Render **Logs** ni tekshiring (`P2022` yoki `does not exist` bo'lmasligi kerak).

Eslatma: yangi ustun qo'shish eski kodga zarar qilmaydi (eski kod uni o'qimaydi), shuning uchun "avval SQL, keyin merge" tartibi xavfsiz. Ustunni o'chirish yoki nomini o'zgartirish bo'lsa, tartib boshqacha bo'ladi (avval kodni o'zgartirib chiqarish, keyin ustunni olib tashlash).

## Eng ko'p xato: noto'g'ri branch

Neon SQL Editor tepasida qaysi branch tanlangani ko'rinadi. **Snapshot branch** (zaxira nusxa) tanlangan bo'lsa, SQL unga tushadi va production o'zgarmaydi.
Ishga tushirishdan oldin: tepada asosiy branch (`Default`/`Primary`) nomi turganini tekshiring.

## Tekshirish

Ustun bor-yo'qligini asosiy branch'da shunday ko'rish mumkin (misol, rozilik ustunlari):

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'users' AND column_name LIKE 'terms%';
```

## Kelajak

`prisma migrate deploy` ni avtomatlashtirish uchun avval baseline (`_prisma_migrations` ni to'ldirish) va Neon "direct" ulanish manzili kerak. Bu pilotdan keyin, zaxira nusxa bilan birga rejalashtiriladi.
