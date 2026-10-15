import { z } from "zod";
import { nonNegativeQuantity, positiveMoney, productName, strictObject } from "./primitives";

/**
 * Supplier yangi mahsulot qo'shadi. `supplierId` va `unit` YUBORILMAYDI (strict): supplier tokendan, birlik mahsulot nomidan olinadi.
 * Narx: musbat butun so'm. Miqdorlar: manfiy emas (0 ruxsat), 2 ta kasrgacha.
 */
export const createProductBody = strictObject({
  name: productName,
  pricePerUnit: positiveMoney,
  dailyCapacity: nonNegativeQuantity,
  availableToday: nonNegativeQuantity,
});
export type CreateProductBody = z.infer<typeof createProductBody>;

/** Supplier o'z mahsulotini yangilaydi: kamida bitta maydon. Nom o'zgartirilmaydi (o'chirib, yangisini qo'shing). */
export const updateProductBody = strictObject({
  availableToday: nonNegativeQuantity.optional(),
  dailyCapacity: nonNegativeQuantity.optional(),
  pricePerUnit: positiveMoney.optional(),
}).refine((v) => Object.keys(v).length > 0, "Kamida bitta maydonni yuboring.");
export type UpdateProductBody = z.infer<typeof updateProductBody>;
