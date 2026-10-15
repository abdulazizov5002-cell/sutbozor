/**
 * /api/orders HTTP testlari: haqiqiy Fastify ilovasi (app.inject), soxta ombor va soxta autentifikatsiya strategiyasi.
 * Tartib: 401 -> 400 -> 403 -> 404 -> 409. Ishga tushirish: npm run test:orders-http (CI'da).
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { fakeOrderRepo, OFFER } from "./helpers/fakeOrderRepo";

Object.assign(process.env, {
  NODE_ENV: "test", LOG_LEVEL: "silent", CORS_ORIGIN: "http://localhost:5173", TRUST_PROXY: "false",
  RATE_LIMIT_MAX: "100", RATE_LIMIT_AUTH_MAX: "10", RATE_LIMIT_WRITE_MAX: "30", RATE_LIMIT_WINDOW_SEC: "60", BODY_LIMIT_BYTES: "1048576",
});
delete process.env.DATABASE_URL;

type AppModule = typeof import("../src/app");
type App = Awaited<ReturnType<AppModule["buildApp"]>>;
const { buildApp } = require("../src/app") as AppModule;
const { setAuthStrategy } = require("../src/middleware/auth") as typeof import("../src/middleware/auth");
const { notImplementedRepositories } = require("../src/repositories/notImplemented") as typeof import("../src/repositories/notImplemented");
type TestUser = import("../src/types/fastify").AuthUser;

const SA = "00000000-0000-4000-8000-00000000000a";
const SB = "00000000-0000-4000-8000-00000000000b";
const users: Record<string, TestUser> = {
  supA: { id: "uA", name: "Ali", role: "supplier", status: "ACTIVE", supplierId: SA, businessId: null },
  supB: { id: "uB", name: "Vali", role: "supplier", status: "ACTIVE", supplierId: SB, businessId: null },
  biz: { id: "uC", name: "Kafe", role: "business", status: "ACTIVE", businessId: "bC", supplierId: null },
  biz2: { id: "uE", name: "Non", role: "business", status: "ACTIVE", businessId: "bE", supplierId: null },
  adm: { id: "uD", name: "Admin", role: "admin", status: "ACTIVE", businessId: null, supplierId: null },
};
const json = (res: { body: string }) => JSON.parse(res.body) as any;
const good = { product: "Sut", days: 30, deliveryMode: "supplier", paymentSchedule: "WEEKLY", items: [{ supplierId: SA, quantityPerDay: 5 }, { supplierId: SB, quantityPerDay: 2 }] };

describe("/api/orders (yaratish, harakatlar, o'qish)", () => {
  let app: App;
  const call = (method: "GET" | "POST", url: string, who?: string, payload?: unknown) =>
    app.inject({
      method, url, payload: payload as never,
      headers: { ...(who ? { "x-test-user": who } : {}), ...(payload !== undefined ? { "content-type": "application/json" } : {}) },
    });

  before(async () => {
    const w = fakeOrderRepo([], [OFFER(SA), OFFER(SB, "Sut", 11000, 4)]);
    setAuthStrategy({ authenticate: async (req) => users[String(req.headers["x-test-user"])] ?? null });
    app = await buildApp({ repositories: { ...notImplementedRepositories(), orders: w.repo } });
  });
  after(async () => { await app.close(); });

  let orderId = ""; let itemA = ""; let itemB = "";

  test("tokensiz -> 401", async () => {
    assert.equal((await call("POST", "/api/orders", undefined, good)).statusCode, 401);
    assert.equal((await call("POST", `/api/orders/${SA}/items/${SB}`, undefined, { action: "accept" })).statusCode, 401);
  });
  test("noto'g'ri body -> 400 (narx yuborish, takror supplier, bo'sh items, noma'lum mahsulot)", async () => {
    const bads = [
      { ...good, pricePerUnit: 1 }, { ...good, items: [] }, { ...good, product: "Pishloq" },
      { ...good, items: [{ supplierId: SA, quantityPerDay: 1 }, { supplierId: SA, quantityPerDay: 2 }] },
      { ...good, items: [{ supplierId: SA, quantityPerDay: 1, pricePerUnit: 1 }] },
    ];
    for (const bad of bads) {
      const res = await call("POST", "/api/orders", "biz", bad);
      assert.equal(res.statusCode, 400); assert.equal(json(res).error.code, "VALIDATION_ERROR");
    }
  });
  test("supplier va admin buyurtma yarata olmaydi -> 403", async () => {
    for (const who of ["supA", "adm"]) assert.equal((await call("POST", "/api/orders", who, good)).statusCode, 403, who);
  });
  test("hajmdan ortiq / sotmaydigan supplier -> 400", async () => {
    assert.equal((await call("POST", "/api/orders", "biz", { ...good, items: [{ supplierId: SB, quantityPerDay: 5 }] })).statusCode, 400);
    assert.equal((await call("POST", "/api/orders", "biz", { ...good, product: "Qatiq" })).statusCode, 400);
  });
  test("biznes yaratadi: 201, narx serverdan, qismlar SENT", async () => {
    const res = await call("POST", "/api/orders", "biz", good);
    assert.equal(res.statusCode, 201);
    const o = json(res).data;
    assert.equal(o.businessId, "bC"); assert.equal(o.quantityPerDay, 7);
    assert.deepEqual(o.items.map((i: any) => [i.pricePerUnit, i.status]), [[12000, "SENT"], [11000, "SENT"]]);
    orderId = o.id; itemA = o.items[0].id; itemB = o.items[1].id;
  });
  test("o'qish: biznes o'zinikini, begona biznes 404, supplier faqat o'z qismini", async () => {
    assert.equal(json(await call("GET", "/api/orders", "biz")).data.total, 1);
    assert.equal(json(await call("GET", "/api/orders", "biz2")).data.total, 0);
    assert.equal((await call("GET", `/api/orders/${orderId}`, "biz2")).statusCode, 404);
    assert.deepEqual(json(await call("GET", `/api/orders/${orderId}`, "supB")).data.items.map((i: any) => i.supplierId), [SB]);
  });
  test("harakat: noto'g'ri body 400 (sababsiz rad, noma'lum harakat, noto'g'ri uuid)", async () => {
    assert.equal((await call("POST", `/api/orders/${orderId}/items/${itemA}`, "supA", { action: "reject" })).statusCode, 400);
    assert.equal((await call("POST", `/api/orders/${orderId}/items/${itemA}`, "supA", { action: "deliver" })).statusCode, 400);
    assert.equal((await call("POST", `/api/orders/${orderId}/items/zzz`, "supA", { action: "accept" })).statusCode, 400);
  });
  test("harakat: huquq 403 (biznes accept, supplier cancel, admin)", async () => {
    assert.equal((await call("POST", `/api/orders/${orderId}/items/${itemA}`, "biz", { action: "accept" })).statusCode, 403);
    assert.equal((await call("POST", `/api/orders/${orderId}/items/${itemA}`, "supA", { action: "cancel", reason: "sababi bor" })).statusCode, 403);
    assert.equal((await call("POST", `/api/orders/${orderId}/items/${itemA}`, "adm", { action: "accept" })).statusCode, 403);
  });
  test("harakat: egalik 404 (boshqa supplier, begona biznes)", async () => {
    assert.equal((await call("POST", `/api/orders/${orderId}/items/${itemA}`, "supB", { action: "accept" })).statusCode, 404);
    assert.equal((await call("POST", `/api/orders/${orderId}/items/${itemB}`, "biz2", { action: "cancel", reason: "begona" })).statusCode, 404);
  });
  test("supplier qabul qiladi: 200, faqat o'z qismi ACTIVE; ikkinchi marta 409", async () => {
    const res = await call("POST", `/api/orders/${orderId}/items/${itemA}`, "supA", { action: "accept" });
    assert.equal(res.statusCode, 200); assert.deepEqual(json(res).data.items.map((i: any) => i.status), ["ACTIVE"]);
    assert.equal((await call("POST", `/api/orders/${orderId}/items/${itemA}`, "supA", { action: "accept" })).statusCode, 409);
  });
  test("biznes SENT qismini bekor qiladi; qabul qilinganini bekor qila olmaydi (409)", async () => {
    assert.equal((await call("POST", `/api/orders/${orderId}/items/${itemA}`, "biz", { action: "cancel", reason: "fikr o'zgardi" })).statusCode, 409);
    const res = await call("POST", `/api/orders/${orderId}/items/${itemB}`, "biz", { action: "cancel", reason: "fikr o'zgardi" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(json(res).data.items.map((i: any) => i.status), ["ACTIVE", "CANCELLED"]);
  });
  test("E: yetkazish sikli HTTP orqali; sirasiz 409; bir kunda ikkinchi marta 409; huquq 403", async () => {
    const url = `/api/orders/${orderId}/items/${itemA}`;
    assert.equal((await call("POST", url, "supA", { action: "depart" })).statusCode, 409); // tayyor emas
    assert.equal((await call("POST", url, "biz", { action: "prepare" })).statusCode, 403);
    for (const a of ["prepare", "ready", "depart"]) assert.equal((await call("POST", url, "supA", { action: a })).statusCode, 200, a);
    const done = await call("POST", url, "supA", { action: "deliver" });
    assert.equal(done.statusCode, 200); assert.equal(json(done).data.items[0].daysDelivered, 1);
    for (const a of ["prepare", "ready", "depart"]) assert.equal((await call("POST", url, "supA", { action: a })).statusCode, 200, a);
    assert.equal((await call("POST", url, "supA", { action: "deliver" })).statusCode, 409); // bugun allaqachon yetkazilgan
    assert.equal((await call("POST", url, "supA", { action: "pause" })).statusCode, 400); // sababsiz
  });
});
