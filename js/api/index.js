/**
 * SutBozorApi: xizmatlarni yig'ish. Foydalanish:
 *   var api = SutBozorApi.get();                 // bitta umumiy nusxa (SutBozorConfig bilan)
 *   if (api.config.useBackend) { api.products.list({ page: 1, limit: 20 }).then(...).catch(showError); }
 * Yuklash tartibi (index.html): env.js, config.js, apiClient.js, authService.js, productService.js, supplierService.js, orderService.js, contractService.js, paymentService.js, index.js
 */
(function (global) {
  "use strict";
  var NS = (global.SutBozorApi = global.SutBozorApi || {});
  var singleton = null;

  /** overrides: { tokenStore, fetch, onUnauthorized } (testlar va maxsus holatlar uchun). */
  NS.createServices = function (config, overrides) {
    overrides = overrides || {};
    var tokenStore = overrides.tokenStore || NS.createTokenStore();
    var client = NS.createApiClient({ config: config, tokenStore: tokenStore, fetch: overrides.fetch, onUnauthorized: overrides.onUnauthorized });
    return {
      config: config,
      client: client,
      tokenStore: tokenStore,
      auth: NS.createAuthService(client, tokenStore),
      products: NS.createProductService(client),
      suppliers: NS.createSupplierService(client),
      orders: NS.createOrderService(client),
      contracts: NS.createContractService(client),
      payments: NS.createPaymentService(client),
      /** Hech qachon xato tashlamaydi: { ok, apiBaseUrl, service?, error? }. Dasturchi konsolida: SutBozorApi.get().checkConnection() */
      checkConnection: function () {
        return client.health().then(
          function (h) { return { ok: h.status === "ok", apiBaseUrl: config.apiBaseUrl, service: h.service }; },
          function (e) { return { ok: false, apiBaseUrl: config.apiBaseUrl, error: e.code + ": " + e.message }; }
        );
      },
    };
  };

  NS.get = function () {
    if (!singleton) singleton = NS.createServices(global.SutBozorConfig);
    return singleton;
  };
})(typeof window !== "undefined" ? window : globalThis);
