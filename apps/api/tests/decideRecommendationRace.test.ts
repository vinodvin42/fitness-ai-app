import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { decideRecommendation } from "../src/modules/plans/plans.service";
import { ApiHttpError } from "../src/middleware/errorHandler";

/**
 * Regression test for a real concurrency bug in plans.service.ts's
 * decideRecommendation(): the same read-then-write race already found and
 * fixed in payments.service.ts's activatePayment(), nutrition.service.ts's
 * confirmFoodEstimate(), and adminInfluencers.service.ts's markPayoutPaid().
 * The old guard (`if (rec.status !== "active") throw` followed by an
 * unconditional `prisma.recommendation.update(...)`) read each caller's own
 * already-fetched Recommendation snapshot, so two concurrent decide calls
 * for the same recommendation (a double-tap on Accept, or a client retry
 * racing its own in-flight request) could both pass the guard. Confirmed
 * against the pre-fix code: two racing "accept" calls both reached the
 * `if (newProgramId)` block and both tried to create a new Plan version;
 * `Plan`'s real `@@unique([userId, version])` constraint stopped the
 * duplicate row, but the loser's whole request then threw a raw, unhandled
 * `PrismaClientKnownRequestError` (a 500) instead of the honest 409 this
 * function is supposed to return — even though its own
 * `recommendation.update()` had already committed moments earlier.
 *
 * Fixed by making the status transition itself atomic (`updateMany` with a
 * `status: "active"` filter, proceeding only when the call's own update
 * actually affected a row). This test drives two concurrent
 * decideRecommendation() calls (both "accept") against one Recommendation
 * row and asserts exactly one call succeeds, the other gets a clean 409
 * `recommendation_already_decided` (not a raw Prisma crash), and exactly
 * one new Plan is created.
 */
describe("Recommendation decide race: concurrent decide calls must not double-create a Plan", () => {
  let userId: string;
  let programAId: string;
  let programBId: string;
  let planId: string;
  let recommendationId: string;

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail("decide-race"),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Decide Race Fixture User",
        referralCode: await generateUniqueReferralCode(),
      },
    });
    userId = user.id;

    const [programA, programB] = await Promise.all([
      prisma.program.create({
        data: {
          id: `test-decide-race-program-a-${suffix}`,
          name: "Decide Race Fixture Program A",
          type: "fitness",
          description: "Fixture program A for the decideRecommendation race test.",
          durationWeeks: 4,
          isAiOnly: true,
          priceCents: 0,
          status: "published",
        },
      }),
      prisma.program.create({
        data: {
          id: `test-decide-race-program-b-${suffix}`,
          name: "Decide Race Fixture Program B",
          type: "fitness",
          description: "Fixture program B (the suggested switch target) for the decideRecommendation race test.",
          durationWeeks: 6,
          isAiOnly: true,
          priceCents: 0,
          status: "published",
        },
      }),
    ]);
    programAId = programA.id;
    programBId = programB.id;

    const plan = await prisma.plan.create({
      data: { userId, version: 1, status: "generated", programId: programAId, rationale: "Fixture starting plan.", isActive: true },
    });
    planId = plan.id;

    const recommendation = await prisma.recommendation.create({
      data: {
        userId,
        planId,
        kind: "switch_program",
        status: "active",
        rationale: "Fixture recommendation to switch programs.",
        suggestedProgramId: programBId,
      },
    });
    recommendationId = recommendation.id;
  });

  afterAll(async () => {
    await prisma.recommendation.deleteMany({ where: { userId } });
    await prisma.plan.deleteMany({ where: { userId } });
    await prisma.program.deleteMany({ where: { id: { in: [programAId, programBId] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("creates exactly one new Plan when two decide('accept') calls race, and the loser gets a clean 409", async () => {
    const results = await Promise.allSettled([
      decideRecommendation(userId, recommendationId, { action: "accept" }),
      decideRecommendation(userId, recommendationId, { action: "accept" }),
    ]);

    const fulfilled = results.filter((r): r is PromiseFulfilledResult<unknown> => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // The loser must see the same honest, documented 409 a sequential
    // second call would get — not a raw, unhandled Prisma error.
    const rejectionReason = rejected[0].reason;
    expect(rejectionReason).toBeInstanceOf(ApiHttpError);
    expect((rejectionReason as ApiHttpError).status).toBe(409);
    expect((rejectionReason as ApiHttpError).code).toBe("recommendation_already_decided");

    const rec = await prisma.recommendation.findUnique({ where: { id: recommendationId } });
    expect(rec?.status).toBe("accepted");

    // Exactly one new Plan (version 2) should exist — not one per racing
    // caller — and exactly one active Plan overall.
    const allPlans = await prisma.plan.findMany({ where: { userId } });
    expect(allPlans).toHaveLength(2); // the original fixture plan + exactly one new one
    const activePlans = allPlans.filter((p) => p.isActive);
    expect(activePlans).toHaveLength(1);
    expect(activePlans[0].programId).toBe(programBId);
    expect(activePlans[0].version).toBe(2);
  });
});
