import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { getAiProviderStatus } from "../../lib/aiClient";
import { UpdateAiCoachSettingsInput } from "./adminAiOps.schema";

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
