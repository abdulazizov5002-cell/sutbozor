# SutBozor backend

SutBozor: kichik uy xo'jaliklari (1-10 bosh chorva) va yaqin atrofdagi do'kon, kafe, nonvoyxona, qandolatxona, restoran, mehmonxonalarni
sut mahsulotlari (sut, qatiq, qaymoq, suzma, tvorog, sariyog') bo'yicha bog'laydigan bozor. Bu papka uning **backend asosi** (foundation).

Holat: asos tayyor, biznes mantiq va autentifikatsiya hali yo'q. Frontend (`../index.html`) o'zgartirilmagan va hozircha backendga ulanmagan.

---

## 1. Backend nima qiladi

Hozir backend quyidagilarni qiladi:

- **Server asosi**: Node.js + TypeScript + Fastify, Zod bilan tekshiriladigan sozlamalar, CORS, Helmet, rate limit, so'rov hajmi limiti.
- **Yagona javob va xato formati**: `{ "success": true, "data": ... }` yoki `{ "success": false, "error": { "code", "message" } }`. Stack, parol va ichki yo'llar javobga chiqmaydi.
- **Validatsiya**: Zod sxemalari (params, query, body), noto'g'ri so'rovga `400 VALIDATION_ERROR`.
- **Ruxsat tizimi**: `admin`, `business`, `supplier` rollari, ularning permissionlari va egalik qoidalari (boshqaning yozuvi uchun 404). Middleware: `requireAuth()`, `requireRole("ADMIN" | "BUSINESS" | "SUPPLIER")`, `requirePermission(...)`.
- **Ma'lumotlar qatlami**: route -> controller -> service -> repository. Prisma/PostgreSQL implementatsiyasi yozilgan (13 model + Telegram hisobi), `DATABASE_URL` berilsa ulanadi.
- **Faqat o'qish endpointlari**: ro'yxat va bitta yozuv (users, businesses, suppliers, products, orders, contracts, payments, disputes, notifications, admin audit log).
- **Xavfsiz log**: so'rov logi tana va sarlavhasiz, parol/token/Telegram initData/sirlar/to'lov rekvizitlari yashiriladi.
- **Telegram tayyorgarligi**: initData tuzilmasi tekshiriladi, kriptografik tekshiruv va kirish hali yo'q.

Hozir **yo'q**: haqiqiy autentifikatsiya (token/sessiya), yozish endpointlari (yaratish/o'zgartirish), seed ma'lumotlar, to'lov provayderlari.
Platforma komissiyasi **0%** (`PLATFORM_COMMISSION_PERCENT = 0`, muhit o'zgaruvchisidan olinmaydi), pul summalari bazada `BigInt` (butun so'm).

Soxta ma'lumot qaytarilmaydi: ulanmagan qism `501` beradi.

---

## 2. Requirements

| Nima | Versiya |
|---|---|
| Node.js | 20 yoki yangi (22 da sinalgan) |
| npm | Node bilan keladigan versiya |
| PostgreSQL | 14+ (faqat Database bosqichi uchun; hozir ixtiyoriy) |

---

## 3. Installation

```bash
cd backend
npm install
npm run prisma:generate    # Prisma Client turlarini hosil qiladi (typecheck va build oldidan avtomatik ham ishlaydi)
cp .env.example .env       # so'ng .env ni o'zingizga moslang
```

`.env` faylini **Git'ga qo'shmang** (`.gitignore` da turibdi). Commit oldidan `npm run check:secrets` ishlating; repozitoriya ildizidagi `.githooks/pre-commit` ham shuni tekshiradi (yoqish: `git config core.hooksPath .githooks`).

---

## 4. Environment variables

Hammasi `src/config/env.ts` da Zod bilan tekshiriladi. Noto'g'ri qiymat bo'lsa server ishga tushmaydi va faqat o'zgaruvchi nomi hamda sababi chiqadi (qiymat chiqmaydi).

