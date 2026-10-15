/**
 * orderService: Buyurtmalar (parent buyurtma va supplier qismlari).
 * Backendda mavjud: GET /api/orders, GET /api/orders/:id (biznes faqat o'zinikini, supplier faqat o'z qismini ko'radi),
 * POST /api/orders (faqat biznes) va POST /api/orders/:id/items/:itemId (accept/reject: supplier, cancel: biznes).
 * Narx va huquq serverda aniqlanadi: frontend narx yubormaydi.
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
      /** o = { product, days, deliveryMode, paymentSchedule, prepTime?, items: [{ supplierId, quantityPerDay }] } */
      create: function (o) {
        return h.attempt(function () {
          return client.post("/api/orders", { body: o });
        });
      },
      /**
       * action: accept | reject | cancel | prepare | ready | depart | deliver | pickup | pause | resume.
       * reject, cancel va pause uchun reason (kamida 3 belgi) majburiy. Holat qoidalari serverda (noto'g'ri holat -> 409).
       */
      act: function (orderId, itemId, action, reason) {
        var body = { action: action };
        if (reason) body.reason = reason;
        return h.attempt(function () {
          return client.post("/api/orders/" + h.idPath(orderId) + "/items/" + h.idPath(itemId), { body: body });
        });
      },
    };
  }

  NS.createOrderService = createOrderService;
})(typeof window !== "undefined" ? window : globalThis);
