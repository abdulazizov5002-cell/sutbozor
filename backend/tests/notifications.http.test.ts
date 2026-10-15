/**
 * /api/notifications HTTP testlari: haqiqiy Fastify ilovasi (app.inject), soxta ombor va soxta autentifikatsiya strategiyasi.
 * Ishga tushirish: npm run test:notifications-http (CI'da).
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { fakeNotificationRepo, note } from "./helpers/fakeNotificationRepo";

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

const N1 = "00000000-0000-4000-8000-0000000000f1";
const N3 = "00000000-0000-4000-8000-0000000000f3";
const users: Record<string, TestUser> = {
  one: { id: "u1", name: "Ali", role: "supplier", status: "ACTIVE", supplierId: "sA", businessId: null },
  two: { id: "u2", name: "Kafe", role: "business", status: "ACTIVE", businessId: "bC", supplierId: null },
};
const json = (res: { body: string }) => JSON.parse(res.body) as any;

describe("/api/notifications", () => {
  let app: App;
  const call = (method: "GET" | "POST", url: string, who?: string, payload?: unknown) =>
    app.inject({
      method, url, payload: payload as never,
      headers: { ...(who ? { "x-test-user": who } : {}), ...(payload !== undefined ? { "content-type": "application/json" } : {}) },
    });
  before(async () => {
    const w = fakeNotificationRepo([note(N1, "u1"), note("00000000-0000-4000-8000-0000000000f2", "u1"), note(N3, "u2")]);
    setAuthStrategy({ authenticate: async (req) => users[String(req.headers["x-test-user"])] ?? null });
    app = await buildApp({ repositories: { ...notImplementedRepositories(), notifications: w.repo } });
  });
  after(async () => { await app.close(); });

  test("tokensiz -> 401", async () => {
    assert.equal((await call("GET", "/api/notifications")).statusCode, 401);
    assert.equal((await call("POST", "/api/notifications/read-all", undefined, {})).statusCode, 401);
    assert.equal((await call("POST", `/api/notifications/${N1}/read`, undefined, {})).statusCode, 401);
  });
  test("ro'yxat faqat o'ziniki; noto'g'ri body -> 400; begona id 404", async () => {
    assert.equal(json(await call("GET", "/api/notifications", "one")).data.total, 2);
    assert.equal((await call("POST", "/api/notifications/read-all", "one", { all: true })).statusCode, 400);
    assert.equal((await call("POST", "/api/notifications/zzz/read", "one", {})).statusCode, 400);
    assert.equal((await call("POST", `/api/notifications/${N3}/read`, "one", {})).statusCode, 404);
  });
  test("o'qilgan qilish: bittasi, keyin hammasi", async () => {
    const r = await call("POST", `/api/notifications/${N1}/read`, "one", {});
    assert.equal(r.statusCode, 200); assert.equal(json(r).data.read, true);
    const all = await call("POST", "/api/notifications/read-all", "one", {});
    assert.equal(all.statusCode, 200); assert.equal(json(all).data.updated, 1);
    assert.equal(json(await call("GET", `/api/notifications/${N3}`, "two")).data.read, false);
  });
});
