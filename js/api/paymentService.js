/**
 * paymentService: To'lovlar (davr bo'yicha jadval va holatlar).
 * Hozir backendda mavjud: GET /api/payments va GET /api/payments/:id (ruxsat va egalik serverda tekshiriladi:
 * biznes faqat o'zinikini, supplier faqat o'z qismini ko'radi). Yozish amallari keyingi bosqichda qo'shiladi
 * va shu xizmatga metod sifatida ulanadi (frontend chaqiruvlari o'zgarmaydi).
 */
(function (global) {
  "use strict";
  var NS = (global.SutBozorApi = global.SutBozorApi || {});

  function createPaymentService(client) {
    var h = NS.helpers;
    return {
      /** { items, total, page, limit } */
      list: function (params) {
        return h.attempt(function () {
          return client.get("/api/payments", { query: h.pageQuery(params) });
        });
      },
      getById: function (id) {
        return h.attempt(function () {
          return client.get("/api/payments/" + h.idPath(id));
        });
      },
    };
  }

  NS.createPaymentService = createPaymentService;
})(typeof window !== "undefined" ? window : globalThis);
