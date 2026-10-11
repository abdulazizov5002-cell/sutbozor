/**
 * Pul summasi: butun so'm. API va domain darajasida `number` (JSON'ga xavfsiz, summalar 2^53 dan ancha kichik),
 * bazada BigInt bo'ladi. number <-> bigint aylantirish faqat repository chegarasida (Database bosqichi) qilinadi.
 */
export type Money = number;

export const isMoney = (value: unknown): value is Money =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
