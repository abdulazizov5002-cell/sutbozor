/**
 * productService: Mahsulotlar (supplier mahsuloti, bozor).
 * Backendda mavjud: GET /api/products, GET /api/products/:id (biznes bozorni, supplier o'zinikini ko'radi) va faqat supplier uchun
 * POST /api/products, PATCH /api/products/:id, DELETE /api/products/:id (faqat o'z mahsuloti; huquq va egalik serverda tekshiriladi).
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
      /** p = { name, pricePerUnit, dailyCapacity, availableToday }. supplierId va birlik serverda aniqlanadi. */
      create: function (p) {
        return h.attempt(function () {
          return client.post("/api/products", { body: p });
        });
      },
      /** patch = { pricePerUnit?, dailyCapacity?, availableToday? } (kamida bittasi). */
      update: function (id, patch) {
        return h.attempt(function () {
          return client.patch("/api/products/" + h.idPath(id), { body: patch });
        });
      },
      remove: function (id) {
        return h.attempt(function () {
          return client.del("/api/products/" + h.idPath(id));
        });
      },
    };
  }

  NS.createProductService = createProductService;
})(typeof window !== "undefined" ? window : globalThis);
