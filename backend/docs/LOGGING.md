# Request logging

Har so'rov tugaganda **bitta** yozuv (`request completed`): `requestId`, `method`, `route` (shablon, masalan `/api/payments/:id/submit`), tozalangan `query`, `statusCode`, `ms`, kirgan bo'lsa `userId` va `role`. Fastify'ning o'zining req/res yozuvlari o'chirilgan (`disableRequestLogging`), shuning uchun sarlavha va tana hech qachon yozilmaydi. Xato javobidagi `x-request-id` log yozuvidagi `reqId` bilan mos, shu orqali xatoni topish mumkin.

## Log'ga tushmaydi
| Nima | Qanday himoyalanadi |
|---|---|
| parol (`password`, `passHash`...) | kalit nomi bo'yicha yashiriladi + `password=...` matn naqshi |
| token (`token`, `accessToken`, Bearer, JWT, `Authorization`, `Cookie`) | kalit + `Bearer ...` va JWT naqshi |
| Telegram `initData` va `hash`, bot token | kalit + initData qatori (url-encoded ham) + bot token naqshi; `x-telegram-init-data` sarlavhasi |
| sirlar (`secret`, `apiKey`, DB URL paroli) | kalit + ulanish manzilidagi parol (`user:[REDACTED]@host` ko'rinishida) |
| to'lovning maxfiy ma'lumoti (`transactionId`, `cardNumber`, `cvv`, `iban`, `accountNumber`) | kalit + karta raqami naqshi (13-19 raqam, 4-4-4-4) |
| so'rov/javob tanasi, barcha sarlavhalar | umuman yozilmaydi |

To'lov summasi, holati va ID'si (`PAY-1`) log'ga yozilishi mumkin: ular audit uchun kerak va maxfiy rekvizit emas. Qiymati yashirilishi kerak bo'lgan yangi kalit bo'lsa, `src/logging/redact.ts` dagi `SENSITIVE_FRAGMENTS` ga qo'shing.

## Qatlamlar
1. Pino `redact` yo'llari (`src/security/config.ts`): ma'lum sarlavha/maydonlar.
2. `serializers`: `req` = `{id, method, tozalangan url}`, `res` = `{statusCode}`, `err` = tur, kod, tozalangan xabar va 12 qator stack.
3. `hooks.logMethod`: `request.log.info(...)` ga berilgan HAR QANDAY obyekt, matn va xato chuqur tozalanadi (kalit va qiymat bo'yicha, chuqurlik 6, 50 kalit, matn 500 belgi, aylanma havola xavfsiz).

Baza xatolari xabarida so'rov qiymatlari bo'lishi mumkin; shuning uchun xato xabari ham tozalanadi va qisqartiriladi, lekin xom `console.log` ishlatmang: faqat `request.log` / `app.log`.

## Tekshirilgan
`npm run test:logging` (11 test): kalit va qiymat naqshlari, URL query, cheklovlar, hook, serializer, yakuniy yozuv. Haqiqiy pino/Fastify bilan ishga tushirilmagan (tarmoq yo'q): hook va serializer imzolari pino 9 / Fastify 5 hujjatiga ko'ra yozilgan, birinchi `npm install` dan keyin bitta so'rov yuborib log'ni ko'zdan kechiring.
