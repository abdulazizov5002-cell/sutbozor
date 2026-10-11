import { TIMEZONE } from "../config/constants";

/** Bugungi sana (YYYY-MM-DD), biznes zonasi (Asia/Tashkent) bo'yicha. Server zonasiga bog'liq emas. */
export function todayInBusinessZone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
