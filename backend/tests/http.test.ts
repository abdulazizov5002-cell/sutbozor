/**
 * HTTP testlari: haqiqiy Fastify ilovasi, `app.inject()` bilan (port ochilmaydi, qo'shimcha kutubxona kerak emas).
 * Ishga tushirish: npm run test:http  (node:test + tsx). Baza va tarmoq kerak emas.
 * Eslatma: bu fayl Fastify o'rnatilgan muhitda yoziladi/ishlaydi; o'rnatilmagan muhitda tekshirilmagan (docs: README, "Tekshirilganlik").
 */
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";

const ALLOWED = "http://localhost:5173";
const OTHER = "https://app.example.com";
const EVIL = "https://evil.example";
const SECRET_MARKER = "SECRET_MARKER_12345";

// Sozlamalar app import qilinishidan OLDIN o'rnatiladi (env.ts import paytida o'qiladi). Dasturchining .env fayli natijaga ta'sir qilmasligi uchun
// asosiy qiymatlar aniq beriladi (process.env dotenv'dan ustun).
Object.assign(process.env, {
  NODE_ENV: "test", LOG_LEVEL: "silent", CORS_ORIGIN: `${ALLOWED},${OTHER}`, TRUST_PROXY: "false",
  RATE_LIMIT_MAX: "100", RATE_LIMIT_AUTH_MAX: "10", RATE_LIMIT_WRITE_MAX: "30", RATE_LIMIT_WINDOW_SEC: "60", BODY_LIMIT_BYTES: "1048576",
});
delete process.env.DATABASE_URL;

// require (import() emas): env sozlamalari yuqorida o'rnatilgandan KEYIN yuklanishi shart; loyiha CommonJS.
type AppModule = typeof import("../src/app");
type App = Awaited<ReturnType<AppModule["buildApp"]>>;
const makeApp = async (): Promise<App> => (require("../src/app") as AppModule).buildApp();
const json = (res: { body: string }) => JSON.parse(res.body) as any;
const post = (app: App, payload: string, headers: Record<string, string> = { "content-type": "application/json" }) =>
  app.inject({ method: "POST", url: "/api/auth/telegram", headers, payload });
const VALID_INIT = `auth_date=1700000000&query_id=AAH&user=${encodeURIComponent(JSON.stringify({ id: 1, first_name: "Ali" }))}&hash=${"a".repeat(64)}`;

describe("GET /api/health", () => {
  let app: App;
  before(async () => { app = await makeApp(); });
  after(async () => { await app.close(); });

  test("server ishlayapti: 200 va aniq javob", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    assert.equal(res.statusCode, 200);
    assert.match(String(res.headers["content-type"]), /application\/json/);
    assert.deepEqual(json(res), { status: "ok", service: "sutbozor-backend" });
  });
  test("x-request-id, xavfsizlik va no-store sarlavhalari", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    assert.match(String(res.headers["x-request-id"]), /^[0-9a-f-]{36}$/);
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.equal(res.headers["cache-control"], "no-store");
    assert.equal(res.headers["x-powered-by"], undefined);
    assert.match(String(res.headers["content-security-policy"]), /default-src 'none'/);
    assert.equal(res.headers["strict-transport-security"], undefined); // faqat productionda
  });
  test("HEAD ishlaydi, POST yo'q (404)", async () => {
    assert.equal((await app.inject({ method: "HEAD", url: "/api/health" })).statusCode, 200);
    assert.equal((await app.inject({ method: "POST", url: "/api/health", payload: {} })).statusCode, 404);
  });
});

describe("noto'g'ri route (404)", () => {
  let app: App;
  before(async () => { app = await makeApp(); });
  after(async () => { await app.close(); });

  for (const url of ["/api/nope", "/nope", "/", "/api/health/extra"]) {
    test(`GET ${url}`, async () => {
      const res = await app.inject({ method: "GET", url });
      assert.equal(res.statusCode, 404);
      const b = json(res);
      assert.equal(b.success, false); assert.equal(b.error.code, "NOT_FOUND");
      assert.ok(!res.body.includes("stack") && !res.body.includes("Route "));
    });
  }
  test("himoyalangan route autentifikatsiya yo'qligida ochiq qolmaydi (501, 200 emas)", async () => {
    for (const url of ["/api/orders", "/api/payments", "/api/users", "/api/admin/audit-logs", "/api/auth/me"]) {
      const res = await app.inject({ method: "GET", url });
      assert.equal(res.statusCode, 501, url);
      assert.equal(json(res).error.code, "AUTH_NOT_CONFIGURED");
    }
  });
});

