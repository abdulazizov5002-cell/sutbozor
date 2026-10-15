/**
 * /api/internal/overdue-sweep HTTP testlari (app.inject): sir bo'lmasa 501, noto'g'ri sir 401, to'g'ri sir 200, foydalanuvchi tokeni kerak emas.
 * Ishga tushirish: npm run test:maintenance-http (CI'da).
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
const { notImplementedRepositories } = require("../src/repositories/notImplemented") as typeof import("../src/repositories/notImplemented");
const SECRET = "k".repeat(40);
const URL = "/api/internal/overdue-sweep";

describe("/api/internal/overdue-sweep", () => {
  let app: App, noSecret: App;
  before(async () => {
    const payments = fakePaymentRepo([pay("p1", { status: "PENDING", dueDate: "2000-01-01" })]).repo;
    app = await buildApp({ repositories: { ...notImplementedRepositories(), payments }, cronSecret: SECRET });
    noSecret = await buildApp({ repositories: { ...notImplementedRepositories(), payments } });
  });
  after(async () => { await app.close(); await noSecret.close(); });

  test("CRON_SECRET sozlanmagan -> 501 (fail-closed)", async () => {
    assert.equal((await noSecret.inject({ method: "POST", url: URL, headers: { "x-cron-secret": SECRET } })).statusCode, 501);
  });
  test("sirsiz yoki noto'g'ri sir -> 401", async () => {
    assert.equal((await app.inject({ method: "POST", url: URL })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: URL, headers: { "x-cron-secret": "x".repeat(40) } })).statusCode, 401);
  });
  test("to'g'ri sir -> 200 va soni; ikkinchi chaqiruv 0", async () => {
    const r = await app.inject({ method: "POST", url: URL, headers: { "x-cron-secret": SECRET } });
    assert.equal(r.statusCode, 200); assert.deepEqual(JSON.parse(r.body), { success: true, data: { overdue: 1 } });
    assert.deepEqual(JSON.parse((await app.inject({ method: "POST", url: URL, headers: { "x-cron-secret": SECRET } })).body).data, { overdue: 0 });
  });
  test("GET ishlamaydi (faqat POST)", async () => {
    assert.ok([404, 405].includes((await app.inject({ method: "GET", url: URL, headers: { "x-cron-secret": SECRET } })).statusCode));
  });
});
