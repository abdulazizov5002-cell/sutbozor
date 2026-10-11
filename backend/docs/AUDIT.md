# Frontend audit (index.html, 3-bosqich versiyasi)

Manba: `index.html` (~85 KB, bitta `<script>` ~566 qator, 124 ta top-level e'lon). Kod yozilmadi va o'zgartirilmadi, faqat o'qildi
va ishga tushirib tekshirildi (shakllar va sonlar kodning o'zidan chiqarilgan).

## 0. Umumiy arxitektura
- Holat bitta global `S` obyektida. Kalitlar: `role, sup, tab, sups, orders, next, biz, q, audit, pay, contracts, nextCt,
  disputes, nextPay, nextAud, demoBiz, users, uid, notifs, nextN, nextD, ver`. Versiya `S.ver = 3`, eski ma'lumot `migrate/migrate2/migrate3` bilan o'tkaziladi.
- Xizmat qatlamlari allaqachon ajratilgan: `Auth`, `PaymentService`, `PaymentProviders`, `DisputeService`, `AdminService`, `Notify`,
  `Validate`, `audit()/mkA()`. Barcha foydalanuvchi harakatlari bitta `run(action, dataset)` orqali o'tadi:
  ruxsat (`ACT_PERM`, 25 ta harakat) → validatsiya → holat o'zgarishi → bildirishnoma → `save()`.
- Bu `run()` backendda API endpoint qatlamiga aylanadi. Ko'rinishlar (`v*`, `render`) `S` dan o'qiydi.

## 1. User / Role modeli
- Rollar: `business`, `supplier`, `admin` (`ROLES`). Statuslar: `ACTIVE`, `BLOCKED`, `PENDING`.
- `User`: `id, name, phone, email, role, businessId, supplierId, status, createdAt, lastLoginAt` (14 ta demo foydalanuvchi: 2 admin, 5 biznes, 7 supplier).
- Zanjir: `Auth.current()` → user → `ROLE_PERMS[role]` → `Auth.can/require(perm)`. Bloklangan/kutilayotgan user hech narsa qila olmaydi.
- Permissionlar: admin 12, business 8, supplier 10 (`dashboard.view` ... `users.manage`). Backend `constants.ts` bilan aynan mos (test qilingan).

## 2. Business / Supplier / Admin
- Business (`S.biz` + `S.demoBiz`, jami 5): `id, name, type, area, addr, rating, n`. Hozir tizimda **faqat bitta haqiqiy biznes** (`S.biz`), qolganlari ko'rsatish uchun.
- Supplier (`S.sups`, 7 ta): `id, name, area, radius, rating, n, products[]`. Supplier "faol"ligi = uning User'i `ACTIVE` (`supActive`).
- Admin: alohida kirish (`#admin`), 12 bo'lim, `VIEW_PERM` bilan bo'limlar permissionga qarab ko'rinadi. Admin buyurtmani o'zgartira olmaydi, faqat to'lovni PAID/bekor qilish, shartnomani bekor qilish, nizo holati va foydalanuvchini bloklash/aktivlash (tasdiqlash oynasi bilan, o'zini va oxirgi faol adminni bloklab bo'lmaydi).

## 3. Products
`Product`: `name, today (bugun mavjud), cap (kunlik quvvat), price`. Supplier ichida massiv. Mahsulotlar: Sut, Qatiq, Qaymoq, Suzma, Tvorog, Sariyog'. Mahsulot ID'si yo'q (nom bo'yicha), bazada alohida ID kerak.

## 4. Orders
- `Order` (parent): `id (SB-1001), created, updated, product, qty, days, mode (supplier|pickup), pay (to'lov davri), businessId, prep, log[], parts[]`.
- `part` (= bazada OrderItem / supplier order): `sup, qty, price, st (SENT|ACTIVE|PAUSED|COMPLETED|CANCELLED), day, dl (SCHEDULED|PREPARING|READY|IN_TRANSIT|DELIVERED), r{toSup,toBiz}, contractId`.
- Bozor `search()` (masofa, hudud, narx, reyting, quvvat bo'yicha), buyurtma bir nechta supplierga bo'linadi. Reyting `eff()` faqat ikki tomon ham baholagach hisobga olinadi.
- Qoidalar `run()` da: yakunlangan/bekor qilingan buyurtmani o'zgartirib bo'lmaydi, biznes faqat o'z buyurtmasini boshqaradi, supplier o'zida yo'q mahsulotni qabul qila olmaydi.

## 5. Contracts
`Contract`: `id, orderId, businessId, supplierId, product, quantityPerDay, unit, pricePerUnit, days, startDate, endDate, paymentSchedule, deliveryMode, status (DRAFT|PENDING|ACTIVE|PAUSED|COMPLETED|CANCELLED), createdAt, activated`.
Har bir `part` uchun shartnoma yaratiladi; holat `sync()` orqali part holatidan olinadi (SENT→PENDING). Biznes alohida shartnoma qoralamasi ham yaratadi (`newDraft`, `sendContract`).

## 6. Payments (to'lov mantig'i)
- Model: SutBozor pul ushlamaydi, komissiya olmaydi, faqat qayd qiladi (Business → Supplier).
- `Payment`: `id, orderId, contractId, businessId, supplierId, amount, currency, paymentPeriod, dueDate, paidAt, paymentMethod, transactionId, status, note, createdAt, updatedAt, seq, label, fromDay, toDay, days, platformCommission, grossAmount, supplierAmount`.
- Statuslar: PENDING, PAYMENT_SUBMITTED, PAID, OVERDUE, CANCELLED, DISPUTED. Davrlar: DELIVERY, WEEKLY, MONTHLY, PREPAID.
- Jadval `buildSchedule`: oxirgi davr qoldiqni oladi (30 kun haftalik: 1-7, 8-14, 15-21, 22-30). DELIVERY da har yetkazilgan kun uchun to'lov, PREPAID da bitta.
- Oqim: shartnoma ACTIVE bo'lganda jadval → Business `submit` (summa aynan teng, usul, tx, sana ≤ bugun) → PAYMENT_SUBMITTED → Supplier `confirm` → PAID. Supplier "pul kelmadi" → nizo → DISPUTED.
- Avtomatik: `sync()` har `save()` da PENDING + muddat o'tgan → OVERDUE, 2 kun qolganda "muddat yaqin" bildirishnomasi, shartnoma bekor bo'lsa PENDING/OVERDUE → CANCELLED.
- Tekshiruv `make`: to'lov summasi buyurtma summasidan oshmasin. `PaymentProviders`: `manual` (Naqd, Bank o'tkazmasi, Karta → karta) ishlaydi, `click/payme/uzum` stub (xato tashlaydi). Interfeys: `initiate(payment)`, `verify(payment, data)`.

## 7. Disputes
`Dispute`: `id (DSP-n), orderId, paymentId, contractId, openedBy, openedById, businessId, supplierId, reason, description, status, createdAt, resolvedAt, resolution, resolvedBy`.
Sabablar: NOT_DELIVERED, WRONG_QTY, QUALITY, PAYMENT, LATE, PRICE, OTHER. O'tishlar: OPEN→UNDER_REVIEW|REJECTED, UNDER_REVIEW→RESOLVED|REJECTED, RESOLVED|REJECTED→CLOSED (yechim matni majburiy). Takroriy ochiq nizo bloklanadi. Hal qilingach bog'liq to'lov oldingi holatga qaytadi.

## 8. Notifications
`Notification`: `id, userId, type, title, message, read, createdAt` (12 tur: order.new/accepted/rejected, delivery.ready/done, payment.due/submitted/confirmed/overdue, dispute.open/resolved, contract.cancelled). Qabul qiluvchi `Notify.biz/sup/admins` bilan aniqlanadi. 500 tadan ortig'i o'chadi.

## 9. Audit log
`{id, ts, actor, role, action, type, oid, desc}`, 500 tagacha. Yozuvlar `audit()/auditU()` bilan har muhim harakatda, jumladan `permission.denied`, `admin.login_failed`.

## 10. Validation (`Validate` + `run()` ichidagi qoidalar)
Miqdor > 0, muddat 1-365 butun, manfiy narx/miqdor taqiqlangan, supplier mavjud/faol/mahsulotni sotadi, to'lov summasi tengligi va oshmasligi, yakunlangan buyurtmani o'zgartirmaslik, PAID to'lovni bekor qilmaslik, nizo uchun sabab va izoh (>=5 belgi). Validatsiya xatosi matn qaytaradi (`BN`), ruxsat xatosi `Error` tashlaydi.

## 11. CONFIG
`{platformCommission: 0, currency: "so'm", paymentPeriodDays: 7, paymentProvider: "manual", deliveryGapMin: {supplier: 40, pickup: 20}}`.

## 12. Komissiya
`CONFIG.platformCommission = 0` va yagona `fee(a)` funksiyasi. Hamma 26 ta to'lovda `platformCommission = 0` va `grossAmount === supplierAmount` (kod ishga tushirib tekshirildi). `COMM=5`, "5%" yoki `commission = 5` qoldig'i yo'q. Backendda ham `PLATFORM_COMMISSION_PERCENT = 0`.

## 13. localStorage / sessionStorage
- `localStorage["sb-site"]`: butun `S` (users, rol, to'lov, audit, nizo, bildirishnoma). Faqat `try/catch` bilan o'qiladi/yoziladi (`save()` har harakatda).
- `sessionStorage["sb-admin"]`: admin sessiyasi, qiymati foydalanuvchi ID'si (`"U-1"`).
- Boshqa joyda saqlash yo'q.

## 14. Demo autentifikatsiya
- Biznes/supplier: parolsiz. `loginRole(role)` shunchaki mos foydalanuvchini tanlaydi (`Auth.login(uid)`), supplierni tanlash menyusi bor.
- Admin: `ADMIN_DEMO = {username:"admin", password:"admin123"}` kodda ochiq (izohda "XAVFSIZ EMAS" deb belgilangan). Kirishda `sb-admin = "U-1"` yoziladi. Login urinishlari audit logga tushadi, limit yo'q.

## 15. Backendga ko'chirilishi kerak
Auth/sessiya, `ROLE_PERMS` tekshiruvi (har endpointda), `Validate`, `PaymentService` (jadval, submit/confirm/dispute, OVERDUE), shartnoma va buyurtma qismi holat o'tishlari, `advance()`, `DisputeService`, `Notify`, `audit`, `AdminService`, `search()`, `eff()`, komissiya invarianti.

## 16. Frontendda qoladi
Barcha `v*`/`render` ko'rinishlari, forma holati (`PF, CF, DF, RF, AC`), formatlash (`fmt, nm, dm, dt`), status yozuvlari (`PT, CST, DSTT, PST, DST`), navigatsiya, mobil moslashuv. `S` obyekti API keshiga aylanadi.

## 17. Backend endpointlar
`/api/auth` (Telegram initData, me, logout); `/api/users`, `/businesses`, `/suppliers` (profil, holat, reyting); `/products`;
`/orders` (market qidiruvi, yaratish, qabul/rad, yetkazish bosqichlari); `/contracts`; `/payments` (jadval, "To'lov qildim", tasdiqlash, nizo, admin PAID/bekor);
`/disputes`; `/notifications`; `/admin` (dashboard, audit, foydalanuvchilar, sozlamalar).

## 18. Database entity'lari
User, Business, Supplier, Product, Order, OrderItem (= `parts[]`), Contract, Payment, Dispute, Notification, AuditLog.
Ko'rinadigan ID'lar (SB-1001, PAY-n, CT-n, DSP-n, U-n, N-n, AUD-n) interfeysda ishlatiladi, shuning uchun `publicId` sifatida saqlansin.
Summalar butun so'm: `BigInt` tavsiya etiladi. `CHECK (grossAmount = supplierAmount)` bilan 0% komissiya invariantini bazada ham himoyalang.

## 19. Xavfsizlik muammolari
1. Admin login/paroli kodda ochiq (`ADMIN_DEMO`).
2. Admin sessiyasi `sessionStorage["sb-admin"] = "U-1"`: istalgan kishi brauzer konsolida yozib kira oladi (`Auth.current()` faqat shu qiymatga qaraydi, parol tekshirilmaydi).
3. `S.role`, `S.uid`, butun ma'lumot `localStorage` da: foydalanuvchi uni o'zgartirib, boshqa rolga o'tishi mumkin.
4. Barcha ruxsat tekshiruvlari faqat brauzerda.
5. Pul hisobi, holatlar, audit log mijozda: audit logni foydalanuvchi tahrirlay oladi.
6. "Demo tiklash" (`reset`) har qanday biznes/supplier foydalanuvchiga ochiq va hammaning ma'lumotini o'chiradi (`profile.manage` bilan ruxsat etilgan).
7. Parol xeshi, 2FA, urinishlar limiti, sessiya muddati yo'q. ID'lar ketma-ket, taxmin qilinadi.
8. Matn chiqarish: 89 ta `esc()` chaqiruvi bor, `innerHTML` bilan ishlaydi. Backendga o'tgach ham foydalanuvchi kiritgan matn (izoh, nizo tavsifi, nom) tozalanishi shart.

## 20. Buzishi mumkin bo'lgan joylar (topilgan xatolar ham)
- **Vaqt zonasi xatosi:** `today()` UTC sanasini oladi (`toISOString`). O'zbekistonda (UTC+5) mahalliy 00:00-05:00 oralig'ida "bugun" hali kechagi sana bo'ladi, shuning uchun OVERDUE va "muddat yaqin" 5 soat kech ishlaydi (kod bilan tasdiqlandi: UTC 21:30 → mahalliy 02:30, `today()` oldingi kunni qaytaradi). Backendda sanalarni `Asia/Tashkent` bo'yicha hisoblash kerak.
- **OVERDUE faqat sahifa ochiq/saqlanganda hisoblanadi** (`sync()` har `save()` va admin ochilganda). Serverda rejalashtirilgan ish (cron) kerak.
- **PAYMENT_SUBMITTED hech qachon OVERDUE bo'lmaydi** (faqat PENDING). Bu ongli qaror (biznes o'z vaqtida yuborgan bo'lsa, supplier tasdiqlamagani uchun kechikkan hisoblanmaydi), lekin supplier uzoq tasdiqlamasa nazoratsiz qoladi. Keyingi bosqichda "tasdiqlash muddati" kerak bo'lishi mumkin.
- **Bekor qilishda PAYMENT_SUBMITTED to'lov o'zgarmaydi:** shartnoma bekor bo'lsa ham yuborilgan to'lov qoladi (faqat PENDING/OVERDUE bekor bo'ladi). Pul qaytarish jarayoni yo'q.
- **Supplier ownership** `run()` da global `S.sup` ga tayanadi. Serverda `supplierId` tokendan olinishi shart.
- **Rating va nizo** `S.orders[index]` (massiv indeksi) orqali tanlanadi, ID orqali emas: API ID bilan ishlashi kerak.
- Frontend `S` shakliga bog'liq ko'p kod: API adapteri `S.orders[].parts[]`, `S.pay`, `S.users` shaklini saqlashi kerak.
- Valyuta: frontendda `"so'm"`, backendda ISO `UZS`.
- `index.html` lokal fayl bo'lsa `Origin: null`: CORS sozlamasi kerak bo'ladi.
- `GET /api/health` javobi o'ralmaydi, qolganlari `{success, data}`.

## 21. Tuzatishlar (audit natijalari bo'yicha, index.html)
Hammasi alohida testlarda tekshirilgan (jami 79 ta tekshiruv, xatosiz).
1. **Admin sessiyasi:** `sessionStorage["sb-admin"]="U-1"` bilan parolsiz kirish yopildi. Endi kirishda tasodifiy 128-bit token yaratiladi (muddati 30 daqiqa), soxta qiymatlar (`U-1`, `1`, `true`, 32 belgili taxminiy token) rad etiladi. Parol ochiq matn emas, SHA-256 xesh sifatida; 5 ta xato urinishdan keyin 60 soniya blok. Cheklov: frontend-only bo'lgani uchun token baribir brauzerda turadi, haqiqiy himoya server sessiyasi/JWT bilan keladi.
2. **Vaqt zonasi:** `today()` endi `CONFIG.timezone = "Asia/Tashkent"` bo'yicha. OVERDUE va "muddat yaqin" mahalliy yarim tunda almashadi (oldin 05:00 da).
3. **Demo tiklash:** biznes/supplier profilidan olib tashlandi, `run("reset")` rad etiladi. Faqat admin (`settings.manage`) Sozlamalar bo'limida, ikki bosqichli tasdiqlash bilan, audit logga yozilib tiklaydi.
4. **Index o'rniga ID:** harakatlar va baholash `order.id` + `supplierId` orqali (`findOrder/findPart`), massiv indeksi faqat eski chaqiruvlar uchun zaxira. Egalik tekshiruvi `S.sup/S.biz.id` o'rniga autentifikatsiyadan o'tgan foydalanuvchining `supplierId/businessId` si bo'yicha.
5. **PAYMENT_SUBMITTED:** 3 kun (`CONFIG.confirmDays`) tasdiqlanmasa supplier va adminga bir marta eslatma (`payment.unconfirmed`), holat o'zgarmaydi. Shartnoma bekor bo'lsa yuborilgan to'lovga izoh yoziladi, ikkala tomonga bildirishnoma boradi, to'lov tasdiqlash yoki nizo uchun ochiq qoladi.
Hal etilmagan (backend bosqichi): haqiqiy autentifikatsiya, serverdagi ruxsat tekshiruvi, pul qaytarish jarayoni (to'lovlar platformadan tashqarida o'tadi), cron orqali OVERDUE.
