import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { getAiProviderStatus } from "../../lib/aiClient";
import {
  AiUsageQuery,
  ListAiAnswerReportsQuery,
  ResolveAiAnswerReportInput,
  UpdateAiCoachSettingsInput,
} from "./adminAiOps.schema";
import { ApiHttpError } from "../../middleware/errorHandler";
import { createNotification } from "../notifications/notifications.service";

/**
 * Module 11 — AI Operations (docs/admin/03-screen-inventory.md §11.01–
 * 11.03), added 27 Aug 2026. reports/build-plan.html's own "needs your
 * decision" framing for the full Feature Console (one row per AI
 * capability — "FitGPT Workout Plan Generator", "PrimeVision Photo Diet
 * Log", etc.) named its own smaller alternative: this build has exactly
 * one real AI capability (AI Coach chat, Phase 2 §H), so a console listing
 * 4 rows would put 3 fabricated ones next to 1 real one — the same
 * reasoning that's kept every other "empty by construction" screen
 * unbuilt. What ships here instead is that named smaller slice: a single,
 * real, audit-logged on/off switch for AI Coach chat.
 *
 * Deliberately NOT built (still genuinely missing, same as the doc said):
 *  - 11.01's multi-capability rows / rollout percentage — no second AI
 *    capability exists anywhere in this build to have a row.
 *  - 11.02 Usage metrics — Module 12.06 Integrations already surfaces a
 *    real AI Coach reply count (`adminIntegrations.service.ts`); nothing
 *    richer (latency, cost/call, error rate) is tracked anywhere.
 *  - 11.03 Safety/Overrides log — no moderation/override concept exists
 *    for AI Coach chat; a genuinely different, still-open decision from
 *    08.04 Safety/Abuse Reports (user-generated content), not the same
 *    gap reused twice.
 * See AdminAiOpsScreen.tsx (apps/admin-web) for how these three render as
 * an honest `NotAvailablePanel` next to the one real toggle.
 *
 * No new AdminModule permission key — reuses the existing "admin" scope
 * (middleware/adminPermissions.ts), same reasoning as adminFinance.ts's
 * "Finance collapses into Commerce": docs/admin/05-roles-permissions.md's
 * design-sourced permission matrix has no "AI Operations" row at all (its
 * 12-row canonical list stops at Audit Logs), so there's no design
 * precedent to invent a 13th module for. A single global feature switch is
 * a system-administration action in the same sense Module 12's Admin
 * Users/Roles/Integrations screens are — "admin" fits without stretching.
 */

const SINGLETON_ID = "singleton";

type SettingsRow = {
  id: string;
  isEnabled: boolean;
  updatedByAdminId: string | null;
  updatedByAdmin: { id: string; fullName: string } | null;
  updatedAt: Date;
};

function toDTO(row: SettingsRow | null) {
  const ai = getAiProviderStatus();
  return {
    // A missing row means "never explicitly touched" — the schema's own
    // `@default(true)` documents what that implies, so this mirrors it
    // rather than writing a row just to answer a read.
    isEnabled: row?.isEnabled ?? true,
    updatedByAdminName: row?.updatedByAdmin?.fullName ?? null,
    updatedAt: row?.updatedAt ?? null,
    provider: ai,
  };
}

export async function getAiCoachSettings() {
  const row = (await prisma.aiCoachSettings.findUnique({
    where: { id: SINGLETON_ID },
    include: { updatedByAdmin: { select: { id: true, fullName: true } } },
  })) as SettingsRow | null;
  return toDTO(row);
}

export async function updateAiCoachSettings(actorAdminId: string, input: UpdateAiCoachSettingsInput) {
  const saved = await prisma.aiCoachSettings.upsert({
    where: { id: SINGLETON_ID },
    update: { isEnabled: input.isEnabled, updatedByAdminId: actorAdminId },
    create: { id: SINGLETON_ID, isEnabled: input.isEnabled, updatedByAdminId: actorAdminId },
  });

  await recordAudit({
    actorAdminId,
    action: input.isEnabled ? "ai_coach_settings.enabled" : "ai_coach_settings.disabled",
    entityType: "AiCoachSettings",
    entityId: saved.id,
    metadata: { isEnabled: input.isEnabled },
  });

  const full = (await prisma.aiCoachSettings.findUnique({
    where: { id: SINGLETON_ID },
    include: { updatedByAdmin: { select: { id: true, fullName: true } } },
  })) as SettingsRow;
  return toDTO(full);
}

/**
 * The one thing outside this module that actually needs this flag —
 * aiCoach.service.ts's `sendMessage()` calls this alongside its existing
 * `isAiConfigured()` check. Kept here (not duplicated) so the singleton-row
 * lookup and its default-when-missing semantics live in exactly one place.
 */
