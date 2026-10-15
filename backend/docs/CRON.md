# Rejalashtirilgan ishlar (Render Cron Job)

Hozir bitta ish bor: **muddati o'tgan to'lovlarni belgilash**.

`POST /api/internal/overdue-sweep` muddati o'tgan `PENDING` to'lovlarni `OVERDUE` qiladi va xaridorga
"To'lov muddati o'tdi" bildirishnomasini yozadi (Telegram yoqilgan bo'lsa botga ham boradi).
Bir necha marta chaqirish xavfsiz: faqat hali `PENDING` bo'lganlar o'tadi, bildirishnoma takrorlanmaydi.

## Sozlash (bir marta)

1. **Sir yaratish** (kamida 32 belgi, tasodifiy). Telefonda yoki kompyuterda, masalan: `openssl rand -hex 32`.
   Sirni hech qayerga yozmang: chatga, Git'ga, skrinshotga.
2. **Render -> `mizatus` (Web Service) -> Environment** ga qo'shing: `CRON_SECRET` = shu sir. Saqlang (servis qayta ishga tushadi).
3. **Render -> New -> Cron Job**: bir xil repo (`sutbozor`), Runtime: Docker emas, oddiy buyruq.
   - Schedule: `0 * * * *` (har soat; UTC).
   - Build Command: bo'sh qoldiring yoki `echo ok`.
   - Command:
     `curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" https://mizatus.onrender.com/api/internal/overdue-sweep`
   - Cron Job **Environment** ga ham xuddi shu `CRON_SECRET` ni qo'shing.
4. Cron Job sahifasida "Trigger Run" ni bosing. Muvaffaqiyatli bo'lsa log'da `{"success":true,"data":{"overdue":N}}` chiqadi.

## Tekshirish va xatolar

| Javob | Ma'nosi |
|---|---|
| `200` + `{"overdue":N}` | Ishladi (N ta to'lov belgilandi) |
| `401` | Cron'dagi `CRON_SECRET` serverdagi bilan bir xil emas |
| `501` | Serverda `CRON_SECRET` yo'q yoki baza ulanmagan |
| `curl: (22)` / timeout | Server uxlayotgan bo'lishi mumkin (Render bepul tarif); cron ni qayta ishga tushiring |

`x-cron-secret` sarlavhasi log'larda `[REDACTED]` bo'ladi.
