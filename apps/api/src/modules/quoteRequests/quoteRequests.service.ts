import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import type {
  CreateQuoteRequestInput,
  DeclineQuoteInput,
  ListQuoteRequestsQuery,
  SendQuoteInput,
} from "./quoteRequests.schema";

/**
 * Human Coach quote flow: user asks -> coach quotes/declines -> user accepts.
 * A `quoted` row past `quoteExpiresAt` is lazily flipped to `expired` on
 * read (same request-driven approach as subscriptions' maybeExpireLapsed).
 *
 * Accept does NOT take payment itself. It returns a handoff for the existing
 * booking flow (offerings to pick from + the Razorpay "booking" order shape).
 * Pass the quote's id as `quoteRequestId` to POST /payments/razorpay/orders
 * and createOrder charges the quoted price (see payments.service.ts's
 * resolveQuote for the rules: owner, accepted, paid within 48h of acceptedAt,
 * same coach + serviceType, not already consumed). A successful booking
 * activation flips the quote to `consumed`.
 */

type QuoteRow = {
  id: string;
  userId: string;
  professionalId: string;
  serviceType: string;
  message: string;
  status: string;
  quotedPriceCents: number | null;
  currency: string | null;
  quoteNote: string | null;
  quoteExpiresAt: Date | null;
  respondedAt: Date | null;
  createdAt: Date;
  professional?: { fullName: string };
  user?: { fullName: string };
};

const OPEN = ["pending", "quoted"];

function toQuote(q: QuoteRow) {
  return {
    id: q.id,
    professionalId: q.professionalId,
    professionalFullName: q.professional?.fullName ?? null,
    clientFullName: q.user?.fullName ?? null,
    serviceType: q.serviceType as "fitness" | "nutrition" | "combined",
    message: q.message,
    status: q.status as "pending" | "quoted" | "declined" | "accepted" | "expired" | "consumed",
    quotedPriceCents: q.quotedPriceCents,
    currency: q.currency,
    quoteNote: q.quoteNote,
    quoteExpiresAt: q.quoteExpiresAt ? q.quoteExpiresAt.toISOString() : null,
    respondedAt: q.respondedAt ? q.respondedAt.toISOString() : null,
    createdAt: q.createdAt.toISOString(),
  };
}

const INCLUDE = { professional: { select: { fullName: true } }, user: { select: { fullName: true } } };

async function maybeExpire(q: QuoteRow): Promise<QuoteRow> {
  if (q.status === "quoted" && q.quoteExpiresAt && q.quoteExpiresAt.getTime() <= Date.now()) {
    await prisma.quoteRequest.updateMany({ where: { id: q.id, status: "quoted" }, data: { status: "expired" } });
    return { ...q, status: "expired" };
  }
  return q;
}

// ---- User side ----------------------------------------------------------

export async function createQuoteRequest(userId: string, input: CreateQuoteRequestInput) {
  const pro = await prisma.professional.findUnique({
    where: { id: input.professionalId },
    select: { id: true, status: true },
  });
  if (!pro || pro.status !== "active") {
    throw new ApiHttpError(404, "professional_not_found", "Coach not found");
  }
  const existing = await prisma.quoteRequest.findFirst({
    where: { userId, professionalId: input.professionalId, serviceType: input.serviceType, status: { in: ["pending", "quoted"] } },
  });
  // A stale `quoted` row doesn't block a fresh request.
  if (existing && (await maybeExpire(existing as QuoteRow)).status !== "expired") {
    throw new ApiHttpError(409, "quote_request_open", "You already have an open quote request with this coach for that service");
  }
  const row = await prisma.quoteRequest.create({
    data: { userId, professionalId: input.professionalId, serviceType: input.serviceType, message: input.message },
    include: INCLUDE,
  });
  await recordAudit({
    actorId: userId,
    action: "quote_request.created",
    entityType: "QuoteRequest",
    entityId: row.id,
    metadata: { professionalId: input.professionalId },
  });
  return toQuote(row as QuoteRow);
}

export async function listMyQuoteRequests(userId: string, query: ListQuoteRequestsQuery) {
  const rows = (await prisma.quoteRequest.findMany({
    where: { userId },
    include: INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 100,
  })) as QuoteRow[];
  const fresh = await Promise.all(rows.map(maybeExpire));
  return { items: fresh.filter((q) => !query.status || q.status === query.status).map(toQuote) };
}

async function getOwnedForUser(userId: string, id: string) {
  const row = (await prisma.quoteRequest.findFirst({ where: { id, userId }, include: INCLUDE })) as QuoteRow | null;
  if (!row) throw new ApiHttpError(404, "quote_request_not_found", "Quote request not found");
  return maybeExpire(row);
}

export async function getMyQuoteRequest(userId: string, id: string) {
  return toQuote(await getOwnedForUser(userId, id));
}

