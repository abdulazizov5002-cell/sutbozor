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
- Demo admin (`ADMIN_DEMO`, `#admin`) hali bor: bu **ma'lum xavfsizlik qarzi** (`backend/docs/SECURITY.md`, `backend/security/secret-baseline.json`).
  Backend uni tanimaydi; uni faqat backend admin kirishi tayyor bo'lgach olib tashlash kerak.
- Backend qatlami (ilovadan alohida, topilmasa ham sahifa ishlaydi): `env.js` -> `js/config.js` (`SutBozorConfig`) ->
  `js/api/apiClient.js` (token faqat xotirada), `authService`, `productService`, `orderService`, `paymentService`, `js/api/index.js` (`SutBozorApi.get()`).
- `env.js` hozir: `env: "production"`, `apiBaseUrl: "https://mizatus.onrender.com"`, `useBackend: true`.
  `useBackend: true` bo'lganda `index.html` oxiridagi blok faqat `loginWithTelegram()` ni chaqiradi va `#srv` qatorida ulanish holatini ko'rsatadi.
  Ilovaning o'zi (buyurtma, to'lov va h.k.) hali ham to'liq `localStorage` bilan ishlaydi.
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
  | `POST /api/auth/telegram`, `GET /api/auth/me` | ishlaydi |
  | `GET /api/{users,businesses,suppliers,products,orders,contracts,payments,disputes,notifications}` va `/:id` | faqat o'qish, auth + permission + egalik |
  | `GET /api/admin/audit-logs` | faqat `ADMIN` + `audit.view` |
  | `GET /api/auth`, `GET /api/admin` | `501 NOT_IMPLEMENTED` |
  Yozish endpointlari (buyurtma, to'lov, nizo va h.k.), ro'yxatdan o'tish, logout/refresh, admin login **hali yo'q**.
  Frontenddagi `adminLogin()` va `logout()` chaqiradigan yo'llar backendda mavjud emas.
- Javob formati: `{ "success": true, "data": ... }` / `{ "success": false, "error": { code, message, details? } }`, har javobda `x-request-id`.
- Validatsiya: Zod (`src/schemas`, `src/validation`), o'zbekcha xato matnlari, `strictObject` (ortiqcha `role`/`status` maydonlari rad etiladi).
- Xavfsizlik: Helmet, CORS ro'yxati, rate limit (global 100/min, auth 10/min, write 30/min), body limit, `Cache-Control: no-store`,
  log'dan parol/token/initData/sir/to'lov rekvizitlari tozalanadi (`src/logging`).
- Baza: `prisma/schema.prisma` (User, Business, Supplier, Product, Order, OrderItem, Contract, Payment, Dispute, Notification, AuditLog, Rating, Sequence, TelegramAccount).
  Migratsiya: `prisma/migrations/20261011000000_init/migration.sql` (ichida `constraints.sql` dagi CHECK'lar: 0% komissiya
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
npm test              # contract, telegram, auth, rbac, logging, http (baza kerak emas)
npm run check:secrets
```

### Hujjatlardagi eskirgan joylar (kod bilan solishtirilgan, hali tuzatilmagan)
- `backend/README.md` 1-bo'lim: "frontend hozircha backendga ulanmagan", "autentifikatsiya yo'q" deyilgan — aslida Telegram kirishi ishlaydi va frontend ulanishni sinaydi.
- `backend/README.md` 6-bo'lim: "`package-lock.json` hali yo'q" — aslida commit qilingan.
- `backend/README.md` 9-bo'lim va `schema.prisma` boshidagi izoh: "QORALAMA, migratsiya yaratilmagan" — aslida `20261011000000_init` migratsiyasi bor.
- `docs/FRONTEND_INTEGRATION.md`: "`useBackend: false`", "Telegram initData bilan kirish backendda yozilmagan" — eskirgan.
- `env.js` izohi "`useBackend: true` (standart) bo'lsa ... demo bilan ishlaydi" deydi; `js/config.js` va `generate-env.js` da standart `false`.

Bu joylar alohida PR'da tuzatiladi.
