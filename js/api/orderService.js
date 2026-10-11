/**
 * orderService: Buyurtmalar (parent buyurtma va supplier qismlari).
 * Hozir backendda mavjud: GET /api/orders va GET /api/orders/:id (ruxsat va egalik serverda tekshiriladi:
 * biznes faqat o'zinikini, supplier faqat o'z qismini ko'radi). Yozish amallari keyingi bosqichda qo'shiladi
 * va shu xizmatga metod sifatida ulanadi (frontend chaqiruvlari o'zgarmaydi).
 */
(function (global) {
  "use strict";
  var NS = (global.SutBozorApi = global.SutBozorApi || {});

  function createOrderService(client) {
    var h = NS.helpers;
    return {
      /** { items, total, page, limit } */
      list: function (params) {
        return h.attempt(function () {
          return client.get("/api/orders", { query: h.pageQuery(params) });
        });
      },
      getById: function (id) {
        return h.attempt(function () {
          return client.get("/api/orders/" + h.idPath(id));
        });
      },
    };
  }

  NS.createOrderService = createOrderService;
})(typeof window !== "undefined" ? window : globalThis);
