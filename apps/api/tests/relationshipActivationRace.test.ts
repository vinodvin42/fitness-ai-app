import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { claimRelationship } from "../src/modules/coaching/coaching.service";

/**
 * Regression test for the "claim once" logic (R1 U6 — professional
 * relationship request/status/active-state UX) coaching.service.ts's
 * claimRelationship() uses: the real six-stage `RelationshipStatus`
 * lifecycle (requested -> accepted -> awaiting_payment -> activating ->
 * active) now lives on a `Relationship` row that's create-or-reused via
 * the real `@@unique([userId, professionalId, serviceType])` constraint
 * (schema.prisma) — the same "the DB is the real gate, not an in-process
 * snapshot" discipline as payments.service.ts#activatePayment, nutrition
 * .service.ts's confirmFoodEstimate, plans.service.ts's
 * decideRecommendation, and progress.service.ts's submitCheckIn (see
 * paymentsActivationRace.test.ts and decideRecommendationRace.test.ts for
 * the sibling tests this one is modeled on), just expressed as a
 * unique-constrained `create()` + caught P2002 fallback rather than a
 * conditional `updateMany` — there's no pre-existing row to conditionally
 * update the first time a (user, professional, serviceType) triple is
 * claimed.
 *
 * **16 Sep 2026 (gap §56 — updates this file's own pre-existing
 * assertions):** `claimRelationship()` no longer auto-advances a brand-new
 * row to `accepted` — it leaves it at `requested` until a real coach calls
 * `acceptRelationship()` (see coaching.test.ts's "Coach relationship
 * accept/decline" suite for that real accept/decline/concurrency
 * coverage). This file keeps its own original scope — the create-or-reuse
 * race itself — and just updates its status assertions to match: a
 * brand-new triple now resolves to exactly one Relationship row at
 * `requested`, not auto-accepted.
 *
 * A realistic race this closes: a user requests guidance from the same
 * professional for the same service twice in quick succession — a
 * double-tap on "Confirm Booking", or two of that professional's offerings
 * both getting booked around the same moment (payments.service.ts's
 * createOrder and coaching.service.ts's createBooking both call
 * claimRelationship() for the SAME triple in the paid-booking flow). The
 * old `ensureRelationship()` this replaced did a plain
 * `findFirst`-then-`create`, which two concurrent callers could both pass
 * the `findFirst` half of before either `create`d — producing two
 * simultaneously-open Relationship rows for one (user, professional,
 * service) pairing. This test drives two concurrent claimRelationship()
 * calls for a brand-new triple and asserts exactly one Relationship row
 * results, with neither call throwing.
 */
describe("Relationship claim race: concurrent claimRelationship() calls for a new triple must not double-create a Relationship", () => {
  let userId: string;
  let professionalId: string;

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail("relationship-claim-race"),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Relationship Claim Race Fixture User",
        referralCode: await generateUniqueReferralCode(),
      },
    });
    userId = user.id;

    const professional = await prisma.professional.create({
      data: {
        email: `coach-claim-race-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Relationship Claim Race Fixture Coach",
        status: "active",
      },
    });
    professionalId = professional.id;
  });

  afterAll(async () => {
    await prisma.relationship.deleteMany({ where: { professionalId } });
    await prisma.professional.deleteMany({ where: { id: professionalId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("claims exactly one Relationship row when two callers race for a brand-new (user, professional, service) triple", async () => {
    const results = await Promise.allSettled([
      claimRelationship(userId, professionalId, "fitness"),
      claimRelationship(userId, professionalId, "fitness"),
    ]);

    // Neither caller should throw — the unique-constraint loser falls back
    // to reading/reclaiming the winner's row rather than erroring.
    for (const result of results) {
      expect(result.status).toBe("fulfilled");
    }
    const ids = results
      .filter((r): r is PromiseFulfilledResult<{ id: string; status: string }> => r.status === "fulfilled")
      .map((r) => r.value.id);
    // Both callers must agree on the SAME row.
    expect(new Set(ids).size).toBe(1);

    const relationships = await prisma.relationship.findMany({
      where: { userId, professionalId, serviceType: "fitness" },
    });
    expect(relationships).toHaveLength(1);
    // Left at `requested` (gap §56 — no auto-accept anymore; see
    // claimRelationship's own doc comment) — a real coach has to accept it
    // via acceptRelationship() before it becomes anything else.
    expect(relationships[0].status).toBe("requested");
  });

  it("re-claiming an already-open triple returns the same row without downgrading its status", async () => {
    const before = await prisma.relationship.findFirstOrThrow({
      where: { userId, professionalId, serviceType: "fitness" },
    });
    // Advance it past `accepted`, as createBooking() would on the way to a
    // real session — re-claiming (e.g. booking a second session with an
    // already-active coach) must never revert this.
    await prisma.relationship.update({ where: { id: before.id }, data: { status: "active" } });

    const claimed = await claimRelationship(userId, professionalId, "fitness");
    expect(claimed.id).toBe(before.id);

    const after = await prisma.relationship.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.status).toBe("active");
  });
});
