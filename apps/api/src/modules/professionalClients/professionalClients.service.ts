import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";
import * as plansService from "../plans/plans.service";
import type { DecideRecommendationInput } from "../plans/plans.schema";

/**
 * Coach Client Profile (docs/coach/03-screen-inventory.md §D), added 31 Aug
 * 2026 — the coach-facing counterpart to apps/user-mobile's "My Professional
 * Team". Backs apps/coach-mobile's Clients tab (previously an honest "Coming
 * soon" placeholder, see MainTabs.tsx's own doc comment naming this exact
 * gap).
 *
 * **What's real vs. a deliberate, documented boundary:**
 * - The client list and each profile are backed by real `Relationship`/
 *   `Booking`/`OnboardingProfile` rows — a coach sees only users they have
 *   an ACTIVE `Relationship` with (authorization enforced in
 *   `getClientProfile` below, not just filtered in the UI), so a coach can
 *   never open an arbitrary userId they aren't actually coaching.
 * - Coaching-relevant onboarding fields (goals, training level, diet type)
 *   are surfaced because they're the information a coach needs to coach.
 *   Genuinely sensitive health data — age, weight, height, medical
 *   conditions, injuries — is deliberately NOT exposed here: it sits behind
 *   the same access boundary Module 02's `SensitiveDataAccessRequest` gates
 *   for admins (a supervisor-approved, logged consent workflow), and no
 *   equivalent coach-facing consent flow exists in this build, so those
 *   fields are named in `notAvailable` rather than handed to a coach
 *   silently. Same "omit-with-honesty, don't fabricate or over-share"
 *   precedent every admin module in this build uses.
 * - Session history reuses the exact Booking shape and 50-row past cap as
 *   coaching.service.ts's `listMySchedule`, scoped to this one client.
 *
 * Deliberately does NOT import Prisma model types, for the same reason as
 * every other service in this build — the un-generated `@prisma/client`
 * stub has no real model exports in this sandbox; see apps/api/README.md.
 */

const PAST_SESSION_LIMIT = 50;

const CLIENT_SENSITIVE_NOT_AVAILABLE = [
  "age",
  "weightKg",
  "heightCm",
  "medicalConditions",
  "injuries",
];

type RelationshipRow = {
  userId: string;
  serviceType: string;
  createdAt: Date;
  user: { fullName: string };
};

type BookingRow = {
  id: string;
  scheduledAt: Date;
  durationMinutes: number;
  status: string;
  offering: { label: string; serviceType: string | null };
};

/** Distinct service types across a client's active relationships, in a stable order. */
function distinctServiceTypes(rows: { serviceType: string }[]): string[] {
  const seen = new Set<string>();
  for (const r of rows) seen.add(r.serviceType);
  return [...seen].sort();
}

export async function listClients(professionalId: string) {
  const relationships = (await prisma.relationship.findMany({
    where: { professionalId, status: "active" },
    include: { user: { select: { fullName: true } } },
    orderBy: { createdAt: "asc" },
  })) as RelationshipRow[];

  // Group active relationships by client — a single client may hold both a
  // fitness and a nutrition relationship with the same coach.
  const byUser = new Map<string, RelationshipRow[]>();
  for (const rel of relationships) {
    const list = byUser.get(rel.userId) ?? [];
    list.push(rel);
    byUser.set(rel.userId, list);
  }

  const now = new Date();
  const clients = await Promise.all(
    [...byUser.entries()].map(async ([userId, rels]) => {
      const [sessionsCompleted, lastSession, nextSession] = await Promise.all([
        prisma.booking.count({
          where: { professionalId, userId, status: "confirmed", scheduledAt: { lte: now } },
        }),
        prisma.booking.findFirst({
          where: { professionalId, userId, status: "confirmed", scheduledAt: { lte: now } },
          orderBy: { scheduledAt: "desc" },
          select: { scheduledAt: true },
        }),
        prisma.booking.findFirst({
          where: { professionalId, userId, status: "confirmed", scheduledAt: { gt: now } },
          orderBy: { scheduledAt: "asc" },
          select: { scheduledAt: true },
        }),
      ]);

      return {
        userId,
        fullName: rels[0].user.fullName,
        serviceTypes: distinctServiceTypes(rels),
        activeSince: rels[0].createdAt,
        sessionsCompleted,
        lastSessionAt: (lastSession as { scheduledAt: Date } | null)?.scheduledAt ?? null,
        nextSessionAt: (nextSession as { scheduledAt: Date } | null)?.scheduledAt ?? null,
      };
    }),
  );

  // Most-recently-active first (soonest upcoming, else most recent past).
  clients.sort((a, b) => {
    const aTime = (a.nextSessionAt ?? a.lastSessionAt ?? a.activeSince).getTime();
    const bTime = (b.nextSessionAt ?? b.lastSessionAt ?? b.activeSince).getTime();
    return bTime - aTime;
  });

  return { clients };
}

