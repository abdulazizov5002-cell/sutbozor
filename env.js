/* Deploy muhitiga xos sozlama. Bu fayl ochiq: unda maxfiy ma'lumot (token, parol, kalit) bo'lmaydi, faqat ochiq API manzili.
   useBackend: false bo'lsa sahifa brauzer xotirasi (demo) bilan ishlaydi va serverga murojaat qilmaydi (js/config.js va generate-env.js da standart).
   useBackend: true bo'lsa Telegram ichida ochilganda serverga kirishga urinadi va #admin server roli bilan ochiladi. */
window.__SUTBOZOR_ENV__ = {
  env: "production",
  apiBaseUrl: "https://mizatus.onrender.com",
  useBackend: true
};
