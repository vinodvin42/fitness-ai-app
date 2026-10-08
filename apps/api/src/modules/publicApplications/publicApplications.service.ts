import { prisma } from "../../db/prisma";
import { createActionItem } from "../../lib/adminActionQueue";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import type { CreateApplicationInput } from "./publicApplications.schema";

/**
 * Spec §8 — the Public Website's forms, stored.
 *
 * Until now "Apply" on the For Gyms page was a `mailto:` link and the
 * Early Access page did not exist. That is why the spec's four form
 * states (success, error, already-registered, consent) had nowhere to
 * come from: a mailto has exactly one outcome, "the mail client
 * opened", and it is not a fact the business can ever act on.
 *
 * Deliberately does NOT import Prisma model types — see apps/api/README.md.
 */

/**
 * Which submissions an admin is expected to work, and which are merely
 * recorded. Early Access is a list, not a queue — putting several
 * thousand signups in the action queue would bury the twelve partner
 * applications that actually need a decision.
 */
const QUEUED_KINDS = new Set(["gym", "creator", "professional"]);

export type CreateApplicationResult =
  | { outcome: "created"; id: string }
  | { outcome: "already_registered"; id: string; since: Date };

export async function createApplication(input: CreateApplicationInput): Promise<CreateApplicationResult> {
  const existing = await prisma.publicApplication.findUnique({
    where: { kind_email: { kind: input.kind, email: input.email } },
    select: { id: true, createdAt: true },
  });

  // The already-registered state is a SUCCESS for the visitor: they are
  // on the list, which is what they came to do. Returning an error here
  // would teach people to submit again with a second address, which is
  // how a clean list turns into a dirty one.
  if (existing) {
    return { outcome: "already_registered", id: existing.id, since: existing.createdAt };
  }

  const created = await prisma.publicApplication.create({
    data: {
      kind: input.kind,
      email: input.email,
      fullName: input.fullName,
      phone: input.phone ?? null,
      organisation: input.organisation ?? null,
      city: input.city ?? null,
      detail: input.detail ?? null,
      message: input.message ?? null,
      sourceCode: input.sourceCode ?? null,
      sourceKind: input.sourceKind ?? null,
      // Both recorded as given. `consentContact` can only be true here
      // (the schema refuses anything else), but it is stored rather than
      // assumed so the row itself is the evidence.
      consentContact: input.consentContact,
      consentMarketing: input.consentMarketing,
    },
    select: { id: true },
  });

  if (QUEUED_KINDS.has(input.kind)) {
    await createActionItem({
      type: "partner_application_received",
      entityType: "public_application",
      entityId: created.id,
      severity: "medium",
      metadata: { kind: input.kind, organisation: input.organisation ?? null },
    });
  }

  return { outcome: "created", id: created.id };
}

export async function listApplications(query: {
  kind?: string;
  status?: string;
  take: number;
  skip: number;
}) {
  const where = {
    ...(query.kind ? { kind: query.kind as never } : {}),
    ...(query.status ? { status: query.status as never } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.publicApplication.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: query.take,
      skip: query.skip,
      select: {
        id: true,
        kind: true,
        status: true,
        email: true,
        fullName: true,
        phone: true,
        organisation: true,
        city: true,
        detail: true,
        message: true,
        sourceCode: true,
        sourceKind: true,
        consentMarketing: true,
        adminNote: true,
        reviewedAt: true,
        createdAt: true,
      },
    }),
    prisma.publicApplication.count({ where }),
  ]);

  return { items, total };
}

export async function updateApplication(
  id: string,
  adminId: string,
  input: { status: string; adminNote?: string },
) {
  const existing = await prisma.publicApplication.findUnique({
    where: { id },
    select: { id: true, status: true, kind: true },
  });
  if (!existing) throw new ApiHttpError(404, "not_found", "Application not found");

  const updated = await prisma.publicApplication.update({
    where: { id },
    data: {
      status: input.status as never,
      adminNote: input.adminNote ?? null,
      reviewedByAdminId: adminId,
      reviewedAt: new Date(),
    },
    select: { id: true, status: true },
  });

  await recordAudit({
    actorAdminId: adminId,
    action: "public_application.status_changed",
    entityType: "public_application",
    entityId: id,
    stateBefore: { status: existing.status },
    stateAfter: { status: updated.status },
    metadata: { kind: existing.kind },
  });

  return updated;
}
