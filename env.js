/* Deploy muhitiga xos sozlama. Bu fayl ochiq: unda maxfiy ma'lumot (token, parol, kalit) bo'lmaydi, faqat ochiq API manzili.
   useBackend: true (standart) bo'lsa sahifa avvalgidek brauzer xotirasi (demo) bilan ishlaydi va serverga murojaat qilmaydi.
   Serverga ulanishni sinash uchun useBackend ni true qiling (Telegram ichida ochilganda kirishga urinadi). */
window.__SUTBOZOR_ENV__ = {
  env: "production",
  apiBaseUrl: "https://mizatus.onrender.com",
  useBackend: true
};