describe("noto'g'ri JSON va validatsiya (POST /api/auth/telegram)", () => {
  let app: App;
  beforeEach(async () => { app = await makeApp(); });
  afterEach(async () => { await app.close(); });

  test("buzilgan JSON -> 400 BAD_REQUEST, parser matni sizmaydi", async () => {
    const res = await post(app, '{"initData": ');
    assert.equal(res.statusCode, 400);
    const b = json(res);
    assert.equal(b.success, false); assert.equal(b.error.code, "BAD_REQUEST");
    assert.ok(!/Unexpected|position|JSON\.parse/i.test(res.body));
  });
  test("bo'sh JSON tana -> 400", async () => {
    assert.equal((await post(app, "")).statusCode, 400);
  });
  test("qo'llab-quvvatlanmaydigan Content-Type -> 415 (Fastify text/plain ni o'zi tahlil qiladi, shuning uchun xml)", async () => {
    const res = await post(app, "<a/>", { "content-type": "application/xml" });
    assert.equal(res.statusCode, 415);
    assert.equal(json(res).error.code, "UNSUPPORTED_MEDIA_TYPE");
  });
  test("juda katta tana (8 KB limit) -> 413", async () => {
    const res = await post(app, JSON.stringify({ initData: "x".repeat(9000) }));
    assert.equal(res.statusCode, 413);
    assert.equal(json(res).error.code, "PAYLOAD_TOO_LARGE");
  });
  test("validatsiya xatosi -> 400 VALIDATION_ERROR + details", async () => {
    const res = await post(app, "{}");
    assert.equal(res.statusCode, 400);
    const b = json(res);
    assert.equal(b.error.code, "VALIDATION_ERROR");
    assert.ok(Array.isArray(b.error.details) && b.error.details.length > 0);
    assert.ok(b.error.details.some((d: any) => String(d.path).includes("initData")));
  });
  test("null va massiv tana -> 400", async () => {
    assert.equal((await post(app, "null")).statusCode, 400);
    assert.equal((await post(app, "[]")).statusCode, 400);
  });
  test("mijoz yuborgan rol/userId rad etiladi (strict)", async () => {
    for (const extra of [{ role: "admin" }, { userId: "u1" }, { telegramId: "1" }]) {
      const res = await post(app, JSON.stringify({ initData: VALID_INIT, ...extra }));
      assert.equal(res.statusCode, 400); assert.equal(json(res).error.code, "VALIDATION_ERROR");
    }
  });
  test("yaroqsiz initData tuzilmasi -> 400 INVALID_INIT_DATA, qiymat aks etmaydi", async () => {
    const res = await post(app, JSON.stringify({ initData: `${SECRET_MARKER}-not-a-real-initdata` }));
    assert.equal(res.statusCode, 400); assert.equal(json(res).error.code, "INVALID_INIT_DATA");
    assert.ok(!res.body.includes(SECRET_MARKER));
  });
  test("tuzilmasi to'g'ri initData -> 501 (tasdiqlash yo'q), token berilmaydi", async () => {
    const res = await post(app, JSON.stringify({ initData: VALID_INIT }));
    assert.equal(res.statusCode, 501);
    const b = json(res);
    assert.equal(b.error.code, "NOT_IMPLEMENTED");
    assert.ok(!/token|session/i.test(JSON.stringify(b.data ?? {})));
  });
});

