import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";
import { recordAudit } from "../../middleware/auditLog";
import type { LinkPartnerCodeInput } from "./userPartner.schema";

type LinkWithGym = NonNullable<Awaited<ReturnType<typeof loadLink>>>;

function loadLink(userId: string) {
  return prisma.userPartnerLink.findUnique({
    where: { userId },
    include: { gym: { include: { locations: { orderBy: { createdAt: "asc" } } } } },
  });
}

/** What the member sees about their linked partner. Never exposes contact/commercial fields. */
function toPartnerView(link: LinkWithGym) {
  return {
    code: link.code,
    linkedAt: link.linkedAt.toISOString(),
    // The gym is no longer an active partner (suspended): the link stays visible but is flagged.
    active: link.gym.status === "approved",
    gym: {
      id: link.gym.id,
      name: link.gym.name,
      locations: link.gym.locations.map((l) => ({
        id: l.id,
        name: l.name,
        address: l.address,
        equipment: l.equipment,
      })),
    },
    // No per-code member offers exist in this build; never fabricated.
    offer: null as null,
  };
}

export async function getPartner(userId: string) {
  const link = await loadLink(userId);
  return { partner: link ? toPartnerView(link) : null };
}

/**
 * Validate a partner code against the Gym model. Errors:
 *  - 404 partner_code_not_found: no such code, or the gym is still only an application
 *  - 410 partner_code_expired: the gym was suspended, so its code no longer works
 *  - 409 partner_code_already_linked: the member already has a code (pass `replace` to change it)
 */
export async function linkPartnerCode(userId: string, input: LinkPartnerCodeInput) {
  const gym = await prisma.gym.findFirst({
    where: { inviteCode: { equals: input.code, mode: "insensitive" } },
    select: { id: true, status: true, inviteCode: true },
  });
  if (!gym || gym.status === "application") {
    throw new ApiHttpError(404, "partner_code_not_found", "We could not find that partner code. Check the spelling or ask your gym.");
  }
  if (gym.status === "suspended") {
    throw new ApiHttpError(410, "partner_code_expired", "That partner code is no longer active.");
  }

  const existing = await prisma.userPartnerLink.findUnique({ where: { userId } });
  if (existing && !input.replace) {
    throw new ApiHttpError(409, "partner_code_already_linked", "Your account is already linked to a partner code.");
  }

  await prisma.$transaction([
    prisma.userPartnerLink.upsert({
      where: { userId },
      create: { userId, gymId: gym.id, code: gym.inviteCode },
      update: { gymId: gym.id, code: gym.inviteCode, linkedAt: new Date() },
    }),
    prisma.user.update({ where: { id: userId }, data: { gymId: gym.id } }),
  ]);

  await recordAudit({
    actorId: userId,
    action: "user.partner_code_linked",
    entityType: "UserPartnerLink",
    entityId: userId,
    metadata: { gymId: gym.id, replaced: Boolean(existing) },
  });

  return getPartner(userId);
}

export async function removePartnerCode(userId: string) {
  const existing = await prisma.userPartnerLink.findUnique({ where: { userId } });
  if (!existing) throw new ApiHttpError(404, "partner_code_not_linked", "No partner code is linked.");

  await prisma.$transaction([
    prisma.userPartnerLink.delete({ where: { userId } }),
    prisma.user.updateMany({ where: { id: userId, gymId: existing.gymId }, data: { gymId: null } }),
  ]);

  await recordAudit({
    actorId: userId,
    action: "user.partner_code_removed",
    entityType: "UserPartnerLink",
    entityId: userId,
    metadata: { gymId: existing.gymId },
  });

  return { removed: true as const };
}
