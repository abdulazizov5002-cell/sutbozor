# Monitoring (server nazorati)

Ikkita manzil bor, ikkalasi ham ochiq (token kerak emas), `Cache-Control: no-store`:

| Manzil | Nimani tekshiradi | Javob |
|---|---|---|
| `GET /api/health` | Server tirikmi (bazani tekshirmaydi) | `200 {"status":"ok","service":"sutbozor-backend"}` |
| `GET /api/ready` | Server **va baza** (`SELECT 1`, 3 soniya timeout) | `200` `database:"ok"`; baza o'lik/sekin: `503` `database:"down"`; baza ulanmagan: `503` `database:"not_configured"` |

`/api/ready` xato matnini yoki ulanish ma'lumotini hech qachon qaytarmaydi.

## UptimeRobot (bepul)

Sozlash (har biri alohida monitor, 5 daqiqa oraliq):
1. `SutBozor server`: `https://mizatus.onrender.com/api/health`
2. `SutBozor baza`: `https://mizatus.onrender.com/api/ready`
3. "Alert contacts"ga email yoki Telegram ulang.

Foydasi: har 5 daqiqada so'rov kelgani uchun Render (bepul tarif) serveri uxlab qolmaydi, birinchi ochilish sekin bo'lmaydi.

## Xabar kelsa nima qilish

| Holat | Sabab va qadam |
|---|---|
| `/health` ham, `/ready` ham tushdi | Render servisi tushgan yoki deploy ketmoqda: Render -> mizatus -> Events/Logs |
| Faqat `/ready` tushdi (503 `down`) | Server bor, baza yo'q: Neon konsolida loyiha holati, compute uxlab qolgan/limit; keyin `BACKUP.md` |
| `/ready` 503 `not_configured` | Render env'da `DATABASE_URL` yo'q yoki noto'g'ri |

Eslatma: Neon bepul tarifida compute bo'sh turganda uxlab qoladi, birinchi so'rov bir necha soniya kechikishi mumkin; `/ready` 3 soniyadan sekin bo'lsa `down` deydi. Bir martalik tushish bo'lsa, 5 daqiqadan keyin tiklanganini tekshiring.
