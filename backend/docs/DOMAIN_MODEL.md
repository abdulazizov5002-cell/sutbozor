# Domain model (Database bosqichi uchun reja)

Entity'lar `src/domain/entities.ts` da turlar sifatida yozilgan (frontenddagi real shakllardan olingan).
`prisma/schema.prisma` da 13 ta model (11 entity + `Rating` + `Sequence`) va 12 ta enum yozilgan. Migratsiya hali yaratilmagan (`prisma migrate dev` kerak).

## Qatlamlar
```
route -> controller -> service -> repository (port) -> [Prisma, keyingi bosqich]
                         |
                    policies/ownership (egalik), permission.service (ruxsat)
```
- `repositories/ports.ts`: interfeyslar. Hozir `notImplemented.ts` ulangan (har chaqiruv 501).
- Database bosqichida faqat `Repositories` implementatsiyasi yoziladi va `buildApp({ repositories })` ga beriladi.
- Hozir faqat o'qish (`getById`, `list`): ruxsat + egalik tekshiruvi servisda, ro'yxat filtri (`Scope`) repository'ning WHERE shartiga qo'shiladi.

## Entity'lar va bog'lanishlar
| Entity | Asosiy maydonlar | Bog'lanish |
|---|---|---|
| User | role, status (ACTIVE/BLOCKED/PENDING), phone, email, lastLoginAt | businessId? yoki supplierId? (admin uchun ikkisi ham null) |
| Business | name, type, area, address, rating | 1 -> N Order, Contract, Payment |
| Supplier | name, area, deliveryRadiusKm, rating | 1 -> N Product, OrderItem |
| Product | name, unit, availableToday, dailyCapacity, pricePerUnit | N -> 1 Supplier |
| Order | publicId, product, quantityPerDay, days, deliveryMode, paymentSchedule | N -> 1 Business, 1 -> N OrderItem |
| OrderItem | quantityPerDay, pricePerUnit, status, deliveryStatus, daysDelivered | N -> 1 Order, N -> 1 Supplier, 0..1 Contract |
| Contract | startDate, endDate, paymentSchedule, deliveryMode, status | Business, Supplier, 0..1 Order |
| Payment | amount, dueDate, status, paymentMethod, transactionId, periodNo, fromDay, toDay | Order, Contract, Business, Supplier |
| Dispute | reason, description, status, resolution | Order, 0..1 Payment, 0..1 Contract |
| Notification | type, title, message, read | N -> 1 User |
| AuditLog | actor, action, objectType, objectId, description | append-only |

Reyting (frontendda `part.r.toSup/toBiz`): alohida `Rating` jadvali bo'lishi tavsiya etiladi (OrderItem + tomon, ikkala tomon baholagach ochiladi).

## Bazaga o'tkazishda majburiy qoidalar
- **Pul (qaror qabul qilingan): `BigInt`** (butun so'm). API da `number` (`domain/money.ts`), aylantirish faqat `repositories/prisma/mappers.ts` da; xavfsiz diapazondan (2^53-1) katta qiymat xato beradi. Float/Decimal pul uchun ishlatilmaydi. Miqdorlar (litr, kg) `Decimal(10,2)`.
- **0% komissiya:** `CHECK (platform_commission = 0 AND gross_amount = amount AND supplier_amount = gross_amount - platform_commission)`. Ilova tomonida `domain/invariants.ts`.
- **To'lov summasi:** bitta shartnoma bo'yicha to'lovlar yig'indisi `quantityPerDay * pricePerUnit * days` dan oshmasin (tranzaksiya ichida tekshirilsin).
- **Tranzaksiya ID:** bo'sh bo'lmagan `transactionId` takrorlanmasin (unique, NULL bundan mustasno).
- **Sanalar:** `dueDate`, `startDate`, `endDate` DATE ustunlari, "bugun" `Asia/Tashkent` bo'yicha hisoblanadi. Vaqt belgilari UTC `timestamptz`.
- **Ko'rinadigan ID:** `publicId` (SB-1001, PAY-n, CT-n, DSP-n) ketma-ketlikdan, ichki `id` alohida (UUID).
- **Audit log:** faqat INSERT (UPDATE/DELETE ruxsati yo'q), yozish faqat server tomonida.
- **Indekslar:** `payments(status, due_date)` (OVERDUE ishi uchun), `orders(business_id)`, `order_items(supplier_id)`, `notifications(user_id, read)`.
- **Egalik:** ro'yxat so'rovlarida `Scope` WHERE ga qo'shiladi, natija keyin kesilmaydi. Boshqa odamning yozuvi uchun 404 qaytariladi.

## Keyingi bosqichlarda servislarga qo'shiladigan yozish amallari
Buyurtma yaratish va supplier qabul/rad/yetkazish, shartnoma, to'lov (jadval, "To'lov qildim", tasdiqlash, OVERDUE cron),
nizo, bildirishnoma, mahsulot yangilash. Har biri `Auth` (permission) -> validatsiya (Zod) -> holat o'tishi -> audit yozuvi tartibida.

## Database ishga tushirish (birinchi marta)
```bash
cd backend
npm install                       # @prisma/client ni generatsiya qiladi
# .env da DATABASE_URL ni yozing (PostgreSQL)
npx prisma validate
npx prisma migrate dev --name init --create-only
# hosil bo'lgan prisma/migrations/*_init/migration.sql oxiriga prisma/constraints.sql mazmunini qo'shing
npx prisma migrate dev
npm run dev                       # DATABASE_URL bor bo'lsa Prisma repository'lari ulanadi
```
`constraints.sql`: 0% komissiya CHECK, manfiy narx/miqdor taqiqi, foydalanuvchi roli va biznes/supplier bog'lanishi, audit_logs UPDATE/DELETE trigger'i.
Hali qilinmagan (keyingi bosqich): seed (demo ma'lumot), yozish amallari, `publicId` ketma-ketligi (`Sequence` jadvali tayyor), Rating repository.
