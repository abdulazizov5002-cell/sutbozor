import { z } from "zod";
import { email, optionalText, personName, phone, role, strictObject, uuid } from "./primitives";

/** Admin foydalanuvchini bloklaydi/faollashtiradi. `role` kabi maydonlar yuborilsa "Noma'lum maydon" xatosi. */
export const updateUserStatusBody = strictObject({
  status: z.enum(["ACTIVE", "BLOCKED"]),
  reason: optionalText(300),
});

/** Yangi foydalanuvchi: rol bilan bog'lanish bazadagi CHECK constraint bilan bir xil (business->businessId, supplier->supplierId, admin->ikkalasisiz). */
export const createUserBody = strictObject({
  name: personName,
  phone,
  email: email.optional(),
  role,
  businessId: uuid.optional(),
  supplierId: uuid.optional(),
}).superRefine((v, ctx) => {
  const need = (cond: boolean, path: string, message: string) => cond && ctx.addIssue({ code: "custom", path: [path], message });
  need(v.role === "business" && !v.businessId, "businessId", "Biznes foydalanuvchisi uchun businessId majburiy.");
  need(v.role === "business" && !!v.supplierId, "supplierId", "Biznes foydalanuvchisiga supplierId berib bo'lmaydi.");
  need(v.role === "supplier" && !v.supplierId, "supplierId", "Supplier foydalanuvchisi uchun supplierId majburiy.");
  need(v.role === "supplier" && !!v.businessId, "businessId", "Supplier foydalanuvchisiga businessId berib bo'lmaydi.");
  need(v.role === "admin" && (!!v.businessId || !!v.supplierId), "role", "Admin biznes yoki supplierga bog'lanmaydi.");
});
