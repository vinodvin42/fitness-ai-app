import { prisma } from "../../db/prisma";

/**
 * 12.04 Privacy & Data Governance (docs/admin/03-screen-inventory.md
 * §12.04: "KPI row, a consent-management card/table, a DSAR (data subject
 * access request) card, and a data-retention card"), added 26 Aug 2026.
 *
 * **The DSAR card is genuinely real — caught a mistake mid-build.** The
 * first version of this file assumed no self-service Data Subject Access
 * Request flow existed anywhere and reframed the whole card around
 * `SensitiveDataAccessRequest` (an ADMIN requesting access to a user's
 * data — the opposite direction). That was wrong: `apps/user-mobile`'s
 * Security screen already has a real GDPR-style "download my data" export
 * (`users.service.ts`'s `exportUserData`) and a real account deletion
 * (`deleteAccount`), both user-initiated and both write a real `AuditLog`
 * entry (`user.data_exported` / `user.account_deleted`) — an actual DSAR
 * trail, just never surfaced console-wide before this. `dsarLog` below
 * queries exactly those two `action` values across every user, the same
 * "surface an existing AuditLog trail console-wide" pattern Module 04's
 * History tab and Module 06's Transaction audit trail already use.
 * `user.account_deleted` rows lose their resolvable actor after the fact
 * — `AuditLog.actorId` is `onDelete: SetNull` specifically so this
 * write-once trail survives account deletion with an anonymized actor
 * rather than being destroyed by the very account it logged (see that
 * model's own doc comment) — rendered honestly as "Deleted account
 * (anonymized)" rather than a fabricated name.
 *
 * **`sensitiveAccessLog` is a second, real, DIFFERENT privacy artifact**
 * kept alongside it: `SensitiveDataAccessRequest` (Module 02's "Sensitive
 * Health Metrics" panel, 25 Aug 2026) is an admin requesting supervisor-
 * approved access to a user's locked sensitive data — an internal
 * access-control log, not a subject-rights request. Surfaced console-wide
 * here for the first time too (previously only visible per-user on that
 * user's own Profile screen). Both cards are clearly labeled so neither
 * is mistaken for the other.
 *
 * **18 Sep 2026: a real `Consent` model now exists** (R1 Developer 1,
 * `apps/user-mobile`'s new PrivacySettingsScreen.tsx +
 * `users.service.ts#listConsents`/`updateConsent`) — this comment's older
 * "no Consent/opt-in tracking entity anywhere in this schema" claim no
 * longer holds.
 *
 * **20 Sep 2026 (Wave 4): the admin-console read side is real too now** —
 * `GET /admin/users/:id/consents` (`adminUsers.routes.ts`/
 * `adminUsers.service.ts#listUserConsents`), a searchable-by-user Consent
 * Management screen (`ConsentManagementScreen.tsx`), both a thin
 * read-only wrapper around `users.service.ts#listConsents` — not
 * duplicated here in this module, since it's naturally scoped per-user
 * (search a user, see their consent state) rather than a console-wide
 * table like the DSAR/Sensitive Access logs above. `notAvailable` below
 * drops `consentManagement` for that reason. Data retention (no
 * retention-policy config or scheduled-deletion job exists anywhere) is
 * unrelated and remains genuinely unbuilt, still rendered via
 * `NotAvailablePanel`.
 *
 * **Also Wave 4: `privacy_request` Admin Action Required wiring** — the
 * DSAR log above stays a passive read (this file isn't the actionable
 * queue), but `users.service.ts#exportUserData`/`deleteAccount` — the
 * two real creation points behind the `user.data_exported`/
 * `user.account_deleted` AuditLog rows `getDsarLog` reads — now each also
 * call `createActionItem({ type: "privacy_request", ... })`, so a real
 * DSAR shows up in the unified `GET /admin/action-items` queue too, not
 * only in this siloed card. See those functions' own comments for the
 * severity reasoning (`low` for a self-service export that already
 * completed, `medium` for an irreversible deletion with downstream
 * erasure obligations worth a human's eye).
 */

const REQUEST_CAP = 200;
const DSAR_ACTIONS = ["user.data_exported", "user.account_deleted"] as const;

