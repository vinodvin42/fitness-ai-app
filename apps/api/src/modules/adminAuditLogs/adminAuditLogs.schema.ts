import { z } from "zod";

// `AuditLog` has three separate nullable actor FKs (actorId/actorAdminId/
// actorProfessionalId — prisma/schema.prisma), never more than one set per
// row (see middleware/auditLog.ts's own doc comment). "system" isn't a
// real fourth value — every real call site sets exactly one of the three
// — but the type stays defensive (actorType can come back null) in case a
// future call site ever legitimately logs with none set.
export const auditLogActorTypes = ["user", "admin", "professional"] as const;

// 12.03 Audit Logs' "filterable ... log table" (docs/admin/03-screen-inventory.md
// §12.03) — actorType and a date range are real DB-level filters; search
// matches `action` or `entityType` (both plain string columns, not enums
// — see adminAuditLogs.service.ts's top comment for why this is a search
// box rather than a fabricated dropdown of "known" values).
export const listAuditLogsQuerySchema = z.object({
  actorType: z.enum(auditLogActorTypes).optional(),
  search: z.string().trim().max(200).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
