# CLAUDE.md — SutBozor

SutBozor: uy xo'jaliklari va kichik fermalar (1-10 bosh mol) bilan yaqin atrofdagi do'kon, kafe, nonvoyxona, restoranlarni
bog'laydigan sut mahsulotlari bozori (Telegram Mini App). Mahsulotlar: Sut, Qatiq, Qaymoq, Suzma, Tvorog, Sariyog'.

## MUHIM QOIDALAR

1. Mavjud frontendni o'chirma, SutBozorni noldan qayta yaratma, bosqichma-bosqich ko'chir.
2. Mavjud HTML/CSS/JS ni keraksiz qayta yozma.
3. `localStorage` dagi demo funksiyalarni hozircha saqla.
4. Komissiya 0% (5% ni qaytarma).
5. SutBozor pulni o'zida ushlab turadigan payment platforma EMAS. Kelajakdagi model: Business -> Supplier to'g'ridan-to'g'ri to'lov. To'lov faqat yozib boriladi.
6. Hozir real Click/Payme/Uzum yoki boshqa payment gateway qilma.
7. Ishlamaydigan fake kod yozma. Backendda soxta ma'lumot yo'q: tayyor bo'lmagan endpoint halol 501 qaytaradi.
8. Secretlarni hech qachon kodga, Git'ga, chatga yozma. Ular faqat Render env'da. `.env` tracked bo'lmasin, `.env.example` tracked.
9. Production xavfsizligini frontendga ishonib topshirma: rol va huquq har so'rovda serverda bazadan tekshiriladi.
10. Pul: bazada `BigInt`, API da `number`.
11. Aniq bilmasang taxmin qilma: avval mavjud kodni tekshir.
12. Muammo (dependency, env, konfiguratsiya) chiqsa yashirma: aniq ko'rsat, sababini tushuntir, tuzat.
13. Har o'zgarishni o'zbek tilida, oddiy so'zlar bilan tushuntir.
14. `main` ga to'g'ridan-to'g'ri push qilma: har ish alohida branch va Pull Request. `main` Render'da avtomatik production'ga chiqadi.

---

## Arxitektura xulosasi (hozirgi haqiqiy holat)

Batafsil: `backend/README.md`, `backend/docs/*.md`, `docs/FRONTEND_INTEGRATION.md`. Quyidagi xulosa kodni o'qib tekshirilgan.

### Umumiy rasm
```
Telegram Mini App (index.html, GitHub Pages)
   |  initData  ->  POST /api/auth/telegram  ->  JWT (faqat xotirada)
   v
Backend (backend/, Fastify 5 + TypeScript + Zod + Prisma)  -- Render: https://mizatus.onrender.com
   v
PostgreSQL (Neon)
```

### Frontend (repo ildizi)
- `index.html`: bitta faylli ilova (CSS + ~600 qator JS). Holat global `S` obyektida, `localStorage["sb-site"]` ga saqlanadi (demo).
  Barcha harakatlar `run(action, dataset)` orqali: ruxsat (`ACT_PERM`) -> validatsiya -> holat -> bildirishnoma -> `save()`.
  Xizmatlar: `Auth`, `PaymentService`, `PaymentProviders` (`manual` ishlaydi, `click/payme/uzum` stub), `DisputeService`, `AdminService`, `Notify`, `Validate`.
- `CONFIG.platformCommission = 0`, yagona `fee()` funksiyasi; hamma joyda "Platforma komissiyasi: 0%".
- Demo `admin/admin123` olib tashlangan (A bosqich). `#admin` faqat server tasdiqlagan `ADMIN` bilan ochiladi (`admVerify()`: Telegram kirishi + `GET /api/auth/me`, rol bazadan).
  Panel ichidagi ko'rinish va amallar hali demo (`localStorage`); serverdagi haqiqiy ma'lumot himoyasi backend `requireRole("ADMIN")` da. Alohida admin login (argon2id, 2FA) yo'q.
- Backend qatlami (ilovadan alohida, topilmasa ham sahifa ishlaydi): `env.js` -> `js/config.js` (`SutBozorConfig`) ->
  `js/api/apiClient.js` (token faqat xotirada), `authService`, `productService`, `supplierService`, `orderService`, `contractService`, `paymentService`, `js/api/index.js` (`SutBozorApi.get()`).
