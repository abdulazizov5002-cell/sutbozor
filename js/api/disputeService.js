/**
 * disputeService: Nizolar.
 * Backendda mavjud: GET /api/disputes, GET /api/disputes/:id (egalik serverda: biznes/supplier faqat o'zinikini, admin hammasini),
 * POST /api/disputes (business/supplier ochadi) va POST /api/disputes/:id (faqat admin holatini o'zgartiradi).
 * Nizo pul harakati qilmaydi va to'lov holatini o'zgartirmaydi: SutBozor pul ushlab turmaydi, faqat qaror yoziladi.
 */
(function (global) {
  "use strict";
  var NS = (global.SutBozorApi = global.SutBozorApi || {});

  function createDisputeService(client) {
    var h = NS.helpers;
    return {
      /** { items, total, page, limit } */
      list: function (params) {
        return h.attempt(function () {
          return client.get("/api/disputes", { query: h.pageQuery(params) });
        });
      },
      getById: function (id) {
        return h.attempt(function () {
          return client.get("/api/disputes/" + h.idPath(id));
        });
      },
      /**
       * o = { orderId, reason, description, paymentId?, contractId?, supplierId? }.
       * reason: NOT_DELIVERED | WRONG_QTY | QUALITY | PAYMENT | LATE | PRICE | OTHER. supplierId faqat biznes uchun va faqat
       * buyurtmada bir nechta supplier bo'lib, to'lov/shartnoma ko'rsatilmaganda kerak.
       */
      open: function (o) {
        return h.attempt(function () {
          return client.post("/api/disputes", { body: o });
        });
      },
      /** Faqat admin. status: UNDER_REVIEW | RESOLVED | REJECTED | CLOSED. RESOLVED/REJECTED uchun resolution (kamida 3 belgi) majburiy. */
      setStatus: function (id, status, resolution) {
        var body = { status: status };
        if (resolution) body.resolution = resolution;
        return h.attempt(function () {
          return client.post("/api/disputes/" + h.idPath(id), { body: body });
        });
      },
    };
  }

  NS.createDisputeService = createDisputeService;
})(typeof window !== "undefined" ? window : globalThis);
