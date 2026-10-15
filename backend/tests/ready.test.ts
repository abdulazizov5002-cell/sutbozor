/** /api/ready mantig'i: baza tirikmi (ok / xato / sekin / ulanmagan), xato matni javobga chiqmaydi. */
import assert from "node:assert/strict";
import { checkReadiness } from "../src/services/health.service";

let pass = 0, fail = 0;
const t = async (name: string, fn: () => unknown | Promise<unknown>) => {
  try { await fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, (e as Error).message); }
};

(async () => {
  await t("baza javob beradi -> 200 ok", async () => {
    assert.deepEqual(await checkReadiness(async () => {}), { statusCode: 200, body: { status: "ok", service: "sutbozor-backend", database: "ok" } });
  });
  await t("baza ulanmagan (ping yo'q) -> 503 not_configured", async () => {
    assert.deepEqual(await checkReadiness(undefined), { statusCode: 503, body: { status: "unavailable", service: "sutbozor-backend", database: "not_configured" } });
  });
  await t("ping xato bersa -> 503 down, xato matni (ulanish ma'lumoti) chiqmaydi", async () => {
    const r = await checkReadiness(async () => { throw new Error("connect ECONNREFUSED postgresql://user:SECRETPASS@host/db"); });
    assert.equal(r.statusCode, 503); assert.equal(r.body.database, "down"); assert.ok(!JSON.stringify(r).includes("SECRETPASS"));
  });
  await t("baza sekin (timeout) -> 503 down tez qaytadi", async () => {
    const t0 = Date.now(); const r = await checkReadiness(() => new Promise<void>(() => {}), 50);
    assert.equal(r.statusCode, 503); assert.equal(r.body.database, "down"); assert.ok(Date.now() - t0 < 1000);
  });
  console.log(`ready: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
