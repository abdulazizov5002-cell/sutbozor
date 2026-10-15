import { z } from "zod";
import { optionalText, strictObject, uuid } from "./primitives";

/** Yakunlangan buyurtma qismini baholash. Tomon (biznes/supplier) va baholanuvchi serverda aktyor rolidan aniqlanadi. */
export const createRatingBody = strictObject({
  orderId: uuid,
  itemId: uuid,
  score: z.number().int().min(1, "Baho 1 dan 5 gacha bo'lishi kerak.").max(5, "Baho 1 dan 5 gacha bo'lishi kerak."),
  comment: optionalText(500),
});
export type CreateRatingBody = z.infer<typeof createRatingBody>;
