import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { trackEvent } from "../../lib/analytics";
import { createActionItem } from "../../lib/adminActionQueue";
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
 * **15 Sep 2026 (R1 U6, Developer 1's professional relationship
 * request/status/active-state half):** `Relationship.status` gained a
 * real six-stage lifecycle (requested/accepted/awaiting_payment/
 * activating/active/ended — see schema.prisma's own comment on that
 * enum), replacing the old `active`/`ended`-only version that used to
 * jump straight to `active` the instant a booking's payment was captured,
 * with nothing observable before that. `claimRelationship()` is the new
 * single entry point every relationship-touching code path funnels
 * through — `createBooking()` (below) and `payments.service.ts`'s
 * `createOrder()` (the booking-purpose branch, so a real, checkable
 * `awaiting_payment` row exists for the whole time a Razorpay Checkout is
 * open, not just after it succeeds) — and `listRelationshipStatus()` is
 * the new read side backing `apps/user-mobile`'s real status screen. See
 * `claimRelationship()`'s own doc comment for the concurrency discipline.
 *
 * **16 Sep 2026 (gap §56):** `accepted` is no longer an automatic
 * pass-through — `claimRelationship()` now leaves a brand-new relationship
 * at `requested` until a real coach explicitly calls
 * `acceptRelationship()`/`declineRelationship()` (new, backing
 * apps/coach-mobile's Pending Requests screen). `createBooking()` and
 * `payments.service.ts`'s `createOrder()` both now refuse to proceed past
 * a still-`requested` relationship — see gap §56 for the full behavior
 * change and why it's the correct reading of the R1 spec that §49
 * deliberately left open.
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

type RelationshipClaimRow = { id: string; status: string };

/**
 * Claim (create-or-reuse) the one `Relationship` row for a (user,
 * professional, serviceType) triple — the real entry point into the
 * requested -> accepted -> awaiting_payment -> activating -> active
 * lifecycle schema.prisma's `RelationshipStatus` now models.
 *
 * **16 Sep 2026 (gap §56):** a brand-new triple is created at `requested`
 * and left there — it no longer auto-advances to `accepted`. §49's own
 * "real product decision" writeup named the missing coach-side review gate
 * as the live, unresolved question for whoever owns the coach's own
 * workspace next; that's this pass. A real human coach now has to call
 * `acceptRelationship()`/`declineRelationship()` below (backing
 * apps/coach-mobile's new Pending Requests screen) before a `requested`
 * relationship can become anything else. See those functions' own doc
 * comments for the accept/decline transitions themselves, and
 * `createBooking()`/`payments.service.ts`'s `createOrder()` for the
 * refusal every booking/payment call site now enforces against a
 * still-`requested` relationship.
 *
 * Uses the real `@@unique([userId, professionalId, serviceType])`
 * constraint as the atomic claim, the same "the DB is the real gate, not
 * an in-process snapshot" discipline as every other claim-once transition
 * in this build (payments.service.ts's activatePayment, nutrition
 * .service.ts's confirmFoodEstimate, plans.service.ts's
 * decideRecommendation, progress.service.ts's submitCheckIn) — just
 * expressed as a unique-constrained `create` + caught P2002 rather than a
 * conditional `updateMany`, since (like submitCheckIn) there's no
 * pre-existing row to conditionally update when the triple is brand new.
 * Two concurrent callers for a brand-new triple can only ever have one
 * `create()` win; the loser falls back to reading/reclaiming the winner's
 * row instead of erroring the caller's request. If the existing row is
 * `ended` (a previously-ended pairing — either a past Change Professional
 * flow or a coach's own decline — requested again), it's reclaimed via the
 * exact `updateMany` + status-filter pattern those other claims use, so
 * two concurrent revival attempts can't both "win" either, and fires
 * `professional.requested` again since re-requesting a previously-ended
 * pairing is a genuine new request needing its own coach review. Any other
 * existing status (already requested/accepted/awaiting_payment/
 * activating/active) is left exactly as-is — booking a second session
 * with an already-active coach must never downgrade that relationship,
 * matching Error & Recovery §9's "never present professional service as
 * active" rule in the other direction (never un-present it either, once
 * genuinely active).
 */
export async function claimRelationship(
  userId: string,
  professionalId: string,
  serviceType: "fitness" | "nutrition",
): Promise<RelationshipClaimRow> {
  try {
    const created = await prisma.relationship.create({
      data: { userId, professionalId, serviceType, status: "requested" },
    });

    // §8 "professional.requested" — the real, brand-new request, fired at
    // the real moment it's created now that nothing auto-advances it any
    // further (gap §56) — this is genuinely the request moment, not a
    // step inside a larger synchronous auto-accept.
    await trackEvent(userId, "professional.requested", { professionalId, relationshipId: created.id }, { metadata: { serviceType } });

    return created;
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") throw err;

    // Someone else's row already exists for this triple. If it's `ended`,
    // atomically reclaim it back to `requested` (only one concurrent
    // reclaim attempt's updateMany actually matches the row) — a genuine
    // new request against a previously-ended pairing, needing its own
    // coach review again; any other status is left untouched.
    const reclaimed = await prisma.relationship.updateMany({
      where: { userId, professionalId, serviceType, status: "ended" },
      data: { status: "requested", endedAt: null, endReason: null },
    });

    const existing = await prisma.relationship.findUnique({
      where: { userId_professionalId_serviceType: { userId, professionalId, serviceType } },
    });
    if (!existing) throw err; // unreachable — the P2002 above proves a row exists for this triple

    if (reclaimed.count > 0) {
      await trackEvent(userId, "professional.requested", { professionalId, relationshipId: existing.id }, { metadata: { serviceType } });
    }
    return existing;
  }
}

/**
 * The professional-facing counterpart to `claimRelationship()` — backs
 * apps/coach-mobile's Pending Requests screen (gap §56). Atomic
 * `updateMany` + status/ownership filter, the same "claim-once" shape as
 * `payments.service.ts#activatePayment`/`plans.service.ts#decideRecommendation`:
 * only a `requested` relationship that genuinely belongs to THIS
 * professional can be accepted, and only one of two concurrent
 * accept-taps (two coach devices, or a double-tap) actually wins — the
 * loser's `updateMany` affects zero rows and gets a clear 409 rather than
 * silently re-accepting.
 */
export async function acceptRelationship(professionalId: string, relationshipId: string): Promise<RelationshipClaimRow> {
  const existing = await prisma.relationship.findUnique({ where: { id: relationshipId } });
  if (!existing || existing.professionalId !== professionalId) {
    throw new ApiHttpError(404, "relationship_not_found", "Relationship request not found");
  }

  const result = await prisma.relationship.updateMany({
    where: { id: relationshipId, professionalId, status: "requested" },
    data: { status: "accepted" },
  });
  if (result.count === 0) {
    throw new ApiHttpError(409, "relationship_not_requested", "This request has already been acted on");
  }

  return { id: relationshipId, status: "accepted" };
}

/**
 * The decline counterpart to `acceptRelationship()` above — moves a
 * `requested` relationship straight to `ended` (with a real `endReason`)
 * rather than through `accepted` first, same atomic ownership+status-filtered
 * `updateMany` claim. Declining is deliberately only possible while a
 * relationship is still `requested`: once a coach has accepted, a booking
 * may already be `awaiting_payment`/paid, and Error & Recovery §9's "money
 * must never move for a relationship that isn't at least accepted" rule
 * only protects the user going INTO acceptance — it says nothing about
 * revoking accepted access, which is Change Professional's/the admin
 * console's own, separately-reviewed territory (createChangeRequest above,
 * adminRelationships.service.ts), not this endpoint's.
 */
export async function declineRelationship(
  professionalId: string,
  relationshipId: string,
  reason?: string,
): Promise<RelationshipClaimRow> {
  const existing = await prisma.relationship.findUnique({ where: { id: relationshipId } });
  if (!existing || existing.professionalId !== professionalId) {
    throw new ApiHttpError(404, "relationship_not_found", "Relationship request not found");
  }

  const result = await prisma.relationship.updateMany({
    where: { id: relationshipId, professionalId, status: "requested" },
    data: { status: "ended", endedAt: new Date(), endReason: reason ?? "declined_by_professional" },
  });
  if (result.count === 0) {
    throw new ApiHttpError(409, "relationship_not_requested", "This request has already been acted on");
  }

  return { id: relationshipId, status: "ended" };
}

type PendingRelationshipRow = {
  id: string;
  userId: string;
  serviceType: string;
  createdAt: Date;
  user: { fullName: string };
};

/**
 * Backs apps/coach-mobile's new Pending Requests screen (gap §56) — every
 * `requested` relationship for this professional, oldest first (first
 * request in, first reviewed), so a coach can genuinely review and act on
 * each one instead of it auto-advancing unseen.
 */
export async function listPendingRelationships(professionalId: string) {
  const relationships = await prisma.relationship.findMany({
    where: { professionalId, status: "requested" },
    include: { user: { select: { fullName: true } } },
    orderBy: { createdAt: "asc" },
  });
  const rows = relationships as PendingRelationshipRow[];

  return {
    requests: rows.map((r) => ({
      relationshipId: r.id,
      userId: r.userId,
      userFullName: r.user.fullName,
      serviceType: r.serviceType,
      createdAt: r.createdAt,
    })),
  };
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
  // claimRelationship() is idempotent/reuse-safe: for a priced offering
  // this is the SECOND time the same triple is claimed (the first was in
  // payments.service.ts's createOrder, the moment Checkout opened — see
  // that function's own comment), so this just finds the already
  // `awaiting_payment` row rather than creating a new one. For a free
  // offering (no order/payment step at all) this is the only claim.
  const relationships = await Promise.all(
    serviceTypes.map((st) => claimRelationship(userId, input.professionalId, st)),
  );

  // 16 Sep 2026 (gap §56) — a still-`requested` relationship means this
  // coach hasn't reviewed the request yet (or just declined it, which
  // reclaimRelationship() would put right back at `requested` on a fresh
  // ask). No Booking is created past this point, paid or free — the same
  // real, honest refusal `payments.service.ts`'s `createOrder()` gives
  // BEFORE a Razorpay order even exists, re-checked here as this function's
  // own defense-in-depth for the free-offering path, which never goes
  // through createOrder at all.
  if (relationships.some((r) => r.status === "requested")) {
    throw new ApiHttpError(
      409,
      "relationship_pending_acceptance",
      "This coach hasn't accepted your request yet — wait for them to accept before booking",
    );
  }

  const relationshipIds = relationships.map((r) => r.id);

  // We're now genuinely committed to creating the Booking — advance every
  // claimed relationship into `activating` before attempting it. If
  // `booking.create()` below throws (the narrow, already-documented
  // slot-conflict race this file's own hasBookingConflict/createBooking
  // comments flag — rare, not impossible, and for a paid booking money may
  // already be captured by this point), the relationship is deliberately
  // LEFT at `activating` rather than silently reverted or advanced to
  // `active` — Error & Recovery §9's "must never present professional
  // service as active" when it genuinely isn't, and an honest signal for
  // manual follow-up rather than a relationship that looks fine but has no
  // real session behind it.
  await prisma.relationship.updateMany({
    where: { id: { in: relationshipIds }, status: { not: "active" } },
    data: { status: "activating" },
  });

  // Spec §11 `relationship.activation_started`. §10 makes ACTIVATING its
  // own state precisely because it is the window where money has moved
  // but access has not been granted — the window Error & Recovery §9 is
  // about. Without this event, that window is invisible in the stream:
  // you can see activation succeed and see it fail, but not how long it
  // took or how many are currently sitting in it.
  for (const relationshipId of relationshipIds) {
    await trackEvent(
      userId,
      "relationship.activation_started",
      { relationshipId, professionalId: input.professionalId },
      { ruleId: "BR-COM-011" },
    );
  }

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

  // The Booking exists for real now — only past this point is the
  // relationship allowed to read as `active`.
  await prisma.relationship.updateMany({
    where: { id: { in: relationshipIds }, status: { not: "active" } },
    data: { status: "active" },
  });

  // §8 "relationship.activated" — fired for every relationship this
  // booking confirms as active. Honest simplification: a relationship
  // that was ALREADY active before this call (e.g. booking a second
  // session with an already-active coach) still emits the event here
  // rather than diffing against its pre-call status — the real fact
  // being reported ("this booking's relationships are active") is true
  // either way, so a rare extra event for an already-active relationship
  // is a harmless over-count, not a fabricated one.
  for (const relationshipId of relationshipIds) {
    await trackEvent(userId, "relationship.activated", { relationshipId, professionalId: input.professionalId, bookingId: booking.id });
    // Spec §11's `access.granted`, the counterpart to the
    // `access.revoked` that relationshipLifecycle.service.ts emits on
    // end/handover. An access ledger with only one side of the pair
    // cannot answer "who could see this client's data on a given day",
    // which is the question BR-ACC-006/007 exist to make answerable.
    await trackEvent(
      userId,
      "access.granted",
      { relationshipId, professionalId: input.professionalId },
      { ruleId: "BR-ACC-006", metadata: { cause: "relationship_activated" } },
    );
  }

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
    relationshipIds,
  };
}

