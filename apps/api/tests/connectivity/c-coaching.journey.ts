/**
 * Scenario C — Coaching: user request → correct coach sees it →
 * accepts/rejects → user sees the corresponding status.
 *
 * Two request paths exist in the code:
 *   C1–C3  Guidance request (the default in the user app, because
 *          PROFESSIONAL_MARKETPLACE_ENABLED defaults to false —
 *          apps/user-mobile/src/lib/coachEntry.ts): user asks for help,
 *          an operations admin matches a coach, the coach accepts/declines.
 *   C4     Marketplace booking (user picks the coach). Hidden in the app
 *          by default but reachable over HTTP, so it is tested too.
 *
 * Surfaces: user-mobile (api/guidanceRequests.ts, api/coaching.ts),
 * admin-web (screens/relationships/AssignmentQueueScreen.tsx),
 * coach-mobile (api/professionalOffers.ts, api/relationshipRequests.ts).
 *
 * Refresh behaviour: these checks show what the API returns on the next
 * request. They cannot show what the phone displays. From source (not
 * executed): user-mobile has no refetchInterval on these screens and uses
 * staleTime 30s (src/lib/queryClient.ts), so the user sees a change only
 * when the screen re-fetches. That is polling-on-revisit, not a real-time
 * notification.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../../src/db/prisma";
import {
  CONFIGURATION,
  bearer,
  describeResponse,
  futureIso,
  loginAdmin,
  loginCoach,
  loginUser,
  record,
  startJourney,
  type Journey,
} from "./harness/journey";

const S = "C";
let j: Journey;
let userA = "";
let userB = "";
let ops = "";
let coachA = "";
let coachB = "";

beforeAll(async () => {
  j = startJourney();
  userA = await loginUser(j, j.world.userA.email);
  userB = await loginUser(j, j.world.userB.email);
  ops = await loginAdmin(j, j.world.adminOperations.email);
  coachA = await loginCoach(j, j.world.coachA.email);
  coachB = await loginCoach(j, j.world.coachB.email);
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function requestAndMatch(userToken: string, note: string) {
  const created = await request(j.app)
    .post("/coaching/guidance-requests")
    .set(bearer(userToken))
    .send({ serviceType: "fitness", userNote: note });
  const requestId = created.body?.id as string;
  const queue = await request(j.app).get("/admin/guidance-requests?status=open").set(bearer(ops));
  const inQueue = Array.isArray(queue.body) && queue.body.some((r: { id: string }) => r.id === requestId);
  const match = await request(j.app)
    .post(`/admin/guidance-requests/${requestId}/match`)
    .set(bearer(ops))
    .set("X-Change-Reason", encodeURIComponent("TEST-ONLY connectivity harness match"))
    .send({ professionalId: j.world.coachA.id });
  const offerId = match.body?.offer?.id as string;
  return { created, requestId, queue, inQueue, match, offerId };
}

describe("C. Coaching request → coach decision → user status", () => {
  it("C1 the matched coach sees the offer; another coach does not and cannot act on it", async () => {
    const r = await requestAndMatch(userA, "TEST-ONLY guidance request (accept path)");
    const offersA = await request(j.app).get("/professionals/me/offers?status=offered").set(bearer(coachA));
    const offersB = await request(j.app).get("/professionals/me/offers?status=offered").set(bearer(coachB));
    const seenByA = (offersA.body?.offers ?? []).some((o: { offerId: string; userId: string }) => o.offerId === r.offerId && o.userId === j.world.userA.id);
    const seenByB = (offersB.body?.offers ?? []).some((o: { offerId: string }) => o.offerId === r.offerId);
    const wrongCoach = await request(j.app).post(`/professionals/me/offers/${r.offerId}/accept`).set(bearer(coachB));
    const ok = r.created.status === 201 && r.inQueue && r.match.status === 201 && seenByA && !seenByB && wrongCoach.status === 404;
    record({
      scenario: S,
      check: "C1 request → admin match → correct coach sees it",
      surface: "user-mobile → admin-web → coach-mobile",
      configuration: CONFIGURATION + "; operations admin (minimum role with professionals:view/create)",
      endpoints: [
        "POST /coaching/guidance-requests",
        "GET /admin/guidance-requests?status=open",
        "POST /admin/guidance-requests/:id/match",
        "GET /professionals/me/offers?status=offered",
        "POST /professionals/me/offers/:id/accept (as the other coach)",
      ],
      files: [
        "apps/user-mobile/src/api/guidanceRequests.ts",
        "apps/admin-web/src/screens/relationships/AssignmentQueueScreen.tsx",
        "apps/coach-mobile/src/api/professionalOffers.ts",
        "apps/api/src/modules/guidanceRequests/guidanceRequests.routes.ts",
        "apps/api/src/modules/professionalOffers/professionalOffers.service.ts",
      ],
      recordsWritten: [`GuidanceRequest ${r.requestId}`, `ProfessionalOffer ${r.offerId}`, "AdminActionItem (assignment pending)"],
      recordsRead: ["GuidanceRequest queue", "ProfessionalOffer (coach A, coach B views)"],
      expected: "request 201, in the admin queue, match 201, coach A sees the offer, coach B does not and gets 404 trying to accept",
      observed:
        `request ${describeResponse(r.created)}; in queue ${r.inQueue}; match ${describeResponse(r.match)}; ` +
        `coach A sees it ${seenByA}; coach B sees it ${seenByB}; coach B accept ${describeResponse(wrongCoach)}`,
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);

    // C2 continues from this offer.
    (globalThis as { __c1Offer?: { offerId: string; requestId: string } }).__c1Offer = { offerId: r.offerId, requestId: r.requestId };
  });

  it("C2 coach accepts; the user sees the accepted coach on the next read (no notification)", async () => {
    const prior = (globalThis as { __c1Offer?: { offerId: string; requestId: string } }).__c1Offer;
    expect(prior).toBeDefined();
    const startedAt = new Date();
    const accept = await request(j.app).post(`/professionals/me/offers/${prior!.offerId}/accept`).set(bearer(coachA));
    const relationshipId = accept.body?.relationshipId as string;
    const status = await request(j.app).get("/coaching/relationships/status").set(bearer(userA));
    const rel = (status.body?.relationships ?? []).find((r: { relationshipId: string }) => r.relationshipId === relationshipId);
    const myRequests = await request(j.app).get("/coaching/guidance-requests").set(bearer(userA));
    const gr = (Array.isArray(myRequests.body) ? myRequests.body : []).find((g: { id: string }) => g.id === prior!.requestId);
    const notifications = await prisma.notification.count({ where: { userId: j.world.userA.id, createdAt: { gte: startedAt } } });
    const ok =
      accept.status === 200 &&
      rel?.status === "accepted" &&
      rel?.professionalId === j.world.coachA.id &&
      gr?.status === "fulfilled";
    record({
      scenario: S,
      check: "C2 coach accepts → user status",
      surface: "coach-mobile → user-mobile",
      configuration: CONFIGURATION,
      endpoints: ["POST /professionals/me/offers/:id/accept", "GET /coaching/relationships/status", "GET /coaching/guidance-requests"],
      files: [
        "apps/coach-mobile/src/api/professionalOffers.ts",
        "apps/user-mobile/src/api/coaching.ts",
        "apps/user-mobile/src/screens/ProfessionalRelationshipScreen.tsx",
        "apps/api/src/modules/coaching/coaching.service.ts",
      ],
      recordsWritten: [`Relationship ${relationshipId} (accepted)`, `ProfessionalOffer ${prior!.offerId} (accepted)`, `GuidanceRequest ${prior!.requestId} (fulfilled)`],
      recordsRead: ["Relationship status for user A", "GuidanceRequest list for user A", "Notification rows for user A since acceptance"],
      expected: "accept 200; user A's next read shows coach A with status accepted; guidance request fulfilled",
      observed:
        `accept ${describeResponse(accept)}; user status=${rel?.status ?? "(not listed)"}; guidance request=${gr?.status ?? "(missing)"}; ` +
        `new notifications for user A=${notifications}`,
      verdict: ok ? "passed" : "failed",
      notes:
        "Update reaches the user only when the app reads again. No notification row was " +
        (notifications === 0 ? "created" : `expected, but ${notifications} appeared`) +
        ". From source (not executed): no polling on this screen, staleTime 30s — this is refresh-on-revisit, not real-time.",
    });
    expect(ok).toBe(true);
  });

  it("C3 coach declines; the user's request returns to the queue", async () => {
    const r = await requestAndMatch(userB, "TEST-ONLY guidance request (decline path)");
    const decline = await request(j.app)
      .post(`/professionals/me/offers/${r.offerId}/decline`)
      .set(bearer(coachA))
      .send({ reason: "TEST-ONLY decline" });
    const myRequests = await request(j.app).get("/coaching/guidance-requests").set(bearer(userB));
    const gr = (Array.isArray(myRequests.body) ? myRequests.body : []).find((g: { id: string }) => g.id === r.requestId);
    const status = await request(j.app).get("/coaching/relationships/status").set(bearer(userB));
    const withCoachA = (status.body?.relationships ?? []).some((x: { professionalId: string }) => x.professionalId === j.world.coachA.id);
    const ok = r.match.status === 201 && decline.status === 200 && (gr?.status === "open" || gr?.status === "exhausted") && !withCoachA;
    record({
      scenario: S,
      check: "C3 coach declines → user status",
      surface: "coach-mobile → user-mobile",
      configuration: CONFIGURATION,
      endpoints: ["POST /professionals/me/offers/:id/decline", "GET /coaching/guidance-requests", "GET /coaching/relationships/status"],
      files: ["apps/coach-mobile/src/api/professionalOffers.ts", "apps/user-mobile/src/api/guidanceRequests.ts", "apps/api/src/modules/professionalOffers/professionalOffers.service.ts"],
      recordsWritten: [`GuidanceRequest ${r.requestId}`, `ProfessionalOffer ${r.offerId} (declined)`],
      recordsRead: ["GuidanceRequest list for user B", "Relationship status for user B"],
      expected: "decline 200; user B's request is back to open (or exhausted); no relationship with coach A",
      observed: `match ${describeResponse(r.match)}; decline ${describeResponse(decline)}; request=${gr?.status ?? "(missing)"}; relationship with coach A listed=${withCoachA}`,
      verdict: ok ? "passed" : "failed",
      notes: "The user sees 'looking for a coach again', not a 'declined' status: the decline is not shown to the user as such.",
    });
    expect(ok).toBe(true);
  });

  it("C4 marketplace path: user picks coach A, only coach A sees and accepts, user can then book", async () => {
    const scheduledAt = futureIso(3);
    const body = { professionalId: j.world.coachA.id, offeringId: j.world.coachA.offeringId, scheduledAt };
    const first = await request(j.app).post("/coaching/bookings").set(bearer(userB)).send(body);
    const reqsA = await request(j.app).get("/professionals/me/relationships/requests").set(bearer(coachA));
    const reqsB = await request(j.app).get("/professionals/me/relationships/requests").set(bearer(coachB));
    const pending = (reqsA.body?.requests ?? []).find((x: { userId: string }) => x.userId === j.world.userB.id);
    const seenByB = (reqsB.body?.requests ?? []).some((x: { userId: string }) => x.userId === j.world.userB.id);
    const relationshipId = pending?.relationshipId as string;
    const wrongCoach = await request(j.app).post(`/professionals/me/relationships/${relationshipId}/accept`).set(bearer(coachB));
    const before = await request(j.app).get("/coaching/relationships/status").set(bearer(userB));
    const statusBefore = (before.body?.relationships ?? []).find((x: { relationshipId: string }) => x.relationshipId === relationshipId)?.status;
    const accept = await request(j.app).post(`/professionals/me/relationships/${relationshipId}/accept`).set(bearer(coachA));
    const after = await request(j.app).get("/coaching/relationships/status").set(bearer(userB));
    const statusAfter = (after.body?.relationships ?? []).find((x: { relationshipId: string }) => x.relationshipId === relationshipId)?.status;
    const booking = await request(j.app).post("/coaching/bookings").set(bearer(userB)).send(body);
    const ok =
      first.status === 409 &&
      first.body?.error?.code === "relationship_pending_acceptance" &&
      !!pending &&
      !seenByB &&
      wrongCoach.status === 404 &&
      statusBefore === "requested" &&
      accept.status === 200 &&
      statusAfter === "accepted" &&
      booking.status === 201;
    record({
      scenario: S,
      check: "C4 marketplace request → coach accepts → user books",
      surface: "user-mobile (marketplace screens, hidden by default) → coach-mobile",
      configuration: CONFIGURATION + "; TEST-ONLY coach level with a ₹0 fee so no payment is needed",
      endpoints: [
        "POST /coaching/bookings",
        "GET /professionals/me/relationships/requests",
        "POST /professionals/me/relationships/:id/accept",
        "GET /coaching/relationships/status",
      ],
      files: [
        "apps/user-mobile/src/api/coaching.ts",
        "apps/coach-mobile/src/api/relationshipRequests.ts",
        "apps/api/src/modules/coaching/coaching.service.ts",
        "apps/api/src/lib/coachFees.ts",
      ],
      recordsWritten: [`Relationship ${relationshipId ?? "(none)"}`, "Booking (after acceptance)"],
      recordsRead: ["Relationship requests for coach A and coach B", "Relationship status for user B"],
      expected:
        "first booking 409 relationship_pending_acceptance (request sent); coach A sees it, coach B does not and gets 404; " +
        "user sees requested then accepted; booking then 201",
      observed:
        `first ${describeResponse(first)}; coach A sees ${!!pending}; coach B sees ${seenByB}; coach B accept ${describeResponse(wrongCoach)}; ` +
        `user before=${statusBefore}; accept ${describeResponse(accept)}; user after=${statusAfter}; booking ${describeResponse(booking)} status=${booking.body?.status}`,
      verdict: ok ? "passed" : "failed",
      notes: "The 'request sent' moment is a 409 response that still creates the request row. Behaviour recorded as observed.",
    });
    expect(ok).toBe(true);
  });
});
