/**
 * productService: Mahsulotlar (supplier mahsuloti, bozor).
 * Hozir backendda mavjud: GET /api/products va GET /api/products/:id (ruxsat va egalik serverda tekshiriladi:
 * biznes faqat o'zinikini, supplier faqat o'z qismini ko'radi). Yozish amallari keyingi bosqichda qo'shiladi
 * va shu xizmatga metod sifatida ulanadi (frontend chaqiruvlari o'zgarmaydi).
 */
(function (global) {
  "use strict";
  var NS = (global.SutBozorApi = global.SutBozorApi || {});

  function createProductService(client) {
    var h = NS.helpers;
    return {
      /** { items, total, page, limit } */
      list: function (params) {
        return h.attempt(function () {
          return client.get("/api/products", { query: h.pageQuery(params) });
        });
      },
      getById: function (id) {
        return h.attempt(function () {
          return client.get("/api/products/" + h.idPath(id));
        });
      },
    };
  }

  NS.createProductService = createProductService;
})(typeof window !== "undefined" ? window : globalThis);