type RelationshipStatusRow = {
  id: string;
  professionalId: string;
  serviceType: string;
  status: string;
  createdAt: Date;
  professional: { id: string; fullName: string };
};

/**
 * Backs the real "Professional guidance request / status / active
 * relationship entry" screen required by the R1 work package (§4) — U6,
 * Developer 1's own half. Returns every relationship the user has that
 * ISN'T `ended` (requested/accepted/awaiting_payment/activating/active),
 * each carrying its real current status, so the client can render a
 * genuine state stepper instead of a screen that only ever shows fully
 * `active` relationships (that's `listMyTeam` below, unchanged, still the
 * richer "last/next session" view for relationships that really are
 * active). Deliberately excludes `ended` — that's what "no relationship
 * with this professional" looks like today, same as before this status
 * screen existed; a past-relationships history view isn't part of this
 * required screen and isn't built here (no design source names one).
 */
export async function listRelationshipStatus(userId: string) {
  const relationships = await prisma.relationship.findMany({
    where: { userId, status: { not: "ended" } },
    include: { professional: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: "desc" },
  });
  const rows = relationships as RelationshipStatusRow[];

  return {
    relationships: rows.map((r) => ({
      relationshipId: r.id,
      professionalId: r.professionalId,
      professionalFullName: r.professional.fullName,
      serviceType: r.serviceType,
      status: r.status,
      createdAt: r.createdAt,
    })),
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

  // Admin Action Required queue (R2 Wave 1, 20 Sep 2026) — a submitted
  // Change/Intervention Queue request needs a real admin to review it
  // (adminRelationships.service.ts's approve/deny), same reasoning as
  // every other pending-review source wired into this queue.
  await createActionItem({
    type: "relationship_change_pending",
    entityType: "RelationshipChangeRequest",
    entityId: changeRequest.id,
    severity: "medium",
    metadata: { relationshipId, userId, reason: input.reason },
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
