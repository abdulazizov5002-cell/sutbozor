import { z } from "zod";
import { deliveryMode, days, optionalText, paymentSchedule, productName, quantity, strictObject, timeOfDay, uuid } from "./primitives";

/**
 * Business yangi buyurtma beradi: supplierlarni O'ZI tanlaydi (har supplier uchun kunlik miqdor).
 * Narx BODY'da yo'q: server uni supplierning mahsulotidan oladi (frontenddagi narxga ishonilmaydi).
 */
export const createOrderBody = strictObject({
  product: productName,
  days,
  deliveryMode,
  paymentSchedule,
  prepTime: timeOfDay.default("06:30"),
  items: z
    .array(strictObject({ supplierId: uuid, quantityPerDay: quantity }))
    .min(1, "Kamida bitta supplier tanlang.")
    .max(10, "Bir buyurtmada ko'pi bilan 10 ta supplier bo'lishi mumkin."),
}).superRefine((v, ctx) => {
  const seen = new Set<string>();
  v.items.forEach((it, i) => {
    if (seen.has(it.supplierId)) {
      ctx.addIssue({ code: "custom", path: ["items", i, "supplierId"], message: "Bir supplier ikki marta tanlanmaydi." });
    }
    seen.add(it.supplierId);
  });
});
export type CreateOrderBody = z.infer<typeof createOrderBody>;

/**
 * Buyurtma qismi (bitta supplier) ustida harakat. D bosqichi: faqat SENT holatida.
 * accept/reject: supplier. cancel: buyurtma egasi (business). Rad etish va bekor qilish uchun sabab majburiy.
 * Yetkazish harakatlari (prepare, deliver, pause...) E bosqichida qo'shiladi.
 */
export const orderItemActionBody = strictObject({
  action: z.enum(["accept", "reject", "cancel"]),
  reason: optionalText(300),
}).superRefine((v, ctx) => {
  if ((v.action === "reject" || v.action === "cancel") && v.reason.length < 3) {
    ctx.addIssue({ code: "custom", path: ["reason"], message: "Sababni yozing (kamida 3 belgi)." });
  }
});
export type OrderItemActionBody = z.infer<typeof orderItemActionBody>;

export const orderItemParamsSchema = z.strictObject({ id: uuid, itemId: uuid });
