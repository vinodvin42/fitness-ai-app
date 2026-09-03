import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";

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
