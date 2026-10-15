import assert from "node:assert/strict";
import { amountForDays, buildPaymentPlan, deliveryPayment } from "../src/domain/paymentPlan";

let pass = 0, fail = 0;
const t = (name: string, fn: () => unknown) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, (e as Error).message); } };
const total = (a: { amount: number }[]) => a.reduce((s, x) => s + x.amount, 0);
const base = { quantityPerDay: 20, pricePerUnit: 12000, startDate: "2026-10-15" };

t("amountForDays: butun va kasr miqdor, yaxlitlash", () => {
  assert.equal(amountForDays(20, 12000, 30), 7_200_000);
  assert.equal(amountForDays(2.5, 11000, 1), 27500);
  assert.equal(amountForDays(0.33, 1001, 1), 330); // 330.33 -> 330
  assert.equal(amountForDays(0.35, 1001, 1), 350); // 350.35 -> 350
  assert.equal(amountForDays(0.5, 1, 1), 1); // 0.5 yuqoriga
});
t("amountForDays: juda katta summa xato", () => {
  assert.throws(() => amountForDays(100000, Number.MAX_SAFE_INTEGER, 365), /diapazon/);
});
t("WEEKLY 30 kun: 4 davr (1-7, 8-14, 15-21, 22-30), yig'indi to'liq summa, muddatlar", () => {
  const p = buildPaymentPlan({ ...base, schedule: "WEEKLY", days: 30 });
  assert.deepEqual(p.map((x) => [x.periodNo, x.fromDay, x.toDay, x.days]), [[1, 1, 7, 7], [2, 8, 14, 7], [3, 15, 21, 7], [4, 22, 30, 9]]);
  assert.equal(total(p), 7_200_000); assert.equal(p[0]!.amount, 7 * 240000); assert.equal(p[3]!.amount, 9 * 240000);
  assert.deepEqual(p.map((x) => x.dueDate), ["2026-10-22", "2026-10-29", "2026-11-05", "2026-11-14"]);
});
t("WEEKLY 3 kun: bitta davr (qoldiq)", () => {
  const p = buildPaymentPlan({ ...base, schedule: "WEEKLY", days: 3 });
  assert.equal(p.length, 1); assert.deepEqual([p[0]!.fromDay, p[0]!.toDay, p[0]!.days], [1, 3, 3]); assert.equal(p[0]!.amount, 3 * 240000);
});
t("MONTHLY 75 kun: 2 davr (1-30, 31-75)", () => {
  const p = buildPaymentPlan({ ...base, schedule: "MONTHLY", days: 75 });
  assert.deepEqual(p.map((x) => [x.fromDay, x.toDay]), [[1, 30], [31, 75]]); assert.equal(total(p), 75 * 240000);
});
t("PREPAID: bitta to'lov, muddati boshlanish kuni", () => {
  const p = buildPaymentPlan({ ...base, schedule: "PREPAID", days: 14 });
  assert.equal(p.length, 1); assert.equal(p[0]!.amount, 14 * 240000); assert.equal(p[0]!.dueDate, "2026-10-15"); assert.equal(p[0]!.toDay, 14);
});
t("DELIVERY: oldindan jadval yo'q; deliveryPayment bir kunlik", () => {
  assert.deepEqual(buildPaymentPlan({ ...base, schedule: "DELIVERY", days: 30 }), []);
  const d = deliveryPayment({ dayNo: 3, quantityPerDay: 2.5, pricePerUnit: 11000, today: "2026-10-17" });
  assert.deepEqual(d, { periodNo: 3, fromDay: 3, toDay: 3, days: 1, amount: 27500, dueDate: "2026-10-17" });
});
t("kasr miqdorda davrlar yig'indisi butun summadan farq qilmaydi", () => {
  for (const [q, price, days] of [[0.33, 1001, 30], [1.07, 9999, 61], [2.5, 11000, 100], [0.01, 1, 365]] as const) {
    for (const schedule of ["WEEKLY", "MONTHLY"] as const) {
      const p = buildPaymentPlan({ schedule, days, quantityPerDay: q, pricePerUnit: price, startDate: "2026-01-01" });
      assert.equal(total(p), amountForDays(q, price, days), `${schedule} ${q} ${days}`);
      assert.ok(p.every((x) => x.amount >= 0 && Number.isInteger(x.amount)));
    }
  }
});

console.log(`paymentPlan: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
