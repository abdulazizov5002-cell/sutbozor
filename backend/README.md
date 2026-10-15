# SutBozor backend

SutBozor: kichik uy xo'jaliklari (1-10 bosh chorva) va yaqin atrofdagi do'kon, kafe, nonvoyxona, qandolatxona, restoran, mehmonxonalarni
sut mahsulotlari (sut, qatiq, qaymoq, suzma, tvorog, sariyog') bo'yicha bog'laydigan bozor. Bu papka uning **backend asosi** (foundation).

Holat: asos, baza (Neon) va Telegram orqali kirish (HMAC + JWT) ishlaydi. Biznes yozish amallari (ro'yxatdan o'tish, mahsulot, buyurtma va h.k.) hali yo'q. Frontend (`../index.html`) backendga ulanib, kirishni sinaydi; qolgan ilova hali brauzer xotirasi (demo) bilan ishlaydi.

---

## 1. Backend nima qiladi

Hozir backend quyidagilarni qiladi:

- **Server asosi**: Node.js + TypeScript + Fastify, Zod bilan tekshiriladigan sozlamalar, CORS, Helmet, rate limit, so'rov hajmi limiti.
- **Yagona javob va xato formati**: `{ "success": true, "data": ... }` yoki `{ "success": false, "error": { "code", "message" } }`. Stack, parol va ichki yo'llar javobga chiqmaydi.
- **Validatsiya**: Zod sxemalari (params, query, body), noto'g'ri so'rovga `400 VALIDATION_ERROR`.
- **Ruxsat tizimi**: `admin`, `business`, `supplier` rollari, ularning permissionlari va egalik qoidalari (boshqaning yozuvi uchun 404). Middleware: `requireAuth()`, `requireRole("ADMIN" | "BUSINESS" | "SUPPLIER")`, `requirePermission(...)`.
- **Ma'lumotlar qatlami**: route -> controller -> service -> repository. Prisma/PostgreSQL implementatsiyasi yozilgan (13 model + Telegram hisobi), `DATABASE_URL` berilsa ulanadi.
- **Faqat o'qish endpointlari**: ro'yxat va bitta yozuv (users, businesses, suppliers, orders, contracts, payments, disputes, notifications, admin audit log).
- **Xavfsiz log**: so'rov logi tana va sarlavhasiz, parol/token/Telegram initData/sirlar/to'lov rekvizitlari yashiriladi.
- **Telegram kirishi**: initData HMAC bilan tekshiriladi, bog'langan foydalanuvchiga qisqa muddatli JWT beriladi (rol bazadan). Sirlar yo'q bo'lsa 501.

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
npm run test:auth       # HMAC (mustaqil vektor), JWT, login oqimi, Bearer
npm run test:rbac       # requireAuth / requireRole
npm run test:logging    # log tozalash
npm run check:secrets   # maxfiy ma'lumot skaneri
```
`test:http` Node'ning o'rnatilgan `node:test` va Fastify'ning `inject()` idan foydalanadi, qo'shimcha kutubxona kerak emas.

`DATABASE_URL`siz ham server ishlaydi (health va modul ro'yxati), entity endpointlari `501` beradi. Frontend bilan sinash: frontend manzilini `CORS_ORIGIN` ga qo'shing (`../docs/FRONTEND_INTEGRATION.md`).

---

## 6. Production build

`package-lock.json` repoda bor, shuning uchun CI va serverda `npm ci` ishlaydi. Render'da build `devDependencies` ni ham o'rnatishi kerak (`npm install --include=dev && npm run build`), chunki TypeScript va Prisma CLI shularda.

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
- Frontenddagi demo admin (`admin/admin123`) olib tashlangan: admin panel faqat server `ADMIN` roli bilan ochiladi (`docs/SECURITY.md`). Birinchi admin: `docs/ADMIN_BOOTSTRAP.md`.

Server `SIGINT`/`SIGTERM` da to'g'ri to'xtaydi (ulanishlar yopiladi).

---

## 7. API structure

Barcha yo'llar `/api` prefiksi bilan. Qatlamlar: `route -> controller -> service -> repository (port)`, yig'ish joyi `src/container.ts`.

| Yo'l | Holat |
|---|---|
| `GET /api/health` | ishlaydi |
| `GET /api` | modullar ro'yxati |
| `POST /api/products`, `PATCH /api/products/:id`, `DELETE /api/products/:id` | ishlaydi: faqat supplier (`products.manage`) va faqat o'z mahsuloti (begonasi `404`). `supplierId` tokendan, birlik (L/kg) nomdan olinadi, narx musbat butun so'm. Har yozish audit yozuvi bilan bitta tranzaksiyada. Takror (supplier, nom) `409`. Mahsulot nomini o'zgartirib bo'lmaydi |
| `POST /api/orders`, `POST /api/orders/:id/items/:itemId` | ishlaydi (D bosqichi): business supplierlarni o'zi tanlab buyurtma beradi, narx serverda supplier mahsulotidan olinadi, miqdor kunlik hajmdan oshmaydi, `SB-<n>` raqam `sequences` jadvalidan. Supplier o'z qismini `accept`/`reject`, business SENT qismini `cancel` qiladi (faqat SENT holatida, aks holda `409`; begona `404`). Audit va bildirishnoma bitta tranzaksiyada. Shartnoma, yetkazish va to'lov keyingi bosqichlarda |
| `POST /api/orders/:id/items/:itemId` (E bosqichi) | harakatlar: `accept` shartnoma yaratadi (`CT-<n>`, bugundan `days` kun, narx snapshot), `prepare`/`ready`/`depart`/`deliver` kunlik yetkazish sikli (bir kunda bir marta), `receive` (xaridor tasdiqlaydi: `daysDelivered`+1; oxirgi kunda `COMPLETED`; o'sha kuni tasdiqlamasa keyingi harakat oldidan avtomatik), `pickup` (olib ketish, darhol hisoblanadi), `pause`/`resume`. Yangi ustun `order_items.lastDeliveredOn` — deploydan OLDIN migratsiyani qo'llang |
| `POST /api/disputes`, `POST /api/disputes/:id` (F bosqichi) | Nizo: business/supplier ochadi (o'z buyurtmasi/to'lovi/shartnomasi bo'yicha, `DS-<n>`), faqat admin holatini o'zgartiradi (`UNDER_REVIEW`, `RESOLVED`/`REJECTED` yechim bilan, `CLOSED`). Takroriy ochiq nizo 409. Pul harakati va to'lov holati o'zgarmaydi. Baza o'zgarishi yo'q (`disputes` jadvali va `sequences`da `dispute` qatori) |
| `POST /api/payments/:id` (F bosqichi) | `submit` (business: usul, tranzaksiya raqami, sana; summa serverda), `confirm`/`reject` (supplier). Faqat yozib borish, pul SutBozor orqali o'tmaydi, gateway yo'q. To'lov yozuvlarini server yaratadi: shartnoma faollashganda jadval (`WEEKLY` 7 kun, `MONTHLY` 30 kun, `PREPAID` bitta), `DELIVERY` bo'lsa har tasdiqlangan kun uchun. Summa BigInt'da, yig'indi butun muddat summasiga teng. Komissiya 0. Baza o'zgarishi yo'q (`sequences` jadvalida `payment` qatori avtomatik paydo bo'ladi) |
| `GET /api/{users,suppliers,businesses,products,orders,contracts,payments,disputes,notifications}` va `/:id` | ulangan: autentifikatsiya + permission + egalik. token yo'q yoki yaroqsiz bo'lsa `401`; `JWT_SECRET` sozlanmagan bo'lsa `501 AUTH_NOT_CONFIGURED`; baza yo'q bo'lsa `501 NOT_IMPLEMENTED` |
| `GET /api/admin/audit-logs` | faqat `ADMIN` roli + `audit.view` |
| `GET /api/auth/me` | autentifikatsiya strategiyasi ulangach ishlaydi |
| `POST /api/auth/telegram` | ishlaydi: initData HMAC tekshiruvi, bog'langan faol foydalanuvchiga token |
| `POST /api/auth/register` | ishlaydi: `{initData, role: business\|supplier, name, phone, email?, organization}`; tashkilot + foydalanuvchi + Telegram bog'lash bitta tranzaksiyada; `201` va token; telefon/email band bo'lsa `409` |
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

Sxema Neon PostgreSQL'ga `20261011000000_init` migratsiyasi bilan qo'llangan. Biznes jadvallari ustida yozish amallari bosqichma-bosqich qo'shiladi; sxemani o'zgartirish har safar yangi migratsiya bilan bo'ladi (mavjudini tahrirlamang). Quyidagi ro'yxat boshlang'ich o'rnatish uchun tarixiy qo'llanma.

1. PostgreSQL yarating va `.env` ga `DATABASE_URL` yozing.
2. `npx prisma validate`
3. `npx prisma migrate dev --name init --create-only`
4. Hosil bo'lgan `migration.sql` oxiriga `prisma/constraints.sql` mazmunini qo'shing (0% komissiya CHECK, manfiy qiymat taqiqi, `audit_logs` o'zgarmasligi triggerlari, `users_role_link`).
5. `npx prisma migrate dev` va productionda `npm run prisma:deploy`.
6. Qilinadigan ishlar: seed ma'lumotlar (ishlab chiqish uchun alohida), ko'rinadigan ID hisoblagichlari (`SB-1001`, `PAY-7`, ...) uchun `Sequence`, `Rating` repository, yozish endpointlari (tranzaksiyalar bilan), `markOverdue` rejalashtirilgan ishi.

Qoidalar: pul `BigInt` (butun so'm), API'da `number`; komissiya 0% bazada CHECK bilan ham himoyalangan; audit log faqat qo'shiladi. Batafsil: `docs/DOMAIN_MODEL.md`.

---

## 10. Telegram authentication (ishlaydi) va keyingi qadamlar

**Hozirgi holat** (`docs/TELEGRAM.md`, `docs/ADMIN_BOOTSTRAP.md`): `POST /api/auth/telegram` faqat `{ "initData": "..." }` qabul qiladi (`role`, `userId` kabi maydonlar 400). Tartib:
1. initData tuzilmasi tekshiriladi (`400 INVALID_INIT_DATA`).
2. **Imzo**: `secret = HMAC_SHA256("WebAppData", BOT_TOKEN)`, `HMAC_SHA256(secret, dataCheckString)` `hash` bilan doimiy vaqtda solishtiriladi, `auth_date` yangiligi tekshiriladi (`TELEGRAM_INIT_DATA_MAX_AGE_SEC`). Muvaffaqiyatsiz: `401`.
3. `TelegramAccount` profili yangilanadi (rolga tegmaydi).
4. Hisob foydalanuvchiga bog'lanmagan bo'lsa: `403 ACCOUNT_NOT_LINKED`, token berilmaydi.
5. **Rol va holat faqat bazadagi `User` dan**; faol bo'lmasa `403`. Frontend yuborgan rolga ishonilmaydi.
6. Qisqa muddatli JWT (HS256, `ACCESS_TOKEN_TTL_MIN`, standart 15 daqiqa) beriladi. Tokenda rol yo'q. Har so'rovda `Bearer` token tekshirilib, foydalanuvchi va uning roli bazadan olinadi, shuning uchun bloklangan foydalanuvchi darhol 403 oladi.

Yoqish uchun uchta narsa kerak: `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `JWT_SECRET`. Biri yo'q bo'lsa tegishli qism fail-closed qoladi (501), server ishga tushadi.

**Keyingi bosqichlar (hali yo'q):**
- Ro'yxatdan o'tish (`POST /api/auth/register`) tayyor. Qoidalar: rol faqat `business`/`supplier` (`admin` tanlab bo'lmaydi), kimlik faqat tasdiqlangan initData'dan, holat serverdan (`REGISTRATION_INITIAL_STATUS` = `ACTIVE`, qaror: admin tasdiqlamaydi), telefon majburiy va unique, email ixtiyoriy.
  **Ma'lum cheklov:** telefon raqami tasdiqlanmaydi (SMS/Telegram kontakt yo'q), shuning uchun kimdir boshqaning raqami bilan ro'yxatdan o'tib, uni band qilib qo'yishi mumkin. Pilotdan oldin: admin tasdiqlashi (`PENDING` + admin endpointlari) yoki Telegram kontakt orqali tasdiqlash qo'shiladi.
  **Migratsiya:** `20261015000000_user_email_optional` (`users.email` NULL ruxsat). Yangi kod chiqishidan oldin qo'llang: `npx prisma migrate deploy` yoki Neon SQL Editor'da `ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;` (qayta bajarilsa xavfsiz).
- Birinchi admin qo'lda yaratiladi (`docs/ADMIN_BOOTSTRAP.md`); admin hech qachon ro'yxatdan o'tish orqali yaratilmaydi.
- Frontend: admin panel server roliga bog'langan (bajarildi). Qolgani: biznes/supplier ko'rinishlarini API ma'lumotiga o'tkazish (`docs/SECURITY.md`).
- Sessiyani bekor qilish (logout): sessiya jadvali qo'shilgach. Hozircha token 15 daqiqada tugaydi, bloklash esa darhol ishlaydi.
- Admin uchun alohida kirish (argon2id parol, 2FA).

---

## Qo'shimcha hujjatlar

`docs/AUDIT.md` (frontend audit), `docs/DOMAIN_MODEL.md`, `docs/VALIDATION.md`, `docs/SECURITY.md`, `docs/LOGGING.md`, `docs/TELEGRAM.md`, `docs/ADMIN_BOOTSTRAP.md`, frontend ulash: `../docs/FRONTEND_INTEGRATION.md`.

## Tekshirilganlik haqida

`test:contract`, `test:telegram`, `test:rbac`, `test:logging` tarmoqsiz muhitda ishga tushirilgan va o'tgan. `test:http` haqiqiy Fastify bilan (GitHub Codespaces, Node 22) ishga tushirilgan: 28 test, 28 o'tdi. TypeScript tekshiruvi Fastify/Prisma o'rniga stub'lar bilan o'tkazilgan. `npm install`, haqiqiy server, Helmet/CORS/rate limit plaginlari va PostgreSQL bilan ishlash **birinchi marta shu mashinangizda** tekshirilishi kerak: `npm install && npm run prisma:generate && npm run typecheck && npm test`, so'ng `npm run dev` va `curl /api/health`.
