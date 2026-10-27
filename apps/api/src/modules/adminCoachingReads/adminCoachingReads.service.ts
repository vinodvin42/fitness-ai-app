import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";

/**
 * Small admin READ views over coaching data (27 Oct 2026 gap fix):
 * - a coach's session ratings (SessionRating) for the Professional Profile's
 *   Reviews tab, plus the average/count the directory shows;
 * - the chat blocks (CoachChatBlock) between the two people in a relationship.
 *
 * Read-only, not audited (same as the other admin profile reads). Ratings are
 * private member feedback: they stay off every member-facing surface (R1
 * decision #4); showing them to staff inside the admin console doesn't change
 * that.
 */

const RATINGS_LIMIT = 200;

export type RatingSummary = { average: number | null; count: number };

/** Average stars (one decimal) and count per professional; professionals with no ratings get { null, 0 }. */
export async function ratingSummaries(professionalIds: string[]): Promise<Map<string, RatingSummary>> {
  const out = new Map<string, RatingSummary>();
  for (const id of professionalIds) out.set(id, { average: null, count: 0 });
  if (professionalIds.length === 0) return out;
  const raw = await prisma.sessionRating.groupBy({
    by: ["professionalId"],
    where: { professionalId: { in: professionalIds } },
    _avg: { stars: true },
    _count: { _all: true },
  });
  const groups = raw as unknown as Array<{ professionalId: string; _avg: { stars: number | null }; _count: { _all: number } }>;
  for (const g of groups) {
    out.set(g.professionalId, {
      average: g._avg.stars == null ? null : Math.round(g._avg.stars * 10) / 10,
      count: g._count._all,
    });
  }
  return out;
}

export async function listProfessionalRatings(professionalId: string) {
  const professional = await prisma.professional.findUnique({ where: { id: professionalId }, select: { id: true } });
  if (!professional) throw new ApiHttpError(404, "not_found", "Professional not found");

  const [rows, summary] = await Promise.all([
    prisma.sessionRating.findMany({
      where: { professionalId },
      orderBy: { createdAt: "desc" },
      take: RATINGS_LIMIT,
      select: {
        id: true,
        bookingId: true,
        stars: true,
        tags: true,
        comment: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, fullName: true } },
        booking: { select: { scheduledAt: true, offering: { select: { label: true } } } },
      },
    }) as Promise<
      Array<{
        id: string;
        bookingId: string;
        stars: number;
        tags: string[];
        comment: string | null;
        createdAt: Date;
        updatedAt: Date;
        user: { id: string; fullName: string };
        booking: { scheduledAt: Date; offering: { label: string } };
      }>
    >,
    ratingSummaries([professionalId]),
  ]);

  return {
    professionalId,
    summary: summary.get(professionalId) ?? { average: null, count: 0 },
    ratings: rows.map((r) => ({
      id: r.id,
      bookingId: r.bookingId,
      userId: r.user.id,
      userFullName: r.user.fullName,
      sessionAt: r.booking.scheduledAt,
      offeringLabel: r.booking.offering.label,
      stars: r.stars,
      tags: r.tags,
      comment: r.comment,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  };
}

/** Chat blocks between the member and the coach of one relationship (either side can block). */
export async function listRelationshipChatBlocks(relationshipId: string) {
  const relationship = (await prisma.relationship.findUnique({
    where: { id: relationshipId },
    select: { id: true, userId: true, professionalId: true },
  })) as { id: string; userId: string; professionalId: string } | null;
  if (!relationship) throw new ApiHttpError(404, "not_found", "Relationship not found");

  const blocks = (await prisma.coachChatBlock.findMany({
    where: { userId: relationship.userId, professionalId: relationship.professionalId },
    orderBy: { createdAt: "asc" },
    select: { id: true, blockedBy: true, createdAt: true },
  })) as Array<{ id: string; blockedBy: "user" | "professional"; createdAt: Date }>;

  return { relationshipId, blocks };
}
