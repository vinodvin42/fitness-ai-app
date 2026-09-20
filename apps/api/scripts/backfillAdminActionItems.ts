/**
 * CLI entry point — run: npx tsx scripts/backfillAdminActionItems.ts
 * (from apps/api), or `npm run db:backfill-action-items --workspace=apps/api`.
 *
 * One-time historical backfill for the Admin Action Required queue (R2
 * Wave 1, 20 Sep 2026) — see schema.prisma's `AdminActionItem` doc
 * comment and lib/adminActionQueue.ts's top comment for the full design.
 * The 5 ongoing hooks (support.service.ts's createTicket,
 * adminSupport.service.ts's escalateSupportTicket, adminRefunds.service
 * .ts's createRefund, coaching.service.ts's requestChange,
 * professionalOnboarding.service.ts's submitCredential — plus
 * users.service.ts's upsertOnboardingProfile for SafetyEscalation) only
 * cover NEW rows created from the moment they were wired in; this script
 * catches every pre-existing real open/pending row from before that
 * moment, once.
 *
 * Idempotent by construction: each source is queried, then filtered down
 * to rows that don't already have a matching `AdminActionItem`
 * (`entityType`+`entityId`), so running this more than once (e.g. after a
 * partial failure) never double-seeds — this is the "repeatable backfill
 * script" dedup concern lib/adminActionQueue.ts's own comment calls out
 * as distinct from `createActionItem()`'s own no-dedup contract.
 */
import { prisma } from "../src/db/prisma";
import { createActionItem } from "../src/lib/adminActionQueue";
import { AdminActionItemType } from "@prisma/client";

async function alreadyQueued(entityType: string, entityIds: string[]): Promise<Set<string>> {
  if (entityIds.length === 0) return new Set();
  const existing = await prisma.adminActionItem.findMany({
    where: { entityType, entityId: { in: entityIds } },
    select: { entityId: true },
  });
  return new Set(existing.map((e) => e.entityId));
}

async function backfillSupportTickets(): Promise<number> {
  const tickets = await prisma.supportTicket.findMany({
    where: { status: "open" },
    select: { id: true, category: true, priority: true },
  });
  const skip = await alreadyQueued("SupportTicket", tickets.map((t) => t.id));
  let created = 0;
  for (const t of tickets) {
    if (skip.has(t.id)) continue;
    await createActionItem({
      type: "support_ticket_open" as AdminActionItemType,
      entityType: "SupportTicket",
      entityId: t.id,
      severity: "low",
      metadata: { category: t.category, priority: t.priority },
    });
    created++;
  }
  return created;
}

async function backfillPendingRefunds(): Promise<number> {
  const refunds = await prisma.refund.findMany({
    where: { status: "pending" },
    select: { id: true, paymentId: true, amountCents: true },
  });
  const skip = await alreadyQueued("Refund", refunds.map((r) => r.id));
  let created = 0;
  for (const r of refunds) {
    if (skip.has(r.id)) continue;
    await createActionItem({
      type: "refund_impact" as AdminActionItemType,
      entityType: "Refund",
      entityId: r.id,
      severity: "medium",
      metadata: { paymentId: r.paymentId, amountCents: r.amountCents },
    });
    created++;
  }
  return created;
}

async function backfillOpenEscalations(): Promise<number> {
  const escalations = await prisma.escalation.findMany({
    where: { status: "open" },
    select: { id: true, supportTicketId: true, reason: true },
  });
  const skip = await alreadyQueued("Escalation", escalations.map((e) => e.id));
  let created = 0;
  for (const e of escalations) {
    if (skip.has(e.id)) continue;
    await createActionItem({
      type: "support_escalation" as AdminActionItemType,
      entityType: "Escalation",
      entityId: e.id,
      severity: "medium",
      metadata: { supportTicketId: e.supportTicketId, reason: e.reason },
    });
    created++;
  }
  return created;
}

async function backfillUnreviewedSafetyEscalations(): Promise<number> {
  // `reviewedAt: null` is this model's own "not yet handled" state (see
  // SafetyEscalation's doc comment) — the queue-equivalent of "open".
  const escalations = await prisma.safetyEscalation.findMany({
    where: { reviewedAt: null },
    select: { id: true, userId: true, medicalConditions: true, injuries: true },
  });
  const skip = await alreadyQueued("SafetyEscalation", escalations.map((e) => e.id));
  let created = 0;
  for (const e of escalations) {
    if (skip.has(e.id)) continue;
    await createActionItem({
      type: "safety_escalation" as AdminActionItemType,
      entityType: "SafetyEscalation",
      entityId: e.id,
      severity: "high",
      metadata: {
        userId: e.userId,
        medicalConditionsCount: e.medicalConditions.length,
        injuriesCount: e.injuries.length,
      },
    });
    created++;
  }
  return created;
}

async function backfillPendingRelationshipChangeRequests(): Promise<number> {
  const requests = await prisma.relationshipChangeRequest.findMany({
    where: { status: "pending" },
    select: { id: true, relationshipId: true, userId: true, reason: true },
  });
  const skip = await alreadyQueued("RelationshipChangeRequest", requests.map((r) => r.id));
  let created = 0;
  for (const r of requests) {
    if (skip.has(r.id)) continue;
    await createActionItem({
      type: "relationship_change_pending" as AdminActionItemType,
      entityType: "RelationshipChangeRequest",
      entityId: r.id,
      severity: "medium",
      metadata: { relationshipId: r.relationshipId, userId: r.userId, reason: r.reason },
    });
    created++;
  }
  return created;
}

async function backfillPendingCredentials(): Promise<number> {
  const credentials = await prisma.professionalCredential.findMany({
    where: { status: "pending" },
    select: { id: true, professionalId: true, serviceType: true },
  });
  const skip = await alreadyQueued("ProfessionalCredential", credentials.map((c) => c.id));
  let created = 0;
  for (const c of credentials) {
    if (skip.has(c.id)) continue;
    await createActionItem({
      type: "credential_verification_pending" as AdminActionItemType,
      entityType: "ProfessionalCredential",
      entityId: c.id,
      severity: "medium",
      metadata: { professionalId: c.professionalId, serviceType: c.serviceType },
    });
    created++;
  }
  return created;
}

async function main() {
  const results = {
    supportTickets: await backfillSupportTickets(),
    refunds: await backfillPendingRefunds(),
    escalations: await backfillOpenEscalations(),
    safetyEscalations: await backfillUnreviewedSafetyEscalations(),
    relationshipChangeRequests: await backfillPendingRelationshipChangeRequests(),
    credentials: await backfillPendingCredentials(),
  };
  const total = Object.values(results).reduce((s, n) => s + n, 0);
  console.log("Admin Action Item backfill complete:");
  for (const [key, count] of Object.entries(results)) {
    console.log(`  ${key}: ${count} created`);
  }
  console.log(`  total: ${total} created`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
