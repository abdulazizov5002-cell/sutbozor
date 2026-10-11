import { z } from "zod";
import { days, deliveryMode, paymentSchedule, positiveMoney, productName, quantity, strictObject, todayOrFuture, uuid } from "./primitives";

export const createContractBody = strictObject({
  supplierId: uuid,
  product: productName,
  quantityPerDay: quantity,
  pricePerUnit: positiveMoney,
  days,
  startDate: todayOrFuture,
  paymentSchedule,
  deliveryMode,
});
export type CreateContractBody = z.infer<typeof createContractBody>;
