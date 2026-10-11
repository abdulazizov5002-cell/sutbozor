/**
 * authService: kirish va joriy foydalanuvchi.
 * Backend endpointlari: GET /api/auth/me (tayyor), POST /api/auth/telegram, /api/auth/admin/login, /api/auth/logout (keyingi bosqich:
 * hozir 501 qaytaradi, xizmat buni ApiError(NOT_IMPLEMENTED) sifatida uzatadi).
 * Biznes/Supplier Telegram Mini App orqali kiradi (initData serverda imzo bo'yicha tekshiriladi). Admin kirishi alohida.
 * Token faqat xotirada. `permissions` faqat interfeysni ko'rsatish uchun, haqiqiy ruxsat serverda tekshiriladi.
 */
(function (global) {
  "use strict";
  var NS = (global.SutBozorApi = global.SutBozorApi || {});

  function telegramInitData() {
    var tg = global.Telegram && global.Telegram.WebApp;
    return tg && typeof tg.initData === "string" ? tg.initData : "";
  }

  function createAuthService(client, tokenStore) {
    var ApiError = NS.ApiError;

    function storeSession(data) {
      if (!data || typeof data.accessToken !== "string" || !data.user) {
        throw new ApiError(0, "INVALID_RESPONSE", "Server kirish javobini noto'g'ri formatda qaytardi.");
      }
      tokenStore.set(data.accessToken, data.expiresAt);
      return data.user;
    }

    return {
      /** Joriy foydalanuvchi: { id, role, status, businessId, supplierId, permissions }. */
      me: function () {
        return client.get("/api/auth/me");
      },
      loginWithTelegram: function () {
        var initData = telegramInitData();
        if (!initData) return Promise.reject(new ApiError(0, "TELEGRAM_UNAVAILABLE", "Ilovani Telegram ichida oching."));
        return client.post("/api/auth/telegram", { body: { initData: initData }, noAuth: true }).then(storeSession);
      },
      adminLogin: function (username, password) {
        if (typeof username !== "string" || username.length < 3 || username.length > 64) {
          return Promise.reject(new ApiError(0, "CLIENT_VALIDATION", "Login 3-64 belgi bo'lishi kerak."));
        }
        if (typeof password !== "string" || password.length < 8 || password.length > 128) {
          return Promise.reject(new ApiError(0, "CLIENT_VALIDATION", "Parol 8-128 belgi bo'lishi kerak."));
        }
        return client.post("/api/auth/admin/login", { body: { username: username, password: password }, noAuth: true }).then(storeSession);
      },
      /** Server sessiyasini bekor qilishga urinadi, har holda mahalliy tokenni o'chiradi. */
      logout: function () {
        return client.post("/api/auth/logout", {}).catch(function () {}).then(function () {
          tokenStore.clear();
        });
      },
      isAuthenticated: function () {
        return !!tokenStore.get();
      },
    };
  }

  NS.createAuthService = createAuthService;
})(typeof window !== "undefined" ? window : globalThis);
