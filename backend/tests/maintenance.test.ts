/** Rejalashtirilgan ishlar: cron sirri (fail-closed, 401), muddati o'tgan to'lovlarni belgilash, Prisma qatlami (bildirishnoma+audit, takror yo'q). */
import assert from "node:assert/strict";
import { maintenanceController } from "../src/controllers/maintenance.controller";
import { createMaintenanceService } from "../src/services/maintenance.service";
import { createPrismaRepositories } from "../src/repositories/prisma";
import { fakePaymentRepo, pay } from "./helpers/fakePaymentRepo";

let pass = 0, fail = 0;
const t = async (name: string, fn: () => unknown | Promise<unknown>) => {
  try { await fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, (e as Error).message); }
};
const code = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (e) { const x = e as { code?: string; statusCode?: number }; return `${x.code}:${x.statusCode}`; } };
const SECRET = "s".repeat(40);
const req = (h?: unknown) => ({ headers: h === undefined ? {} : { "x-cron-secret": h } }) as never;

(async () => {
  const w = fakePaymentRepo([pay("p1", { status: "PENDING", dueDate: "2000-01-01" }), pay("p2", { status: "PENDING", dueDate: "2999-01-01" })]);
  const svc = createMaintenanceService({ payments: w.repo });
  await t("servis: muddati o'tganni sanaydi, kelajakdagi tegmaydi", async () => {
    assert.deepEqual(await svc.sweepOverduePayments(), { overdue: 1 });
    assert.deepEqual(await svc.sweepOverduePayments(), { overdue: 0 });
  });
  await t("sir yo'q -> 501; noto'g'ri/yo'q/massiv sarlavha -> 401; to'g'ri -> ok", async () => {
    assert.equal(await code(maintenanceController(svc, undefined).overdueSweep(req(SECRET))), "NOT_IMPLEMENTED:501");
    const c = maintenanceController(svc, SECRET);
    assert.equal(await code(c.overdueSweep(req())), "UNAUTHENTICATED:401");
    assert.equal(await code(c.overdueSweep(req("x".repeat(40)))), "UNAUTHENTICATED:401");
    assert.equal(await code(c.overdueSweep(req([SECRET]))), "UNAUTHENTICATED:401");
    assert.deepEqual(await c.overdueSweep(req(SECRET)), { success: true, data: { overdue: 0 } });
  });

  // ---------- Prisma qatlami ----------
  const mkDb = (rows: any[], o: { raceLose?: boolean; failAudit?: boolean } = {}) => {
    const log = { updates: [] as unknown[], audits: [] as any[], notes: [] as any[], users: [] as unknown[] };
    const tx = {
      payment: {
        async findMany() { return rows.filter((r) => r.status === "PENDING"); },
        async updateMany(a: any) {
          log.updates.push(a.where.id);
          if (o.raceLose) return { count: 0 };
          const r = rows.find((x) => x.id === a.where.id && x.status === a.where.status); if (!r) return { count: 0 };
          r.status = "OVERDUE"; return { count: 1 };
        },
      },
      auditLog: { async create(a: any) { if (o.failAudit) throw new Error("audit down"); log.audits.push(a.data); return {}; } },
      user: { async findMany(a: any) { log.users.push(a.where); return [{ id: "u1" }]; } },
      notification: { async createMany(a: any) { log.notes.push(a.data); return {}; } },
    };
    const prisma = { async $transaction(fn: (t: unknown) => Promise<unknown>) { return fn(tx); } };
    return { log, repo: createPrismaRepositories(prisma as never).payments };
  };
  const row = (id: string, over: Record<string, unknown> = {}) => ({ id, publicId: `PAY-${id}`, businessId: `b${id}`, amount: 840000n, dueDate: new Date("2026-10-01T00:00:00.000Z"), status: "PENDING", ...over });
  await t("prisma: har o'tgan to'lov uchun OVERDUE + audit(Tizim) + xaridorga bildirishnoma", async () => {
    const rows = [row("1"), row("2")]; const d = mkDb(rows);
    assert.equal(await d.repo.markOverdue("2026-10-15"), 2);
    assert.deepEqual(rows.map((r) => r.status), ["OVERDUE", "OVERDUE"]);
    assert.equal(d.log.audits.length, 2); assert.equal(d.log.audits[0].actorId, null); assert.equal(d.log.audits[0].actorRole, "system"); assert.equal(d.log.audits[0].action, "payment.overdue");
    assert.equal(d.log.notes.length, 2); assert.equal(d.log.notes[0][0].type, "payment.overdue"); assert.match(d.log.notes[0][0].message, /PAY-1 \(840\s000 so'm\)/);
    assert.deepEqual((d.log.users[0] as any).businessId, "b1");
  });
  await t("prisma: takror chaqiruv 0, bildirishnoma takrorlanmaydi; poygada yutqazsa xabar yo'q", async () => {
    const rows = [row("1")]; const d = mkDb(rows); await d.repo.markOverdue("2026-10-15");
    assert.equal(await d.repo.markOverdue("2026-10-15"), 0); assert.equal(d.log.notes.length, 1);
    const lost = mkDb([row("9")], { raceLose: true }); assert.equal(await lost.repo.markOverdue("2026-10-15"), 0); assert.equal(lost.log.notes.length, 0); assert.equal(lost.log.audits.length, 0);
  });
  await t("prisma: audit xatosi tranzaksiyani buzadi (xato yuqoriga chiqadi)", async () => {
    await assert.rejects(() => mkDb([row("1")], { failAudit: true }).repo.markOverdue("2026-10-15"), /audit down/);
  });
  console.log(`maintenance: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
