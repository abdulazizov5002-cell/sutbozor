import { z } from "zod";
import { optionalText, paymentMethod, pastOrToday, positiveMoney, strictObject } from "./primitives";

/** Business "To'lov qildim": summa to'lov summasiga tengligi servisda (bazadagi qiymat bilan) tekshiriladi. */
export const submitPaymentBody = strictObject({
  amount: positiveMoney,
  paymentMethod,
  transactionId: z
    .string()
    .trim()
    .min(4)
    .max(60)
    .regex(/^[A-Za-z0-9._\-/]+$/, "Faqat harf, raqam va . _ - / belgilari ruxsat etiladi."),
  paidAt: pastOrToday,
  note: optionalText(300),
});
export type SubmitPaymentBody = z.infer<typeof submitPaymentBody>;

/** Supplier to'lovni tasdiqlaydi yoki nizo ochadi. */
export const resolvePaymentBody = strictObject({
  decision: z.enum(["confirm", "dispute"]),
  note: optionalText(300),
}).superRefine((v, ctx) => {
  if (v.decision === "dispute" && v.note.length < 5) {
    ctx.addIssue({ code: "custom", path: ["note"], message: "Nizo sababini kamida 5 belgi bilan yozing." });
  }
});