async function getDsarLog() {
  const [exportCount, deletionCount, rows] = await Promise.all([
    prisma.auditLog.count({ where: { action: "user.data_exported" } }),
    prisma.auditLog.count({ where: { action: "user.account_deleted" } }),
    prisma.auditLog.findMany({
      where: { action: { in: [...DSAR_ACTIONS] } },
      orderBy: { createdAt: "desc" },
      take: REQUEST_CAP,
      select: { id: true, actorId: true, action: true, createdAt: true },
    }) as Promise<Array<{ id: string; actorId: string | null; action: string; createdAt: Date }>>,
  ]);

  const userIds = [...new Set(rows.map((r) => r.actorId).filter((id): id is string => !!id))];
  const users =
    userIds.length > 0
      ? ((await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true } })) as Array<{
          id: string;
          fullName: string;
          email: string;
        }>)
      : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  return {
    kpis: { exports: exportCount, deletions: deletionCount },
    entries: rows.map((r) => ({
      id: r.id,
      type: r.action === "user.data_exported" ? ("export" as const) : ("deletion" as const),
      // Null when the underlying User row is gone (account_deleted rows,
      // by design — see this file's top comment) — an honest "anonymized"
      // label, not a fabricated name.
      user: r.actorId ? (userById.get(r.actorId) ?? { id: r.actorId, fullName: "Unknown user", email: "" }) : null,
      createdAt: r.createdAt.toISOString(),
    })),
    totalCount: exportCount + deletionCount,
    truncated: exportCount + deletionCount > REQUEST_CAP,
  };
}

async function getSensitiveAccessLog() {
  const [total, pending, approved, denied, requests] = await Promise.all([
    prisma.sensitiveDataAccessRequest.count(),
    prisma.sensitiveDataAccessRequest.count({ where: { status: "pending" } }),
    prisma.sensitiveDataAccessRequest.count({ where: { status: "approved" } }),
    prisma.sensitiveDataAccessRequest.count({ where: { status: "denied" } }),
    prisma.sensitiveDataAccessRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: REQUEST_CAP,
      select: {
        id: true,
        userId: true,
        reason: true,
        status: true,
        reviewNotes: true,
        createdAt: true,
        reviewedAt: true,
        requestedByAdminId: true,
        reviewedByAdminId: true,
      },
    }) as Promise<
      Array<{
        id: string;
        userId: string;
        reason: string;
        status: string;
        reviewNotes: string | null;
        createdAt: Date;
        reviewedAt: Date | null;
        requestedByAdminId: string;
        reviewedByAdminId: string | null;
      }>
    >,
  ]);

  // Batch-resolve every referenced user/admin id in at most 2 more
  // queries total, regardless of row count — same "batch-resolve, don't
  // N+1" precedent as adminPayments.service.ts / adminAuditLogs.service.ts.
  const userIds = [...new Set(requests.map((r) => r.userId))];
  const adminIds = [...new Set([...requests.map((r) => r.requestedByAdminId), ...requests.map((r) => r.reviewedByAdminId).filter((id): id is string => !!id)])];

  const [users, admins] = await Promise.all([
    userIds.length > 0
      ? (prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true } }) as Promise<
          Array<{ id: string; fullName: string; email: string }>
        >)
      : Promise.resolve([]),
    adminIds.length > 0
      ? (prisma.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, fullName: true } }) as Promise<Array<{ id: string; fullName: string }>>)
      : Promise.resolve([]),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const adminById = new Map(admins.map((a) => [a.id, a]));

  return {
    kpis: { total, pending, approved, denied },
    entries: requests.map((r) => ({
      id: r.id,
      user: userById.get(r.userId) ?? { id: r.userId, fullName: "Unknown user", email: "" },
      reason: r.reason,
      status: r.status,
      reviewNotes: r.reviewNotes,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
      requestedByAdmin: adminById.get(r.requestedByAdminId) ?? { id: r.requestedByAdminId, fullName: "Unknown admin" },
      reviewedByAdmin: r.reviewedByAdminId ? adminById.get(r.reviewedByAdminId) ?? { id: r.reviewedByAdminId, fullName: "Unknown admin" } : null,
    })),
    totalCount: total,
    truncated: total > REQUEST_CAP,
  };
}

export async function getPrivacyDashboard() {
  const [dsarLog, sensitiveAccessLog] = await Promise.all([getDsarLog(), getSensitiveAccessLog()]);

  return {
    dsarLog,
    sensitiveAccessLog,
    // See this file's top comment — consent management is real now
    // (Wave 4, GET /admin/users/:id/consents), only data retention
    // remains genuinely unbuilt.
    notAvailable: ["dataRetention"],
  };
}
