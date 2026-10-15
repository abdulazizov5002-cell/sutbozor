/**
 * supplierService: Supplierlar ro'yxati (nomi, hudud, reyting). Backendda: GET /api/suppliers va /:id
 * (biznes bozor uchun ko'radi; ruxsat serverda tekshiriladi).
 */
(function (global) {
  "use strict";
  var NS = (global.SutBozorApi = global.SutBozorApi || {});

  function createSupplierService(client) {
    var h = NS.helpers;
    return {
      /** { items, total, page, limit } */
      list: function (params) {
        return h.attempt(function () {
          return client.get("/api/suppliers", { query: h.pageQuery(params) });
        });
      },
    };
  }

  NS.createSupplierService = createSupplierService;
})(typeof window !== "undefined" ? window : globalThis);
