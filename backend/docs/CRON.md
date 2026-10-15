# Rejalashtirilgan ishlar (Render Cron Job)

Hozir bitta ish bor: **muddati o'tgan to'lovlarni belgilash**.

`POST /api/internal/overdue-sweep` muddati o'tgan `PENDING` to'lovlarni `OVERDUE` qiladi va xaridorga
"To'lov muddati o'tdi" bildirishnomasini yozadi (Telegram yoqilgan bo'lsa botga ham boradi).
Bir necha marta chaqirish xavfsiz: faqat hali `PENDING` bo'lganlar o'tadi, bildirishnoma takrorlanmaydi.

## Sozlash (bir marta): GitHub Actions (bepul, tavsiya etiladi)

Workflow tayyor: `.github/workflows/overdue-sweep.yml` (har soat, soat :07 da, UTC). Faqat sirni qo'yish kerak.

1. **Sir yaratish**: kamida 32 belgi, tasodifiy (masalan, telefondagi parol generatori, 40 belgi). Hech qayerga yozmang: chatga, Git'ga, skrinshotga.
2. **Render -> `mizatus` -> Environment**: `CRON_SECRET` = shu sir. Saqlang (servis qayta ishga tushadi).
3. **GitHub -> repo `sutbozor` -> Settings -> Secrets and variables -> Actions -> New repository secret**:
   Name: `CRON_SECRET`, Secret: xuddi shu sir. (Telefonda GitHub ilovasida bu menyu yo'q: brauzerda github.com ni "Desktop site" rejimida oching.)
4. **GitHub -> Actions -> "Muddati o'tgan to'lovlarni belgilash" -> Run workflow**. Yashil bo'lsa va logda `{"success":true,"data":{"overdue":N}}` bo'lsa, ishlayapti.

Eslatma: GitHub rejalashtirilgan ishlarni bir necha daqiqa kechiktirishi mumkin. Repoda 60 kun hech qanday faollik bo'lmasa GitHub jadvalni o'chirib qo'yadi (Actions sahifasidan qayta yoqiladi).

## Muqobil: Render Cron Job (pullik bo'lishi mumkin)

Render -> New -> Cron Job, Schedule `0 * * * *`, Command:
`curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" https://mizatus.onrender.com/api/internal/overdue-sweep`
va Cron Job Environment'ida ham `CRON_SECRET` bo'lsin.

## Tekshirish va xatolar

| Javob | Ma'nosi |
|---|---|
| `200` + `{"overdue":N}` | Ishladi (N ta to'lov belgilandi) |
| `401` | Cron'dagi `CRON_SECRET` serverdagi bilan bir xil emas |
| `501` | Serverda `CRON_SECRET` yo'q yoki baza ulanmagan |
| timeout / `000` | Server uxlayotgan bo'lishi mumkin (Render bepul tarif); workflow o'zi 3 marta qayta urinadi, yana xato bo'lsa qo'lda qayta ishga tushiring |

`x-cron-secret` sarlavhasi log'larda `[REDACTED]` bo'ladi.
