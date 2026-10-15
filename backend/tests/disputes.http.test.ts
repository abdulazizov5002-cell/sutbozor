/**
 * /api/disputes HTTP testlari: haqiqiy Fastify ilovasi (app.inject), soxta omborlar va soxta autentifikatsiya strategiyasi.
 * Tartib: 401 -> 400 -> 403 -> 404 -> 409. Ishga tushirish: npm run test:disputes-http (CI'da).
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { fakeDisputeRepo } from "./helpers/fakeDisputeRepo";
import { fakePaymentRepo, pay } from "./helpers/fakePaymentRepo";

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

const O1 = "00000000-0000-4000-8000-0000000000c1";
const P1 = "00000000-0000-4000-8000-0000000000a1";
const users: Record<string, TestUser> = {
  supA: { id: "uA", name: "Ali", role: "supplier", status: "ACTIVE", supplierId: "sA", businessId: null },
  supB: { id: "uB", name: "Vali", role: "supplier", status: "ACTIVE", supplierId: "sB", businessId: null },
  biz: { id: "uC", name: "Kafe", role: "business", status: "ACTIVE", businessId: "bC", supplierId: null },
  biz2: { id: "uE", name: "Non", role: "business", status: "ACTIVE", businessId: "bE", supplierId: null },
  adm: { id: "uD", name: "Admin", role: "admin", status: "ACTIVE", businessId: null, supplierId: null },
};
const json = (res: { body: string }) => JSON.parse(res.body) as any;
const good = { orderId: O1, paymentId: P1, reason: "PAYMENT", description: "Pul tushmadi" };

describe("/api/disputes (ochish, o'qish, admin hal qilishi)", () => {
  let app: App;
  const call = (method: "GET" | "POST", url: string, who?: string, payload?: unknown) =>
    app.inject({
      method, url, payload: payload as never,
      headers: { ...(who ? { "x-test-user": who } : {}), ...(payload !== undefined ? { "content-type": "application/json" } : {}) },
    });

  before(async () => {
    const order = {
      id: O1, publicId: "SB-1001", businessId: "bC", items: [{ id: "i1", orderId: O1, supplierId: "sA", status: "ACTIVE" }],
    };
    const orders = { async findById(id: string) { return id === O1 ? order : null; }, async list() { return { items: [], total: 0, page: 1, limit: 20 }; } };
    const payments = fakePaymentRepo([pay(P1, { orderId: O1 })]);
    setAuthStrategy({ authenticate: async (req) => users[String(req.headers["x-test-user"])] ?? null });
    app = await buildApp({
      repositories: { ...notImplementedRepositories(), disputes: fakeDisputeRepo().repo, orders: orders as never, payments: payments.repo },
    });
  });
  after(async () => { await app.close(); });

  test("tokensiz -> 401", async () => {
    assert.equal((await call("GET", "/api/disputes")).statusCode, 401);
    assert.equal((await call("POST", "/api/disputes", undefined, good)).statusCode, 401);
  });
  test("noto'g'ri body -> 400 (ortiqcha status, qisqa matn, noma'lum sabab, noto'g'ri uuid, admin holati)", async () => {
    for (const bad of [{ ...good, status: "RESOLVED" }, { ...good, description: "yo'q" }, { ...good, reason: "XYZ" }, { ...good, orderId: "zzz" }]) {
      const res = await call("POST", "/api/disputes", "biz", bad);
      assert.equal(res.statusCode, 400); assert.equal(json(res).error.code, "VALIDATION_ERROR");
    }
    assert.equal((await call("POST", "/api/disputes/zzz", "adm", { status: "UNDER_REVIEW" })).statusCode, 400);
    assert.equal((await call("POST", `/api/disputes/${P1}`, "adm", { status: "RESOLVED" })).statusCode, 400);
  });
  test("huquq 403: admin ocha olmaydi; biznes/supplier holat o'zgartira olmaydi", async () => {
    assert.equal((await call("POST", "/api/disputes", "adm", good)).statusCode, 403);
    assert.equal((await call("POST", `/api/disputes/${P1}`, "biz", { status: "UNDER_REVIEW" })).statusCode, 403);
    assert.equal((await call("POST", `/api/disputes/${P1}`, "supA", { status: "UNDER_REVIEW" })).statusCode, 403);
  });
  test("egalik 404: begona biznes/supplier ocha olmaydi", async () => {
    assert.equal((await call("POST", "/api/disputes", "biz2", good)).statusCode, 404);
    assert.equal((await call("POST", "/api/disputes", "supB", good)).statusCode, 404);
  });
  test("to'liq yo'l: biznes ochadi 201; takror 409; ro'yxat egalik bo'yicha; admin ko'rib chiqadi -> hal qiladi -> yopadi; noto'g'ri o'tish 409", async () => {
    const created = await call("POST", "/api/disputes", "biz", good);
    assert.equal(created.statusCode, 201);
    const d = json(created).data; assert.equal(d.status, "OPEN"); assert.equal(d.supplierId, "sA"); assert.equal(d.openedBy, "business"); assert.match(d.publicId, /^DS-/);
    assert.equal((await call("POST", "/api/disputes", "supA", good)).statusCode, 409);

    assert.equal(json(await call("GET", "/api/disputes", "supA")).data.total, 1);
    assert.equal(json(await call("GET", "/api/disputes", "supB")).data.total, 0);
    assert.equal(json(await call("GET", "/api/disputes", "adm")).data.total, 1);
    assert.equal((await call("GET", `/api/disputes/${d.id}`, "biz2")).statusCode, 404);

    const url = `/api/disputes/${d.id}`;
    assert.equal((await call("POST", url, "adm", { status: "CLOSED" })).statusCode, 409);
    assert.equal(json(await call("POST", url, "adm", { status: "UNDER_REVIEW" })).data.status, "UNDER_REVIEW");
    const done = await call("POST", url, "adm", { status: "RESOLVED", resolution: "Pul qaytariladi" });
    assert.equal(done.statusCode, 200); assert.equal(json(done).data.resolution, "Pul qaytariladi"); assert.equal(json(done).data.resolvedBy, "uD");
    assert.equal((await call("POST", url, "adm", { status: "UNDER_REVIEW" })).statusCode, 409);
    assert.equal(json(await call("POST", url, "adm", { status: "CLOSED" })).data.status, "CLOSED");
  });
});
