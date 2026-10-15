/**
 * contractService: Shartnomalar (supplier qabul qilganda server yaratadi). Backendda: GET /api/contracts va /:id
 * (biznes faqat o'zinikini, supplier faqat o'zinikini ko'radi; ruxsat serverda tekshiriladi).
 */
(function (global) {
  "use strict";
  var NS = (global.SutBozorApi = global.SutBozorApi || {});

  function createContractService(client) {
    var h = NS.helpers;
    return {
      /** { items, total, page, limit } */
      list: function (params) {
        return h.attempt(function () {
          return client.get("/api/contracts", { query: h.pageQuery(params) });
        });
      },
      getById: function (id) {
        return h.attempt(function () {
          return client.get("/api/contracts/" + h.idPath(id));
        });
      },
    };
  }

  NS.createContractService = createContractService;
})(typeof window !== "undefined" ? window : globalThis);
