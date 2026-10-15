/** GET /api/ready HTTP testlari (app.inject): baza tirik 200, o'lik/ulanmagan 503, /health bazaga bog'liq emas. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

Object.assign(process.env, {
  NODE_ENV: "test", LOG_LEVEL: "silent", CORS_ORIGIN: "http://localhost:5173", TRUST_PROXY: "false",
  RATE_LIMIT_MAX: "100", RATE_LIMIT_AUTH_MAX: "10", RATE_LIMIT_WRITE_MAX: "30", RATE_LIMIT_WINDOW_SEC: "60", BODY_LIMIT_BYTES: "1048576",
});
delete process.env.DATABASE_URL;

type AppModule = typeof import("../src/app");
type App = Awaited<ReturnType<AppModule["buildApp"]>>;
const { buildApp } = require("../src/app") as AppModule;
const json = (res: { body: string }) => JSON.parse(res.body) as any;

describe("GET /api/ready", () => {
  let up: App, down: App, none: App;
  before(async () => {
    up = await buildApp({ readinessCheck: async () => {} });
    down = await buildApp({ readinessCheck: async () => { throw new Error("db down postgresql://u:dummySECRETPASS@h/d"); } });
    none = await buildApp();
  });
  after(async () => { await up.close(); await down.close(); await none.close(); });

  test("baza tirik -> 200", async () => {
    const r = await up.inject({ method: "GET", url: "/api/ready" });
    assert.equal(r.statusCode, 200); assert.deepEqual(json(r), { status: "ok", service: "sutbozor-backend", database: "ok" });
    assert.equal(r.headers["cache-control"], "no-store");
  });
  test("baza o'lik -> 503, sir chiqmaydi; /health baribir 200", async () => {
    const r = await down.inject({ method: "GET", url: "/api/ready" });
    assert.equal(r.statusCode, 503); assert.equal(json(r).database, "down"); assert.ok(!r.body.includes("SECRETPASS"));
    assert.equal((await down.inject({ method: "GET", url: "/api/health" })).statusCode, 200);
  });
  test("baza ulanmagan -> 503 not_configured", async () => {
    const r = await none.inject({ method: "GET", url: "/api/ready" });
    assert.equal(r.statusCode, 503); assert.equal(json(r).database, "not_configured");
  });
  test("POST yo'q (404)", async () => {
    assert.equal((await up.inject({ method: "POST", url: "/api/ready", payload: {} })).statusCode, 404);
  });
});