export async function isAiCoachEnabledByAdmin(): Promise<boolean> {
  const row = await prisma.aiCoachSettings.findUnique({ where: { id: SINGLETON_ID } });
  return row?.isEnabled ?? true;
}

/**
 * 11.02 AI Usage & Metrics (docs/admin/03-screen-inventory.md §11.02), Oct
 * 2026 — real usage of the one AI capability (AI Coach chat), from
 * `AiCoachMessage` rows. Aggregates only: no user names or message text,
 * so the screen can sit behind the analytics permission without exposing
 * anyone's conversation.
 *
 * - questions: user messages in the window.
 * - answered: assistant replies in the window.
 * - unanswered: user messages still marked `failed` (the reply failed and
 *   no retry has succeeded yet — see the model's own comment).
 * - personalised: replies that carried `sources` (the user's own context
 *   was used, what the app's "Why this?" sheet shows).
 * - activeUsers: distinct users who asked at least one question.
 *
 * Not available: tokens, cost and latency (none are stored per reply), and
 * a per-model breakdown (one provider/model is configured at a time).
 */
export async function getAiUsage(query: AiUsageQuery) {
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (query.days - 1)));

  const [questions, answered, unanswered, personalised, activeUsers, everUsers, daily, settings] = await Promise.all([
    prisma.aiCoachMessage.count({ where: { role: "user", createdAt: { gte: since } } }),
    prisma.aiCoachMessage.count({ where: { role: "assistant", createdAt: { gte: since } } }),
    prisma.aiCoachMessage.count({ where: { role: "user", failed: true, createdAt: { gte: since } } }),
    prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS n FROM ai_coach_messages
      WHERE role = 'assistant' AND "createdAt" >= ${since}
        AND jsonb_typeof(sources) = 'array' AND jsonb_array_length(sources) > 0`),
    prisma.aiCoachMessage.findMany({ where: { role: "user", createdAt: { gte: since } }, distinct: ["userId"], select: { userId: true } }),
    prisma.aiCoachMessage.findMany({ where: { role: "user" }, distinct: ["userId"], select: { userId: true } }),
    prisma.$queryRaw<Array<{ day: Date; questions: bigint; answered: bigint; unanswered: bigint; users: bigint }>>(Prisma.sql`
      SELECT date_trunc('day', "createdAt") AS day,
             COUNT(*) FILTER (WHERE role = 'user')::bigint AS questions,
             COUNT(*) FILTER (WHERE role = 'assistant')::bigint AS answered,
             COUNT(*) FILTER (WHERE role = 'user' AND failed)::bigint AS unanswered,
             COUNT(DISTINCT "userId") FILTER (WHERE role = 'user')::bigint AS users
      FROM ai_coach_messages
      WHERE "createdAt" >= ${since}
      GROUP BY 1
      ORDER BY 1`),
    getAiCoachSettings(),
  ]);

  // Every day in the window, including days with no messages.
  const byDay = new Map(daily.map((d) => [d.day.toISOString().slice(0, 10), d]));
  const series = Array.from({ length: query.days }, (_, i) => {
    const date = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const d = byDay.get(date);
    return {
      date,
      questions: Number(d?.questions ?? 0),
      answered: Number(d?.answered ?? 0),
      unanswered: Number(d?.unanswered ?? 0),
      activeUsers: Number(d?.users ?? 0),
    };
  });

  return {
    days: query.days,
    since,
    enabled: settings.isEnabled,
    provider: settings.provider,
    totals: {
      questions,
      answered,
      unanswered,
      personalised: Number(personalised[0]?.n ?? 0),
      activeUsers: activeUsers.length,
      usersEver: everUsers.length,
      unansweredRate: questions > 0 ? unanswered / questions : null,
      personalisedRate: answered > 0 ? Number(personalised[0]?.n ?? 0) / answered : null,
    },
    series,
    notAvailable: ["aiTokens", "aiCost", "aiLatency", "aiModelBreakdown"],
  };
}

/**
 * 11.03 AI Safety / Overrides (docs/admin/03-screen-inventory.md §11.03),
 * Oct 2026 — AI Coach answers people reported in the app (Google Play
 * requires that reporting for apps with generative AI; see schema.prisma's
 * AiAnswerReport). These are health conversations, so the routes need the
 * `sensitiveData` permission (Super Admin and the safety/privacy role
 * only), the list carries no message text, and opening a report is
 * audit-logged.
 *
 * Staff either mark a report reviewed (the answer was fine) or hide the
 * answer: it is replaced in the user's chat and left out of what the AI sees
 * next time. The user who reported is told which, in-app.
 *
 * The overrides log is the audit trail of what staff changed about the AI:
 * answers hidden and AI Coach switched on or off.
 *
 * Not built: automatic flagging (no moderation model runs on answers).
 */
const OVERRIDE_ACTIONS = ["ai_answer.hidden", "ai_coach_settings.enabled", "ai_coach_settings.disabled"];

export async function listAiAnswerReports(query: ListAiAnswerReportsQuery) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const [rows, open, reportedThisWeek, answersThisWeek, overrides] = await Promise.all([
    prisma.aiAnswerReport.findMany({
      where: query.status ? { status: query.status } : {},
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      take: 500,
      select: {
        id: true,
        reason: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
        note: true,
        messageId: true,
        reviewedByAdmin: { select: { fullName: true } },
      },
    }),
    prisma.aiAnswerReport.count({ where: { status: "open" } }),
    prisma.aiAnswerReport.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.aiCoachMessage.count({ where: { role: "assistant", createdAt: { gte: weekAgo } } }),
    prisma.auditLog.findMany({
      where: { action: { in: OVERRIDE_ACTIONS } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, action: true, createdAt: true, reason: true, entityId: true, actorAdmin: { select: { fullName: true } } },
    }),
  ]);

  return {
    reports: rows.map((r) => ({
      id: r.id,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt,
      ageHours: Math.floor((now.getTime() - r.createdAt.getTime()) / 3_600_000),
      hasNote: Boolean(r.note),
      // False once the user cleared their conversation; the report keeps a copy.
      answerStillInChat: Boolean(r.messageId),
      reviewedAt: r.reviewedAt,
      reviewedByName: r.reviewedByAdmin?.fullName ?? null,
    })),
    stats: {
      open,
      reportedThisWeek,
      answersThisWeek,
      reportedShare: answersThisWeek > 0 ? reportedThisWeek / answersThisWeek : null,
    },
    overrides: overrides.map((o) => ({
      id: o.id,
      action: o.action,
      at: o.createdAt,
      byName: o.actorAdmin?.fullName ?? null,
      note: o.reason,
    })),
    notAvailable: ["aiAutoFlagging"],
  };
}

export async function getAiAnswerReport(adminId: string, id: string) {
  const r = await prisma.aiAnswerReport.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, fullName: true } },
      message: { select: { sources: true, hiddenAt: true } },
      reviewedByAdmin: { select: { fullName: true } },
    },
  });
  if (!r) throw new ApiHttpError(404, "not_found", "Report not found");
  await recordAudit({ actorAdminId: adminId, action: "ai_answer_report.viewed", entityType: "AiAnswerReport", entityId: r.id });
  return {
    id: r.id,
    reason: r.reason,
    status: r.status,
    createdAt: r.createdAt,
    user: r.user,
    question: r.questionText,
    answer: r.answerText,
    note: r.note,
    sources: Array.isArray(r.message?.sources) ? r.message?.sources : [],
    answerStillInChat: Boolean(r.message),
    answerHidden: Boolean(r.message?.hiddenAt),
    reviewNote: r.reviewNote,
    reviewedAt: r.reviewedAt,
    reviewedByName: r.reviewedByAdmin?.fullName ?? null,
  };
}

export async function resolveAiAnswerReport(adminId: string, id: string, input: ResolveAiAnswerReportInput) {
  const r = await prisma.aiAnswerReport.findUnique({ where: { id } });
  if (!r) throw new ApiHttpError(404, "not_found", "Report not found");
  if (r.status !== "open") throw new ApiHttpError(409, "already_resolved", "This report has already been resolved");

  if (input.action === "hide_answer" && r.messageId) {
    await prisma.aiCoachMessage.update({ where: { id: r.messageId }, data: { hiddenAt: new Date() } });
  }
  const updated = await prisma.aiAnswerReport.update({
    where: { id },
    data: {
      status: input.action === "hide_answer" ? "answer_hidden" : "reviewed",
      reviewNote: input.reason,
      reviewedAt: new Date(),
      reviewedByAdminId: adminId,
    },
    select: { id: true, status: true },
  });
  await recordAudit({
    actorAdminId: adminId,
    action: input.action === "hide_answer" ? "ai_answer.hidden" : "ai_answer_report.reviewed",
    entityType: "AiAnswerReport",
    entityId: id,
    reason: input.reason,
    metadata: { messageId: r.messageId },
  });
  await createNotification(r.userId, {
    kind: "system",
    title: "About the AI Coach answer you reported",
    body:
      input.action === "hide_answer"
        ? "Thanks for reporting it. Our team reviewed the answer and removed it from your chat."
        : "Thanks for reporting it. Our team reviewed the answer and found no problem with it.",
  });
  return updated;
}