- `env.js` hozir: `env: "production"`, `apiBaseUrl: "https://mizatus.onrender.com"`, `useBackend: true`.
  `useBackend: true` bo'lganda `index.html` oxiridagi blok faqat `loginWithTelegram()` ni chaqiradi va `#srv` qatorida ulanish holatini ko'rsatadi.
  Ilovaning o'zi (buyurtma, to'lov va h.k.) hali ham to'liq `localStorage` bilan ishlaydi.
  Alohida server bo'limlari (demo'dan mustaqil): `#reg` (ro'yxatdan o'tish), `#sprod` (supplier mahsulotlari), `#sord` (`srvOrders`: biznes buyurtma beradi/bekor qiladi, supplier qabul/rad etadi va kunlik yetkazish tugmalarini bosadi, shartnoma raqami va yetkazilgan kunlar ko'rinadi).
- `scripts/generate-env.js`: deploy vaqtida `env.js` ni `SUTBOZOR_API_URL`, `SUTBOZOR_ENV`, `SUTBOZOR_USE_BACKEND` dan yozadi. `env.js` ochiq fayl, unga sir yozilmaydi.

### Backend (`backend/`)
- Qatlamlar: `route -> controller -> service -> repository (port)`. Yig'ish joyi: `src/container.ts`, ishga tushirish: `src/server.ts`.
- `src/config/env.ts`: barcha muhit o'zgaruvchilari Zod bilan startda tekshiriladi (xatoda faqat nom va sabab chiqadi, qiymat emas).
  Productionda `DATABASE_URL` majburiy, `CORS_ORIGIN` faqat `https` va `*` taqiqlangan.
- `src/config/constants.ts`: rollar (`business`, `supplier`, `admin`), permissionlar (admin 12, business 8, supplier 10 — frontend `ROLE_PERMS` bilan bir xil),
  statuslar, `PLATFORM_COMMISSION_PERCENT = 0` (env'dan olinmaydi), `CURRENCY = "UZS"`, `TIMEZONE = "Asia/Tashkent"`.
- Fail-closed ulanish (`src/server.ts`): har qism faqat o'z sozlamasi bo'lsa yoqiladi.
  - `DATABASE_URL` yo'q -> entity endpointlari `501 NOT_IMPLEMENTED` (`repositories/notImplemented.ts`).
  - `JWT_SECRET` yoki `TELEGRAM_BOT_TOKEN` yo'q -> Telegram kirishi `501`; Bearer strategiyasi ulanmasa himoyalangan route'lar `501 AUTH_NOT_CONFIGURED`.
- Autentifikatsiya (ishlaydi): `POST /api/auth/telegram` faqat `{ initData }` qabul qiladi (strict). HMAC-SHA256 (`WebAppData`) + `auth_date` yangiligi ->
  `TelegramAccount` profili yangilanadi -> bog'lanmagan bo'lsa `403 ACCOUNT_NOT_LINKED` -> `User` bazadan, faol bo'lmasa `403` ->
  HS256 JWT (`src/auth/jwt.ts`, `node:crypto`, standart 15 daqiqa). **Tokenda rol yo'q**: `src/auth/bearer.strategy.ts` har so'rovda
  foydalanuvchi, rol va holatni bazadan oladi (bloklangan foydalanuvchi darhol 403).
- Ruxsat: `src/middleware/auth.ts` (`requireAuth`, `requireRole`, `requirePermission`), `src/services/scopedRead.service.ts`
  (permission + egalik), `src/policies/ownership.ts`. Begona yozuv uchun 404 (IDOR himoyasi); ro'yxat filtri repository WHERE ichida.
- Endpointlar (`/api` prefiksi):
  | Yo'l | Holat |
  |---|---|
  | `GET /api/health` | ishlaydi (o'ralmagan `{status, service}`, bazani tekshirmaydi) |
  | `GET /api` | modullar ro'yxati |
  | `POST /api/auth/telegram`, `POST /api/auth/register`, `GET /api/auth/me` | ishlaydi (register: rol faqat business\|supplier, holat serverdan, telefon majburiy, email ixtiyoriy) |
  | `GET /api/{users,businesses,suppliers,orders,contracts,payments,disputes,notifications}` va `/:id` | faqat o'qish, auth + permission + egalik |
  | `GET /api/products`, `/:id` | biznes bozorni, supplier o'zinikini ko'radi |
  | `POST /api/orders` | faqat business (`orders.create`): supplierlarni o'zi tanlaydi (`items: [{supplierId, quantityPerDay}]`); narx serverda supplier mahsulotidan olinadi (snapshot), miqdor kunlik hajmdan oshmaydi, faqat faol supplier; `SB-<n>` raqam; buyurtma + audit + bildirishnoma bitta tranzaksiyada |
  | `POST /api/orders/:id/items/:itemId` | `{action, reason?}`: supplier `accept` (shartnoma CT-<n> yaratadi, ACTIVE), `reject`, `prepare`->`ready`->`depart`->`deliver` (kunlik yetkazish, bir kunda bir marta; kun hali hisoblanmaydi), `pause`/`resume`; business `receive` (yetkazilganini tasdiqlaydi: `daysDelivered`+1, oxirgi kunda qism va shartnoma COMPLETED), `cancel` (faqat SENT) va `pickup` (olib ketish rejimi, darhol hisoblanadi). Xaridor o'sha kuni tasdiqlamasa, keyingi harakat oldidan kun avtomatik hisoblanadi (audit `order.auto_receive`). Noto'g'ri holat -> 409, begona -> 404, rad/bekor/to'xtatish uchun sabab majburiy. `accept` to'lov jadvalini ham yaratadi (haftalik/oylik/oldindan; `DELIVERY` bo'lsa har tasdiqlangan kun uchun alohida to'lov `PAY-<n>`) |
  | `POST /api/payments/:id` | `{action}`: business `submit` (usul, tranzaksiya raqami, sana; summa serverda), supplier `confirm` (pul keldi -> PAID) yoki `reject` (sabab, -> DISPUTED; biznes qayta yuboradi). **Pul SutBozor orqali o'tmaydi, faqat yozib boriladi.** Komissiya 0 (`amount = grossAmount = supplierAmount`). Muddati o'tgan PENDING o'qishdan oldin OVERDUE bo'ladi (lazy; cron H bosqichida). Noto'g'ri holat 409, begona 404, tranzaksiya raqami takrori 409 |
  | `POST /api/products`, `PATCH /api/products/:id`, `DELETE /api/products/:id` | faqat supplier (`products.manage`), faqat o'z mahsuloti (begona -> 404); supplierId tokendan, birlik nomdan; audit bilan bitta tranzaksiyada |
  | `GET /api/admin/audit-logs` | faqat `ADMIN` + `audit.view` |
  | `GET /api/auth`, `GET /api/admin` | `501 NOT_IMPLEMENTED` |
  Yozish endpointlari (nizo va h.k.), logout/refresh, admin login **hali yo'q**.
  Frontenddagi `adminLogin()` va `logout()` chaqiradigan yo'llar backendda mavjud emas.
- Javob formati: `{ "success": true, "data": ... }` / `{ "success": false, "error": { code, message, details? } }`, har javobda `x-request-id`.
- Validatsiya: Zod (`src/schemas`, `src/validation`), o'zbekcha xato matnlari, `strictObject` (ortiqcha `role`/`status` maydonlari rad etiladi).
- Xavfsizlik: Helmet, CORS ro'yxati, rate limit (global 100/min, auth 10/min, write 30/min), body limit, `Cache-Control: no-store`,
  log'dan parol/token/initData/sir/to'lov rekvizitlari tozalanadi (`src/logging`).
- Baza: `prisma/schema.prisma` (User, Business, Supplier, Product, Order, OrderItem, Contract, Payment, Dispute, Notification, AuditLog, Rating, Sequence, TelegramAccount).
  Migratsiyalar: `20261015120000_order_item_last_delivered` (`order_items.lastDeliveredOn`), `20261015000000_user_email_optional`, `prisma/migrations/20261011000000_init/migration.sql` (ichida `constraints.sql` dagi CHECK'lar: 0% komissiya
  `platformCommission = 0 AND grossAmount = amount`, manfiy qiymat taqiqi, `users_role_link`, audit_logs faqat qo'shiladi).
  Pul ustunlari `BigInt`; `BigInt <-> number` aylantirish **faqat** `src/repositories/prisma/mappers.ts` da (2^53-1 dan katta qiymat xato).
- Birinchi admin qo'lda SQL bilan yaratiladi: `backend/docs/ADMIN_BOOTSTRAP.md`.

### Sirlar va muhit
- Render env'da: `DATABASE_URL`, `JWT_SECRET` (>= 32 belgi), `TELEGRAM_BOT_TOKEN`, `CORS_ORIGIN`, `NODE_ENV=production`, `TRUST_PROXY` va boshqalar (`backend/.env.example` ro'yxati).
- `.gitignore` (ildiz va `backend/`) `.env`, `.env.*` ni bloklaydi, `!.env.example` ruxsat.
- Sir skaneri: `cd backend && npm run check:secrets`; pre-commit hook: `git config core.hooksPath .githooks`.
- Repoda `render.yaml` yo'q: Render sozlamalari dashboard'da.

### Tekshiruv buyruqlari (backend)
```bash
cd backend
npm ci
npm run typecheck     # prisma generate + tsc --noEmit
npm test              # contract, telegram, auth, register, products, orders, rbac, logging, http (baza kerak emas)
npm run check:secrets
```

### CI
`.github/workflows/ci.yml`: har Pull Request'da `backend/` da `npm ci`, `prisma generate`, typecheck, build, test. Merge'dan oldin yashil bo'lishi shart.
