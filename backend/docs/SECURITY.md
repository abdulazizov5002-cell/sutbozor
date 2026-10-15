# Xavfsizlik asosi

Bu hujjat backenddagi xavfsizlik qatlamini va frontenddagi vaqtinchalik autentifikatsiyani olib tashlash rejasini tavsiflaydi.

## 1. Nima qo'shilgan
| Yo'nalish | Qaerda | Qanday |
|---|---|---|
| CORS | `src/security/config.ts` (`buildCorsOptions`) | Faqat `CORS_ORIGIN` ro'yxatidagi manzillar. `credentials: false` (Bearer token). Productionda faqat `https`, `*` taqiqlangan. Manzil shakli startda tekshiriladi (`https://app.example.com`, oxirida `/` siz). `Origin: null` (lokal `file://`) ruxsat etilmaydi |
| Xavfsizlik sarlavhalari | `buildHelmetOptions` + `NO_STORE_HEADERS` | Helmet, CSP `default-src 'none'` va `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, HSTS (faqat production), `Cache-Control: no-store` |
| So'rov validatsiyasi | `src/validation`, `src/schemas` | Zod, hamma xato 400 (docs/VALIDATION.md) |
| So'rov hajmi va vaqti | `BODY_LIMIT_BYTES` (1 MB), `REQUEST_TIMEOUT_MS` (30 s), `maxParamLength` 100 | Katta so'rov 413, sekin yuboruvchi ulanishni band qila olmaydi |
| Xatolarni boshqarish | `src/middleware/errorHandler.ts` | Stack, parol, yo'l javobga chiqmaydi (docs: README) |
| Muhit o'zgaruvchilari | `src/config/env.ts`, `.env.example` | Zod bilan startda tekshiriladi, xato xabarida qiymat chiqmaydi, bo'sh qiymat = berilmagan |
| Sirlar git'ga tushmasligi | `.gitignore` (ildiz va `backend/`), `scripts/check-secrets.js`, `.githooks/pre-commit` | `npm run check:secrets`; pre-commit: `git config core.hooksPath .githooks` |
| Rate limit | `src/security/rateLimit.ts` | 3 siyosat: global 100/min, auth 10/min, write 30/min (IP bo'yicha) |
| Log | `LOG_REDACT_PATHS` | authorization, cookie, password, initData, token log'ga tushmaydi |

## 2. Rate limit arxitekturasi
- Global limit hamma route'ga (`app.ts`), IP bo'yicha, autentifikatsiyadan oldin.
- Route siyosati: `app.get(path, { config: routeLimit(policies.auth) }, handler)`. Hozir `/api/auth` va `/api/auth/me` da qo'llangan,
  login endpointlari (`POST /api/auth/telegram`, `/admin/login`) shu siyosatni oladi.
- `policies.write` yozish endpointlari uchun tayyor (POST/PATCH/DELETE ulanganda).
- Bitta server uchun xotiradagi hisoblagich yetadi. Bir nechta nusxa bo'lsa `@fastify/rate-limit` ning `redis` opsiyasi ulanadi.
- Proxy orqasida `TRUST_PROXY=true` qo'yilmasa hamma foydalanuvchi bitta IP bo'lib ko'rinadi. Noto'g'ri `true` esa `X-Forwarded-For` soxtalashtirishga yo'l ochadi: faqat haqiqiy proxy bor bo'lsa yoqing.
- Foydalanuvchi bo'yicha limit (`perUserKey`) autentifikatsiyadan keyin route preHandler sifatida keyingi bosqichda qo'shiladi.

## 3. Autentifikatsiya arxitekturasi (keyingi bosqichga tayyor)
```
Authentication (Telegram initData / admin login) -> User -> Role -> Permission
Request -> authenticate (AuthStrategy) -> validate -> service (ruxsat + egalik) -> repository
```
- `src/auth/ports.ts`: `TokenService`, `SessionStore`, `PasswordHasher` (argon2id), `TelegramVerifier`, `UserLookup`.
- `src/auth/bearer.strategy.ts`: `Authorization: Bearer` qat'iy formatda; **foydalanuvchi holati va roli har so'rovda bazadan** olinadi,
  shuning uchun bloklangan foydalanuvchi token amal qilishidan qat'i nazar darhol 403 oladi. Bekor qilingan sessiya 401.
- `AuthenticationError`: strategiya yaroqsiz yoki muddati o'tgan token uchun shuni tashlaydi (401). Baza xatosi 401 ga aylantirilmaydi.
- `GET /api/auth/me`: ishlaydi (strategiya ulangach). Foydalanuvchi, rol va `permissions` ro'yxatini qaytaradi (faqat interfeys uchun).
- Shartnoma: `src/auth/contract.ts`. Zod: `src/schemas/auth.schemas.ts` (`adminLoginBody`, `telegramLoginBody`).
- Sirlar: `JWT_SECRET` (>= 32 belgi), `TELEGRAM_BOT_TOKEN`: faqat muhit o'zgaruvchisida.
- Auth bosqichida hali yozilishi kerak: `TokenService` (JWT/imzolangan token), `SessionStore` (jadval), argon2id hasher, Telegram HMAC tekshiruvi (`auth_date` yangiligi bilan), `POST /api/auth/telegram`, `/admin/login` (2FA), `/refresh`, `/logout`.

## 4. Frontenddan olib tashlash rejasi
Hozir `index.html` da quyidagilar bor. Backend auth tayyor bo'lgach ular olib tashlanadi. Skaner (`check-secrets`) ularni "ma'lum qarz" sifatida
`security/secret-baseline.json` da ushlab turadi: **yangi** sir kodga tushsa commit to'xtaydi, qarz esa har safar eslatiladi.

| Frontenddagi narsa | Qator (index.html script) | Nima bilan almashtiriladi |
|---|---|---|
| ~~`ADMIN_DEMO` (admin / admin123 xeshi)~~ | — | **Olib tashlandi.** Admin panel faqat server roli bilan ochiladi: Telegram kirishi + `GET /api/auth/me`, `role=admin` va `ACTIVE` (rol bazadan) |
| ~~`sha256`, `rndHex`~~ | — | **Olib tashlandi** (xeshlash va token serverda) |
| ~~`admLogin`, `S.sessions`, `S.lock`, `sessionStorage["sb-admin"]`~~ | — | **Olib tashlandi.** O'rniga `admVerify()`: server javobi (`ADM`) faqat xotirada, har `#admin` ga kirishda qayta tekshiriladi. Eski `sb-admin`/`S.sessions` yuklashda tozalanadi |
| `Auth` obyekti (`current`, `adminUser`, `login`, `ctx`) | 122 | `AuthClient`: token xotirada, `GET /api/auth/me` bilan kim ekanligi aniqlanadi |
| `loginRole`, `S.role`, `S.uid`, `S.users` (rol almashtirish) | 130 | Telegram orqali kirish; rol serverdan keladi, foydalanuvchi o'zgartira olmaydi |
| `ROLE_PERMS`, `ACT_PERM`, `VIEW_PERM` bilan ruxsat | 116, 394, 550 | Faqat interfeys uchun: `me.permissions` bilan tugmani yashirish. Haqiqiy tekshiruv serverda |
| `run()` dagi holat o'zgarishi va validatsiya | 396 | API chaqiruvlari (`/orders`, `/payments`, ...); frontend javobni ko'rsatadi |
| `localStorage["sb-site"]` (butun holat) | 272, 275 | API keshi; sirlar va holat serverda |