export async function acceptQuote(userId: string, id: string) {
  const q = await getOwnedForUser(userId, id);
  if (q.status === "expired") {
    throw new ApiHttpError(409, "quote_expired", "This quote has expired — ask the coach for a new one");
  }
  if (q.status !== "quoted") {
    throw new ApiHttpError(409, "quote_not_acceptable", "Only a quoted request can be accepted");
  }
  // Atomic claim guards a double-tap and the quote-expiry race.
  const claimed = await prisma.quoteRequest.updateMany({
    where: { id, userId, status: "quoted", quoteExpiresAt: { gt: new Date() } },
    data: { status: "accepted", acceptedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new ApiHttpError(409, "quote_not_acceptable", "This quote is no longer available");
  }
  await recordAudit({
    actorId: userId,
    action: "quote_request.accepted",
    entityType: "QuoteRequest",
    entityId: id,
    metadata: { professionalId: q.professionalId, quotedPriceCents: q.quotedPriceCents },
  });

  const offerings = (await prisma.professionalServiceOffering.findMany({
    where: {
      professionalId: q.professionalId,
      isActive: true,
      ...(q.serviceType === "combined" ? { serviceType: null } : { serviceType: q.serviceType as "fitness" | "nutrition" }),
    },
    select: { id: true, label: true, serviceType: true, durationMinutes: true, priceCents: true },
    orderBy: { priceCents: "asc" },
  })) as Array<{ id: string; label: string; serviceType: string | null; durationMinutes: number; priceCents: number }>;

  const fresh = await getOwnedForUser(userId, id);
  return {
    quoteRequest: toQuote(fresh),
    handoff: {
      quoteRequestId: id,
      professionalId: q.professionalId,
      serviceType: fresh.serviceType as "fitness" | "nutrition" | "combined",
      quotedPriceCents: q.quotedPriceCents,
      currency: q.currency,
      // Next steps: pick a slot (GET /coaching/professionals/:id/availability), then
      // POST /payments/razorpay/orders {purpose:"booking", referenceId: <offering.id>, scheduledAt, quoteRequestId}.
      bookingPurpose: "booking" as const,
      offerings,
      // true when the order is created with quoteRequestId (createOrder charges quotedPriceCents).
      quotedPriceApplied: q.quotedPriceCents != null,
    },
  };
}

// ---- Professional side --------------------------------------------------

export async function listProfessionalQuoteRequests(professionalId: string, query: ListQuoteRequestsQuery) {
  const rows = (await prisma.quoteRequest.findMany({
    where: { professionalId },
    include: INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 100,
  })) as QuoteRow[];
  const fresh = await Promise.all(rows.map(maybeExpire));
  return { items: fresh.filter((q) => !query.status || q.status === query.status).map(toQuote) };
}

async function getOwnedForPro(professionalId: string, id: string) {
  const row = (await prisma.quoteRequest.findFirst({ where: { id, professionalId } })) as QuoteRow | null;
  if (!row) throw new ApiHttpError(404, "quote_request_not_found", "Quote request not found");
  return maybeExpire(row);
}

export async function sendQuote(professionalId: string, id: string, input: SendQuoteInput) {
  const q = await getOwnedForPro(professionalId, id);
  const expiresAt = new Date(input.expiresAt);
  if (expiresAt.getTime() <= Date.now() || expiresAt.getTime() > Date.now() + 90 * 24 * 60 * 60 * 1000) {
    throw new ApiHttpError(400, "invalid_quote_expiry", "expiresAt must be in the future and within 90 days");
  }
  // A coach may revise a quote while it's still pending/quoted/expired, never after a final user decision.
  if (!["pending", "quoted", "expired"].includes(q.status)) {
    throw new ApiHttpError(409, "quote_not_quotable", "This request can no longer be quoted");
  }
  const updated = await prisma.quoteRequest.updateMany({
    where: { id, professionalId, status: { in: ["pending", "quoted", "expired"] } },
    data: {
      status: "quoted",
      quotedPriceCents: input.priceCents,
      currency: input.currency,
      quoteNote: input.note ?? null,
      quoteExpiresAt: expiresAt,
      respondedAt: new Date(),
    },
  });
  if (updated.count === 0) throw new ApiHttpError(409, "quote_not_quotable", "This request can no longer be quoted");
  await recordAudit({
    actorProfessionalId: professionalId,
    action: "quote_request.quoted",
    entityType: "QuoteRequest",
    entityId: id,
    metadata: { priceCents: input.priceCents, currency: input.currency },
  });
  const row = (await prisma.quoteRequest.findFirst({ where: { id, professionalId }, include: INCLUDE })) as QuoteRow;
  return toQuote(row);
}

export async function declineQuote(professionalId: string, id: string, input: DeclineQuoteInput) {
  const q = await getOwnedForPro(professionalId, id);
  if (!OPEN.includes(q.status)) {
    throw new ApiHttpError(409, "quote_not_declinable", "This request can no longer be declined");
  }
  const updated = await prisma.quoteRequest.updateMany({
    where: { id, professionalId, status: { in: ["pending", "quoted"] } },
    data: { status: "declined", quoteNote: input.reason ?? null, respondedAt: new Date() },
  });
  if (updated.count === 0) throw new ApiHttpError(409, "quote_not_declinable", "This request can no longer be declined");
  await recordAudit({
    actorProfessionalId: professionalId,
    action: "quote_request.declined",
    entityType: "QuoteRequest",
    entityId: id,
  });
  const row = (await prisma.quoteRequest.findFirst({ where: { id, professionalId }, include: INCLUDE })) as QuoteRow;
  return toQuote(row);
}