describe("CORS", () => {
  let app: App;
  before(async () => { app = await makeApp(); });
  after(async () => { await app.close(); });

  test("ruxsat etilgan origin: ACAO shu origin, '*' emas, credentials yo'q", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health", headers: { origin: ALLOWED } });
    assert.equal(res.headers["access-control-allow-origin"], ALLOWED);
    assert.equal(res.headers["access-control-allow-credentials"], undefined);
    assert.match(String(res.headers["vary"]), /origin/i);
    assert.match(String(res.headers["access-control-expose-headers"]), /x-request-id/i);
  });
  test("ikkinchi ruxsat etilgan origin ham ishlaydi", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health", headers: { origin: OTHER } });
    assert.equal(res.headers["access-control-allow-origin"], OTHER);
  });
  test("begona origin: ACAO yo'q", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health", headers: { origin: EVIL } });
    assert.equal(res.headers["access-control-allow-origin"], undefined);
  });
  test("preflight (ruxsat etilgan origin) -> 204 va to'g'ri sarlavhalar", async () => {
    const res = await app.inject({
      method: "OPTIONS", url: "/api/auth/telegram",
      headers: { origin: ALLOWED, "access-control-request-method": "POST", "access-control-request-headers": "content-type,authorization" },
    });
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers["access-control-allow-origin"], ALLOWED);
    assert.match(String(res.headers["access-control-allow-methods"]), /POST/);
    assert.match(String(res.headers["access-control-allow-headers"]), /authorization/i);
    assert.equal(res.headers["access-control-max-age"], "600");
  });
  test("preflight (begona origin): ACAO yo'q", async () => {
    const res = await app.inject({
      method: "OPTIONS", url: "/api/auth/telegram",
      headers: { origin: EVIL, "access-control-request-method": "POST" },
    });
    assert.equal(res.headers["access-control-allow-origin"], undefined);
  });
  test("xato javobida ham CORS sarlavhasi bor (brauzer xatoni o'qiy olishi uchun)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/nope", headers: { origin: ALLOWED } });
    assert.equal(res.statusCode, 404);
    assert.equal(res.headers["access-control-allow-origin"], ALLOWED);
  });
});

describe("error handler", () => {
  let app: App;
  before(async () => {
    app = await makeApp();
    const { AppError, ERROR_CODES } = require("../src/utils/errors") as typeof import("../src/utils/errors");
    const { ZodError } = require("zod") as typeof import("zod");
    // Sinov route'lari ilovaning HAQIQIY error handler'idan o'tadi (ready'dan oldin qo'shiladi).
    app.get("/__t/boom", async () => { throw new Error(`DB xatosi password=hunter2 at /srv/app/db.ts ${SECRET_MARKER}`); });
    app.get("/__t/app", async () => { throw new AppError(409, ERROR_CODES.CONFLICT, "Allaqachon mavjud."); });
    app.get("/__t/zod", async () => { throw new ZodError([{ code: "custom", path: ["body", "x"], message: "Noto'g'ri." }]); });
    app.get("/__t/503", async () => { throw Object.assign(new Error("upstream secret-host"), { statusCode: 503 }); });
  });
  after(async () => { await app.close(); });

  test("kutilmagan xato -> 500 INTERNAL_ERROR, hech narsa sizmaydi", async () => {
    const res = await app.inject({ method: "GET", url: "/__t/boom" });
    assert.equal(res.statusCode, 500);
    assert.equal(json(res).error.code, "INTERNAL_ERROR");
    for (const bad of ["hunter2", "/srv", SECRET_MARKER, "stack", "db.ts"]) assert.ok(!res.body.includes(bad), bad);
    assert.match(String(res.headers["x-request-id"]), /^[0-9a-f-]{36}$/);
  });
  test("AppError -> o'z statusi, kodi va xabari", async () => {
    const res = await app.inject({ method: "GET", url: "/__t/app" });
    assert.equal(res.statusCode, 409);
    assert.deepEqual(json(res), { success: false, error: { code: "CONFLICT", message: "Allaqachon mavjud." } });
  });
  test("ZodError -> 400 VALIDATION_ERROR", async () => {
    const res = await app.inject({ method: "GET", url: "/__t/zod" });
    assert.equal(res.statusCode, 400); assert.equal(json(res).error.code, "VALIDATION_ERROR");
  });
  test("503 -> SERVICE_UNAVAILABLE, matn umumiy", async () => {
    const res = await app.inject({ method: "GET", url: "/__t/503" });
    assert.equal(res.statusCode, 503); assert.equal(json(res).error.code, "SERVICE_UNAVAILABLE");
    assert.ok(!res.body.includes("secret-host"));
  });
});

describe("rate limit (/api/auth qattiq)", () => {
  test("11-so'rov 429 RATE_LIMITED bo'ladi", async () => {
    const app = await makeApp();
    try {
      const codes: number[] = [];
      for (let i = 0; i < 12; i++) codes.push((await post(app, "{}")).statusCode);
      assert.equal(codes.slice(0, 10).every((c) => c === 400), true, codes.join(","));
      assert.equal(codes[10], 429);
      const res = await post(app, "{}");
      assert.equal(json(res).error.code, "RATE_LIMITED");
      assert.ok(res.headers["retry-after"] !== undefined);
    } finally {
      await app.close();
    }
  });
});
