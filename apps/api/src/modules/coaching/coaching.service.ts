import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import {
  AvailabilityQuery,
  CreateBookingInput,
  CreateChangeRequestInput,
  DiscoverProfessionalsQuery,
} from "./coaching.schema";

/**
 * Coach Discovery & Booking (docs/coach/03-screen-inventory.md §E), added
 * 25 Aug 2026 — closes docs/coach/07-open-questions-gaps.md gap §1, "the
 * single most consequential inconsistency found across the whole
 * project": the consumer app (v1-user, 4 screens, Fitness/Nutrition/
 * Yoga/Sports) and this coach app's own file (v1-coach, 7 screens incl.
 * relationship management, Fitness/Nutrition/Fitness+Nutrition) design
 * the same "find and book a coach" journey twice, differently. Both
 * docs/coach/06-cross-app-integration.md §2 and this gap entry are
 * explicit that picking one is a product/design decision, not an
 * engineering guess — that decision was made (confirmed with the user,
 * not assumed): adopt v1-coach's version as authoritative for both apps,
 * matching the Relationship-as-parent data model already built for it on
 * 20 Aug 2026. All 7 of its screens ship here, with Discovery Filters +
 * Discovery List combined into one screen client-side (see
 * CoachDiscoveryScreen.tsx) — the same "combine near-duplicate design
 * screens into one real one" precedent already used for Security and
 * Subscription.
 *
 * **What's real vs. a deliberate, documented simplification:**
 * - Discovery, Profile Detail, Booking, My Professional Team, and Change
 *   Professional are all real and backed by real
 *   Professional/ProfessionalCredential/ProfessionalServiceOffering/
 *   Booking/Relationship/RelationshipChangeRequest rows — not mocked
 *   screens reading fixture data.
 * - Rating, review count, languages, and region have NO backing field
 *   anywhere in this schema (no Review entity, no language/region column
 *   on Professional — the same gap adminProfessionals.service.ts already
 *   flags for the admin console's own Professional Directory) — omitted
 *   from every response below via an explicit `notAvailable` list rather
 *   than sent as fabricated numbers, same convention the admin modules
 *   use throughout this build.
 * - "Available Services" pricing comes from `ProfessionalServiceOffering`
 *   — real rows, but seeded (`scripts/seed.ts`), not coach-authored: no
 *   screen in either Figma file lets a coach set their own rates
 *   (apps/coach-mobile's Dashboard quick actions are still inert, gap
 *   §6), so this is the same "seeded not admin/coach-authored yet"
 *   precedent Programs/Exercises/Recipes started under before Module
 *   05's CMS existed.
 * - "Availability" is a fixed 9:00-18:00 hourly slot grid, not a
 *   coach-configured schedule — no screen anywhere designs a coach
 *   setting their own hours. Conflict-checking against it IS real,
 *   though: a slot already covered by another confirmed Booking for that
 *   professional is genuinely marked unavailable, computed from real
 *   data, not just cosmetically disabled.
 * - **RESOLVED 5 Sep 2026 (PAY-01).** A booking used to activate
 *   immediately with no payment-collection step, the same simplification
 *   Subscribe/Program Purchase originally shipped with before Razorpay
 *   closed that gap for them (gap §14, 20 Aug 2026). It's wired through
 *   the same Razorpay rails now, as a third `purpose: "booking"` on
 *   payments.service.ts's order/verify flow: `createBooking()` below
 *   requires `opts.verifiedPayment` for any offering with `priceCents >
 *   0` (same gate `subscribe()`/`purchaseProgram()` already use), and
 *   `payments.service.ts`'s `activatePayment()` calls back into this
 *   exact function once a payment is captured. Neither Figma file's
 *   Discovery & Booking flow shows a separate payment/checkout screen
 *   (Booking: Service Selection goes straight to Booking Confirmation),
 *   same as Subscription/Program Purchase's own design before Razorpay —
 *   `BookingServiceSelectionScreen.tsx` now opens Razorpay's hosted
 *   Checkout in between, exactly like `ProgramDetailScreen.tsx` does.
 * - A confirmed Booking implies (and creates, if missing) the
 *   Relationship row(s) for whichever service(s) its offering covers —
 *   see the Booking model's own schema.prisma comment for why this is a
 *   real consequence of booking rather than a literal single foreign
 *   key, especially for a combined (both-service) offering.
 *
 * **26 Aug 2026: `listMySchedule` added** — the professional-facing
 * counterpart to all of the above, backing apps/coach-mobile's real
 * Calendar tab. See that function's own doc comment for the scoping
 * decision (a real Booking list, not an invented calendar-grid widget).
 *
 * Deliberately does NOT import Prisma model types for the same reason as
 * every other service in this build (adminProfessionals.service.ts,
 * adminRelationships.service.ts, etc.) — the un-generated `@prisma/client`
 * stub has no real model exports in this sandbox; see apps/api/README.md.
 */

