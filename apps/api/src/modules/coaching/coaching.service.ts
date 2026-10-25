import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { trackEvent } from "../../lib/analytics";
import { createActionItem } from "../../lib/adminActionQueue";
import {
  FINISHED_RELATIONSHIP_STATUSES,
  FINISHED_RELATIONSHIP_WINDOW_MS,
  REQUEST_REPLY_WINDOW_MS,
  STUCK_ACTIVATING_THRESHOLD_MS,
} from "../../lib/relationshipActivation";
import { ApiHttpError } from "../../middleware/errorHandler";
import { commissionPctFor, offeringFees, priceOffering, type BookingPrice } from "../../lib/coachFees";
import { activeGstPercent, gstOnTop } from "../../lib/gst";
import {
  AvailabilityQuery,
  CreateBookingInput,
  CreateChangeRequestInput,
  CreateGuidanceRequestInput,
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
// Package 4: an offering's price is the fee FynroX set for the coach's
// level and the offering's service (lib/coachFees.ts), never a column on
// the offering.
type OfferingSummaryRow = { id: string; serviceId: string; serviceType: string | null; isActive: boolean };
type LevelRow = { id: string; name: string; rank: number } | null;

type ProfessionalListRow = {
  id: string;
  fullName: string;
  bio: string | null;
  specializationTags: string[];
  yearsExperience: number | null;
  coachLevel: LevelRow;
  credentials: CredentialRow[];
  serviceOfferings: OfferingSummaryRow[];
};

function verifiedServiceTypes(credentials: CredentialRow[]): string[] {
  return credentials.filter((c) => c.status === "verified").map((c) => c.serviceType);
}

/** Fees (before GST) for every active offering of these coaches; offerings without a fee are left out. */
async function feesForProfessionals(rows: Array<{ id: string; coachLevel: LevelRow; serviceOfferings: OfferingSummaryRow[] }>) {
  const levelByProfessional = new Map<string, string | null>(rows.map((p) => [p.id, p.coachLevel?.id ?? null]));
  const offerings = rows.flatMap((p) =>
    p.serviceOfferings.filter((o) => o.isActive).map((o) => ({ id: o.id, serviceId: o.serviceId, professionalId: p.id })),
  );
  return offeringFees(offerings, levelByProfessional);
}

function startingPriceCents(offerings: OfferingSummaryRow[], fees: Map<string, number>): number | null {
  const prices = offerings.filter((o) => o.isActive && fees.has(o.id)).map((o) => fees.get(o.id) as number);
  if (prices.length === 0) return null;
  return Math.min(...prices);
}

function toDiscoveryItem(p: ProfessionalListRow, fees: Map<string, number>, gstPercent: number) {
  return {
    id: p.id,
    fullName: p.fullName,
    bio: p.bio,
    specializationTags: p.specializationTags,
    yearsExperience: p.yearsExperience,
    verifiedServices: verifiedServiceTypes(p.credentials),
    // Lowest fee before GST; GST (`gstPercent`) is added on top at checkout.
    startingPriceCents: startingPriceCents(p.serviceOfferings, fees),
    gstPercent,
    level: p.coachLevel ? { name: p.coachLevel.name, rank: p.coachLevel.rank } : null,
    gender: (p as { gender?: "male" | "female" | null }).gender ?? null,
  };
}

const DISCOVERY_NOT_AVAILABLE = ["rating", "reviewCount", "languages", "region"];

export async function listProfessionals(query: DiscoverProfessionalsQuery) {
  const where: Record<string, unknown> = {
    status: "active",
    credentials: { some: { status: "verified" } },
  };

  if (query.gender) where.gender = query.gender;

  if (query.search) {
    where.OR = [
      { fullName: { contains: query.search, mode: "insensitive" } },
      { bio: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const professionals = await prisma.professional.findMany({
    where,
    include: {
      coachLevel: { select: { id: true, name: true, rank: true } },
      credentials: { select: { serviceType: true, status: true } },
      serviceOfferings: {
        where: { isActive: true },
        select: { id: true, serviceId: true, serviceType: true, isActive: true },
      },
    },
  });

  const rows = professionals as ProfessionalListRow[];
  const [fees, gstPercent] = await Promise.all([feesForProfessionals(rows), activeGstPercent()]);
  let items = rows.map((p) => toDiscoveryItem(p, fees, gstPercent));

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
  serviceOfferings: Array<OfferingSummaryRow & { label: string; durationMinutes: number }>;
};

export async function getProfessionalDetail(id: string) {
  const professional = await prisma.professional.findUnique({
    where: { id },
    include: {
      coachLevel: { select: { id: true, name: true, rank: true } },
      credentials: { select: { serviceType: true, status: true } },
      serviceOfferings: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
    },
  });

  const p = professional as ProfessionalDetailRow | null;
  if (!p || p.status !== "active") {
    throw new ApiHttpError(404, "professional_not_found", "Coach not found");
  }

  const totalClients = await prisma.relationship.count({ where: { professionalId: id, status: "active" } });
  const [fees, gstPercent] = await Promise.all([feesForProfessionals([p]), activeGstPercent()]);
  // Only offerings with a fee at this coach's level can be booked.
  const bookable = p.serviceOfferings
    .filter((o) => fees.has(o.id))
    .map((o) => ({ ...o, feeCents: fees.get(o.id) as number }))
    .sort((a, b) => a.feeCents - b.feeCents);

  return {
    id: p.id,
    fullName: p.fullName,
    bio: p.bio,
    specializationTags: p.specializationTags,
    yearsExperience: p.yearsExperience,
    verifiedServices: verifiedServiceTypes(p.credentials),
    totalClients,
    level: p.coachLevel ? { name: p.coachLevel.name, rank: p.coachLevel.rank } : null,
    gstPercent,
    offerings: bookable.map((o) => {
      const gstCents = gstOnTop(o.feeCents, gstPercent);
      return {
        id: o.id,
        serviceType: o.serviceType,
        label: o.label,
        durationMinutes: o.durationMinutes,
        // The coach fee FynroX set for this level, before GST.
        priceCents: o.feeCents,
        gstCents,
        totalCents: o.feeCents + gstCents,
      };
    }),
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
      data: { userId, professionalId, serviceType, status: "requested", requestedAt: new Date() },
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
    // `declined` is reclaimed too (18 Oct 2026, declines stopped being
    // `ended`): createOrder's and createBooking's gates only refuse
    // `requested`, so a declined row handed back as-is would let the user
    // pay a coach who said no.
    // `expired` is reclaimed too (25 Oct 2026): a request the coach never answered
    // can be made again, with a fresh reply window and none of the old details.
    const reclaimed = await prisma.relationship.updateMany({
      where: { userId, professionalId, serviceType, status: { in: ["ended", "declined", "expired"] } },
      data: {
        status: "requested",
        endedAt: null,
        endReason: null,
        requestedAt: new Date(),
        acceptedAt: null,
        requestedOfferingId: null,
        preferredDate: null,
        requestNote: null,
      },
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

  // A request that sat past the reply window has ended: accepting it now would
  // start a booking the member already saw as expired.
  const lapsed = await expireOverdueRequests({ id: relationshipId });
  if (lapsed > 0) {
    throw new ApiHttpError(409, "relationship_expired", "This request has expired: it wasn't answered in time");
  }

  const result = await prisma.relationship.updateMany({
    where: { id: relationshipId, professionalId, status: "requested" },
    data: { status: "accepted", acceptedAt: new Date() },
  });
  if (result.count === 0) {
    throw new ApiHttpError(409, "relationship_not_requested", "This request has already been acted on");
  }

  return { id: relationshipId, status: "accepted" };
}

/**
 * Ends every `requested` relationship (matching `extra`) that has waited longer
 * than REQUEST_REPLY_WINDOW_MS for the coach: `expired`, with `endReason`
 * "no_reply". This app has no scheduler, so it runs when either side reads or
 * acts on a request (the same lazy pattern as the stuck-activation check in
 * professionalDashboard.service.ts) and is atomic and idempotent: the
 * status-filtered `updateMany` only ever moves a row that is still
 * `requested`, so it can never race an accept or a decline. A legacy row with
 * no `requestedAt` counts from `createdAt`. Returns how many rows it ended.
 */
export async function expireOverdueRequests(extra: { id?: string; userId?: string; professionalId?: string }, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - REQUEST_REPLY_WINDOW_MS);
  const result = await prisma.relationship.updateMany({
    where: {
      ...extra,
      status: "requested",
      OR: [{ requestedAt: { lt: cutoff } }, { requestedAt: null, createdAt: { lt: cutoff } }],
    },
    data: { status: "expired", endedAt: now, endReason: "no_reply" },
  });
  return result.count;
}

/** When the coach's reply window closes for a request made at `requestedAt` (or `createdAt` for a legacy row). */
function replyBy(row: { requestedAt?: Date | null; createdAt: Date }): Date {
  return new Date((row.requestedAt ?? row.createdAt).getTime() + REQUEST_REPLY_WINDOW_MS);
}

/**
 * Figma coach/02, 05: ask a coach for guidance with no payment and no exact
 * slot. Claims the (user, coach, service) relationship the same way a booking
 * attempt always did (claimRelationship), then keeps what the member asked for
 * (which offering, a preferred day, a note) so the coach can review it and the
 * member can see it again, and later pay for exactly that. Safe to repeat:
 * while the request is still `requested` the details are updated in place;
 * once the coach has accepted (or the relationship is further along) nothing
 * changes and the current status is returned, so the app can carry on from
 * there. Nothing is charged here.
 */
export async function createGuidanceRequest(userId: string, input: CreateGuidanceRequestInput) {
  const professional = (await prisma.professional.findUnique({
    where: { id: input.professionalId },
    select: { id: true, status: true, credentials: { select: { serviceType: true, status: true } } },
  })) as { id: string; status: string; credentials: CredentialRow[] } | null;
  if (!professional || professional.status !== "active") {
    throw new ApiHttpError(404, "professional_not_found", "Coach not found");
  }
  if (!verifiedServiceTypes(professional.credentials).includes(input.serviceType)) {
    throw new ApiHttpError(400, "service_not_offered", "This coach doesn't offer that service");
  }

  if (input.offeringId) {
    const offering = (await prisma.professionalServiceOffering.findUnique({ where: { id: input.offeringId } })) as {
      professionalId: string;
      serviceType: string | null;
      isActive: boolean;
    } | null;
    // A combined offering (no serviceType) covers both services.
    if (
      !offering ||
      offering.professionalId !== input.professionalId ||
      !offering.isActive ||
      (offering.serviceType != null && offering.serviceType !== input.serviceType)
    ) {
      throw new ApiHttpError(404, "offering_not_found", "This coaching service could not be found");
    }
  }

  let preferredDate: Date | null = null;
  if (input.preferredDate) {
    preferredDate = parseDateOnlyUtc(input.preferredDate);
    // The member picks a day in their own time zone, so "today" can be a day behind UTC for them.
    const today = parseDateOnlyUtc(new Date().toISOString().slice(0, 10));
    const earliest = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const latest = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(preferredDate.getTime()) || preferredDate < earliest || preferredDate > latest) {
      throw new ApiHttpError(400, "invalid_preferred_date", "Pick a day from today up to 60 days ahead");
    }
  }

  const claimed = await claimRelationship(userId, input.professionalId, input.serviceType);
  if (claimed.status !== "requested") {
    return { relationshipId: claimed.id, status: claimed.status, created: false, replyBy: null as Date | null };
  }

  const updated = await prisma.relationship.update({
    where: { id: claimed.id },
    data: {
      requestedOfferingId: input.offeringId ?? null,
      preferredDate,
      requestNote: input.note?.trim() ? input.note.trim() : null,
    },
  });
  return { relationshipId: updated.id, status: "requested", created: true, replyBy: replyBy(updated) };
}

/**
 * Figma coach/05, 07 "Cancel request": the member takes a request back before
 * any payment exists, while it is still waiting for the coach (`requested`) or
 * accepted but not yet paid (`accepted`). Atomic and ownership-filtered like
 * the coach's accept/decline; a relationship that is further along (a payment
 * started, an active coach) can only be changed through the change-request
 * flow, never silently here. The row ends (`ended`, "cancelled_by_member"), so
 * it leaves the member's list and the coach's pending list, and the same coach
 * can be asked again later.
 */
export async function cancelGuidanceRequest(userId: string, relationshipId: string) {
  const existing = await prisma.relationship.findUnique({ where: { id: relationshipId }, select: { userId: true } });
  if (!existing || existing.userId !== userId) {
    throw new ApiHttpError(404, "relationship_not_found", "Request not found");
  }
  const result = await prisma.relationship.updateMany({
    where: { id: relationshipId, userId, status: { in: ["requested", "accepted"] } },
    data: { status: "ended", endedAt: new Date(), endReason: "cancelled_by_member" },
  });
  if (result.count === 0) {
    throw new ApiHttpError(409, "relationship_not_cancellable", "This request can no longer be cancelled here");
  }
  return { id: relationshipId, status: "ended" as const };
}

/**
 * The decline counterpart to `acceptRelationship()` above — moves a
 * `requested` relationship straight to `declined` (was `ended` until 18 Oct
 * 2026, which made the request vanish from the user's status screen; the
 * coach's free-text `endReason` is still stored but never shown to the user)
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
    data: { status: "declined", endedAt: new Date(), endReason: reason ?? "declined_by_professional" },
  });
  if (result.count === 0) {
    throw new ApiHttpError(409, "relationship_not_requested", "This request has already been acted on");
  }

  return { id: relationshipId, status: "declined" };
}

type PendingRelationshipRow = {
  id: string;
  userId: string;
  serviceType: string;
  createdAt: Date;
  requestedAt: Date | null;
  requestedOfferingId: string | null;
  preferredDate: Date | null;
  requestNote: string | null;
  user: { fullName: string };
};

/** The service name for each requested offering, for showing what a member asked for. */
async function offeringLabels(ids: Array<string | null>): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (wanted.length === 0) return new Map();
  const rows = (await prisma.professionalServiceOffering.findMany({
    where: { id: { in: wanted } },
    select: { id: true, label: true },
  })) as Array<{ id: string; label: string }>;
  return new Map(rows.map((r) => [r.id, r.label] as const));
}

/**
 * Backs apps/coach-mobile's new Pending Requests screen (gap §56) — every
 * `requested` relationship for this professional, oldest first (first
 * request in, first reviewed), so a coach can genuinely review and act on
 * each one instead of it auto-advancing unseen.
 */
export async function listPendingRelationships(professionalId: string) {
  // A request the coach let lapse is gone from their list too (25 Oct 2026).
  await expireOverdueRequests({ professionalId });
  const relationships = await prisma.relationship.findMany({
    where: { professionalId, status: "requested" },
    include: { user: { select: { fullName: true } } },
    orderBy: { createdAt: "asc" },
  });
  const rows = relationships as PendingRelationshipRow[];
  const labels = await offeringLabels(rows.map((r) => r.requestedOfferingId));

  return {
    requests: rows.map((r) => ({
      relationshipId: r.id,
      userId: r.userId,
      userFullName: r.user.fullName,
      serviceType: r.serviceType,
      createdAt: r.createdAt,
      // What the member asked for (25 Oct 2026); all null for a request made before this existed.
      requestedAt: r.requestedAt ?? r.createdAt,
      replyBy: replyBy(r),
      serviceName: r.requestedOfferingId ? (labels.get(r.requestedOfferingId) ?? null) : null,
      preferredDate: r.preferredDate,
      note: r.requestNote,
    })),
  };
}

export async function createBooking(
  userId: string,
  input: CreateBookingInput,
  // `paidPrice` (Package 4): the fee and GST the user actually paid for,
  // copied from the Payment, so the booking records what was charged even
  // if FynroX changed the fee between checkout and payment capture.
  opts: {
    verifiedPayment?: boolean;
    paidPrice?: { feeCents: number; gstCents: number; coachLevelId?: string | null };
  } = {},
) {
  const offering = await prisma.professionalServiceOffering.findUnique({ where: { id: input.offeringId } });
  const o = offering as {
    id: string;
    professionalId: string;
    serviceId: string;
    serviceType: string | null;
    label: string;
    durationMinutes: number;
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
  // Package 4: the price is the level fee in force now (+ GST on top);
  // a paid booking keeps exactly what was paid.
  let price: Pick<BookingPrice, "feeCents" | "gstCents"> & { coachLevelId: string | null };
  if (opts.verifiedPayment && opts.paidPrice) {
    // The level recorded at checkout, else (older payments) the current one.
    let coachLevelId = opts.paidPrice.coachLevelId ?? null;
    if (!coachLevelId) {
      const level = (await prisma.professional.findUnique({
        where: { id: input.professionalId },
        select: { coachLevelId: true },
      })) as { coachLevelId: string | null } | null;
      coachLevelId = level?.coachLevelId ?? null;
    }
    price = { feeCents: opts.paidPrice.feeCents, gstCents: opts.paidPrice.gstCents, coachLevelId };
  } else {
    price = await priceOffering({ id: o.id, serviceId: o.serviceId, professionalId: o.professionalId });
  }

  if (price.feeCents > 0 && !opts.verifiedPayment) {
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

  // FynroX's commission is copied now; a later rate change never reaches
  // this booking or its settlement.
  const commissionPct = (await commissionPctFor([input.professionalId])).get(input.professionalId) as number;
  const booking = await prisma.booking.create({
    data: {
      userId,
      professionalId: input.professionalId,
      offeringId: o.id,
      scheduledAt,
      durationMinutes: o.durationMinutes,
      priceCents: price.feeCents,
      gstCents: price.gstCents,
      commissionPct,
      coachLevelId: price.coachLevelId,
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
    gstCents: booking.gstCents,
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
  updatedAt: Date;
  endedAt: Date | null;
  requestedAt: Date | null;
  acceptedAt: Date | null;
  requestedOfferingId: string | null;
  preferredDate: Date | null;
  requestNote: string | null;
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
 *
 * 18 Oct 2026 (owner-approved, Figma Professional 05b/06/12):
 *  - Finished outcomes (`declined`, `expired`, `completed`) are returned for
 *    FINISHED_RELATIONSHIP_WINDOW_MS (30 days) after `endedAt`, so a coach's
 *    decline no longer just vanishes. The coach's reason is never returned.
 *  - `activating` rows carry `activatingSince` and `stuck` (past
 *    STUCK_ACTIVATING_THRESHOLD_MS, the same cut-off the professional
 *    dashboard uses to queue an admin item).
 *  - `activation_failed` and stuck rows carry `paymentId`: the user's latest
 *    captured, never-activated booking payment for that coach, created no
 *    later than the row's last status change — so support can find it.
 */
export async function listRelationshipStatus(userId: string, now: Date = new Date()) {
  // A request the coach never answered ends here, so the member sees it as
  // expired instead of waiting forever (25 Oct 2026).
  await expireOverdueRequests({ userId }, now);
  const finishedSince = new Date(now.getTime() - FINISHED_RELATIONSHIP_WINDOW_MS);
  const relationships = await prisma.relationship.findMany({
    where: {
      userId,
      OR: [
        { status: { notIn: ["ended", ...FINISHED_RELATIONSHIP_STATUSES] } },
        { status: { in: [...FINISHED_RELATIONSHIP_STATUSES] }, endedAt: { gte: finishedSince } },
      ],
    },
    include: { professional: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: "desc" },
  });
  const rows = relationships as RelationshipStatusRow[];

  const stuckCutoff = now.getTime() - STUCK_ACTIVATING_THRESHOLD_MS;
  const isStuck = (r: RelationshipStatusRow) => r.status === "activating" && r.updatedAt.getTime() < stuckCutoff;
  const needsPayment = rows.filter((r) => r.status === "activation_failed" || isStuck(r));
  const paymentByRelationship = await unactivatedBookingPayments(userId, needsPayment);
  const labels = await offeringLabels(rows.map((r) => r.requestedOfferingId));

  return {
    relationships: rows.map((r) => ({
      relationshipId: r.id,
      professionalId: r.professionalId,
      professionalFullName: r.professional.fullName,
      serviceType: r.serviceType,
      status: r.status,
      createdAt: r.createdAt,
      endedAt: r.endedAt,
      activatingSince: r.status === "activating" ? r.updatedAt : null,
      stuck: isStuck(r),
      paymentId: paymentByRelationship.get(r.id) ?? null,
      // What the member asked for and when (25 Oct 2026, Figma coach/05, 07): all null for a request made before this existed.
      requestedAt: r.requestedAt ?? r.createdAt,
      replyBy: r.status === "requested" ? replyBy(r) : null,
      acceptedAt: r.acceptedAt,
      offeringId: r.requestedOfferingId,
      serviceName: r.requestedOfferingId ? (labels.get(r.requestedOfferingId) ?? null) : null,
      preferredDate: r.preferredDate,
      note: r.requestNote,
    })),
  };
}

/**
 * For each relationship, the newest booking Payment this user paid for that
 * coach which never reached `activatedAt`, created no later than the
 * relationship's last status change (the order is always created before the
 * relationship moves to awaiting_payment/activating/activation_failed).
 */
async function unactivatedBookingPayments(userId: string, rows: RelationshipStatusRow[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (rows.length === 0) return out;
  const payments: Array<{ id: string; referenceId: string; createdAt: Date }> = await prisma.payment.findMany({
    where: { userId, purpose: "booking", status: "paid", activatedAt: null },
    select: { id: true, referenceId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  if (payments.length === 0) return out;
  const offerings: Array<{ id: string; professionalId: string }> = await prisma.professionalServiceOffering.findMany({
    where: { id: { in: payments.map((p) => p.referenceId) } },
    select: { id: true, professionalId: true },
  });
  const coachByOffering = new Map(offerings.map((o) => [o.id, o.professionalId] as const));
  for (const r of rows) {
    const match = payments.find((p) => coachByOffering.get(p.referenceId) === r.professionalId && p.createdAt <= r.updatedAt);
    if (match) out.set(r.id, match.id);
  }
  return out;
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
        createdAt: r.createdAt,
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