| O'zgaruvchi | Standart | Izoh |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test`, `production` |
| `PORT` | `3000` | |
| `HOST` | `0.0.0.0` | |
| `DATABASE_URL` | yo'q | PostgreSQL manzili. **Productionda majburiy.** Developmentda bo'lmasa entity endpointlari `501` qaytaradi |
| `CORS_ORIGIN` | `http://localhost:5173` | Vergul bilan ajratilgan frontend manzillari (`https://app.example.com`, oxirida `/` siz). Productionda faqat `https`, `*` taqiqlangan |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |
| `BODY_LIMIT_BYTES` | `1048576` | So'rov hajmi (1 KB - 10 MB) |
| `REQUEST_TIMEOUT_MS` | `30000` | |
| `RATE_LIMIT_WINDOW_SEC` | `60` | Rate limit oynasi |
| `RATE_LIMIT_MAX` | `100` | Oynadagi umumiy so'rovlar (IP bo'yicha) |
| `RATE_LIMIT_AUTH_MAX` | `10` | `/api/auth` uchun qattiq limit |
| `RATE_LIMIT_WRITE_MAX` | `30` | Yozish so'rovlari uchun |
| `TRUST_PROXY` | `false` | Nginx/Cloudflare orqasida `true` qiling, aks holda limit noto'g'ri IP ko'radi |
| `JWT_SECRET` | yo'q | Keyingi bosqichda majburiy bo'ladi. Kamida 32 belgi, tasodifiy |
| `ACCESS_TOKEN_TTL_MIN` | `15` | Keyingi bosqich |
| `TELEGRAM_BOT_TOKEN` | yo'q | Keyingi bosqich (initData tekshiruvi) |
| `TELEGRAM_INIT_DATA_MAX_AGE_SEC` | `86400` | initData eskirish muddati |

