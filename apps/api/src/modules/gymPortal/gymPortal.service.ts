import QRCode from "qrcode";
import { prisma } from "../../db/prisma";
import { gymInviteUrl } from "@fitness-ai-app/config";
import { recordAudit } from "../../middleware/auditLog";
import { createActionItem } from "../../lib/adminActionQueue";
import { ApiHttpError } from "../../middleware/errorHandler";

/**
 * Gym Partner Lite — the portal's own surface beyond sign-in and the
 * dashboard (G-M2 through G-M5).
 *
 * Every function here is scoped to the gym id on the verified token; a
 * gym can only ever read or change its own rows. BR-GYM-003 is the
 * standing constraint: "Gyms see operational aggregates only ... never
 * health, nutrition logs, photos or AI chats", which is why nothing in
 * this module touches a User row or returns a member list.
 *
 * Deliberately does NOT import Prisma model types — see apps/api/README.md.
 */

/**
 * How long an equipment self-report is trusted before the portal asks
 * the gym to confirm it is still accurate.
 *
 * 180 days is a judgement, not a rule from the spec: long enough that a
 * stable gym is not nagged, short enough that a year-old list does not
 * quietly drive plan generation. It lives here as a named constant so
 * changing it is one edit rather than a hunt through date arithmetic.
 */
export const EQUIPMENT_STALE_AFTER_DAYS = 180;

function isStale(confirmedAt: Date | null, storedStatus: string): boolean {
  if (storedStatus === "stale") return true;
  if (!confirmedAt) return true; // never confirmed since the field existed
  const ageDays = (Date.now() - confirmedAt.getTime()) / (24 * 60 * 60 * 1000);
  return ageDays > EQUIPMENT_STALE_AFTER_DAYS;
}

/**
 * The gym's locations with their equipment profile and staleness.
 *
 * Staleness is computed on read rather than written by a scheduled job,
 * for the same reason the subscription `expiring` state is derived: this
 * codebase has no worker, so a stored flag would be wrong for every gym
 * nobody happened to look at. The stored `equipmentStatus` still matters
 * — an admin or the gym can mark a profile stale explicitly — so the
 * read honours both.
 */
export async function listLocations(gymId: string) {
  const locations = await prisma.gymLocation.findMany({
    where: { gymId },
    orderBy: { createdAt: "asc" },
  });

  return locations.map((l) => ({
    id: l.id,
    name: l.name,
    address: l.address,
    equipment: l.equipment,
    equipmentConfirmedAt: l.equipmentConfirmedAt,
    // The one signal U-M11 and the portal's reconfirm screen both read.
    equipmentStale: isStale(l.equipmentConfirmedAt, l.equipmentStatus),
    hasEquipmentProfile: Boolean(l.equipment?.trim()),
  }));
}

async function ownedLocation(gymId: string, locationId: string) {
  const location = await prisma.gymLocation.findFirst({ where: { id: locationId, gymId } });
  // 404 rather than 403 for a location belonging to another gym: a
  // portal that distinguishes "not yours" from "doesn't exist" lets one
  // partner probe for another's location ids.
  if (!location) throw new ApiHttpError(404, "location_not_found", "Location not found");
  return location;
}

/** The gym edits its own equipment list, which also re-confirms it. */
export async function updateEquipment(gymId: string, locationId: string, equipment: string) {
  const location = await ownedLocation(gymId, locationId);

  const updated = await prisma.gymLocation.update({
    where: { id: locationId },
    data: { equipment, equipmentStatus: "current", equipmentConfirmedAt: new Date() },
  });

  await recordAudit({
    action: "gym.equipment_updated",
    entityType: "GymLocation",
    entityId: locationId,
    ruleId: "BR-GYM-003",
    stateBefore: { equipment: location.equipment, status: location.equipmentStatus },
    stateAfter: { equipment, status: "current" },
    metadata: { gymId },
  });

  return updated;
}

/**
 * "Yes, this is still accurate" — the reconfirm action, distinct from an
 * edit. A gym whose equipment has not changed should not have to retype
 * it to clear a stale warning, and making them would train them to paste
 * anything to make the banner go away.
 */
