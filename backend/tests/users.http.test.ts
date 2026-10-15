/**
 * /api/users HTTP testlari: haqiqiy Fastify ilovasi (app.inject), soxta ombor va soxta autentifikatsiya strategiyasi.
 * Tartib: 401 -> 400 -> 403 -> 404 -> 409. Ishga tushirish: npm run test:users-http (CI'da).
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { fakeUserRepo, usr } from "./helpers/fakeUserRepo";

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

const U1 = "00000000-0000-4000-8000-0000000000e1";
const ADM2 = "00000000-0000-4000-8000-0000000000e3";
const users: Record<string, TestUser> = {
  sup: { id: "uA", name: "Ali", role: "supplier", status: "ACTIVE", supplierId: "sA", businessId: null },
  biz: { id: "uC", name: "Kafe", role: "business", status: "ACTIVE", businessId: "bC", supplierId: null },
  adm: { id: "uD", name: "Admin", role: "admin", status: "ACTIVE", businessId: null, supplierId: null },
};
const json = (res: { body: string }) => JSON.parse(res.body) as any;

describe("/api/users (o'qish va bloklash/faollashtirish)", () => {
  let app: App;
  const call = (method: "GET" | "POST", url: string, who?: string, payload?: unknown) =>
    app.inject({
      method, url, payload: payload as never,
      headers: { ...(who ? { "x-test-user": who } : {}), ...(payload !== undefined ? { "content-type": "application/json" } : {}) },
    });

  before(async () => {
    const w = fakeUserRepo([usr(U1), usr(ADM2, { role: "admin", businessId: null }), usr("uD", { role: "admin", businessId: null })]);
    setAuthStrategy({ authenticate: async (req) => users[String(req.headers["x-test-user"])] ?? null });
    app = await buildApp({ repositories: { ...notImplementedRepositories(), users: w.repo } });
  });
  after(async () => { await app.close(); });

  test("tokensiz -> 401; admin bo'lmaganlar o'qiy olmaydi (403)", async () => {
    assert.equal((await call("GET", "/api/users")).statusCode, 401);
    assert.equal((await call("POST", `/api/users/${U1}`, undefined, { status: "ACTIVE" })).statusCode, 401);
    assert.equal((await call("GET", "/api/users", "biz")).statusCode, 403);
  });
  test("noto'g'ri body -> 400 (sababsiz bloklash, PENDING, ortiqcha role, noto'g'ri uuid)", async () => {
    for (const bad of [{ status: "BLOCKED" }, { status: "PENDING" }, { status: "ACTIVE", role: "admin" }]) {
      const res = await call("POST", `/api/users/${U1}`, "adm", bad);
      assert.equal(res.statusCode, 400); assert.equal(json(res).error.code, "VALIDATION_ERROR");
    }
    assert.equal((await call("POST", "/api/users/zzz", "adm", { status: "ACTIVE" })).statusCode, 400);
  });
  test("huquq 403: biznes va supplier holat o'zgartira olmaydi", async () => {
    assert.equal((await call("POST", `/api/users/${U1}`, "biz", { status: "BLOCKED", reason: "Sabab bor" })).statusCode, 403);
    assert.equal((await call("POST", `/api/users/${U1}`, "sup", { status: "BLOCKED", reason: "Sabab bor" })).statusCode, 403);
  });
  test("404 yo'q foydalanuvchi; 409 o'zini va adminni bloklash", async () => {
    assert.equal((await call("POST", "/api/users/00000000-0000-4000-8000-00000000dead", "adm", { status: "ACTIVE" })).statusCode, 404);
    assert.equal((await call("POST", `/api/users/${ADM2}`, "adm", { status: "BLOCKED", reason: "Sabab bor" })).statusCode, 409);
  });
  test("to'liq yo'l: bloklash 200; qayta bloklash 409; faollashtirish 200; ro'yxatda holat ko'rinadi", async () => {
    const url = `/api/users/${U1}`;
    const b = await call("POST", url, "adm", { status: "BLOCKED", reason: "Soxta buyurtmalar" });
    assert.equal(b.statusCode, 200); assert.equal(json(b).data.status, "BLOCKED");
    assert.equal((await call("POST", url, "adm", { status: "BLOCKED", reason: "Yana bir bor" })).statusCode, 409);
    assert.equal(json(await call("GET", "/api/users", "adm")).data.items.find((x: any) => x.id === U1).status, "BLOCKED");
    const a = await call("POST", url, "adm", { status: "ACTIVE" });
    assert.equal(a.statusCode, 200); assert.equal(json(a).data.status, "ACTIVE");
  });
});
