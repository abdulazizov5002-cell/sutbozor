import { z } from "zod";
import { deliveryMode, days, optionalText, paymentSchedule, positiveMoney, productName, quantity, strictObject, timeOfDay } from "./primitives";

/** Business yangi doimiy buyurtma yaratadi: server mos supplierlarni o'zi tanlaydi. */
export const createOrderBody = strictObject({
  product: productName,
  quantityPerDay: quantity,
  days,
  deliveryMode,
  paymentSchedule,
  prepTime: timeOfDay.default("06:30"),
  radiusKm: z.number().int().min(1).max(50).default(5),
  maxPricePerUnit: positiveMoney,
  minRating: z.number().min(0).max(5).default(0),
});
export type CreateOrderBody = z.infer<typeof createOrderBody>;

/** Supplier/Business buyurtma qismi ustida harakat qiladi. Rad etish va to'xtatish uchun sabab majburiy. */
export const orderItemActionBody = strictObject({
  action: z.enum(["accept", "reject", "prepare", "ready", "depart", "deliver", "pause", "resume", "cancel"]),
  reason: optionalText(300),
}).superRefine((v, ctx) => {
  if ((v.action === "reject" || v.action === "pause" || v.action === "cancel") && v.reason.length < 3) {
    ctx.addIssue({ code: "custom", path: ["reason"], message: "Sababni yozing (kamida 3 belgi)." });
  }
});
export type OrderItemActionBody = z.infer<typeof orderItemActionBody>;
