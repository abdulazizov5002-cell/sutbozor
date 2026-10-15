/**
 * /api/payments HTTP testlari: haqiqiy Fastify ilovasi (app.inject), soxta ombor va soxta autentifikatsiya strategiyasi.
 * Tartib: 401 -> 400 -> 403 -> 404 -> 409. Ishga tushirish: npm run test:payments-http (CI'da).
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
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

const P1 = "00000000-0000-4000-8000-0000000000a1";
const P2 = "00000000-0000-4000-8000-0000000000a2";
const users: Record<string, TestUser> = {
  supA: { id: "uA", name: "Ali", role: "supplier", status: "ACTIVE", supplierId: "sA", businessId: null },
  supB: { id: "uB", name: "Vali", role: "supplier", status: "ACTIVE", supplierId: "sB", businessId: null },
  biz: { id: "uC", name: "Kafe", role: "business", status: "ACTIVE", businessId: "bC", supplierId: null },
  biz2: { id: "uE", name: "Non", role: "business", status: "ACTIVE", businessId: "bE", supplierId: null },
  adm: { id: "uD", name: "Admin", role: "admin", status: "ACTIVE", businessId: null, supplierId: null },
};
const json = (res: { body: string }) => JSON.parse(res.body) as any;
const good = { action: "submit", method: "Naqd", transactionId: "TX-777", paidOn: "2026-10-14" };

describe("/api/payments (o'qish va harakatlar)", () => {
  let app: App;
  const call = (method: "GET" | "POST", url: string, who?: string, payload?: unknown) =>
    app.inject({
      method, url, payload: payload as never,
      headers: { ...(who ? { "x-test-user": who } : {}), ...(payload !== undefined ? { "content-type": "application/json" } : {}) },
    });

  before(async () => {
    const w = fakePaymentRepo([pay(P1), pay(P2, { dueDate: "2000-01-01" })]);
    setAuthStrategy({ authenticate: async (req) => users[String(req.headers["x-test-user"])] ?? null });
    app = await buildApp({ repositories: { ...notImplementedRepositories(), payments: w.repo } });
  });
  after(async () => { await app.close(); });

  test("tokensiz -> 401", async () => {
    assert.equal((await call("GET", "/api/payments")).statusCode, 401);
    assert.equal((await call("POST", `/api/payments/${P1}`, undefined, good)).statusCode, 401);
  });
  test("o'qish: egalik bo'yicha; muddati o'tgan OVERDUE; begona 404", async () => {
    const l = json(await call("GET", "/api/payments", "biz"));
    assert.equal(l.data.total, 2); assert.ok(l.data.items.some((x: any) => x.status === "OVERDUE"));
    assert.equal(json(await call("GET", "/api/payments", "biz2")).data.total, 0);
    assert.equal((await call("GET", `/api/payments/${P1}`, "supB")).statusCode, 404);
    assert.equal((await call("GET", `/api/payments/${P1}`, "supA")).statusCode, 200);
  });
  test("noto'g'ri body -> 400 (summa yuborish, noto'g'ri usul, sababsiz reject, noma'lum harakat, noto'g'ri uuid)", async () => {
    for (const bad of [{ ...good, amount: 1 }, { ...good, method: "Click" }, { action: "reject" }, { action: "refund" }, { ...good, paidOn: "2999-01-01" }]) {
      const res = await call("POST", `/api/payments/${P1}`, "biz", bad);
      assert.equal(res.statusCode, 400); assert.equal(json(res).error.code, "VALIDATION_ERROR");
    }
    assert.equal((await call("POST", "/api/payments/zzz", "biz", good)).statusCode, 400);
  });
  test("huquq 403: supplier submit, biznes confirm, admin", async () => {
    assert.equal((await call("POST", `/api/payments/${P1}`, "supA", good)).statusCode, 403);
    assert.equal((await call("POST", `/api/payments/${P1}`, "biz", { action: "confirm" })).statusCode, 403);
    assert.equal((await call("POST", `/api/payments/${P1}`, "adm", good)).statusCode, 403);
  });
  test("egalik 404: begona biznes/supplier", async () => {
    assert.equal((await call("POST", `/api/payments/${P1}`, "biz2", good)).statusCode, 404);
    assert.equal((await call("POST", `/api/payments/${P1}`, "supB", { action: "confirm" })).statusCode, 404);
  });
  test("to'liq yo'l: confirm oldin 409; submit 200; ikkinchi submit 409; reject -> DISPUTED; qayta submit; confirm -> PAID", async () => {
    const url = `/api/payments/${P1}`;
    assert.equal((await call("POST", url, "supA", { action: "confirm" })).statusCode, 409);
    const sub = await call("POST", url, "biz", good);
    assert.equal(sub.statusCode, 200); assert.equal(json(sub).data.status, "PAYMENT_SUBMITTED"); assert.equal(json(sub).data.amount, 180000);
    assert.equal((await call("POST", url, "biz", { ...good, transactionId: "TX-778" })).statusCode, 409);
    const rej = await call("POST", url, "supA", { action: "reject", reason: "Pul kelmadi" });
    assert.equal(rej.statusCode, 200); assert.equal(json(rej).data.status, "DISPUTED");
    assert.equal((await call("POST", url, "biz", { ...good, transactionId: "TX-779" })).statusCode, 200);
    const paid = await call("POST", url, "supA", { action: "confirm" });
    assert.equal(paid.statusCode, 200); assert.equal(json(paid).data.status, "PAID");
    assert.equal((await call("POST", url, "supA", { action: "confirm" })).statusCode, 409);
  });
});