export async function reconfirmEquipment(gymId: string, locationId: string) {
  const location = await ownedLocation(gymId, locationId);
  if (!location.equipment?.trim()) {
    throw new ApiHttpError(
      422,
      "no_equipment_profile",
      "Add an equipment list before confirming it",
    );
  }

  const updated = await prisma.gymLocation.update({
    where: { id: locationId },
    data: { equipmentStatus: "current", equipmentConfirmedAt: new Date() },
  });

  await recordAudit({
    action: "gym.equipment_reconfirmed",
    entityType: "GymLocation",
    entityId: locationId,
    ruleId: "BR-GYM-003",
    stateAfter: { status: "current", confirmedAt: updated.equipmentConfirmedAt },
    metadata: { gymId },
  });

  return updated;
}

/**
 * G-M4 — "QR download / print (PNG, PDF poster)".
 *
 * Returns the invite link plus a PNG data URL the portal can offer as a
 * download. The link is built by the shared brand helper, so Q4's
 * lowercase fynrox.app/gym/{code} holds in one place rather than being
 * re-spelled here.
 *
 * A PDF poster is NOT generated: it needs a layout, a logo asset and a
 * PDF dependency this API does not have, and a poster with placeholder
 * branding is worse than none. The PNG is the part that works today.
 */
export async function getInviteAssets(gymId: string) {
  const gym = await prisma.gym.findUnique({
    where: { id: gymId },
    select: { inviteCode: true, name: true, status: true },
  });
  if (!gym) throw new ApiHttpError(404, "gym_not_found", "Gym not found");

  const url = gymInviteUrl(gym.inviteCode);
  const qrPngDataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2 });

  return {
    inviteCode: gym.inviteCode,
    url,
    qrPngDataUrl,
    // An invite from a gym that is not approved will not resolve — say so
    // here rather than letting them print a poster that does not work.
    live: gym.status === "approved",
    posterPdfAvailable: false,
  };
}

/** Partnership status — a summary, never the negotiated rates. */
export async function getPartnership(gymId: string) {
  const gym = await prisma.gym.findUnique({
    where: { id: gymId },
    select: {
      status: true,
      pricingModel: true,
      ratePerMemberCents: true,
      commissionPct: true,
      createdAt: true,
      _count: { select: { locations: true, members: true } },
    },
  });
  if (!gym) throw new ApiHttpError(404, "gym_not_found", "Gym not found");

  return {
    status: gym.status,
    partnerSince: gym.createdAt,
    locationCount: gym._count.locations,
    // An aggregate count, which BR-GYM-003 permits — never the members.
    memberCount: gym._count.members,
    // Whether terms exist, not what they are. The raw negotiated figures
    // are an admin<->partner matter and the existing /gym-portal/me route
    // already trims them for the same reason.
    commercialConfigured: gym.ratePerMemberCents > 0 || gym.commissionPct > 0,
    pricingModel: gym.pricingModel,
  };
}

// ---- Trainer help requests ------------------------------------------

export async function listHelpRequests(gymId: string) {
  return prisma.gymHelpRequest.findMany({
    where: { gymId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { location: { select: { id: true, name: true } } },
  });
}

export async function getHelpRequest(gymId: string, id: string) {
  const row = await prisma.gymHelpRequest.findFirst({
    where: { id, gymId },
    include: { location: { select: { id: true, name: true } } },
  });
  if (!row) throw new ApiHttpError(404, "help_request_not_found", "Request not found");
  return row;
}

export async function createHelpRequest(
  gymId: string,
  input: {
    category: "trainer_support" | "equipment" | "member_onboarding" | "billing" | "other";
    subject: string;
    body: string;
    locationId?: string | null;
    gymReference?: string | null;
  },
) {
  if (input.locationId) await ownedLocation(gymId, input.locationId);

  const created = await prisma.gymHelpRequest.create({
    data: {
      gymId,
      category: input.category,
      subject: input.subject,
      body: input.body,
      locationId: input.locationId ?? null,
      gymReference: input.gymReference ?? null,
    },
  });

  await createActionItem({
    type: "gym_help_request",
    entityType: "GymHelpRequest",
    entityId: created.id,
    severity: input.category === "billing" ? "medium" : "low",
    metadata: { gymId, category: input.category },
  });

  await recordAudit({
    action: "gym.help_request_created",
    entityType: "GymHelpRequest",
    entityId: created.id,
    ruleId: "BR-GYM-003",
    stateAfter: { status: "open", category: input.category },
    metadata: { gymId },
  });

  return created;
}
