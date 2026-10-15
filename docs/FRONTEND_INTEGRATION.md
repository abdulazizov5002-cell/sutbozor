# Frontend integratsiyasi (tayyorlov bosqichi)

Maqsad: frontend backendga **bosqichma-bosqich** o'tishi uchun tayyor qatlam. Hozir mavjud Telegram Mini App frontendi avvalgidek
brauzer xotirasi bilan ishlaydi (`useBackend: false`). Hech bir mavjud funksiya backendga ko'chirilmagan.

## Fayllar
```
index.html                  mavjud ilova (faqat 8 ta <script src> qo'shilgan, ilova kodi o'zgarmagan)
env.js                      deploy muhitiga xos sozlama (standart: bo'sh)
js/config.js                SutBozorConfig: backend manzili, useBackend, timeout
js/api/apiClient.js         apiClient, ApiError, tokenStore (xotirada), yordamchilar
js/api/authService.js       authService
js/api/productService.js    productService
js/api/orderService.js      orderService
js/api/paymentService.js    paymentService
js/api/index.js             SutBozorApi.get(): hammasini yig'adi
scripts/generate-env.js     deploy vaqtida env.js ni muhit o'zgaruvchisidan yozadi
```
Skriptlar topilmasa ham `index.html` avvalgidek ishlaydi (ilova ularga bog'liq emas).

## Backend manzili
| Muhit | Manba |
|---|---|
| development (`localhost`, `127.0.0.1`, `*.local`) | `http://localhost:3000` (standart) |
| production | `SUTBOZOR_API_URL` muhit o'zgaruvchisi -> `env.js` (faqat `https`, faqat domen, yo'lsiz) |

Statik hostingda runtime muhit o'zgaruvchisi bo'lmagani uchun deploy qadamida `env.js` yoziladi:
```bash
SUTBOZOR_API_URL=https://api.example.com node scripts/generate-env.js
# ixtiyoriy: SUTBOZOR_ENV=development | SUTBOZOR_USE_BACKEND=true
```
`env.js` ochiq fayl: unga maxfiy ma'lumot yozilmaydi. Production manzili berilmasa yoki noto'g'ri bo'lsa `CONFIG_ERROR` chiqadi,
jimgina `localhost` ga o'tilmaydi. Deploy skripti bunday holatda xato bilan to'xtaydi.

## Foydalanish
```js
var api = SutBozorApi.get();
api.checkConnection().then(console.log);          // { ok, apiBaseUrl, service }
if (api.config.useBackend) {
  api.orders.list({ page: 1, limit: 20 })         // { items, total, page, limit }
    .then(render)
    .catch(function (e) { alert(e.message); });    // e: ApiError { status, code, message, details, requestId }
}
```
- Barcha xizmat metodlari **Promise** qaytaradi (mijoz tekshiruvi xatosi ham `.catch()` ga tushadi).
- `ApiError.status === 0`: serverga yetib bormagan (`NETWORK_ERROR`, `TIMEOUT`, `CONFIG_ERROR`, `CLIENT_VALIDATION`, `TELEGRAM_UNAVAILABLE`).
- `status >= 400`: backend xatosi, `code` (`VALIDATION_ERROR`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, ...) va maydonlar bo'yicha `details`.
- Server HTML yoki kutilmagan javob qaytarsa `INVALID_RESPONSE`: javob matni foydalanuvchiga ko'rsatilmaydi.
- 401 da token tozalanadi va `onUnauthorized` chaqiriladi (qayta kirish oynasini ko'rsatish uchun).

## Xavfsizlik qoidalari (kodda qo'llangan)
Token faqat xotirada (`localStorage`/`sessionStorage` ga yozilmaydi); cookie yuborilmaydi; redirect'ga ergashilmaydi; faqat `/api/...` yo'llari
(`..`, `//` taqiqlangan); ID'lar mijozda tekshiriladi; Authorization faqat token bor bo'lsa; `permissions` faqat interfeys uchun,
haqiqiy ruxsat serverda.

## Backendda hozir mavjud endpointlar
| Xizmat | Metodlar | Backend |
|---|---|---|
| authService | `me()` | `GET /api/auth/me` (autentifikatsiya strategiyasi ulangach) |
| authService | `loginWithTelegram()`, `adminLogin()`, `logout()` | keyingi bosqich (hozir 404/501, xizmat `ApiError` qaytaradi) |
| productService / orderService / paymentService | `list()`, `getById()` | `GET /api/<modul>` va `/:id` (ruxsat va egalik serverda) |

Yozish amallari (buyurtma yaratish, "To'lov qildim", tasdiqlash va h.k.) backendda yozilgach shu xizmatlarga metod sifatida qo'shiladi.

## Mini App va CORS
Telegram Mini App HTTPS domenda joylashadi. Shu domenni backend `CORS_ORIGIN` ga qo'shing (masalan `https://miniapp.example.com`,
oxirida `/` siz). Aks holda brauzer so'rovni bloklaydi.

## Ko'chirish tartibi (tavsiya)
1. `useBackend` ni faqat sinov muhitida yoqing, `checkConnection()` bilan tekshiring.
2. O'qish: buyurtmalar, to'lovlar va mahsulotlar ro'yxati (`list`, `getById`) mavjud ko'rinishlarga ulanadi, localStorage zaxira sifatida qoladi.
3. Autentifikatsiya: `Auth`/`loginRole` o'rniga `authService` (backend auth bosqichidan keyin, docs/SECURITY.md dagi reja).
4. Yozish amallari: `run()` harakatlari birma-bir xizmat metodlariga o'tkaziladi.
5. Oxirida frontenddagi rol tekshiruvi va localStorage holati olib tashlanadi. Demo admin login allaqachon olib tashlangan: `#admin` faqat server `ADMIN` roli bilan ochiladi.

## Hali qilinmagan
Mavjud ilova xizmatlardan foydalanmaydi (`useBackend: false`). Telegram `initData` bilan kirish backendda yozilmagan.
Servislarda token yangilash (refresh) va qayta urinish yo'q.
