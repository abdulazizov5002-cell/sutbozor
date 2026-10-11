/**
 * apiClient: backend bilan yagona aloqa nuqtasi. Barcha xizmatlar (auth, products, orders, payments) shu orqali so'rov yuboradi.
 * Backend formati: muvaffaqiyat {success:true,data}, xato {success:false,error:{code,message,details?}}.
 * Xavfsizlik: token faqat xotirada (localStorage/sessionStorage'ga yozilmaydi), cookie yuborilmaydi (credentials:"omit"),
 * redirect'ga ergashilmaydi, faqat /api/ yo'llariga so'rov ketadi, server xatolarining matni foydalanuvchiga chiqarilmaydi.
 */
(function (global) {
  "use strict";
  var NS = (global.SutBozorApi = global.SutBozorApi || {});
  var PATH_RE = /^\/api\/[A-Za-z0-9\-._~%\/]*$/;
  var TOKEN_RE = /^[A-Za-z0-9._~+/=-]{10,4096}$/;

  class ApiError extends Error {
    constructor(status, code, message, details, requestId) {
      super(message);
      this.name = "ApiError";
      this.status = status; // 0: serverga yetib bormagan (tarmoq, timeout, sozlama, mijoz tekshiruvi)
      this.code = code;
      this.details = details || null;
      this.requestId = requestId || null;
    }
  }

  /** Token xotirada saqlanadi. Muddati (epoch, soniya) o'tsa avtomatik null qaytaradi. */
  function createTokenStore(nowFn) {
    var now = nowFn || Date.now;
    var token = null;
    var expiresAt = 0;
    return {
      set: function (value, exp) {
        if (typeof value !== "string" || !TOKEN_RE.test(value)) throw new ApiError(0, "INVALID_TOKEN", "Token formati noto'g'ri.");
        token = value;
        expiresAt = Number(exp) || 0;
      },
      get: function () {
        if (!token) return null;
        if (expiresAt && expiresAt <= Math.floor(now() / 1000)) {
          token = null;
          return null;
        }
        return token;
      },
      clear: function () {
        token = null;
        expiresAt = 0;
      },
    };
  }

  /** ?page=&limit= ni mijozda tekshiradi (backend ham tekshiradi, bu faqat tez xato uchun). */
  function pageQuery(params) {
    params = params || {};
    var page = params.page === undefined ? 1 : params.page;
    var limit = params.limit === undefined ? 20 : params.limit;
    if (!Number.isInteger(page) || page < 1) throw new ApiError(0, "CLIENT_VALIDATION", "page 1 dan katta butun son bo'lishi kerak.");
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ApiError(0, "CLIENT_VALIDATION", "limit 1 dan 100 gacha bo'lishi kerak.");
    return { page: page, limit: limit };
  }

  function idPath(id) {
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new ApiError(0, "CLIENT_VALIDATION", "ID noto'g'ri.");
    return encodeURIComponent(id);
  }

  function toQuery(query) {
    if (!query) return "";
    var parts = [];
    Object.keys(query).forEach(function (k) {
      var v = query[k];
      if (v === undefined || v === null || v === "") return;
      if (typeof v === "object") throw new TypeError("Query qiymati oddiy bo'lishi kerak: " + k);
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v)));
    });
    return parts.length ? "?" + parts.join("&") : "";
  }

  /**
   * options: { config, tokenStore, fetch, onUnauthorized }
   * onUnauthorized(error) token yaroqsiz bo'lganda (401) chaqiriladi: foydalanuvchini qayta kirishga yo'naltirish uchun.
   */
  function createApiClient(options) {
    var cfg = options.config;
    var tokenStore = options.tokenStore;
    var fetchFn = options.fetch || (typeof global.fetch === "function" ? global.fetch.bind(global) : null);
    var onUnauthorized = options.onUnauthorized;

    async function request(method, path, o) {
      o = o || {};
      if (!cfg || !cfg.isConfigured) throw new ApiError(0, "CONFIG_ERROR", (cfg && cfg.configError) || "API manzili sozlanmagan.");
      // Faqat /api/... yo'li; "..", "." segmentlari va "//" taqiqlanadi (yo'l manipulyatsiyasidan himoya).
      if (typeof path !== "string" || !PATH_RE.test(path) || /(^|\/)\.\.?(\/|$)/.test(path) || path.indexOf("//") !== -1) {
        throw new ApiError(0, "CLIENT_VALIDATION", "So'rov yo'li noto'g'ri.");
      }
      if (!fetchFn) throw new ApiError(0, "CONFIG_ERROR", "Brauzer fetch'ni qo'llamaydi.");

      var headers = { Accept: "application/json" };
      var token = tokenStore && !o.noAuth ? tokenStore.get() : null;
      if (token) headers.Authorization = "Bearer " + token;
      var init = { method: method, headers: headers, credentials: "omit", cache: "no-store", redirect: "error", mode: "cors" };
      if (o.body !== undefined) {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(o.body);
      }
      var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = null;
      if (controller) {
        init.signal = controller.signal;
        timer = setTimeout(function () {
          controller.abort();
        }, o.timeoutMs || cfg.requestTimeoutMs);
      }

      var res, text;
      try {
        res = await fetchFn(cfg.apiBaseUrl + path + toQuery(o.query), init);
        text = await res.text();
      } catch (err) {
        var timedOut = controller && controller.signal.aborted;
        throw timedOut
          ? new ApiError(0, "TIMEOUT", "So'rov vaqti tugadi. Internetni tekshiring.")
          : new ApiError(0, "NETWORK_ERROR", "Serverga ulanib bo'lmadi. Internetni tekshiring.");
      } finally {
        if (timer) clearTimeout(timer);
      }

      var requestId = res.headers && typeof res.headers.get === "function" ? res.headers.get("x-request-id") : null;
      var json = null;
      try {
        json = JSON.parse(text);
      } catch (e) {
        json = null;
      }

      if (o.raw) {
        if (res.ok && json && typeof json === "object") return json;
      } else if (json && json.success === true && "data" in json) {
        return json.data;
      } else if (json && json.success === false && json.error && typeof json.error.code === "string") {
        var err2 = new ApiError(res.status, json.error.code, String(json.error.message || "Xatolik").slice(0, 300), json.error.details, requestId);
        if (res.status === 401 && !o.noAuth) {
          if (tokenStore) tokenStore.clear();
          if (typeof onUnauthorized === "function") onUnauthorized(err2);
        }
        throw err2;
      }
      // Server HTML, bo'sh yoki kutilmagan javob qaytardi: matni foydalanuvchiga ko'rsatilmaydi.
      throw new ApiError(res.status, "INVALID_RESPONSE", "Server kutilmagan javob qaytardi (HTTP " + res.status + ").", null, requestId);
    }

    return {
      get: function (path, o) { return request("GET", path, o); },
      post: function (path, o) { return request("POST", path, o); },
      patch: function (path, o) { return request("PATCH", path, o); },
      put: function (path, o) { return request("PUT", path, o); },
      del: function (path, o) { return request("DELETE", path, o); },
      /** /api/health o'ralmagan {status, service} qaytaradi. */
      health: function () { return request("GET", "/api/health", { raw: true, noAuth: true }); },
    };
  }

  NS.ApiError = ApiError;
  NS.createTokenStore = createTokenStore;
  NS.createApiClient = createApiClient;
  /** Barcha xizmat metodlari Promise qaytaradi: sinxron xato (mijoz tekshiruvi) ham rad etilgan Promise bo'ladi, .catch() ushlaydi. */
  function attempt(fn) {
    return new Promise(function (resolve) {
      resolve(fn());
    });
  }

  NS.helpers = { pageQuery: pageQuery, idPath: idPath, toQuery: toQuery, attempt: attempt };
})(typeof window !== "undefined" ? window : globalThis);
