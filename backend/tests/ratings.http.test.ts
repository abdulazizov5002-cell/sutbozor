/**
 * /api/ratings HTTP testlari: haqiqiy Fastify ilovasi (app.inject), soxta omborlar. Tartib: 401 -> 400 -> 403 -> 404 -> 409.
 * Ishga tushirish: npm run test:ratings-http (CI'da).
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { fakeRatingRepo } from "./helpers/fakeRatingRepo";

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
const I1 = "00000000-0000-4000-8000-0000000000d1";
const I2 = "00000000-0000-4000-8000-0000000000d2";
const users: Record<string, TestUser> = {
  supA: { id: "uA", name: "Ali", role: "supplier", status: "ACTIVE", supplierId: "sA", businessId: null },
  supB: { id: "uB", name: "Vali", role: "supplier", status: "ACTIVE", supplierId: "sB", businessId: null },
  biz: { id: "uC", name: "Kafe", role: "business", status: "ACTIVE", businessId: "bC", supplierId: null },
  biz2: { id: "uE", name: "Non", role: "business", status: "ACTIVE", businessId: "bE", supplierId: null },
  adm: { id: "uD", name: "Admin", role: "admin", status: "ACTIVE", businessId: null, supplierId: null },
};
const json = (res: { body: string }) => JSON.parse(res.body) as any;

describe("/api/ratings (baholash)", () => {
  let app: App;
  const post = (who: string | undefined, payload: unknown) =>
    app.inject({ method: "POST", url: "/api/ratings", payload: payload as never, headers: { ...(who ? { "x-test-user": who } : {}), "content-type": "application/json" } });

  before(async () => {
    const order = {
      id: O1, publicId: "SB-1001", businessId: "bC",
      items: [{ id: I1, orderId: O1, supplierId: "sA", status: "COMPLETED" }, { id: I2, orderId: O1, supplierId: "sA", status: "ACTIVE" }],
    };
    const orders = { async findById(id: string) { return id === O1 ? order : null; } };
    setAuthStrategy({ authenticate: async (req) => users[String(req.headers["x-test-user"])] ?? null });
    app = await buildApp({ repositories: { ...notImplementedRepositories(), ratings: fakeRatingRepo().repo, orders: orders as never } });
  });
  after(async () => { await app.close(); });

  test("tokensiz -> 401", async () => { assert.equal((await post(undefined, { orderId: O1, itemId: I1, score: 5 })).statusCode, 401); });
  test("noto'g'ri body -> 400 (ball, ortiqcha side/ratee, uuid)", async () => {
    for (const body of [
      { orderId: O1, itemId: I1, score: 0 }, { orderId: O1, itemId: I1, score: 6 }, { orderId: O1, itemId: I1, score: 3.5 },
      { orderId: O1, itemId: I1, score: 5, side: "TO_BUSINESS" }, { orderId: O1, itemId: I1, score: 5, rateeId: "x" },
      { orderId: "x", itemId: I1, score: 5 }, { orderId: O1, score: 5 },
    ]) assert.equal((await post("biz", body)).statusCode, 400, JSON.stringify(body));
  });
  test("admin -> 403; begona biznes/supplier -> 404", async () => {
    const b = { orderId: O1, itemId: I1, score: 5 };
    assert.equal((await post("adm", b)).statusCode, 403);
    assert.equal((await post("biz2", b)).statusCode, 404);
    assert.equal((await post("supB", b)).statusCode, 404);
  });
  test("yakunlanmagan qism -> 409", async () => { assert.equal((await post("biz", { orderId: O1, itemId: I2, score: 5 })).statusCode, 409); });
  test("biznes baholaydi -> 201, takror -> 409, supplier ham baholaydi -> 201", async () => {
    const r = await post("biz", { orderId: O1, itemId: I1, score: 4, comment: "Yaxshi" });
    assert.equal(r.statusCode, 201); assert.deepEqual([json(r).data.side, json(r).data.score], ["TO_SUPPLIER", 4]);
    assert.equal((await post("biz", { orderId: O1, itemId: I1, score: 1 })).statusCode, 409);
    const s = await post("supA", { orderId: O1, itemId: I1, score: 5 });
    assert.equal(s.statusCode, 201); assert.equal(json(s).data.side, "TO_BUSINESS");
  });
});
