import type { Rating } from "../../src/domain/entities";
import type { NewAuditLog } from "../../src/domain/entities";
import type { NewNotification, RatingRepository, Recipient } from "../../src/repositories/ports";
import { conflict } from "../../src/utils/errors";

/** Xotiradagi soxta baho ombori (faqat testlar uchun): takroriy (qism + tomon) -> 409. */
export function fakeRatingRepo() {
  const rows: Rating[] = [];
  const audits: NewAuditLog[] = [];
  const notes: { recipient: Recipient; content: NewNotification }[] = [];
  const created: unknown[] = [];
  const repo: RatingRepository = {
    async create(input, hooks) {
      if (rows.some((r) => r.orderItemId === input.orderItemId && r.side === input.side)) throw conflict("Siz bu buyurtmani allaqachon baholagansiz.");
      const r: Rating = { id: `r${rows.length + 1}`, orderItemId: input.orderItemId, side: input.side, score: input.score, comment: input.comment, createdAt: "2026-10-15T00:00:00.000Z" };
      rows.push(r); created.push(input);
      audits.push(hooks.audit(r)); notes.push({ recipient: hooks.recipient, content: hooks.notify(r) });
      return r;
    },
  };
  return { repo, rows, audits, notes, created };
}
