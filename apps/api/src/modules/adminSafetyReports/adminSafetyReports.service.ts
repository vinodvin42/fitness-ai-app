import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { createNotification } from "../notifications/notifications.service";
import { REMOVED_MESSAGE_TEXT } from "../coachMessages/coachMessages.service";
import { ListSafetyReportsQuery, ResolveSafetyReportInput } from "./adminSafetyReports.schema";

/**
 * 08.04 Safety & Abuse Reports (docs/admin/03-screen-inventory.md §08.04),
 * Oct 2026 — the staff queue for reports made from coach ↔ client chat (see
 * schema.prisma's SafetyReport). Required by app-store rules for apps where
 * people message each other: reports must get a timely response. The staff
 * target is to act on reports within 24 hours (`overdue` counts open reports
 * older than that); that is an internal target, not a promise shown to users.
 *
 * Outcomes:
 * - dismissed: nothing wrong found.
 * - warning: the reported person is told (in-app, users only — professionals
 *   have no inbox yet) to keep messages respectful.
 * - message_removed: the reported message is hidden in both apps ("Removed
 *   by Fynrox"); its text stays on the report as evidence.
 * - account_suspended: recorded only once the account really is suspended,
 *   with the existing reason-gated suspend action on the user's or coach's
 *   profile — this screen never suspends anyone itself.
 *
 * A user who reported gets a short in-app notice that the report was
 * reviewed, without saying what happened to the other person.
 *
 * Reading a report (it contains private chat messages) is audit-logged.
 */

const OVERDUE_HOURS = 24;
const CONTEXT_EACH_SIDE = 5;

const listInclude = {
  reporterUser: { select: { id: true, fullName: true } },
  reporterProfessional: { select: { id: true, fullName: true } },
  reportedUser: { select: { id: true, fullName: true, status: true } },
  reportedProfessional: { select: { id: true, fullName: true, status: true } },
  resolvedByAdmin: { select: { fullName: true } },
} satisfies Prisma.SafetyReportInclude;

type ReportRow = Prisma.SafetyReportGetPayload<{ include: typeof listInclude }>;

function party(user: { id: string; fullName: string } | null, professional: { id: string; fullName: string } | null) {
  if (user) return { kind: "user" as const, id: user.id, name: user.fullName };
  if (professional) return { kind: "professional" as const, id: professional.id, name: professional.fullName };
  return null;
}

function toListItem(r: ReportRow, now: Date) {
  const reported = r.reportedUser
    ? { kind: "user" as const, id: r.reportedUser.id, name: r.reportedUser.fullName, accountStatus: r.reportedUser.status }
    : r.reportedProfessional
      ? {
          kind: "professional" as const,
          id: r.reportedProfessional.id,
          name: r.reportedProfessional.fullName,
          accountStatus: r.reportedProfessional.status,
        }
      : null;
  return {
    id: r.id,
    reason: r.reason,
    severity: r.severity,
    status: r.status,
    outcome: r.outcome,
    reporter: party(r.reporterUser, r.reporterProfessional),
    reported,
    hasMessage: Boolean(r.messageId || r.messageExcerpt),
    excerpt: r.messageExcerpt ? r.messageExcerpt.slice(0, 140) : null,
    createdAt: r.createdAt,
    ageHours: Math.floor((now.getTime() - r.createdAt.getTime()) / 3_600_000),
    overdue: r.status === "open" && now.getTime() - r.createdAt.getTime() > OVERDUE_HOURS * 3_600_000,
    resolvedAt: r.resolvedAt,
    resolvedByName: r.resolvedByAdmin?.fullName ?? null,
  };
}

export async function listSafetyReports(query: ListSafetyReportsQuery) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const overdueBefore = new Date(now.getTime() - OVERDUE_HOURS * 3_600_000);
  const [rows, open, highOpen, overdue, actionedThisWeek] = await Promise.all([
    prisma.safetyReport.findMany({
      where: { ...(query.status ? { status: query.status } : {}), ...(query.severity ? { severity: query.severity } : {}) },
      include: listInclude,
      // High severity first, then oldest open first, so the queue reads top-down.
      orderBy: [{ status: "asc" }, { severity: "asc" }, { createdAt: "asc" }],
      take: 500,
    }),
    prisma.safetyReport.count({ where: { status: "open" } }),
    prisma.safetyReport.count({ where: { status: "open", severity: "high" } }),
    prisma.safetyReport.count({ where: { status: "open", createdAt: { lt: overdueBefore } } }),
    prisma.safetyReport.count({ where: { status: "actioned", resolvedAt: { gte: weekAgo } } }),
  ]);
  return {
    reports: rows.map((r) => toListItem(r, now)),
    stats: { open, highOpen, overdue, actionedThisWeek, overdueHours: OVERDUE_HOURS },
  };
}

async function getReportOrThrow(id: string) {
  const report = await prisma.safetyReport.findUnique({ where: { id }, include: listInclude });
  if (!report) throw new ApiHttpError(404, "not_found", "Report not found");
  return report;
}

