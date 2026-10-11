import type { AuditLog, NewAuditLog } from "../domain/entities";
import type { AuditLogRepository } from "../repositories/ports";
import { createScopedReadService, type ReadService } from "./scopedRead.service";

export interface AuditService extends ReadService<AuditLog> {
  /** Har bir muhim harakat shu orqali yoziladi (faqat server tomonida, mijoz yoza olmaydi). */
  record(entry: NewAuditLog): Promise<AuditLog>;
}

export function createAuditService(repo: AuditLogRepository): AuditService {
  const reader = createScopedReadService<AuditLog>({
    repo,
    anyOf: ["audit.view"],
    scope: () => ({}),
    canAccess: () => true,
  });
  return { ...reader, record: (entry) => repo.append(entry) };
}