Tartib: (1) backend auth endpointlari, (2) frontend `AuthClient` va `me` bilan ulanish, (3) `run()` ni API ga o'tkazish, (4) yuqoridagi kodni o'chirish,
(5) `npm run check:secrets -- --update-baseline` bilan baseline'ni bo'shatish. Shundan keyin skaner hech qanday ma'lum qarzsiz o'tishi kerak.

## 5. Hali qilinmagan / cheklovlar
- Haqiqiy server ishga tushirilmagan: Helmet, CORS va rate limit plaginlari faqat sozlama darajasida tekshirilgan (sof funksiyalar va marshrut sozlamalari).
- Frontenddagi demo admin kirishi olib tashlandi, baseline bo'sh. Admin panel ichidagi ko'rinish va amallar hali demo ma'lumot (`localStorage`) ustida ishlaydi:
  panelni ochish brauzerdagi tekshiruv, uni konsoldan chetlab o'tish faqat o'z brauzeridagi demo ma'lumotni ochadi. Serverdagi haqiqiy ma'lumot
  faqat backend `requireRole("ADMIN")` bilan himoyalangan. Alohida admin login (`/api/auth/admin/login`, argon2id, 2FA) hali yo'q: admin Telegram orqali kiradi.
- Parol/MFA, token aylanishi (refresh rotation), sessiyalarni bekor qilish: auth bosqichida.
- Skaner namunaviy qoidalar bilan ishlaydi, u kodni ko'rib chiqishning o'rnini bosmaydi.

## Rol asosidagi kirish nazorati (RBAC middleware)
Frontendda demo admin login yo'q (olib tashlangan). Admin faqat bazadagi `User(role=admin)`: frontend admin panelini ham faqat `GET /api/auth/me` shuni tasdiqlasa ochadi.

`src/middleware/auth.ts`:
| Middleware | Natija |
|---|---|
| `requireAuth()` | tokensiz/yaroqsiz 401; hisob faol emas 403; strategiya ulanmagan 501 |
| `requireRole("ADMIN")`, `requireRole("BUSINESS")`, `requireRole("SUPPLIER")` | avval `requireAuth`, keyin rol mos kelmasa 403 |
| `requireRole("BUSINESS", "SUPPLIER")` | ro'yxatdagi istalgan rol |
| `requirePermission(...)` | rolning permissionlari (service qatlamidagi egalik tekshiruvi bilan birga) |

Qoidalar: rol faqat `AuthUser` dan (bazadagi User), so'rov tanasi/sarlavha/tokendagi da'vodan emas; noto'g'ri sozlash (bo'sh yoki noma'lum rol) route ro'yxatdan o'tishida xato beradi; bir so'rovda strategiya bir marta chaqiriladi. Rol tekshiruvi egalik tekshiruvining o'rnini bosmaydi.

Namuna: `app.get("/x", { preHandler: [requireRole("ADMIN")] }, handler)`. Hozir `/api/admin/*` (audit log) ga `requireRole("ADMIN")` ulangan. Telegram/admin login keyingi bosqichda `setAuthStrategy` orqali ulanadi, route'lar o'zgarmaydi.
Test: `npm run test:rbac` (18 test).

## Logging
Parol, token, Telegram initData, sirlar va to'lov rekvizitlari log'ga yozilmaydi (kalit va qiymat bo'yicha tozalash, tanasiz so'rov logi). Batafsil: `docs/LOGGING.md`.
