# So'rov validatsiyasi (Zod)

## Qanday ishlaydi
```
route -> authenticate -> validate({ params, query, body }) -> controller -> service
```
- `src/validation/validate.ts`: `validate(schemas)` preHandler. params, query va body'ni birga tekshiradi va **barcha** xatolarni
  bitta javobda qaytaradi (yo'llar `params.id`, `query.page`, `body.amount`). Muvaffaqiyatda `request.params/query/body` tozalangan
  qiymatlar bilan almashtiriladi (kesilgan matn, kichik harfli email, songa aylantirilgan query, ortiqcha maydonsiz).
- Autentifikatsiya validatsiyadan **oldin** ishlaydi: ruxsatsiz foydalanuvchiga sxema tafsilotlari ko'rsatilmaydi (401).
- `src/validation/errorMap.ts`: barcha Zod xabarlari o'zbek tilida, maydon nomisiz (u `path` da keladi). Foydalanuvchi yuborgan
  qiymat xabarga hech qachon qo'shilmaydi.
- `src/schemas/primitives.ts`: `text`, `uuid`, `email`, `phone` (+998), `money` (butun so'm), `quantity` (2 ta kasrgacha), `days` (1-365),
  `isoDate` (haqiqiy sana), `pastOrToday`/`todayOrFuture` (Asia/Tashkent bo'yicha), `timeOfDay`, enum'lar (constants.ts dan).
- `strictObject`: body'da noma'lum maydon rad etiladi (`role`, `status` kabi maydonlar orqali huquqni oshirib bo'lmaydi).

## Xato javobi (HTTP 400)
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Yuborilgan ma'lumotlar noto'g'ri: body.amount: 0 dan katta bo'lishi kerak.",
    "details": [
      { "path": "body.amount", "message": "0 dan katta bo'lishi kerak.", "code": "too_small" },
      { "path": "body.paymentMethod", "message": "Ruxsat etilgan qiymatlar: Naqd, Bank o'tkazmasi, Karta → karta.", "code": "invalid_enum_value" }
    ]
  }
}
```
`details` 20 tagacha. Body umuman yuborilmasa: "So'rov tanasi (JSON) yuborilmagan."

## Tayyor so'rov sxemalari (yozish endpointlari keyingi bosqichda ulanadi)
| Fayl | Sxemalar |
|---|---|
| `order.schemas.ts` | `createOrderBody`, `orderItemActionBody` (reject/pause/cancel uchun sabab majburiy) |
| `payment.schemas.ts` | `submitPaymentBody` (summa, usul, tranzaksiya ID, sana <= bugun, izoh), `resolvePaymentBody` |
| `dispute.schemas.ts` | `openDisputeBody` (sabab enum, izoh >= 5 belgi), `updateDisputeStatusBody` (RESOLVED/REJECTED uchun yechim) |
| `contract.schemas.ts` | `createContractBody` (boshlanish sanasi o'tmishda bo'lmasin) |
| `product.schemas.ts` | `updateProductBody` (kamida bitta maydon, manfiy qiymat yo'q) |
| `user.schemas.ts` | `updateUserStatusBody`, `createUserBody` (rol <-> businessId/supplierId, bazadagi CHECK bilan bir xil) |

Hozir faqat o'qish endpointlariga ulangan: `GET /api/<modul>` (`paginationSchema`) va `GET /api/<modul>/:id` (`idParamSchema`, UUID).

## Frontend bilan farqlar (ataylab qattiqroq)
- Tranzaksiya ID: kamida 4 belgi va faqat `A-Z a-z 0-9 . _ - /` (frontendda faqat bo'sh bo'lmasligi tekshiriladi).
- ID'lar UUID: frontenddagi `SB-1001` kabi ko'rinadigan kodlar URL'da emas, `publicId` sifatida alohida ishlatiladi.
- Matnlarda NUL belgisi rad etiladi (PostgreSQL xato berardi).
