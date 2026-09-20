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

// ---- Client 360 Summary (Wave 2, 20 Sep 2026) --------------------------
// Closes the audited gap that `getClientProfile` above surfaces only
// Booking/OnboardingProfile data (session history + goals/training level/
// diet) gated on nothing but an active Relationship — no assessment,
// training, nutrition, or check-in summary is surfaced anywhere, and
// nothing anywhere checks the real `Consent` model (prisma/schema.prisma's
// `Consent`/`ConsentType`, apps/api/src/modules/users/users.service.ts's
// listConsents/updateConsent) before a coach could see a client's actual
// health data.
//
// This is the real, load-bearing gate this wave adds: an active
// Relationship (reusing the same 404-not-403 authorization
// `getClientProfile` above already established — don't invent a second
// convention) is necessary but NOT sufficient. Health/fitness data
// (workouts, meal logs, check-ins, body measurements) additionally
// requires that user's own `health_data_processing` Consent row to read
// `granted: true` — the same explicit, checked-gate discipline
// `SafetyEscalation` (see its own doc comment above in this schema)
// already established for sensitive data in this codebase: a real,
// queried precondition, never an implicit one. If consent is missing,
// this returns a real, honest `{ consentGranted: false }` shape — no
// health data included, but also not an empty screen pretending there's
// nothing to show; the coach-mobile client renders a distinct "client
// hasn't enabled data sharing" state for this, never a blank/broken one.
//
// **Deliberately excluded even with consent granted:** `ProgressPhoto`
// image data and `AiCoachMessage` conversation content. No local
// evidence (docs/coach/*, this schema, or Developer 2's R1 work package
// as it exists in this repo) establishes either as coach-visible, and
// the same work package's own Gym Partner Lite section (§5,
// `getMemberActivationSummary()` in gyms.service.ts) explicitly
// treats photo/AI-conversation data as always off-limits to a
// non-owner party. Given this endpoint touches real user health/privacy
// data, the conservative default — OFF, documented here — is preferred
// over guessing permissive. See docs/coach/07-open-questions-gaps.md's
// 20 Sep 2026 entry for the full reasoning.
//
// Aggregates are intentionally summaries, not raw logs: WorkoutSession
// completion/adherence (not a full exercise-by-exercise breakdown —
// ExerciseSetLog stays out of this response), a MealLog nutrition
// summary, real CheckIn rows, and real BodyMeasurement rows. Each capped
// to a recent window (last 10 rows / last 30 days, matching the "recent"
// framing the work package asks for) rather than a client's entire
// history, same "a coach needs a current picture, not a full export"
// reasoning as `getClientProfile`'s own 50-row session cap.
const SUMMARY_ROW_LIMIT = 10;
const SUMMARY_LOOKBACK_DAYS = 30;

type WorkoutSessionSummaryRow = {
  id: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  workout: { name: string } | null;
};

type MealLogSummaryRow = {
  id: string;
  mealType: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  loggedAt: Date;
};

type CheckInSummaryRow = {
  id: string;
  period: string;
  periodKey: string;
  energy: number;
  soreness: number;
  adherence: number;
  note: string | null;
  createdAt: Date;
};

type BodyMeasurementSummaryRow = {
  id: string;
  weightKg: number | null;
  chestCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  armsCm: number | null;
  thighsCm: number | null;
  bodyFatPercent: number | null;
  loggedAt: Date;
};

export async function getClientSummary(professionalId: string, userId: string) {
  // Same authorization gate as getClientProfile — an active Relationship,
  // 404 (never 403) so a coach with no real relationship to this user
  // can't even confirm the userId exists.
  const relationship = await prisma.relationship.findFirst({
    where: { professionalId, userId, status: "active" },
    select: { id: true },
  });
  if (!relationship) {
    throw new ApiHttpError(404, "client_not_found", "This client could not be found");
  }

  const consent = await prisma.consent.findUnique({
    where: { userId_type: { userId, type: "health_data_processing" } },
    select: { granted: true },
  });

  if (!consent?.granted) {
    return { consentGranted: false as const };
  }

  const since = new Date(Date.now() - SUMMARY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [workoutSessions, mealLogs, checkIns, bodyMeasurements] = await Promise.all([
    prisma.workoutSession.findMany({
      where: { userId, startedAt: { gte: since } },
      include: { workout: { select: { name: true } } },
      orderBy: { startedAt: "desc" },
      take: SUMMARY_ROW_LIMIT,
    }),
    prisma.mealLog.findMany({
      where: { userId, loggedAt: { gte: since } },
      orderBy: { loggedAt: "desc" },
      take: SUMMARY_ROW_LIMIT,
    }),
    prisma.checkIn.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: SUMMARY_ROW_LIMIT,
    }),
    prisma.bodyMeasurement.findMany({
      where: { userId, loggedAt: { gte: since } },
      orderBy: { loggedAt: "desc" },
      take: SUMMARY_ROW_LIMIT,
    }),
  ]);

  const sessions = workoutSessions as WorkoutSessionSummaryRow[];
  const completedSessions = sessions.filter((s) => s.status === "completed");

  return {
    consentGranted: true as const,
    training: {
      // Adherence over the lookback window's own fetched sessions, not a
      // separate all-time query — same "recent window, not full history"
      // scoping as the rest of this response.
      completedCount: completedSessions.length,
      totalCount: sessions.length,
      recentSessions: sessions.map((s) => ({
        id: s.id,
        workoutName: s.workout?.name ?? null,
        status: s.status,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
      })),
    },
    nutrition: {
      recentLogs: (mealLogs as MealLogSummaryRow[]).map((m) => ({
        id: m.id,
        mealType: m.mealType,
        calories: m.calories,
        proteinG: m.proteinG,
        carbsG: m.carbsG,
        fatG: m.fatG,
        loggedAt: m.loggedAt,
      })),
    },
    checkIns: (checkIns as CheckInSummaryRow[]).map((c) => ({
      id: c.id,
      period: c.period,
      periodKey: c.periodKey,
      energy: c.energy,
      soreness: c.soreness,
      adherence: c.adherence,
      note: c.note,
      createdAt: c.createdAt,
    })),
    bodyMeasurements: (bodyMeasurements as BodyMeasurementSummaryRow[]).map((b) => ({
      id: b.id,
      weightKg: b.weightKg,
      chestCm: b.chestCm,
      waistCm: b.waistCm,
      hipsCm: b.hipsCm,
      armsCm: b.armsCm,
      thighsCm: b.thighsCm,
      bodyFatPercent: b.bodyFatPercent,
      loggedAt: b.loggedAt,
    })),
    // Explicit, not just an omission — mirrors CLIENT_SENSITIVE_NOT_AVAILABLE's
    // "name it, don't silently drop it" convention. Progress photos and AI
    // coach conversation content are excluded even with consent granted;
    // see this function's own doc comment for why.
    notAvailable: ["progressPhotos", "aiCoachConversation"],
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