const SLOT_START_HOUR = 9;
const SLOT_END_HOUR = 18; // exclusive — the last bookable slot starts at 17:00
const SLOT_DURATION_MINUTES = 60;

type CredentialRow = { serviceType: string; status: string };
type OfferingSummaryRow = { serviceType: string | null; priceCents: number; isActive: boolean };

type ProfessionalListRow = {
  id: string;
  fullName: string;
  bio: string | null;
  specializationTags: string[];
  yearsExperience: number | null;
  credentials: CredentialRow[];
  serviceOfferings: OfferingSummaryRow[];
};

function verifiedServiceTypes(credentials: CredentialRow[]): string[] {
  return credentials.filter((c) => c.status === "verified").map((c) => c.serviceType);
}

function startingPriceCents(offerings: OfferingSummaryRow[]): number | null {
  const active = offerings.filter((o) => o.isActive);
  if (active.length === 0) return null;
  return Math.min(...active.map((o) => o.priceCents));
}

function toDiscoveryItem(p: ProfessionalListRow) {
  return {
    id: p.id,
    fullName: p.fullName,
    bio: p.bio,
    specializationTags: p.specializationTags,
    yearsExperience: p.yearsExperience,
    verifiedServices: verifiedServiceTypes(p.credentials),
    startingPriceCents: startingPriceCents(p.serviceOfferings),
  };
}

const DISCOVERY_NOT_AVAILABLE = ["rating", "reviewCount", "languages", "region"];

