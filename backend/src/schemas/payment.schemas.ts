import { z } from "zod";
import { optionalText, paymentMethod, pastOrToday, strictObject, text } from "./primitives";

/**
 * To'lov yozuvi ustida harakat. SutBozor pul ushlab turmaydi: to'lov biznesdan supplierga to'g'ridan-to'g'ri o'tadi,
 * bu yerda faqat yozib boriladi.
 * - submit (business): "To'lov qildim" — usul, tranzaksiya raqami, sana. Summa serverda (clientdan olinmaydi).
 * - confirm (supplier): "Pul keldi" — to'lov PAID.
 * - reject (supplier): "Pul kelmadi" — sabab bilan, to'lov DISPUTED; biznes qayta yuborishi mumkin.
 */
export const paymentActionBody = z.discriminatedUnion("action", [
  strictObject({
    action: z.literal("submit"),
    method: paymentMethod,
    transactionId: text(3, 60),
    paidOn: pastOrToday,
    note: optionalText(300),
  }),
  strictObject({ action: z.literal("confirm") }),
  strictObject({ action: z.literal("reject"), reason: text(3, 300) }),
]);
export type PaymentActionBody = z.infer<typeof paymentActionBody>;
