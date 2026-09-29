import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { hashPassword } from "../../lib/password";
import {
  CreateGymInput,
  ListGymsQuery,
  UpdateGymCommercialInput,
  UpdateGymStatusInput,
  AddGymLocationInput,
  SetGymPortalPasswordInput,
} from "./gyms.schema";

/**
 * Gym Partner Lite — R1 Wave 1 (added 20 Sep 2026), Developer 3's real work
 * package §5 + §8 "Gym" + BR-GYM-002/003/004. See the `Gym`/`GymLocation`
 * models' own doc comments in schema.prisma for the full scope/decisions
 * context — this file is the schema + service layer only; no admin-web
 * screens (Wave 4) and no gym-facing portal (Wave 5) shipped in this
 * original comment's scope.
 *
 * **R2 Wave 5 (21 Sep 2026):** added `setGymPortalPassword` (the admin-side
 * bootstrap for the gym-facing portal's login — see its own doc comment)
 * as a new export alongside the rest of this file's Wave 1 functions,
 * which remain untouched. The portal itself (apps/gym-portal) and its auth
 * module (modules/gymAuth/) are new consumers of `getGymDetail`/
 * `getMemberActivationSummary` below (via thin gym-authed wrapper routes in
 * gyms.routes.ts) — neither function's own aggregation logic changed.
 *
 * **Status lifecycle:** application -> approved -> suspended, and
 * suspended -> approved (reactivation) — the "Partner application/status"
 * requirement, kept to exactly the three states the work package names.
 * Both transitions are claimed atomically (`updateMany` with a `status: {
 * in: allowedFrom }` filter, same discipline as
 * adminInfluencers.service.ts's markPayoutPaid()/payments.service.ts's
 * activatePayment()) so two concurrent admin actions on the same Gym can't
 * both "win" — exactly one succeeds, the other gets a real 409.
 *
 * **Invite code:** a real, unique, unguessable per-Gym code (same
 * alphabet/collision-retry discipline as lib/referralCode.ts), generated
 * once at creation. This is genuinely compatible with what
 * apps/user-mobile's acquisitionContext.ts already expects — that file
 * parses `fynrox://join?source=gym&code=<code>` into the raw string
 * `"gym:<code>"` and persists it on `User.acquisitionContext`. Resolving
 * that raw string into a real `User.gymId` relation at signup is
 * DELIBERATELY NOT done here — that's later-wave integration work per the
 * instructions this module was built under (acquisitionContext.ts itself
 * is untouched). `User.gymId` exists on the schema now so that wiring has
 * a real column to populate; until it lands, `getMemberActivationSummary`
 * below is honest, correct code that will always report zero members for
 * a brand-new Gym.
 *
 * **BR-GYM-003 boundary:** the ONLY per-member data this module ever
 * returns is the aggregate counts in `getMemberActivationSummary` — no
 * nutrition logs, medical/safety responses, progress photos, or private
 * AI conversation content is queried or exposed anywhere in this file.
 *
 * Deliberately does NOT import Prisma model types beyond the `Prisma`
 * namespace itself (for the JSON input type and P2002 error class) — same
 * hand-typed-row convention as adminInfluencers.service.ts/
 * adminSettlements.service.ts.
 */

const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I — same as referralCode.ts
const INVITE_CODE_LENGTH = 8;

function randomInviteCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CODE_ALPHABET[crypto.randomInt(INVITE_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Generates a `Gym.inviteCode` unique across the whole table. Collision
 * odds at 8 chars over a 32-symbol alphabet are astronomically small
 * (32^8 ≈ 1.1 trillion) — the retry loop exists for correctness, not
 * because collisions are expected in practice. Same shape as
 * lib/referralCode.ts's generateUniqueReferralCode().
 */
export async function generateUniqueGymInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomInviteCode();
    const existing = await prisma.gym.findUnique({ where: { inviteCode: code } });
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique gym invite code after 5 attempts");
}

type GymRow = {
  id: string;
  name: string;
  status: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  commissionPct: number;
  pricingModel: string;
  ratePerMemberCents: number;
  inviteCode: string;
  createdAt: Date;
  updatedAt: Date;
};

type LocationRow = {
  id: string;
  gymId: string;
  name: string;
  address: string;
  equipment: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Creates a Gym (application status by default) plus any locations given
 * up front. The invite code is generated server-side — never client-
 * supplied — so it's guaranteed genuinely random and unique.
 */
export async function createGym(actorAdminId: string, input: CreateGymInput) {
  const inviteCode = await generateUniqueGymInviteCode();

  let gym: GymRow;
  try {
    gym = (await prisma.gym.create({
      data: {
        name: input.name,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone ?? null,
        commissionPct: input.commissionPct,
        pricingModel: input.pricingModel,
        ratePerMemberCents: input.ratePerMemberCents,
        inviteCode,
        ...(input.locations && input.locations.length > 0
          ? {
              locations: {
                create: input.locations.map((l) => ({
                  name: l.name,
                  address: l.address,
                  equipment: l.equipment ?? null,
                })),
              },
            }
          : {}),
      },
    })) as GymRow;
  } catch (err) {
    // The unique-constraint-plus-caught-P2002 half of this codebase's two
    // established concurrency patterns (see payments.service.ts's
    // activatePayment()) — belt-and-suspenders against the astronomically
    // unlikely case that generateUniqueGymInviteCode()'s own read-then-
    // create window let a concurrent create() win the same code first.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ApiHttpError(409, "invite_code_collision", "Could not allocate a unique invite code — please retry");
    }
    throw err;
  }

  await recordAudit({
    actorAdminId,
    action: "gym.created",
    entityType: "Gym",
    entityId: gym.id,
    metadata: { name: gym.name, commissionPct: gym.commissionPct },
  });

  return getGymDetail(gym.id);
}

export async function listGyms(query: ListGymsQuery) {
  const where: Prisma.GymWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { contactName: { contains: query.search, mode: "insensitive" } },
            { contactEmail: { contains: query.search, mode: "insensitive" } },
            { inviteCode: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const gyms = await prisma.gym.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { locations: true, members: true } } },
  });

  return {
    gyms: (
      gyms as (GymRow & { _count: { locations: number; members: number } })[]
    ).map((g) => ({
      id: g.id,
      name: g.name,
      status: g.status,
      contactName: g.contactName,
      contactEmail: g.contactEmail,
      contactPhone: g.contactPhone,
      commissionPct: g.commissionPct,
      pricingModel: g.pricingModel,
      ratePerMemberCents: g.ratePerMemberCents,
      inviteCode: g.inviteCode,
      locationCount: g._count.locations,
      memberCount: g._count.members,
      createdAt: g.createdAt,
    })),
  };
}

export async function getGymDetail(gymId: string) {
  const gym = await prisma.gym.findUnique({
    where: { id: gymId },
    include: { locations: { orderBy: { createdAt: "asc" } } },
  });
  if (!gym) {
    throw new ApiHttpError(404, "gym_not_found", "Gym not found");
  }
  const g = gym as GymRow & { locations: LocationRow[] };

  return {
    id: g.id,
    name: g.name,
    status: g.status,
    contactName: g.contactName,
    contactEmail: g.contactEmail,
    contactPhone: g.contactPhone,
    commissionPct: g.commissionPct,
    pricingModel: g.pricingModel,
    ratePerMemberCents: g.ratePerMemberCents,
    // Honest "not configured" signal for whatever later-wave UI displays
    // this — see the Gym model's own doc comment on why 0 is inert, not a
    // real free rate.
    ratePerMemberConfigured: g.ratePerMemberCents > 0,
    inviteCode: g.inviteCode,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
    locations: g.locations.map((l) => ({
      id: l.id,
      name: l.name,
      address: l.address,
      equipment: l.equipment,
      createdAt: l.createdAt,
    })),
  };
}

export async function addGymLocation(actorAdminId: string, gymId: string, input: AddGymLocationInput) {
  const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { id: true } });
  if (!gym) {
    throw new ApiHttpError(404, "gym_not_found", "Gym not found");
  }

  const location = (await prisma.gymLocation.create({
    data: { gymId, name: input.name, address: input.address, equipment: input.equipment ?? null },
  })) as LocationRow;

  await recordAudit({
    actorAdminId,
    action: "gym.location_added",
    entityType: "GymLocation",
    entityId: location.id,
    metadata: { gymId, name: location.name },
  });

  return location;
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  // application -> approved is the normal partner-onboarding path.
  approved: ["application", "suspended"],
  // Only an approved partner can be suspended (nothing to suspend on a
  // still-pending application — reject that by simply never approving it,
  // there's no separate "rejected" state per the work package's own "keep
  // it simple, don't over-engineer more states than the doc names").
  suspended: ["approved"],
};

/**
 * Atomically transitions a Gym's status. Claims the row with `updateMany`
 * filtered on the allowed source statuses (same pattern as
 * adminInfluencers.service.ts's markPayoutPaid()) so two concurrent calls
 * — two admins, or a double-click — can't both succeed: exactly one
 * updateMany affects a row, the other gets a real 409 rather than silently
 * re-applying the same transition.
 */
