# Birinchi admin va Telegram hisobini bog'lash

Telegram orqali kirish endi ishlaydi (`POST /api/auth/telegram`), lekin **hech kim o'zini admin qila olmaydi**: rol faqat bazadagi `User` dan olinadi,
Telegram hisobi esa foydalanuvchiga bog'lanmaguncha hech qanday huquq olmaydi (403 `ACCOUNT_NOT_LINKED`).
Ro'yxatdan o'tish (Business/Supplier o'zi yaratishi) keyingi bosqichda qo'shiladi. Birinchi admin bir marta qo'lda yaratiladi.

## Qadamlar (Neon -> SQL Editor)
1. O'z Telegram ID raqamingizni biling (faqat raqam, masalan 123456789). Masalan, @userinfobot ga yozing.
2. Neon konsolida: loyiha -> **SQL Editor**.
3. Quyidagini qo'yib, `+998XXXXXXXXX`, `sizning@email.uz` va `123456789` ni o'z qiymatlaringizga almashtiring, so'ng **Run**:

```sql
WITH u AS (
  INSERT INTO users (id, name, phone, email, role, status)
  VALUES (gen_random_uuid()::text, 'Admin', '+998XXXXXXXXX', 'sizning@email.uz', 'admin', 'ACTIVE')
  RETURNING id
)
INSERT INTO telegram_accounts (id, "telegramId", "firstName", "userId")
SELECT gen_random_uuid()::text, 123456789, 'Admin', id FROM u;
```

4. Tekshirish:

```sql
SELECT u.role, u.status, t."telegramId" FROM users u JOIN telegram_accounts t ON t."userId" = u.id;
```

Natija: bitta qator, `admin`, `ACTIVE`, sizning Telegram ID'ingiz.

## Xavfsizlik
- Bu SQL faqat sizning Neon hisobingizda ishlaydi; kodda yoki GitHub'da admin yo'q.
- Faqat o'z Telegram ID'ingizni yozing. Boshqa odamning ID'si unga admin huquqi beradi.
- Bu usul vaqtinchalik: ro'yxatdan o'tish va admin tasdiqlash oqimi qo'shilgach, qo'lda SQL kerak bo'lmaydi.
- Foydalanuvchini bloklash: `UPDATE users SET status = 'BLOCKED' WHERE email = '...';` Token amal qilib tursa ham keyingi so'rovda 403 olinadi (holat har so'rovda bazadan tekshiriladi).
