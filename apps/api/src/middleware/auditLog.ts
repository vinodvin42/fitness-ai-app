import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

/**
 * Write-once audit log helper. Call from service functions after a mutating
 * action succeeds — deliberately NOT wired as blanket request middleware,
 * since a meaningful audit entry needs to know entityType/entityId/action,
 * not just "someone POSTed something".
 *
 * 20 Aug 2026 (Phase 6): accepts `actorAdminId` alongside the original
 * `actorId` so admin-console actions attribute to the acting AdminUser
 * rather than being logged as an anonymous system action — pass at most
 * one of the two (a consumer action vs. a staff action), never both.
 * Same day (Phase 5): accepts `actorProfessionalId` too, for the third
 * `Professional` identity. R2 Wave 5 (21 Sep 2026): accepts
 * `actorInfluencerId` too, for the fourth `Influencer`/Creator Portal
 * identity — pass at most one of the four actor fields.
 */
export async function recordAudit(params: {
  actorId?: string | null;
  actorAdminId?: string | null;
  actorProfessionalId?: string | null;
  actorInfluencerId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  /**
   * Spec §6: the audit log must show "state before / after and rule ID".
   * Both were previously left to each caller's own `metadata` shape, so
   * the admin audit screen had nothing dependable to render. Passing
   * them is optional — most actions have no meaningful before-state —
   * but a state transition should pass both, and BR-ADM-005's
   * high-impact actions must.
   */
  stateBefore?: Record<string, unknown> | null;
  stateAfter?: Record<string, unknown> | null;
  /** e.g. "BR-COM-011". Spec §11 requires every event to carry one. */
  ruleId?: string | null;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId ?? null,
      actorAdminId: params.actorAdminId ?? null,
      actorProfessionalId: params.actorProfessionalId ?? null,
      actorInfluencerId: params.actorInfluencerId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      // Cast to Prisma's JSON input type — a plain Record<string, unknown>
      // isn't structurally assignable to InputJsonValue's recursive union
      // (this surfaced 31 Aug 2026 the first time the Prisma client was
      // actually generated; before that `prisma` was an un-typed stub).
      // Only set when present so an undefined stays "field not set".
      ...(params.metadata !== undefined
        ? { metadata: params.metadata as Prisma.InputJsonObject }
        : {}),
      ...(params.stateBefore != null
        ? { stateBefore: params.stateBefore as Prisma.InputJsonObject }
        : {}),
      ...(params.stateAfter != null
        ? { stateAfter: params.stateAfter as Prisma.InputJsonObject }
        : {}),
      ruleId: params.ruleId ?? null,
    },
  });
}
