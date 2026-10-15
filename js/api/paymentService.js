/**
 * paymentService: To'lovlar (davr bo'yicha jadval va holatlar).
 * Hozir backendda mavjud: GET /api/payments va GET /api/payments/:id (ruxsat va egalik serverda tekshiriladi:
 * biznes faqat o'zinikini, supplier faqat o'z qismini ko'radi) va POST /api/payments/:id (submit/confirm/reject).
 * SutBozor pul ushlab turmaydi: to'lov faqat yozib boriladi. Summani frontend yubormaydi, server o'zi biladi.
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
      /** Biznes: to'lov qilganini yozadi. o = { method, transactionId, paidOn: "YYYY-MM-DD", note? } */
      submit: function (id, o) {
        var body = { action: "submit", method: o.method, transactionId: o.transactionId, paidOn: o.paidOn };
        if (o.note) body.note = o.note;
        return h.attempt(function () {
          return client.post("/api/payments/" + h.idPath(id), { body: body });
        });
      },
      /** Supplier: pul kelganini tasdiqlaydi. */
      confirm: function (id) {
        return h.attempt(function () {
          return client.post("/api/payments/" + h.idPath(id), { body: { action: "confirm" } });
        });
      },
      /** Supplier: pul kelmaganini yozadi (sabab kamida 3 belgi). */
      reject: function (id, reason) {
        return h.attempt(function () {
          return client.post("/api/payments/" + h.idPath(id), { body: { action: "reject", reason: reason } });
        });
      },
    };
  }

  NS.createPaymentService = createPaymentService;
})(typeof window !== "undefined" ? window : globalThis);