type OnboardingRow = {
  goals: string[];
  trainingLevel: string | null;
  dietType: string | null;
} | null;

function toScheduleItem(b: BookingRow) {
  return {
    id: b.id,
    // The client is fixed context on this screen, so clientFullName is the
    // client themselves — kept in the shape for parity with CoachScheduleItem.
    clientFullName: "",
    offeringLabel: b.offering.label,
    serviceType: b.offering.serviceType,
    scheduledAt: b.scheduledAt,
    durationMinutes: b.durationMinutes,
    status: b.status,
  };
}

/**
 * The real "does this professional actually coach this user" gate, shared
 * by every professional-authed endpoint scoped to one client — same
 * precedent as `getClientProfile` below (a 404, not a 403, so an endpoint
 * never confirms a userId even exists to a coach with no active
 * Relationship to it). Kept as its own small helper so
 * `listClientRecommendations`/`decideClientRecommendation` below (Wave 2.4,
 * 20 Sep 2026 — coach review of a client's AI Plan Recommendations, see
 * plans.service.ts#decideRecommendation's own doc comment on the
 * `decidedByRole: "professional"` parameter this wires up) don't need to
 * duplicate the relationship query.
 */
async function assertActiveRelationship(professionalId: string, userId: string): Promise<void> {
  const count = await prisma.relationship.count({ where: { professionalId, userId, status: "active" } });
  if (count === 0) {
    throw new ApiHttpError(404, "client_not_found", "This client could not be found");
  }
}

