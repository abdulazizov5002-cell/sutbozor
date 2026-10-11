import { z } from "zod";
import { disputeReason, optionalText, strictObject, text, uuid } from "./primitives";

export const openDisputeBody = strictObject({
  orderId: uuid,
  paymentId: uuid.optional(),
  contractId: uuid.optional(),
  reason: disputeReason,
  description: text(5, 1000),
});
export type OpenDisputeBody = z.infer<typeof openDisputeBody>;

/** Admin nizo holatini o'zgartiradi. Hal qilish yoki rad etishda yechim matni majburiy. */
export const updateDisputeStatusBody = strictObject({
  status: z.enum(["UNDER_REVIEW", "RESOLVED", "REJECTED", "CLOSED"]),
  resolution: optionalText(1000),
}).superRefine((v, ctx) => {
  if ((v.status === "RESOLVED" || v.status === "REJECTED") && v.resolution.length < 3) {
    ctx.addIssue({ code: "custom", path: ["resolution"], message: "Yechim matnini kiriting (kamida 3 belgi)." });
  }
});
