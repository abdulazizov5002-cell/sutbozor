import assert from "node:assert/strict";
import { createPrismaRepositories } from "../src/repositories/prisma";
import { createNotificationService } from "../src/services/notification.service";
import type { AuthUser } from "../src/types/fastify";
import type { AppError } from "../src/utils/errors";
import { fakeNotificationRepo, note } from "./helpers/fakeNotificationRepo";

let pass = 0, fail = 0;
const t = async (name: string, fn: () => unknown | Promise<unknown>) => {
  try { await fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, (e as Error).message); }
};
const errOf = async (fn: () => Promise<unknown>) => {
  try { await fn(); return "ok"; } catch (e) { const a = e as AppError; return `${a.code ?? a.message}:${a.statusCode ?? ""}`; }
};
const u1: AuthUser = { id: "u1", name: "Ali", role: "supplier", status: "ACTIVE", supplierId: "sA", businessId: null };
const u2: AuthUser = { id: "u2", name: "Kafe", role: "business", status: "ACTIVE", businessId: "bC", supplierId: null };
const N1 = "00000000-0000-4000-8000-0000000000f1";
const N2 = "00000000-0000-4000-8000-0000000000f2";
const N3 = "00000000-0000-4000-8000-0000000000f3";
const world = () => fakeNotificationRepo([note(N1, "u1"), note(N2, "u1", { read: true }), note(N3, "u2")]);

(async () => {
  await t("o'qish: faqat o'ziniki; begona id 404", async () => {
    const svc = createNotificationService(world().repo);
    assert.equal((await svc.list(u1, { page: 1, limit: 20 })).total, 2);
    assert.equal((await svc.getById(u2, N3)).id, N3);
    assert.equal(await errOf(() => svc.getById(u1, N3)), "NOT_FOUND:404");
  });
  await t("markRead: o'zinikini o'qilgan qiladi; allaqachon o'qilgan bo'lsa ham 200; begona/yo'q 404, begonanikiga tegilmaydi", async () => {
    const w = world(); const svc = createNotificationService(w.repo);
    assert.equal((await svc.markRead(u1, N1)).read, true); assert.equal(w.items[0]!.read, true);
    assert.equal((await svc.markRead(u1, N2)).read, true);
    assert.equal(await errOf(() => svc.markRead(u1, N3)), "NOT_FOUND:404"); assert.equal(w.items[2]!.read, false);
    assert.equal(await errOf(() => svc.markRead(u1, "00000000-0000-4000-8000-00000000dead")), "NOT_FOUND:404");
  });
  await t("markAllRead: faqat o'zining o'qilmaganlari, soni qaytadi; boshqaning tegilmaydi", async () => {
    const w = world(); const svc = createNotificationService(w.repo);
    assert.deepEqual(await svc.markAllRead(u1), { updated: 1 }); assert.equal(w.items[2]!.read, false);
    assert.deepEqual(await svc.markAllRead(u1), { updated: 0 });
  });
  await t("faol bo'lmagan hisob 403", async () => {
    const svc = createNotificationService(world().repo); const blocked = { ...u1, status: "BLOCKED" } as AuthUser;
    assert.equal(await errOf(() => svc.markAllRead(blocked)), "FORBIDDEN:403");
    assert.equal(await errOf(() => svc.markRead(blocked, N1)), "FORBIDDEN:403");
  });
  await t("prisma: egalik WHERE ichida (userId), o'qilganlar qayta yozilmaydi", async () => {
    const seen: any[] = [];
    const prisma = { notification: { async updateMany(a: any) { seen.push(a); return { count: a.where.id ? 1 : 3 }; } } };
    const repo = createPrismaRepositories(prisma as never).notifications;
    assert.equal(await repo.markAllRead("u1"), 3); assert.equal(await repo.markRead("u1", N1), true);
    assert.deepEqual(seen[0], { where: { userId: "u1", read: false }, data: { read: true } });
    assert.deepEqual(seen[1], { where: { id: N1, userId: "u1" }, data: { read: true } });
  });
  console.log(`notifications: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
