# Zaxira nusxa va tiklash (Neon PostgreSQL)

SutBozor ma'lumotlari (buyurtma, to'lov yozuvlari, nizolar, audit) Neon bazasida. Quyidagi qo'llanma Neon'ning o'z imkoniyatlariga tayanadi.
Tarifga qarab tiklash oynasi (necha soat/kun orqaga qaytish mumkin) farq qiladi, **aniq qiymatni Neon konsolidan o'zingiz ko'ring**
(bu hujjatda taxminiy raqam yozilmagan).

Muhim: bazaga ulanish manzili (`DATABASE_URL`) sir hisoblanadi. U faqat Render env'da turadi; GitHub Secrets'ga, kodga yoki chatga qo'yilmaydi
(CLAUDE.md qoida 8). Shuning uchun zaxira Neon ichida yuritiladi, tashqi avtomatik nusxa hozircha yo'q.

## 1. Tiklash oynasini aniqlash (bir marta)

1. Neon konsol -> loyiha -> **Backup & Restore** (yoki Branches -> Restore; menyu nomi yangilanishi mumkin).
2. "History retention / restore window" yozuvini o'qing: shu davr ichidagi istalgan paytga qaytish mumkin.
3. Oyna qisqa bo'lsa (masalan, bir necha soat), real foydalanuvchilar kelishidan oldin uzaytirish mumkin yoki yo'qligini tarif sahifasidan ko'ring.

## 2. Muhim o'zgarishdan oldin qo'lda snapshot (branch)

Migratsiya, katta o'zgarish yoki pilotdan oldin:
1. Neon konsol -> **Branches** -> **Create branch** (asosiy `main`/production branch'dan, "current data").
2. Nomi: `snapshot-YYYY-MM-DD`.
3. Bu branch o'sha paytdagi nusxa. Keraksiz bo'lganda o'chirib tashlang (joy egallaydi).

## 3. Xato bo'lsa tiklash

- **Yaqinda tasodifan o'chirilgan/o'zgargan ma'lumot**: Neon -> Restore, kerakli vaqtni tanlang (oynadan ichkarida bo'lsin). Avval yangi branch'ga tiklab, ma'lumotni tekshirib ko'ring, so'ng asosiy branch'ga qo'llang.
- **Tiklangandan keyin**: agar baza manzili yoki branch o'zgargan bo'lsa, Render env'dagi `DATABASE_URL` ni yangilang (qiymatni chatga yozmang), servis qayta ishga tushsin.
- Tiklangandan keyin tekshiring: `GET /api/health`, ilovaga kirish, bitta buyurtma ro'yxati.

## 4. Tiklash mashqi (pilotdan oldin bir marta)

Haqiqiy halokatda birinchi marta urinmaslik uchun:
1. Snapshot branch oching (2-bo'lim).
2. Neon SQL Editor'da (snapshot branch'da, productionda EMAS) bitta test yozuvni o'zgartiring.
3. Restore bilan uni oldingi holatga qaytaring va natijani tekshiring.
4. Necha daqiqa ketganini yozib qo'ying.

## Hozircha yo'q

- Tashqi (Neon'dan tashqarida) avtomatik zaxira: baza manzilini boshqa tizimga berishni talab qiladi, shuning uchun sir qoidasi bilan kelishib, keyinroq alohida ko'rib chiqiladi.
