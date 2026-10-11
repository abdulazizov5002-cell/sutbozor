# Telegram tayyorgarligi

Holat: **tayyorlov**. Kriptografik tekshiruv (HMAC) hali yozilmagan, shuning uchun hozir hech kim Telegram orqali kira olmaydi (fail-closed).

## Qabul qilinadigan ma'lumot
Telegram WebApp `initData` (query-string): `user` (JSON: `id`, `username`, `first_name`, `last_name`, `photo_url`, `language_code`), `auth_date`, `hash`, `query_id`, `start_param`.

## Oqim (`POST /api/auth/telegram`, body: faqat `{ initData }`)
1. Body strict: `role`, `userId`, `telegramId` yuborilsa 400 (`telegramLoginBody`). Qattiq rate limit, body 8 KB.
2. `parseInitData` (`src/auth/telegram/initData.ts`): faqat **tuzilma** tekshiruvi. Chegaralar: 4096 belgi, 20 maydon, qiymat 2048, kalit 64; takroriy/bo'sh kalit taqiqlangan; `hash` 64 kichik hex; `auth_date` butun son; `user` JSON sxemaga mos (id musbat xavfsiz butun, ism boshqaruv belgilarisiz, `photo_url` faqat Telegram'ning https manzili). Noma'lum maydonlar (jumladan `role`) tashlab yuboriladi. Natija `trusted: false`. Xato: 400 `INVALID_INIT_DATA` (qiymat xabarga qo'shilmaydi).
3. `TelegramVerifier.verify` (hozir `createUnimplementedTelegramVerifier`): 501.
4. Keyingi bosqich: HMAC tekshiruvi muvaffaqiyatli bo'lsa `VerifiedTelegramIdentity`, aks holda 401.

## Rol qoidasi
- Telegram turlarida (`TelegramUserProfile`, `VerifiedTelegramIdentity`, `TelegramAccount`) `role` maydoni **yo'q**.
- Rol faqat `TelegramAccount.userId` orqali topiladigan `User.role` dan olinadi. `userId = null` bo'lsa hisob hech qanday huquq olmaydi.
- `TelegramAccountStore.upsertProfile` faqat profil maydonlarini yozadi; `userId` ni hech qachon o'zgartirmaydi (testlangan).
- Telegram ID bazada `BigInt` (unique, CHECK > 0), API'da string.

## Keyingi bosqich (qilinishi kerak)
- `TelegramVerifier`: `secret = HMAC_SHA256("WebAppData", BOT_TOKEN)`, `expected = HMAC_SHA256(secret, dataCheckString)`, `timingSafeEqual` bilan solishtirish, `isFresh(authDate, now, TELEGRAM_INIT_DATA_MAX_AGE_SEC)`. Amalga oshirishdan oldin Telegram'ning joriy hujjati va test vektorlari bilan solishtiring.
- Token/sessiya (`TokenService`, `SessionStore`), birinchi kirishda `TelegramAccount` yaratish va `User` bilan bog'lash jarayoni (rolni server/admin belgilaydi).
- `BOT_TOKEN` faqat muhit o'zgaruvchisida, log va javobga chiqmaydi.

## Tekshirilgan
`npm run test:telegram`: 52 test (parser chegaralari, zararli kirish, `role` e'tiborsiz, 501/400/401 yo'llari, repository `userId`/`role` yozmasligi). Haqiqiy Fastify/Prisma/PostgreSQL bilan ishga tushirilmagan (tarmoq yo'q).
