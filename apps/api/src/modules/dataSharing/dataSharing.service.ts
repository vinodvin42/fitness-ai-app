import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";
import { recordAudit } from "../../middleware/auditLog";

/**
 * Profile & Settings 12 - per-professional data sharing. A professional with
 * an ACTIVE relationship sees a client's health data only if (a) the client
 * has granted the health_data_processing consent (existing gate) AND (b) the
 * relevant flag below is on for THAT professional. No row = defaults:
 * foodLogs on (existing behaviour), steps / sleepRecovery off (newly
 * exposed data classes stay private until opted in).
 */

export type SharingFlags = { steps: boolean; foodLogs: boolean; sleepRecovery: boolean };
export const DEFAULT_SHARING: SharingFlags = { steps: false, foodLogs: true, sleepRecovery: false };

export async function getSharingFlags(userId: string, professionalId: string): Promise<SharingFlags> {
  const row = await prisma.professionalDataSharing.findUnique({
    where: { userId_professionalId: { userId, professionalId } },
  });
  return row ? { steps: row.steps, foodLogs: row.foodLogs, sleepRecovery: row.sleepRecovery } : { ...DEFAULT_SHARING };
}

async function assertActiveRelationship(userId: string, professionalId: string) {
  const rel = await prisma.relationship.findFirst({
    where: { userId, professionalId, status: "active" },
    include: { professional: { select: { fullName: true } } },
  });
  if (!rel) throw new ApiHttpError(404, "professional_not_found", "You have no active relationship with this professional");
  return rel.professional.fullName;
}

export async function getSharing(userId: string, professionalId: string) {
  const professionalFullName = await assertActiveRelationship(userId, professionalId);
  return { professionalId, professionalFullName, ...(await getSharingFlags(userId, professionalId)) };
}

export async function updateSharing(userId: string, professionalId: string, input: Partial<SharingFlags>) {
  const professionalFullName = await assertActiveRelationship(userId, professionalId);
  const current = await getSharingFlags(userId, professionalId);
  const next = { ...current, ...input };
  await prisma.professionalDataSharing.upsert({
    where: { userId_professionalId: { userId, professionalId } },
    create: { userId, professionalId, ...next },
    update: input,
  });
  await recordAudit({
    actorId: userId,
    action: "user.data_sharing_updated",
    entityType: "Professional",
    entityId: professionalId,
    metadata: next,
  });
  return { professionalId, professionalFullName, ...next };
}

/** One entry per professional the user has an active relationship with (distinct), with their flags. */
export async function listSharing(userId: string) {
  const rels = await prisma.relationship.findMany({
    where: { userId, status: "active" },
    include: { professional: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: "asc" },
  });
  const seen = new Set<string>();
  const items = [];
  for (const r of rels) {
    if (seen.has(r.professionalId)) continue;
    seen.add(r.professionalId);
    items.push({
      professionalId: r.professionalId,
      professionalFullName: r.professional.fullName,
      ...(await getSharingFlags(userId, r.professionalId)),
    });
  }
  return { items };
}
