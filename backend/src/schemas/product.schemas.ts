import { z } from "zod";
import { money, nonNegativeQuantity, strictObject } from "./primitives";

/** Supplier mahsulotini yangilaydi: kamida bitta maydon yuborilishi kerak. */
export const updateProductBody = strictObject({
  availableToday: nonNegativeQuantity.optional(),
  dailyCapacity: nonNegativeQuantity.optional(),
  pricePerUnit: money.optional(),
}).refine((v) => Object.keys(v).length > 0, "Kamida bitta maydonni yuboring.");
export type UpdateProductBody = z.infer<typeof updateProductBody>;
