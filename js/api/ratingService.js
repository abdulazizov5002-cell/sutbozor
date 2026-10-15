/**
 * ratingService: yakunlangan buyurtma qismini baholash (G3).
 * Backendda mavjud: POST /api/ratings { orderId, itemId, score (1-5), comment? }.
 * Kim kimni baholashi (biznes -> supplier, supplier -> biznes) serverda rolidan aniqlanadi; bodyda yo'q.
 * O'qish endpointi yo'q: o'rtacha bal supplier/biznes yozuvidagi `rating` va `ratingCount` da ko'rinadi.
 */
(function (global) {
  "use strict";
  var NS = (global.SutBozorApi = global.SutBozorApi || {});

  function createRatingService(client) {
    var h = NS.helpers;
    return {
      /** score: 1..5 butun son. Takror baho yoki yakunlanmagan qism uchun 409 xato qaytadi. */
      create: function (input) {
        return h.attempt(function () {
          return client.post("/api/ratings", {
            body: { orderId: input.orderId, itemId: input.itemId, score: input.score, comment: input.comment || "" },
          });
        });
      },
    };
  }

  NS.createRatingService = createRatingService;
})(typeof window !== "undefined" ? window : globalThis);