export async function updateGymStatus(actorAdminId: string, gymId: string, input: UpdateGymStatusInput) {
  const allowedFrom = STATUS_TRANSITIONS[input.status];
  if (!allowedFrom) {
    throw new ApiHttpError(422, "invalid_status", `Unsupported target status: ${input.status}`);
  }

  const claimed = await prisma.gym.updateMany({
    where: { id: gymId, status: { in: allowedFrom as Array<"application" | "approved" | "suspended"> } },
    data: { status: input.status as "application" | "approved" | "suspended" },
  });

  if (claimed.count === 0) {
    const existing = await prisma.gym.findUnique({ where: { id: gymId }, select: { status: true } });
    if (!existing) {
      throw new ApiHttpError(404, "gym_not_found", "Gym not found");
    }
    throw new ApiHttpError(
      409,
      "invalid_status_transition",
      `Cannot move a gym from ${(existing as { status: string }).status} to ${input.status}`,
    );
  }

  await recordAudit({
    actorAdminId,
    action: `gym.status_${input.status}`,
    entityType: "Gym",
    entityId: gymId,
    metadata: { status: input.status, note: input.note ?? null },
  });

  return getGymDetail(gymId);
}

/**
 * Admin-editable commercial fields — commission % and the
 * PRODUCT_DECISION_REQUIRED pricing placeholder (see the Gym model's own
 * doc comment). Never gated on status — a still-`application` gym's
 * commercial terms can be set/negotiated before approval.
 */
export async function updateGymCommercial(actorAdminId: string, gymId: string, input: UpdateGymCommercialInput) {
  const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { id: true } });
  if (!gym) {
    throw new ApiHttpError(404, "gym_not_found", "Gym not found");
  }

  await prisma.gym.update({
    where: { id: gymId },
    data: {
      ...(input.commissionPct !== undefined ? { commissionPct: input.commissionPct } : {}),
      ...(input.pricingModel !== undefined ? { pricingModel: input.pricingModel } : {}),
      ...(input.ratePerMemberCents !== undefined ? { ratePerMemberCents: input.ratePerMemberCents } : {}),
    },
  });

  await recordAudit({
    actorAdminId,
    action: "gym.commercial_updated",
    entityType: "Gym",
    entityId: gymId,
    metadata: input,
  });

  return getGymDetail(gymId);
}

/**
 * Gym Partner Lite portal bootstrap (R2 Wave 5, 21 Sep 2026) — admin-set
 * password for a Gym's own portal login (apps/gym-portal). A brand-new Gym
 * has no `gymPasswordHash` at all (see the model's own doc comment) so it
 * cannot log in anywhere until an admin runs this once. This was the
 * genuine, undecided product call this wave named explicitly ("your call,
 * but keep it simple and real") — an admin-set password on the existing
 * Gym Profile screen was chosen over a token-based self-serve first-login
 * link because it needs zero new infrastructure (no email delivery is even
 * configured in every environment — see lib/mailer.ts/SMTP_HOST's own
 * "leave blank to run unconfigured" precedent) and matches how every other
 * *admin-managed* identity in this build already gets its first credential
 * (AdminUser rows are seed-script/admin-console-created with a real
 * password from day one, never a self-serve link). Bcrypt-hashed via the
 * same lib/password.ts every other password in this codebase uses — never
 * stored or logged in plaintext. Re-runnable (rotates the password), not
 * one-time-only, so a locked-out gym partner can always be re-onboarded by
 * an admin without a separate "reset" endpoint.
 */
export async function setGymPortalPassword(actorAdminId: string, gymId: string, input: SetGymPortalPasswordInput) {
  const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { id: true } });
  if (!gym) {
    throw new ApiHttpError(404, "gym_not_found", "Gym not found");
  }

  const gymPasswordHash = await hashPassword(input.password);
  await prisma.gym.update({ where: { id: gymId }, data: { gymPasswordHash } });

  await recordAudit({
    actorAdminId,
    action: "gym.portal_password_set",
    entityType: "Gym",
    entityId: gymId,
    // Never the password/hash itself in audit metadata.
  });

  return { gymId, portalPasswordSet: true };
}

/**
 * Real, honest read-only aggregate — "First-workout and privacy-safe
 * activity/re-entry indicators" per the work package §5. Computed
 * directly from User/OnboardingProfile/WorkoutSession via the real
 * `User.gymId` relation added this wave; see this file's own doc comment
 * for why that relation is always empty today (acquisitionContext
 * resolution is later-wave work) — this function is correct code
 * operating on real (if currently zero) data, not a fabricated number.
 *
 * BR-GYM-003 boundary: only counts are returned, never a member list or
 * any per-member identifying/sensitive field.
 */
export async function getMemberActivationSummary(gymId: string) {
  const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { id: true } });
  if (!gym) {
    throw new ApiHttpError(404, "gym_not_found", "Gym not found");
  }

  const [memberCount, onboardedCount, firstWorkoutCount] = await Promise.all([
    prisma.user.count({ where: { gymId } }),
    prisma.user.count({ where: { gymId, onboardingProfile: { completedAt: { not: null } } } }),
    prisma.user.count({ where: { gymId, workoutSessions: { some: { status: "completed" } } } }),
  ]);

  return {
    gymId,
    memberCount,
    onboardingCompletedCount: onboardedCount,
    firstWorkoutCompletedCount: firstWorkoutCount,
  };
}
