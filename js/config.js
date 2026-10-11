/**
 * SutBozor frontend konfiguratsiyasi. Backend manzili kodda qattiq yozilmaydi, shu yerda va env.js orqali boshqariladi.
 *   development: http://localhost:3000 (localhost / 127.0.0.1 / *.local da avtomatik)
 *   production : env.js ichidagi apiBaseUrl (deploy vaqtida SUTBOZOR_API_URL muhit o'zgaruvchisidan yoziladi), faqat https
 * `useBackend: false` (standart): mavjud frontend avvalgidek brauzer xotirasi bilan ishlaydi, API xizmatlari chaqirilmaydi.
 * Backendga bosqichma-bosqich o'tishda `useBackend: true` qilinadi va tegishli funksiyalar xizmatlarga ulanadi.
 */
(function (global) {
  "use strict";
  var DEV_API_URL = "http://localhost:3000";
  var DEV_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\]|.+\.local)$/;

  /** Faqat origin (protokol + host + port) qabul qilinadi. Yo'l, so'rov qatori, login/parol bo'lmasligi kerak. */
  function normalizeBaseUrl(raw, mode) {
    var u;
    try {
      u = new URL(String(raw).trim());
    } catch (e) {
      return { url: "", error: "API manzili noto'g'ri (masalan: https://api.example.com)." };
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return { url: "", error: "API manzili http yoki https bo'lishi kerak." };
    if (u.username || u.password) return { url: "", error: "API manzilida login yoki parol bo'lmasligi kerak." };
    if ((u.pathname && u.pathname !== "/") || u.search || u.hash) return { url: "", error: "API manzili faqat domen (va port) bo'lishi kerak, yo'lsiz." };
    if (mode === "production" && u.protocol !== "https:") return { url: "", error: "Productionda API manzili https bo'lishi kerak." };
    return { url: u.origin, error: "" };
  }

  function clamp(value, min, max, dflt) {
    var n = Number(value);
    return isFinite(n) && n >= min && n <= max ? Math.floor(n) : dflt;
  }

  function resolveConfig(env, loc) {
    env = env || {};
    var host = (loc && loc.hostname) || "";
    var mode = env.env === "production" || env.env === "development" ? env.env : DEV_HOSTS.test(host) ? "development" : "production";
    var requested = env.apiBaseUrl || (mode === "development" ? DEV_API_URL : "");
    var result = requested
      ? normalizeBaseUrl(requested, mode)
      : { url: "", error: mode === "production" ? "Production uchun API manzili berilmagan (SUTBOZOR_API_URL -> env.js)." : "" };
    return Object.freeze({
      env: mode,
      apiBaseUrl: result.url,
      isConfigured: !!result.url && !result.error,
      configError: result.error,
      useBackend: env.useBackend === true,
      requestTimeoutMs: clamp(env.requestTimeoutMs, 1000, 60000, 15000),
    });
  }

  var NS = (global.SutBozorApi = global.SutBozorApi || {});
  NS.resolveConfig = resolveConfig;
  global.SutBozorConfig = resolveConfig(global.__SUTBOZOR_ENV__, global.location);
})(typeof window !== "undefined" ? window : globalThis);
