import assert from "node:assert/strict";
import { createPrismaRepositories } from "../src/repositories/prisma";
import { updateUserStatusBody } from "../src/schemas/user.schemas";
import { createUserService } from "../src/services/user.service";
import type { AuthUser } from "../src/types/fastify";
import type { AppError } from "../src/utils/errors";
import { fakeUserRepo, usr } from "./helpers/fakeUserRepo";

let pass = 0, fail = 0;
const t = async (name: string, fn: () => unknown | Promise<unknown>) => {
  try { await fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, (e as Error).message); }
};
const errOf = async (fn: () => Promise<unknown>) => {
  try { await fn(); return "ok"; } catch (e) { const a = e as AppError; return `${a.code ?? a.message}:${a.statusCode ?? ""}`; }
};

const adm: AuthUser = { id: "uD", name: "Admin", role: "admin", status: "ACTIVE", businessId: null, supplierId: null };
const biz: AuthUser = { id: "uC", name: "Kafe", role: "business", status: "ACTIVE", businessId: "bC", supplierId: null };
const sup: AuthUser = { id: "uA", name: "Ali", role: "supplier", status: "ACTIVE", supplierId: "sA", businessId: null };
const U1 = "00000000-0000-4000-8000-0000000000e1";
const U2 = "00000000-0000-4000-8000-0000000000e2";
const ADM2 = "00000000-0000-4000-8000-0000000000e3";
const world = () => fakeUserRepo([usr(U1), usr(U2, { status: "BLOCKED" }), usr(ADM2, { role: "admin", businessId: null }), usr("uD", { role: "admin", businessId: null })]);
const block = (reason = "Soxta buyurtmalar") => updateUserStatusBody.parse({ status: "BLOCKED", reason });
const activate = () => updateUserStatusBody.parse({ status: "ACTIVE" });

(async () => {
  await t("sxema: bloklashda sabab majburiy; faollashtirishda emas; ortiqcha maydon (role) rad etiladi", () => {
    assert.ok(!updateUserStatusBody.safeParse({ status: "BLOCKED" }).success);
    assert.ok(!updateUserStatusBody.safeParse({ status: "BLOCKED", reason: "x" }).success);
    assert.ok(updateUserStatusBody.safeParse({ status: "BLOCKED", reason: "Sabab bor" }).success);
    assert.ok(updateUserStatusBody.safeParse({ status: "ACTIVE" }).success);
    assert.ok(!updateUserStatusBody.safeParse({ status: "PENDING" }).success);
    assert.ok(!updateUserStatusBody.safeParse({ status: "ACTIVE", role: "admin" }).success);
  });
  await t("admin bloklaydi, keyin faollashtiradi; audit yoziladi (sabab bilan)", async () => {
    const w = world(); const svc = createUserService(w.repo);
    assert.equal((await svc.setStatus(adm, U1, block())).status, "BLOCKED");
    assert.equal(w.audits[0]!.action, "user.blocked"); assert.match(w.audits[0]!.description, /Soxta buyurtmalar/); assert.equal(w.audits[0]!.objectId, U1);
    assert.equal((await svc.setStatus(adm, U1, activate())).status, "ACTIVE"); assert.equal(w.audits[1]!.action, "user.activated");
    assert.equal((await svc.setStatus(adm, U2, activate())).status, "ACTIVE");
  });
  await t("himoya: o'zini va boshqa adminni o'zgartirib bo'lmaydi (409), repo chaqirilmaydi", async () => {
    const w = world(); const svc = createUserService(w.repo);
    assert.equal(await errOf(() => svc.setStatus(adm, "uD", block())), "CONFLICT:409");
    assert.equal(await errOf(() => svc.setStatus(adm, ADM2, block())), "CONFLICT:409");
    assert.equal(w.transitions.length, 0);
  });
  await t("holat: bloklangan foydalanuvchini yana bloklash 409; faolni faollashtirish 409", async () => {
    const w = world(); const svc = createUserService(w.repo);
    assert.equal(await errOf(() => svc.setStatus(adm, U2, block())), "CONFLICT:409");
    assert.equal(await errOf(() => svc.setStatus(adm, U1, activate())), "CONFLICT:409");
    assert.equal(w.transitions.length, 0);
  });
  await t("huquq va mavjudlik: admin bo'lmaganlar 403, faol bo'lmagan admin 403, yo'q foydalanuvchi 404, poyga 409", async () => {
    const w = world(); const svc = createUserService(w.repo);
    for (const u of [biz, sup]) assert.equal(await errOf(() => svc.setStatus(u, U1, block())), "FORBIDDEN:403");
    assert.equal(await errOf(() => svc.setStatus({ ...adm, status: "BLOCKED" } as AuthUser, U1, block())), "FORBIDDEN:403");
    assert.equal(await errOf(() => svc.setStatus(adm, "00000000-0000-4000-8000-00000000dead", block())), "NOT_FOUND:404");
    const racy = createUserService({ ...w.repo, transitionStatus: async () => null });
    assert.equal(await errOf(() => racy.setStatus(adm, U1, block())), "CONFLICT:409");
  });
  await t("o'qish: faqat admin ro'yxatni ko'radi", async () => {
    const svc = createUserService(world().repo);
    assert.equal((await svc.list(adm, { page: 1, limit: 20 })).total, 4);
    assert.equal(await errOf(() => svc.list(biz, { page: 1, limit: 20 })), "FORBIDDEN:403");
  });

  // ---------- Prisma qatlami ----------
  const row = (over: Record<string, unknown> = {}) => ({ id: U1, name: "Ali", phone: "+998901234567", email: null, role: "supplier", status: "BLOCKED", businessId: null, supplierId: "sA", createdAt: new Date(0), lastLoginAt: null, ...over });
  const fakePrisma = (changed = 1) => {
    const seen: Record<string, any> = {}; const ops: string[] = [];
    const tx = {
      user: {
        async updateMany(a: any) { ops.push("user.updateMany"); seen.update = a; return { count: changed }; },
        async findUnique() { ops.push("user.findUnique"); return row(); },
      },
      auditLog: { async create(a: any) { ops.push("audit.create"); seen.audit = a; return {}; } },
    };
    const prisma = { async $transaction(fn: (t: unknown) => Promise<unknown>) { return fn(tx); } };
    return { repo: createPrismaRepositories(prisma as never).users, seen, ops };
  };
  const hooks = { audit: (u: { id: string }) => ({ actorId: "uD", actorName: "A", actorRole: "admin" as const, action: "user.blocked", objectType: "user", objectId: u.id, description: "d" }) };
  await t("prisma: holat sharti + admin istisno WHERE ichida, audit; count 0 -> null", async () => {
    const f = fakePrisma(); const u = await f.repo.transitionStatus({ id: U1, from: ["ACTIVE", "PENDING"], to: "BLOCKED", excludeRole: "admin" }, hooks);
    assert.equal(u!.status, "BLOCKED");
    assert.deepEqual(f.seen.update, { where: { id: U1, status: { in: ["ACTIVE", "PENDING"] }, role: { not: "admin" } }, data: { status: "BLOCKED" } });
    assert.deepEqual(f.ops, ["user.updateMany", "user.findUnique", "audit.create"]);
    const none = fakePrisma(0); assert.equal(await none.repo.transitionStatus({ id: U1, from: ["ACTIVE"], to: "BLOCKED", excludeRole: "admin" }, hooks), null); assert.deepEqual(none.ops, ["user.updateMany"]);
  });

  console.log(`users: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