/** The conversation pair a report is about (user id + professional id). */
function pairOf(r: ReportRow) {
  const userId = r.reportedUser?.id ?? r.reporterUser?.id ?? null;
  const professionalId = r.reportedProfessional?.id ?? r.reporterProfessional?.id ?? null;
  return userId && professionalId ? { userId, professionalId } : null;
}

export async function getSafetyReport(adminId: string, id: string) {
  const r = await getReportOrThrow(id);
  const now = new Date();
  const pair = pairOf(r);

  // The messages around the reported one (or the latest ones), for context.
  let context: Array<{ id: string; sender: string; content: string; createdAt: Date; removed: boolean; reported: boolean }> = [];
  if (pair) {
    const anchor = r.messageId ? await prisma.coachMessage.findUnique({ where: { id: r.messageId }, select: { createdAt: true } }) : null;
    const where = { userId: pair.userId, professionalId: pair.professionalId };
    const select = { id: true, sender: true, content: true, createdAt: true, removedAt: true };
    const rows = anchor
      ? [
          ...(await prisma.coachMessage.findMany({ where: { ...where, createdAt: { lt: anchor.createdAt } }, orderBy: { createdAt: "desc" }, take: CONTEXT_EACH_SIDE, select })).reverse(),
          ...(await prisma.coachMessage.findMany({ where: { ...where, createdAt: { gte: anchor.createdAt } }, orderBy: { createdAt: "asc" }, take: CONTEXT_EACH_SIDE + 1, select })),
        ]
      : (await prisma.coachMessage.findMany({ where, orderBy: { createdAt: "desc" }, take: CONTEXT_EACH_SIDE * 2, select })).reverse();
    context = rows.map((m) => ({
      id: m.id,
      sender: m.sender,
      // Staff see the original text of a removed message, marked as removed.
      content: m.content,
      createdAt: m.createdAt,
      removed: Boolean(m.removedAt),
      reported: m.id === r.messageId,
    }));
  }

  const priorReports = await prisma.safetyReport.count({
    where: {
      id: { not: r.id },
      ...(r.reportedUser ? { reportedUserId: r.reportedUser.id } : { reportedProfessionalId: r.reportedProfessional?.id ?? "-" }),
    },
  });

  await recordAudit({ actorAdminId: adminId, action: "safety_report.viewed", entityType: "SafetyReport", entityId: r.id });

  return {
    ...toListItem(r, now),
    details: r.details,
    messageId: r.messageId,
    messageExcerpt: r.messageExcerpt,
    messageRemoved: context.some((m) => m.reported && m.removed),
    resolutionNote: r.resolutionNote,
    context,
    priorReportsAgainstReported: priorReports,
  };
}

export async function resolveSafetyReport(adminId: string, id: string, input: ResolveSafetyReportInput) {
  const r = await getReportOrThrow(id);
  if (r.status !== "open") {
    throw new ApiHttpError(409, "already_resolved", "This report has already been resolved");
  }

  if (input.outcome === "message_removed") {
    if (!r.messageId) {
      throw new ApiHttpError(400, "no_message", "This report isn't about a single message");
    }
    await prisma.coachMessage.update({ where: { id: r.messageId }, data: { removedAt: new Date() } });
  }
  if (input.outcome === "account_suspended") {
    const status = r.reportedUser?.status ?? r.reportedProfessional?.status ?? null;
    if (status !== "suspended") {
      throw new ApiHttpError(409, "suspend_first", "Suspend the account from its profile first, then record it here");
    }
  }

  const updated = await prisma.safetyReport.update({
    where: { id },
    data: {
      status: input.outcome === "dismissed" ? "dismissed" : "actioned",
      outcome: input.outcome,
      resolutionNote: input.reason,
      resolvedAt: new Date(),
      resolvedByAdminId: adminId,
    },
  });

  await recordAudit({
    actorAdminId: adminId,
    action: "safety_report.resolved",
    entityType: "SafetyReport",
    entityId: id,
    metadata: { outcome: input.outcome, note: input.reason },
  });

  // A warning reaches a reported user in-app. Professionals have no inbox yet.
  if (input.outcome === "warning" && r.reportedUser) {
    await createNotification(r.reportedUser.id, {
      kind: "system",
      title: "A message you sent was reported",
      body: "Our team reviewed a report about a message you sent. Please keep messages respectful — repeated reports can lead to your account being suspended.",
    });
  }
  // The reporter (a user) hears that it was reviewed, not what was done.
  if (r.reporterUser) {
    await createNotification(r.reporterUser.id, {
      kind: "system",
      title: "Thanks for your report",
      body: "Our team reviewed your report and took action where needed.",
    });
  }

  return { id: updated.id, status: updated.status, outcome: updated.outcome, removedText: input.outcome === "message_removed" ? REMOVED_MESSAGE_TEXT : null };
}