export async function listProfessionals(query: DiscoverProfessionalsQuery) {
  const where: Record<string, unknown> = {
    status: "active",
    credentials: { some: { status: "verified" } },
  };

  if (query.search) {
    where.OR = [
      { fullName: { contains: query.search, mode: "insensitive" } },
      { bio: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const professionals = await prisma.professional.findMany({
    where,
    include: {
      credentials: { select: { serviceType: true, status: true } },
      serviceOfferings: {
        where: { isActive: true },
        select: { serviceType: true, priceCents: true, isActive: true },
      },
    },
  });

  let items = (professionals as ProfessionalListRow[]).map(toDiscoveryItem);

  if (query.serviceType === "combined") {
    items = items.filter(
      (i) => i.verifiedServices.includes("fitness") && i.verifiedServices.includes("nutrition"),
    );
  } else if (query.serviceType) {
    items = items.filter((i) => i.verifiedServices.includes(query.serviceType as string));
  }

  items = [...items].sort((a, b) => {
    if (query.sort === "price") {
      const aPrice = a.startingPriceCents ?? Number.POSITIVE_INFINITY;
      const bPrice = b.startingPriceCents ?? Number.POSITIVE_INFINITY;
      return aPrice - bPrice;
    }
    return (b.yearsExperience ?? 0) - (a.yearsExperience ?? 0);
  });

  return { items, notAvailable: DISCOVERY_NOT_AVAILABLE };
}

type ProfessionalDetailRow = Omit<ProfessionalListRow, "serviceOfferings"> & {
  status: string;
  serviceOfferings: Array<OfferingSummaryRow & { id: string; label: string; durationMinutes: number }>;
};

export async function getProfessionalDetail(id: string) {
  const professional = await prisma.professional.findUnique({
    where: { id },
    include: {
      credentials: { select: { serviceType: true, status: true } },
      serviceOfferings: { where: { isActive: true }, orderBy: { priceCents: "asc" } },
    },
  });

  const p = professional as ProfessionalDetailRow | null;
  if (!p || p.status !== "active") {
    throw new ApiHttpError(404, "professional_not_found", "Coach not found");
  }

  const totalClients = await prisma.relationship.count({ where: { professionalId: id, status: "active" } });

  return {
    id: p.id,
    fullName: p.fullName,
    bio: p.bio,
    specializationTags: p.specializationTags,
    yearsExperience: p.yearsExperience,
    verifiedServices: verifiedServiceTypes(p.credentials),
    totalClients,
    offerings: p.serviceOfferings.map((o) => ({
      id: o.id,
      serviceType: o.serviceType,
      label: o.label,
      durationMinutes: o.durationMinutes,
      priceCents: o.priceCents,
    })),
    notAvailable: DISCOVERY_NOT_AVAILABLE,
  };
}

function parseDateOnlyUtc(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map((n) => Number(n));
  return new Date(Date.UTC(y, m - 1, d));
}

type BookingOverlapRow = { scheduledAt: Date; durationMinutes: number };

function overlaps(aStart: Date, aEnd: Date, bookings: BookingOverlapRow[]): boolean {
  return bookings.some((b) => {
    const bEnd = new Date(b.scheduledAt.getTime() + b.durationMinutes * 60 * 1000);
    return aStart < bEnd && b.scheduledAt < aEnd;
  });
}

/**
 * Exported so payments.service.ts's resolveAmountCents (PAY-01, 5 Sep
 * 2026) can price-check a booking's slot before creating a Razorpay
 * order, without duplicating this query. Same conflict rule createBooking()
 * itself uses below — only `confirmed` bookings block a slot.
 */
export async function hasBookingConflict(
  professionalId: string,
  scheduledAt: Date,
  durationMinutes: number,
): Promise<boolean> {
  const scheduledEnd = new Date(scheduledAt.getTime() + durationMinutes * 60 * 1000);
  const existingBookings = await prisma.booking.findMany({
    where: { professionalId, status: "confirmed" },
    select: { scheduledAt: true, durationMinutes: true },
  });
  return overlaps(scheduledAt, scheduledEnd, existingBookings as BookingOverlapRow[]);
}

export async function getAvailability(professionalId: string, query: AvailabilityQuery) {
  const professional = await prisma.professional.findUnique({
    where: { id: professionalId },
    select: { id: true, status: true },
  });
  const p = professional as { id: string; status: string } | null;
  if (!p || p.status !== "active") {
    throw new ApiHttpError(404, "professional_not_found", "Coach not found");
  }

  const dayStart = parseDateOnlyUtc(query.date);
  if (Number.isNaN(dayStart.getTime())) {
    throw new ApiHttpError(400, "invalid_date", "date must be a real calendar date");
  }
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const bookings = await prisma.booking.findMany({
    where: { professionalId, status: "confirmed", scheduledAt: { gte: dayStart, lt: dayEnd } },
    select: { scheduledAt: true, durationMinutes: true },
  });

  const now = new Date();
  const slots: Array<{ time: string; available: boolean }> = [];
  for (let hour = SLOT_START_HOUR; hour < SLOT_END_HOUR; hour++) {
    const slotStart = new Date(dayStart.getTime() + hour * 60 * 60 * 1000);
    const slotEnd = new Date(slotStart.getTime() + SLOT_DURATION_MINUTES * 60 * 1000);
    const isPast = slotStart.getTime() <= now.getTime();
    const isBusy = overlaps(slotStart, slotEnd, bookings as BookingOverlapRow[]);
    slots.push({ time: slotStart.toISOString(), available: !isPast && !isBusy });
  }

  return { date: query.date, slots };
}

async function ensureRelationship(userId: string, professionalId: string, serviceType: "fitness" | "nutrition") {
  const existing = await prisma.relationship.findFirst({
    where: { userId, professionalId, serviceType, status: "active" },
  });
  if (existing) return existing;
  return prisma.relationship.create({ data: { userId, professionalId, serviceType, status: "active" } });
}

export async function createBooking(
  userId: string,
  input: CreateBookingInput,
  opts: { verifiedPayment?: boolean } = {},
) {
  const offering = await prisma.professionalServiceOffering.findUnique({ where: { id: input.offeringId } });
  const o = offering as {
    id: string;
    professionalId: string;
    serviceType: string | null;
    label: string;
    durationMinutes: number;
    priceCents: number;
    isActive: boolean;
  } | null;
  if (!o || o.professionalId !== input.professionalId || !o.isActive) {
    throw new ApiHttpError(404, "offering_not_found", "This coaching service could not be found");
  }

  const professional = await prisma.professional.findUnique({
    where: { id: input.professionalId },
    select: { id: true, status: true, fullName: true },
  });
  const prof = professional as { id: string; status: string; fullName: string } | null;
  if (!prof || prof.status !== "active") {
    throw new ApiHttpError(404, "professional_not_found", "Coach not found");
  }

  const scheduledAt = new Date(input.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
    throw new ApiHttpError(400, "invalid_schedule_time", "scheduledAt must be a real, future date/time");
  }
  const scheduledEnd = new Date(scheduledAt.getTime() + o.durationMinutes * 60 * 1000);

  const existingBookings = await prisma.booking.findMany({
    where: { professionalId: input.professionalId, status: "confirmed" },
    select: { scheduledAt: true, durationMinutes: true },
  });
  if (overlaps(scheduledAt, scheduledEnd, existingBookings as BookingOverlapRow[])) {
    throw new ApiHttpError(409, "slot_unavailable", "This time is no longer available — pick another slot");
  }

  // PAY-01 (5 Sep 2026) — same gate subscribe()/purchaseProgram() already
  // use: a priced offering needs a verified Razorpay payment first: create
  // a Payment via POST /payments/razorpay/orders (purpose "booking",
  // referenceId the offering id, scheduledAt this slot), which calls back
  // into this exact function with verifiedPayment: true once captured. No
  // Booking row is created below until that happens — same "nothing exists
  // until it's paid for" principle, not a fake reservation that later needs
  // to be un-created. A $0 offering (none seeded today, but the schema
  // allows one) skips this and confirms immediately, same as a free plan
  // or program.
  if (o.priceCents > 0 && !opts.verifiedPayment) {
    throw new ApiHttpError(
      402,
      "payment_required",
      "This session requires payment — create a Razorpay order via POST /payments/razorpay/orders first",
    );
  }

  const serviceTypes: Array<"fitness" | "nutrition"> = o.serviceType
    ? [o.serviceType as "fitness" | "nutrition"]
    : ["fitness", "nutrition"];
  const relationships = await Promise.all(
    serviceTypes.map((st) => ensureRelationship(userId, input.professionalId, st)),
  );

  const booking = await prisma.booking.create({
    data: {
      userId,
      professionalId: input.professionalId,
      offeringId: o.id,
      scheduledAt,
      durationMinutes: o.durationMinutes,
      priceCents: o.priceCents,
      status: "confirmed",
    },
  });

  await recordAudit({
    actorId: userId,
    action: "booking.created",
    entityType: "Booking",
    entityId: booking.id,
    metadata: { professionalId: input.professionalId, offeringId: o.id, scheduledAt: scheduledAt.toISOString() },
  });

  return {
    id: booking.id,
    professionalId: input.professionalId,
    professionalFullName: prof.fullName,
    offeringLabel: o.label,
    scheduledAt: booking.scheduledAt,
    durationMinutes: booking.durationMinutes,
    priceCents: booking.priceCents,
    status: booking.status,
    relationshipIds: (relationships as Array<{ id: string }>).map((r) => r.id),
  };
}

type RelationshipTeamRow = {
  id: string;
  professionalId: string;
  serviceType: string;
  createdAt: Date;
  professional: { id: string; fullName: string; specializationTags: string[] };
};

/**
 * "My Professional Team" (docs/coach/03-screen-inventory.md §E) — real
 * active relationships plus real last/next session dates computed from
 * `Booking`. "Recommended Professionals" reuses `listProfessionals`
 * (top-3 by experience, excluding anyone already on the team) rather
 * than a separate recommendation engine — no such system exists anywhere
 * in this build, and this is a real, defensible substitute rather than a
 * fabricated "recommended for you" claim.
 */
export async function listMyTeam(userId: string) {
  const relationships = await prisma.relationship.findMany({
    where: { userId, status: "active" },
    include: { professional: { select: { id: true, fullName: true, specializationTags: true } } },
    orderBy: { createdAt: "desc" },
  });
  const rels = relationships as RelationshipTeamRow[];

  const now = new Date();
  const team = await Promise.all(
    rels.map(async (r) => {
      const [lastSession, nextSession] = await Promise.all([
        prisma.booking.findFirst({
          where: { userId, professionalId: r.professionalId, status: "confirmed", scheduledAt: { lte: now } },
          orderBy: { scheduledAt: "desc" },
          select: { scheduledAt: true },
        }),
        prisma.booking.findFirst({
          where: { userId, professionalId: r.professionalId, status: "confirmed", scheduledAt: { gt: now } },
          orderBy: { scheduledAt: "asc" },
          select: { scheduledAt: true },
        }),
      ]);
      return {
        relationshipId: r.id,
        professionalId: r.professionalId,
        professionalFullName: r.professional.fullName,
        specializationTags: r.professional.specializationTags,
        serviceType: r.serviceType,
        lastSessionAt: (lastSession as { scheduledAt: Date } | null)?.scheduledAt ?? null,
        nextSessionAt: (nextSession as { scheduledAt: Date } | null)?.scheduledAt ?? null,
      };
    }),
  );

  const excludeIds = new Set(rels.map((r) => r.professionalId));
  const recommended = await listProfessionals({ sort: "experience" } as DiscoverProfessionalsQuery);
  const recommendedFiltered = recommended.items.filter((p) => !excludeIds.has(p.id)).slice(0, 3);

  return { team, recommended: recommendedFiltered };
}

/**
 * "Change Professional" (docs/coach/03-screen-inventory.md §E) — this is
 * the user-facing counterpart to the admin console's Change/Intervention
 * Queue (04.03, NOT built — see schema.prisma's RelationshipChangeStatus
 * comment). Submitting here creates a real, persisted request; it
 * deliberately does NOT end the relationship itself — per the design's
 * own warning banner ("changing one service's professional doesn't
 * affect other service relationships"), ending a relationship is framed
 * as a reviewed action, not an automatic side effect of asking for one.
 * The relationship stays active and the request sits `pending` until a
 * future admin Change/Intervention Queue screen can review it — same
 * "stays open until Phase 6 triages it" precedent as SupportTicket.
 */
export async function createChangeRequest(
  userId: string,
  relationshipId: string,
  input: CreateChangeRequestInput,
) {
  const relationship = await prisma.relationship.findUnique({ where: { id: relationshipId } });
  const rel = relationship as { id: string; userId: string; status: string } | null;
  if (!rel || rel.userId !== userId) {
    throw new ApiHttpError(404, "relationship_not_found", "Relationship not found");
  }
  if (rel.status !== "active") {
    throw new ApiHttpError(409, "relationship_not_active", "This relationship has already ended");
  }

  const changeRequest = await prisma.relationshipChangeRequest.create({
    data: { relationshipId, userId, reason: input.reason, note: input.note ?? null, status: "pending" },
  });

  await recordAudit({
    actorId: userId,
    action: "relationship.change_requested",
    entityType: "RelationshipChangeRequest",
    entityId: changeRequest.id,
    metadata: { relationshipId, reason: input.reason },
  });

  return changeRequest;
}

type ScheduleBookingRow = {
  id: string;
  scheduledAt: Date;
  durationMinutes: number;
  status: string;
  user: { fullName: string };
  offering: { label: string; serviceType: string | null };
};

const PAST_SCHEDULE_LIMIT = 50;

function toScheduleItem(b: ScheduleBookingRow) {
  return {
    id: b.id,
    clientFullName: b.user.fullName,
    offeringLabel: b.offering.label,
    serviceType: b.offering.serviceType,
    scheduledAt: b.scheduledAt,
    durationMinutes: b.durationMinutes,
    status: b.status,
  };
}

/**
 * Coach Calendar (docs/coach/03-screen-inventory.md — the tab exists in
 * apps/coach-mobile's own nav, but docs/coach/02-information-architecture.
 * md §2 is explicit "Calendar has no frames in this file"), added 26 Aug
 * 2026 — the scoping decision behind the "needs a design decision, then
 * buildable" gap: rather than inventing a month-grid calendar widget with
 * no design source to match, this is a real, sectioned list of the coach's
 * own Bookings — the same "honest smaller scope than an unspec'd Figma
 * feature" precedent as 09.01's compare toggle. Upcoming is every
 * `confirmed` future booking (small by construction — bounded by the
 * fixed 9–18 UTC availability grid). Past is capped at the most recent 50
 * (any status, so a coach can see cancellations in their own history too)
 * with a real `pastTruncated` flag rather than silently dropping older
 * rows — same "no silent caps" precedent as adminAuditLogs' 200-row cap.
 */
export async function listMySchedule(professionalId: string) {
  const now = new Date();
  const [upcomingRows, pastRows, pastTotal] = await Promise.all([
    prisma.booking.findMany({
      where: { professionalId, status: "confirmed", scheduledAt: { gte: now } },
      include: { user: { select: { fullName: true } }, offering: { select: { label: true, serviceType: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.booking.findMany({
      where: { professionalId, scheduledAt: { lt: now } },
      include: { user: { select: { fullName: true } }, offering: { select: { label: true, serviceType: true } } },
      orderBy: { scheduledAt: "desc" },
      take: PAST_SCHEDULE_LIMIT,
    }),
    prisma.booking.count({ where: { professionalId, scheduledAt: { lt: now } } }),
  ]);

  return {
    upcoming: (upcomingRows as ScheduleBookingRow[]).map(toScheduleItem),
    past: (pastRows as ScheduleBookingRow[]).map(toScheduleItem),
    pastTruncated: pastTotal > PAST_SCHEDULE_LIMIT,
  };
}
