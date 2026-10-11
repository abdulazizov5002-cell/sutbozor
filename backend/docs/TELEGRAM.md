# Telegram tayyorgarligi

Holat: **ishlaydi** (HMAC + JWT). `TELEGRAM_BOT_TOKEN`, `JWT_SECRET` va `DATABASE_URL` bo'lmasa kirish fail-closed (501). Birinchi admin: `docs/ADMIN_BOOTSTRAP.md`.

## Qabul qilinadigan ma'lumot
Telegram WebApp `initData` (query-string): `user` (JSON: `id`, `username`, `first_name`, `last_name`, `photo_url`, `language_code`), `auth_date`, `hash`, `query_id`, `start_param`.

## Oqim (`POST /api/auth/telegram`, body: faqat `{ initData }`)
1. Body strict: `role`, `userId`, `telegramId` yuborilsa 400 (`telegramLoginBody`). Qattiq rate limit, body 8 KB.
2. `parseInitData` (`src/auth/telegram/initData.ts`): faqat **tuzilma** tekshiruvi. Chegaralar: 4096 belgi, 20 maydon, qiymat 2048, kalit 64; takroriy/bo'sh kalit taqiqlangan; `hash` 64 kichik hex; `auth_date` butun son; `user` JSON sxemaga mos (id musbat xavfsiz butun, ism boshqaruv belgilarisiz, `photo_url` faqat Telegram'ning https manzili). Noma'lum maydonlar (jumladan `role`) tashlab yuboriladi. Natija `trusted: false`. Xato: 400 `INVALID_INIT_DATA` (qiymat xabarga qo'shilmaydi).
3. `TelegramVerifier.verify` (`createTelegramVerifier`): `secret = HMAC_SHA256("WebAppData", BOT_TOKEN)`, `HMAC_SHA256(secret, dataCheckString)` ni `hash` bilan `timingSafeEqual` bilan solishtiradi, `auth_date` yangiligini tekshiradi (hujjat bo'yicha faqat `hash` chiqarib tashlanadi). Muvaffaqiyatsiz: 401. Token yo'q bo'lsa `createUnimplementedTelegramVerifier`: 501.
4. `TelegramAccount` profili yangilanadi; bog'lanmagan hisob: 403 `ACCOUNT_NOT_LINKED`.
5. Bog'langan faol `User` (rol bazadan) uchun qisqa muddatli JWT beriladi (`src/auth/jwt.ts`, HS256, tokenda rol yo'q).

## Rol qoidasi
- Telegram turlarida (`TelegramUserProfile`, `VerifiedTelegramIdentity`, `TelegramAccount`) `role` maydoni **yo'q**.
- Rol faqat `TelegramAccount.userId` orqali topiladigan `User.role` dan olinadi. `userId = null` bo'lsa hisob hech qanday huquq olmaydi.
- `TelegramAccountStore.upsertProfile` faqat profil maydonlarini yozadi; `userId` ni hech qachon o'zgartirmaydi (testlangan).
- Telegram ID bazada `BigInt` (unique, CHECK > 0), API'da string.

## Keyingi bosqich (qilinishi kerak)
- Ro'yxatdan o'tish: yangi Telegram hisobi uchun `User` yaratish (Business/Supplier rolini foydalanuvchi tanlaydi, `admin` hech qachon), admin tasdiqlashi.
- Sessiyani bekor qilish (`SessionStore`, logout) va refresh.
- `BOT_TOKEN` va `JWT_SECRET` faqat muhit o'zgaruvchisida, log va javobga chiqmaydi (ishlaydi).

## Tekshirilgan
`npm run test:auth`: 32 test (HMAC mustaqil Python vektori, o'zgartirilgan/eskirgan/boshqa token initData, JWT alg=none va muddat, login: bog'lanmagan/bloklangan/rol bazadan, Bearer zanjiri).
`npm run test:telegram`: 52 test (parser chegaralari, zararli kirish, `role` e'tiborsiz, 501/400/401 yo'llari, repository `userId`/`role` yozmasligi). Haqiqiy Fastify/Prisma/PostgreSQL bilan ishga tushirilmagan (tarmoq yo'q).