Tasodifiy sir hosil qilish:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```
Haqiqiy qiymatlar faqat `.env` yoki hosting sirlar bo'limida turadi. `.env.example` da faqat joy egalari bor.

---

## 5. Development serverni ishga tushirish

```bash
npm run dev          # tsx watch, http://localhost:3000, o'zgarishda qayta ishga tushadi
npm run typecheck    # tsc --noEmit
```

Testlar (baza va tarmoq kerak emas):
```bash
npm test                # hammasi ketma-ket
npm run test:contract   # xato xaritasi, 404, CORS/Helmet sozlamasi, validatsiya, health (Fastify'siz)
npm run test:http       # haqiqiy Fastify: app.inject() bilan health, 404, buzilgan JSON, validatsiya, CORS, error handler, rate limit
npm run test:telegram   # initData tahlili, Telegram hisob saqlash
npm run test:rbac       # requireAuth / requireRole
npm run test:logging    # log tozalash
npm run check:secrets   # maxfiy ma'lumot skaneri
```
`test:http` Node'ning o'rnatilgan `node:test` va Fastify'ning `inject()` idan foydalanadi, qo'shimcha kutubxona kerak emas.

`DATABASE_URL`siz ham server ishlaydi (health va modul ro'yxati), entity endpointlari `501` beradi. Frontend bilan sinash: frontend manzilini `CORS_ORIGIN` ga qo'shing (`../docs/FRONTEND_INTEGRATION.md`).

---

## 6. Production build

`package-lock.json` hali yo'q (u faqat birinchi `npm install` dan keyin hosil bo'ladi). Birinchi marta o'z mashinangizda `npm install` qiling va hosil bo'lgan `package-lock.json` ni commit qiling; shundan keyingina serverda `npm ci` ishlaydi.

```bash
npm ci               # lock fayl commit qilingandan keyin (birinchi marta: npm install)
npm run prisma:generate
npm run build        # dist/ ga kompilyatsiya qiladi
NODE_ENV=production npm start    # node dist/server.js
```

Productionda tekshiring:
- `NODE_ENV=production`, `DATABASE_URL`, `CORS_ORIGIN` (faqat `https`) berilgan.
- `TRUST_PROXY=true`, agar reverse proxy orqasida bo'lsa.
- `.env` serverda, repozitoriyda emas. Sirlar hosting muhitidan beriladi.
- `LOG_LEVEL=info` yoki yuqori.
- HTTPS proxy darajasida (Nginx, Caddy, Cloudflare).
- Frontenddagi demo admin (`admin/admin123`) **hali olib tashlanmagan** (ma'lum qarz, reja `docs/SECURITY.md` da). Haqiqiy foydalanuvchilarga ochishdan oldin bu hal qilinishi shart.

Server `SIGINT`/`SIGTERM` da to'g'ri to'xtaydi (ulanishlar yopiladi).

---

## 7. API structure

Barcha yo'llar `/api` prefiksi bilan. Qatlamlar: `route -> controller -> service -> repository (port)`, yig'ish joyi `src/container.ts`.

| Yo'l | Holat |
|---|---|
| `GET /api/health` | ishlaydi |
| `GET /api` | modullar ro'yxati |
| `GET /api/{users,suppliers,businesses,products,orders,contracts,payments,disputes,notifications}` va `/:id` | ulangan: autentifikatsiya + permission + egalik. Hozir autentifikatsiya yo'q, shuning uchun `501 AUTH_NOT_CONFIGURED`; baza yo'q bo'lsa `501 NOT_IMPLEMENTED` |
| `GET /api/admin/audit-logs` | faqat `ADMIN` roli + `audit.view` |
| `GET /api/auth/me` | autentifikatsiya strategiyasi ulangach ishlaydi |
| `POST /api/auth/telegram` | tayyorlov: tuzilma tekshiriladi, keyin `501` (token berilmaydi) |
| `GET /api/auth`, `GET /api/admin` | `501 NOT_IMPLEMENTED` |

Javob formati:
```json
{ "success": true, "data": {} }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [] } }
```

Xato kodlari: `VALIDATION_ERROR` 400, `INVALID_INIT_DATA` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `PAYLOAD_TOO_LARGE` 413, `RATE_LIMITED` 429, `NOT_IMPLEMENTED` / `AUTH_NOT_CONFIGURED` 501, `SERVICE_UNAVAILABLE` 502-504, `INTERNAL_ERROR` 500. Har javobda `x-request-id` sarlavhasi bor (log bilan bog'lash uchun).

Rollar va permissionlar: `admin` 12, `business` 8, `supplier` 10 (frontenddagi `ROLE_PERMS` bilan bir xil).

Papkalar:
```
src/config        env, constants (rollar, permissionlar, statuslar, komissiya 0%)
src/domain        entity turlari, Money, invariantlar
src/repositories  ports, prisma/ (BigInt <-> number), notImplemented
src/policies      egalik qoidalari
src/services      permission, scopedRead, audit, health
src/controllers   entity (umumiy), auth, health, foundation
src/routes        /api route'lari
src/middleware    errorHandler, auth (requireAuth, requireRole, requirePermission)
src/auth          portlar, Bearer strategiya, telegram/ (initData)
src/security      CORS, sarlavhalar, rate limit
src/logging       log tozalash
src/schemas       Zod sxemalari
src/validation    validate() va o'zbekcha xato matnlari
prisma/           schema.prisma, constraints.sql
docs/             AUDIT, DOMAIN_MODEL, VALIDATION, SECURITY, LOGGING, TELEGRAM
tests/            contract, http, telegram, rbac, logging
scripts/          check-secrets.js
```

---

## 8. Health check

```bash
curl http://localhost:3000/api/health
```
```json
{ "status": "ok", "service": "sutbozor-backend" }
```

Bu javob o'ralmagan (`success/data`siz), monitoring va load balancer uchun. Hozir u bazani tekshirmaydi, faqat jarayon tirik ekanini ko'rsatadi.

---

## 9. Database keyingi bosqichi

`prisma/schema.prisma` hozir **qoralama (DRAFT)**: migratsiya yaratilmagan, baza ulanmagan, haqiqiy PostgreSQL bilan sinalmagan. Biznes jadvallari shu bosqichda ko'rib chiqilib tasdiqlanadi.

1. PostgreSQL yarating va `.env` ga `DATABASE_URL` yozing.
2. `npx prisma validate`
3. `npx prisma migrate dev --name init --create-only`
4. Hosil bo'lgan `migration.sql` oxiriga `prisma/constraints.sql` mazmunini qo'shing (0% komissiya CHECK, manfiy qiymat taqiqi, `audit_logs` o'zgarmasligi triggerlari, `users_role_link`).
5. `npx prisma migrate dev` va productionda `npm run prisma:deploy`.
6. Qilinadigan ishlar: seed ma'lumotlar (ishlab chiqish uchun alohida), ko'rinadigan ID hisoblagichlari (`SB-1001`, `PAY-7`, ...) uchun `Sequence`, `Rating` repository, yozish endpointlari (tranzaksiyalar bilan), `markOverdue` rejalashtirilgan ishi.

Qoidalar: pul `BigInt` (butun so'm), API'da `number`; komissiya 0% bazada CHECK bilan ham himoyalangan; audit log faqat qo'shiladi. Batafsil: `docs/DOMAIN_MODEL.md`.

---

## 10. Telegram authentication keyingi bosqichi

Hozirgi holat (`docs/TELEGRAM.md`): `POST /api/auth/telegram` faqat `{ "initData": "..." }` qabul qiladi (`role`, `userId` kabi maydonlar 400). initData **tuzilmasi** tekshiriladi (uzunlik va maydon chegaralari, `hash` shakli, `auth_date`, `user` JSON), noto'g'ri bo'lsa `400 INVALID_INIT_DATA`, to'g'ri bo'lsa `501`. Imzo tekshirilmaydi, token berilmaydi.

Keyingi bosqichda:
1. **Imzoni tekshirish** (`TelegramVerifier`): `secret = HMAC_SHA256("WebAppData", BOT_TOKEN)`, `HMAC_SHA256(secret, dataCheckString)` ni `hash` bilan doimiy vaqtda solishtirish, `auth_date` yangiligi (`TELEGRAM_INIT_DATA_MAX_AGE_SEC`). Yozishdan oldin Telegram'ning joriy hujjati bilan solishtiring.
2. **Hisob**: tasdiqlangan identifikator bo'yicha `TelegramAccount` yaratish/yangilash (Prisma saqlash kodi yozilgan, `container` ga hali ulanmagan).
3. **Rol faqat serverda**: rol `TelegramAccount.userId` orqali bog'langan `User.role` dan olinadi. Bog'lanmagan hisob hech qanday huquq olmaydi. Frontend yuborgan rolga ishonilmaydi.
4. **Token va sessiya**: `TokenService`, `SessionStore`, `setAuthStrategy(createBearerStrategy(...))`. Shundan keyin `requireRole(...)` va barcha himoyalangan route'lar ishlay boshlaydi.
5. **Admin kirishi**: Telegramdan alohida (argon2id parol, 2FA). Frontenddagi `admin/admin123`, frontend rol tekshiruvi va frontend-only autentifikatsiya olib tashlanadi (reja `docs/SECURITY.md` da).
6. Kerakli sozlamalar: `TELEGRAM_BOT_TOKEN`, `JWT_SECRET` (`.env` da, kodda emas).

---

## Qo'shimcha hujjatlar

`docs/AUDIT.md` (frontend audit), `docs/DOMAIN_MODEL.md`, `docs/VALIDATION.md`, `docs/SECURITY.md`, `docs/LOGGING.md`, `docs/TELEGRAM.md`, frontend ulash: `../docs/FRONTEND_INTEGRATION.md`.

## Tekshirilganlik haqida

`test:contract`, `test:telegram`, `test:rbac`, `test:logging` tarmoqsiz muhitda ishga tushirilgan va o'tgan. `test:http` haqiqiy Fastify bilan (GitHub Codespaces, Node 22) ishga tushirilgan: 28 test, 28 o'tdi. TypeScript tekshiruvi Fastify/Prisma o'rniga stub'lar bilan o'tkazilgan. `npm install`, haqiqiy server, Helmet/CORS/rate limit plaginlari va PostgreSQL bilan ishlash **birinchi marta shu mashinangizda** tekshirilishi kerak: `npm install && npm run prisma:generate && npm run typecheck && npm test`, so'ng `npm run dev` va `curl /api/health`.
