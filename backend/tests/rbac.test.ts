import assert from "node:assert/strict";
import { requireAuth, requireRole, requirePermission, setAuthStrategy } from "../src/middleware/auth";
import type { AuthUser } from "../src/types/fastify";
import type { AppError } from "../src/utils/errors";

let pass = 0, fail = 0;
const t = async (n: string, f: () => unknown) => { try { await f(); pass++; } catch (e) { fail++; console.log("FAIL", n, (e as Error).message); } };
const outcome = async (mw: (r: any) => Promise<void>, req: any) => { try { await mw(req); return "ok"; } catch (e) { return (e as AppError).statusCode + ":" + (e as AppError).code; } };
const user = (role: AuthUser["role"], status: AuthUser["status"] = "ACTIVE"): AuthUser => ({ id: "u1", role, status });
let calls = 0;
const as = (u: AuthUser | null) => setAuthStrategy({ authenticate: async () => { calls++; return u; } });

(async () => {
  // strategiya ulanmagan: fail-closed
  await t("no strategy -> 501 for all", async () => {
    for (const mw of [requireAuth(), requireRole("ADMIN"), requireRole("BUSINESS"), requireRole("SUPPLIER")]) {
      assert.equal((await outcome(mw, {})).split(":")[0], "501");
    }
  });
  await t("unauthenticated -> 401", async () => { as(null); assert.equal((await outcome(requireRole("ADMIN"), {})).split(":")[0], "401"); assert.equal((await outcome(requireAuth(), {})).split(":")[0], "401"); });
  await t("blocked/pending user -> 403 even with right role", async () => {
    for (const st of ["BLOCKED", "PENDING"] as const) { as(user("admin", st)); assert.equal((await outcome(requireRole("ADMIN"), {})).split(":")[0], "403"); }
  });
  const roles = [["ADMIN", "admin"], ["BUSINESS", "business"], ["SUPPLIER", "supplier"]] as const;
  for (const [name] of roles) for (const [, actual] of roles) {
    await t(`requireRole(${name}) with ${actual}`, async () => {
      as(user(actual)); const want = ROLE_OK(name, actual);
      assert.equal(await outcome(requireRole(name), {}), want ? "ok" : "403:FORBIDDEN");
    });
  }
  function ROLE_OK(n: string, a: string) { return n.toLowerCase() === a; }
  await t("multiple roles", async () => {
    const mw = requireRole("BUSINESS", "SUPPLIER");
    as(user("business")); assert.equal(await outcome(mw, {}), "ok");
    as(user("supplier")); assert.equal(await outcome(mw, {}), "ok");
    as(user("admin")); assert.equal(await outcome(mw, {}), "403:FORBIDDEN");
  });
  await t("client-claimed role ignored", async () => {
    as(user("business"));
    const req = { headers: { "x-role": "admin" }, body: { role: "admin" }, query: { role: "ADMIN" }, user: undefined };
    assert.equal(await outcome(requireRole("ADMIN"), req), "403:FORBIDDEN");
  });
  await t("misconfiguration throws at setup", () => {
    assert.throws(() => requireRole());
    assert.throws(() => requireRole("ROOT" as any));
    assert.throws(() => requireRole("admin" as any));
    assert.throws(() => requireRole("__proto__" as any));
    assert.throws(() => requireRole("toString" as any));
  });
  await t("strategy called once with requireAuth + requireRole", async () => {
    as(user("admin")); calls = 0; const req: any = {};
    await requireAuth()(req); await requireRole("ADMIN")(req); await requirePermission("audit.view" as any)(req).catch(() => {});
    assert.equal(calls, 1);
  });
  await t("request.user set only after checks", async () => {
    as(user("admin", "BLOCKED")); const req: any = {}; await outcome(requireAuth(), req); assert.equal(req.user, undefined);
  });
  await t("strategy errors propagate (not 401)", async () => {
    setAuthStrategy({ authenticate: async () => { throw new Error("db down"); } });
    await assert.rejects(requireRole("ADMIN")({} as any), /db down/);
  });
  console.log(`rbac: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
