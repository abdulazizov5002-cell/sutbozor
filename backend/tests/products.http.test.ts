/**
 * /api/products HTTP testlari: haqiqiy Fastify ilovasi (app.inject), soxta ombor va soxta autentifikatsiya strategiyasi.
 * Tartib: autentifikatsiya (401) -> validatsiya (400) -> huquq (403) -> egalik (404). Ishga tushirish: npm run test:products-http (CI'da).
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { fakeProductRepo, prod } from "./helpers/fakeProductRepo";

const ALLOWED = "http://localhost:5173";
Object.assign(process.env, {
  NODE_ENV: "test", LOG_LEVEL: "silent", CORS_ORIGIN: ALLOWED, TRUST_PROXY: "false",
  RATE_LIMIT_MAX: "100", RATE_LIMIT_AUTH_MAX: "10", RATE_LIMIT_WRITE_MAX: "30", RATE_LIMIT_WINDOW_SEC: "60", BODY_LIMIT_BYTES: "1048576",
});
delete process.env.DATABASE_URL;

// require: env yuqorida o'rnatilgandan KEYIN yuklanishi shart (loyiha CommonJS).
type AppModule = typeof import("../src/app");
type App = Awaited<ReturnType<AppModule["buildApp"]>>;
const { buildApp } = require("../src/app") as AppModule;
const { setAuthStrategy } = require("../src/middleware/auth") as typeof import("../src/middleware/auth");
const { notImplementedRepositories } = require("../src/repositories/notImplemented") as typeof import("../src/repositories/notImplemented");
type TestUser = import("../src/types/fastify").AuthUser;

const P_A = "00000000-0000-4000-8000-0000000000a1";
const P_B = "00000000-0000-4000-8000-0000000000b1";
const users: Record<string, TestUser> = {
  supA: { id: "uA", name: "Ali", role: "supplier", status: "ACTIVE", supplierId: "sA", businessId: null },
  supB: { id: "uB", name: "Vali", role: "supplier", status: "ACTIVE", supplierId: "sB", businessId: null },
  biz: { id: "uC", name: "Kafe", role: "business", status: "ACTIVE", businessId: "bC", supplierId: null },
  adm: { id: "uD", name: "Admin", role: "admin", status: "ACTIVE", businessId: null, supplierId: null },
};
const json = (res: { body: string }) => JSON.parse(res.body) as any;
const good = { name: "Qaymoq", pricePerUnit: 30000, dailyCapacity: 4, availableToday: 3 };

describe("/api/products (yozish va o'qish)", () => {
  let app: App;
  const call = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, who?: string, payload?: unknown) =>
    app.inject({
      method, url, payload: payload as never,
      headers: { ...(who ? { "x-test-user": who } : {}), ...(payload !== undefined ? { "content-type": "application/json" } : {}) },
    });

  before(async () => {
    const w = fakeProductRepo([prod(P_A, "sA"), prod(P_B, "sB", "Qatiq")]);
    setAuthStrategy({ authenticate: async (req) => users[String(req.headers["x-test-user"])] ?? null });
    app = await buildApp({ repositories: { ...notImplementedRepositories(), products: w.repo } });
  });
  after(async () => { await app.close(); });

  test("tokensiz -> 401 (o'qish ham, yozish ham)", async () => {
    assert.equal((await call("GET", "/api/products")).statusCode, 401);
    assert.equal((await call("POST", "/api/products", undefined, good)).statusCode, 401);
    assert.equal((await call("DELETE", `/api/products/${P_A}`)).statusCode, 401);
  });
  test("biznes bozorni (hammasini), supplier faqat o'zinikini ko'radi", async () => {
    assert.equal(json(await call("GET", "/api/products", "biz")).data.total, 2);
    assert.equal(json(await call("GET", "/api/products", "supA")).data.total, 1);
  });
  test("biznes va admin yaratolmaydi, o'zgartira olmaydi, o'chira olmaydi -> 403", async () => {
    for (const who of ["biz", "adm"]) {
      assert.equal((await call("POST", "/api/products", who, good)).statusCode, 403, who);
      assert.equal((await call("PATCH", `/api/products/${P_A}`, who, { pricePerUnit: 1 })).statusCode, 403, who);
      assert.equal((await call("DELETE", `/api/products/${P_A}`, who)).statusCode, 403, who);
    }
  });
  test("noto'g'ri body -> 400 VALIDATION_ERROR (narx 0, noma'lum nom, supplierId/unit yuborish)", async () => {
    for (const bad of [{ ...good, pricePerUnit: 0 }, { ...good, name: "Pishloq" }, { ...good, supplierId: "sB" }, { ...good, unit: "kg" }]) {
      const res = await call("POST", "/api/products", "supA", bad);
      assert.equal(res.statusCode, 400);
      assert.equal(json(res).error.code, "VALIDATION_ERROR");
    }
    assert.equal((await call("PATCH", `/api/products/${P_A}`, "supA", {})).statusCode, 400);
    assert.equal((await call("PATCH", "/api/products/not-a-uuid", "supA", { pricePerUnit: 1 })).statusCode, 400);
  });
  test("supplier yaratadi: 201, supplierId tokendan, birlik nomdan", async () => {
    const res = await call("POST", "/api/products", "supA", good);
    assert.equal(res.statusCode, 201);
    const b = json(res);
    assert.equal(b.success, true); assert.equal(b.data.supplierId, "sA"); assert.equal(b.data.unit, "L"); assert.equal(b.data.name, "Qaymoq");
  });
  test("takror mahsulot -> 409 CONFLICT", async () => {
    const res = await call("POST", "/api/products", "supA", { ...good, name: "Sut" });
    assert.equal(res.statusCode, 409); assert.equal(json(res).error.code, "CONFLICT");
  });
  test("begona mahsulotni o'zgartirish/o'chirish -> 404, o'zinikini -> 200", async () => {
    assert.equal((await call("PATCH", `/api/products/${P_B}`, "supA", { pricePerUnit: 1 })).statusCode, 404);
    assert.equal((await call("DELETE", `/api/products/${P_B}`, "supA")).statusCode, 404);
    const upd = await call("PATCH", `/api/products/${P_A}`, "supA", { pricePerUnit: 15000 });
    assert.equal(upd.statusCode, 200); assert.equal(json(upd).data.pricePerUnit, 15000);
    const del = await call("DELETE", `/api/products/${P_B}`, "supB");
    assert.equal(del.statusCode, 200); assert.equal(json(del).data.id, P_B);
    assert.equal((await call("GET", `/api/products/${P_B}`, "biz")).statusCode, 404);
  });
  test("CORS preflight PATCH va DELETE uchun ruxsat beriladi", async () => {
    for (const method of ["PATCH", "DELETE"]) {
      const res = await app.inject({
        method: "OPTIONS", url: `/api/products/${P_A}`,
        headers: { origin: ALLOWED, "access-control-request-method": method, "access-control-request-headers": "content-type,authorization" },
      });
      assert.equal(res.statusCode, 204, method);
      assert.match(String(res.headers["access-control-allow-methods"]), new RegExp(method));
    }
  });
});
