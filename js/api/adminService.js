/**
 * adminService: Admin uchun serverdagi ma'lumotlar (faqat ADMIN roli; ruxsat har so'rovda serverda bazadan tekshiriladi).
 * Backendda mavjud: GET /api/users, POST /api/users/:id (bloklash/faollashtirish), GET /api/businesses, GET /api/admin/audit-logs.
 * Buyurtmalar, to'lovlar, nizolar, supplierlar mavjud xizmatlar orqali o'qiladi (orders, payments, disputes, suppliers): admin hammasini ko'radi.
 */
(function (global) {
  "use strict";
  var NS = (global.SutBozorApi = global.SutBozorApi || {});

  function createAdminService(client) {
    var h = NS.helpers;
    return {
      /** { items, total, page, limit } */
      listUsers: function (params) {
        return h.attempt(function () {
          return client.get("/api/users", { query: h.pageQuery(params) });
        });
      },
      /** status: BLOCKED (reason kamida 3 belgi, majburiy) | ACTIVE. O'zini va boshqa adminni o'zgartirib bo'lmaydi (409). */
      setUserStatus: function (id, status, reason) {
        var body = { status: status };
        if (reason) body.reason = reason;
        return h.attempt(function () {
          return client.post("/api/users/" + h.idPath(id), { body: body });
        });
      },
      listBusinesses: function (params) {
        return h.attempt(function () {
          return client.get("/api/businesses", { query: h.pageQuery(params) });
        });
      },
      listAuditLogs: function (params) {
        return h.attempt(function () {
          return client.get("/api/admin/audit-logs", { query: h.pageQuery(params) });
        });
      },
    };
  }

  NS.createAdminService = createAdminService;
})(typeof window !== "undefined" ? window : globalThis);