export async function getClientProfile(professionalId: string, userId: string) {
  const relationships = (await prisma.relationship.findMany({
    where: { professionalId, userId, status: "active" },
    include: { user: { select: { fullName: true } } },
    orderBy: { createdAt: "asc" },
  })) as RelationshipRow[];

  // Authorization: no active relationship means this coach isn't coaching
  // this user — a 404, not a 403, so the endpoint never confirms the userId
  // even exists to a coach who has no business seeing it.
  if (relationships.length === 0) {
    throw new ApiHttpError(404, "client_not_found", "This client could not be found");
  }

  const now = new Date();
  const [onboarding, upcomingRows, pastRows, totalCompleted, pastTotal] = await Promise.all([
    prisma.onboardingProfile.findUnique({
      where: { userId },
      select: { goals: true, trainingLevel: true, dietType: true },
    }),
    prisma.booking.findMany({
      where: { professionalId, userId, status: "confirmed", scheduledAt: { gte: now } },
      include: { offering: { select: { label: true, serviceType: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.booking.findMany({
      where: { professionalId, userId, scheduledAt: { lt: now } },
      include: { offering: { select: { label: true, serviceType: true } } },
      orderBy: { scheduledAt: "desc" },
      take: PAST_SESSION_LIMIT,
    }),
    prisma.booking.count({
      where: { professionalId, userId, status: "confirmed", scheduledAt: { lt: now } },
    }),
    prisma.booking.count({ where: { professionalId, userId, scheduledAt: { lt: now } } }),
  ]);

  const profile = onboarding as OnboardingRow;

  return {
    userId,
    fullName: relationships[0].user.fullName,
    serviceTypes: distinctServiceTypes(relationships),
    activeSince: relationships[0].createdAt,
    coaching: {
      goals: profile?.goals ?? [],
      trainingLevel: profile?.trainingLevel ?? null,
      dietType: profile?.dietType ?? null,
    },
    sessions: {
      upcoming: (upcomingRows as BookingRow[]).map(toScheduleItem),
      past: (pastRows as BookingRow[]).map(toScheduleItem),
      pastTruncated: pastTotal > PAST_SESSION_LIMIT,
      totalCompleted,
    },
    notAvailable: CLIENT_SENSITIVE_NOT_AVAILABLE,
  };
}

// ---- Coach review of a client's Plan Recommendations (Wave 2.4, 20 Sep
// 2026) -----------------------------------------------------------------
// plans.service.ts's `decideRecommendation()` has accepted a
// `decidedByRole: "professional"` parameter since it was written (14 Sep
// 2026) — see that file's own top comment — but nothing ever called it
// that way, and no coach-mobile screen let a coach actually review one.
// This is that wiring, not new decision logic: the exact same
// `decideRecommendation()` a user's own "Why This Changed" screen calls
// (apps/user-mobile's WhyThisChangedScreen.tsx), gated on the same real
// active-`Relationship` check every other client-scoped endpoint in this
// file already uses, and scoped to `active` (the real "awaiting a
// decision" `RecommendationStatus`) recommendations only.

type ClientRecommendationRow = {
  id: string;
  planId: string;
  kind: string;
  status: "active" | "accepted" | "modified" | "declined" | "no_change" | "superseded";
  rationale: string;
  suggestedProgramId: string | null;
  decidedByRole: string | null;
  decidedAt: Date | null;
  createdAt: Date;
};

async function toClientRecommendationDTO(r: ClientRecommendationRow) {
  const suggestedProgramName = r.suggestedProgramId
    ? (await prisma.program.findUnique({ where: { id: r.suggestedProgramId }, select: { name: true } }))?.name ?? null
    : null;
  return {
    id: r.id,
    planId: r.planId,
    kind: r.kind as "no_change" | "switch_program",
    status: r.status,
    rationale: r.rationale,
    suggestedProgramId: r.suggestedProgramId,
    suggestedProgramName,
    decidedByRole: r.decidedByRole as "user" | "professional" | null,
    decidedAt: r.decidedAt,
    createdAt: r.createdAt,
  };
}

/** GET /professionals/me/clients/:userId/recommendations — every pending (real `active`-status) Recommendation for this client, gated on a real active Relationship. Most recent first. */
export async function listClientRecommendations(professionalId: string, userId: string) {
  await assertActiveRelationship(professionalId, userId);

  const rows = (await prisma.recommendation.findMany({
    where: { userId, status: "active" },
    orderBy: { createdAt: "desc" },
  })) as ClientRecommendationRow[];

  return { recommendations: await Promise.all(rows.map(toClientRecommendationDTO)) };
}

/**
 * POST /professionals/me/clients/:userId/recommendations/:id/decide — a
 * professional deciding on a client's Recommendation. Calls the SAME
 * `decideRecommendation()` a self-serve user's own decide endpoint calls
 * (plans.routes.ts's `POST /recommendations/:id/decide`), just with
 * `decidedByRole: "professional"` — no duplicated decision logic, no
 * change to what that function does for existing user callers. The
 * active-Relationship check above is this endpoint's real authorization;
 * `decideRecommendation()`'s own `rec.userId !== userId` check (userId
 * here is the real client id from the route, established as safe to reach
 * once assertActiveRelationship has passed) still guards against deciding
 * a recommendation that isn't even this client's.
 *
 * Passes `professionalId` through as `decideRecommendation()`'s new
 * (20 Sep 2026) optional `actorProfessionalId` parameter — that function's
 * own `userId` argument has to be the CLIENT id (its ownership check
 * requires it), so without a separate real actor id its audit write
 * (`recordAudit`'s `actorProfessionalId`) would try to record the
 * client's own id against `AuditLog.actorProfessionalId`'s FK to
 * `Professional`, which is a different id space entirely and 500s the
 * request — a real bug this wave's own integration test caught, since
 * this was the first real caller ever to exercise that branch. See
 * plans.service.ts#decideRecommendation's own updated doc comment.
 */
export async function decideClientRecommendation(
  professionalId: string,
  userId: string,
  recommendationId: string,
  input: DecideRecommendationInput,
): Promise<{
  id: string;
  planId: string;
  kind: "no_change" | "switch_program";
  status: "active" | "accepted" | "modified" | "declined" | "no_change" | "superseded";
  rationale: string;
  suggestedProgramId: string | null;
  suggestedProgramName: string | null;
  decidedByRole: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}> {
  await assertActiveRelationship(professionalId, userId);
  // Explicit return type above (rather than inferring plansService's own
  // `RecommendationDTO`) — that interface isn't exported, same
  // "un-generated Prisma client stub" constraint this file's own top
  // comment names for Prisma model types; the shape below is structurally
  // identical to it, not a redefinition of its meaning.
  return plansService.decideRecommendation(userId, recommendationId, input, "professional", professionalId);
}
