/**
 * notificationService: Bildirishnomalar (faqat o'zinikini ko'radi; egalik serverda tekshiriladi).
 * Backendda mavjud: GET /api/notifications, GET /api/notifications/:id, POST /api/notifications/read-all, POST /api/notifications/:id/read.
 * Bildirishnomalarni server buyurtma, to'lov va nizo amallari ichida o'zi yaratadi.
 */
(function (global) {
  "use strict";
  var NS = (global.SutBozorApi = global.SutBozorApi || {});

  function createNotificationService(client) {
    var h = NS.helpers;
    return {
      /** { items, total, page, limit } (yangilari birinchi) */
      list: function (params) {
        return h.attempt(function () {
          return client.get("/api/notifications", { query: h.pageQuery(params) });
        });
      },
      /** Bitta bildirishnomani o'qilgan qiladi. */
      markRead: function (id) {
        return h.attempt(function () {
          return client.post("/api/notifications/" + h.idPath(id) + "/read", { body: {} });
        });
      },
      /** Hammasini o'qilgan qiladi, { updated } qaytaradi. */
      markAllRead: function () {
        return h.attempt(function () {
          return client.post("/api/notifications/read-all", { body: {} });
        });
      },
    };
  }

  NS.createNotificationService = createNotificationService;
})(typeof window !== "undefined" ? window : globalThis);
