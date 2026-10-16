/**
 * Scenario A — Authentication: login → own profile → another account's
 * records rejected.
 *
 * Surfaces: user-mobile (apps/user-mobile/src/api/auth.ts, support.ts),
 * coach-mobile (apps/coach-mobile/src/api/professionalAuth.ts).
 * API: modules/auth, modules/users, modules/support, modules/guidanceRequests,
 * middleware/auth.ts, middleware/professionalAuth.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../../src/db/prisma";
import { CONFIGURATION, bearer, describeResponse, loginCoach, loginUser, record, startJourney, type Journey } from "./harness/journey";

const S = "A";
let j: Journey;
let tokenA = "";
let tokenB = "";
let coachToken = "";

beforeAll(async () => {
  j = startJourney();
  tokenA = await loginUser(j, j.world.userA.email);
  tokenB = await loginUser(j, j.world.userB.email);
  coachToken = await loginCoach(j, j.world.coachA.email);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("A. Authentication and record ownership", () => {
  it("A1 user logs in and reads their own profile", async () => {
    const res = await request(j.app).get("/users/me").set(bearer(tokenA));
    const ok = res.status === 200 && res.body?.user?.id === j.world.userA.id && !("passwordHash" in (res.body?.user ?? {}));
    record({
      scenario: S,
      check: "A1 login → own profile",
      surface: "user-mobile",
      configuration: CONFIGURATION,
      endpoints: ["POST /auth/login", "GET /users/me"],
      files: ["apps/user-mobile/src/api/auth.ts", "apps/api/src/modules/auth/auth.routes.ts", "apps/api/src/modules/users/users.routes.ts"],
      recordsWritten: ["RefreshToken (login)"],
      recordsRead: ["User A"],
      expected: "200 with User A's own record and no password hash",
      observed: `${describeResponse(res)}; id matches A: ${res.body?.user?.id === j.world.userA.id}; passwordHash exposed: ${"passwordHash" in (res.body?.user ?? {})}`,
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);
  });

  it("A2 no token is refused", async () => {
    const res = await request(j.app).get("/users/me");
    record({
      scenario: S,
      check: "A2 profile without a token",
      surface: "user-mobile",
      configuration: CONFIGURATION,
      endpoints: ["GET /users/me"],
      files: ["apps/api/src/middleware/auth.ts"],
      recordsWritten: [],
      recordsRead: [],
      expected: "401 unauthorized",
      observed: describeResponse(res),
      verdict: res.status === 401 ? "passed" : "failed",
    });
    expect(res.status).toBe(401);
  });

  it("A3 user A cannot read user B's support ticket", async () => {
    const created = await request(j.app)
      .post("/support/tickets")
      .set(bearer(tokenB))
      .send({ subject: "TEST-ONLY ticket", message: "TEST-ONLY synthetic message for the ownership check", category: "other" });
    expect(created.status).toBe(201);
    const ticketId = created.body.id as string;

    const asOwner = await request(j.app).get(`/support/tickets/${ticketId}`).set(bearer(tokenB));
    const asOther = await request(j.app).get(`/support/tickets/${ticketId}`).set(bearer(tokenA));
    const listA = await request(j.app).get("/support/tickets").set(bearer(tokenA));
    const leakedInList = (listA.body?.items ?? []).some((t: { id: string }) => t.id === ticketId);
    const ok = asOwner.status === 200 && asOther.status === 404 && !leakedInList;
    record({
      scenario: S,
      check: "A3 another user's support ticket",
      surface: "user-mobile",
      configuration: CONFIGURATION,
      endpoints: ["POST /support/tickets", "GET /support/tickets/:id", "GET /support/tickets"],
      files: ["apps/user-mobile/src/api/support.ts", "apps/api/src/modules/support/support.service.ts"],
      recordsWritten: [`SupportTicket ${ticketId} (owned by B)`],
      recordsRead: [`SupportTicket ${ticketId}`],
      expected: "owner 200; user A 404 (existence not revealed); not in A's list",
      observed: `owner ${describeResponse(asOwner)}; A ${describeResponse(asOther)}; in A's list: ${leakedInList}`,
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);
  });

  it("A4 user A cannot cancel user B's guidance request", async () => {
    const created = await request(j.app)
      .post("/coaching/guidance-requests")
      .set(bearer(tokenB))
      .send({ serviceType: "nutrition", userNote: "TEST-ONLY ownership check" });
    expect(created.status).toBe(201);
    const requestId = created.body.id as string;

    const byOther = await request(j.app).post(`/coaching/guidance-requests/${requestId}/cancel`).set(bearer(tokenA));
    const row = await prisma.guidanceRequest.findUnique({ where: { id: requestId } });
    const byOwner = await request(j.app).post(`/coaching/guidance-requests/${requestId}/cancel`).set(bearer(tokenB));
    const ok = byOther.status === 404 && row?.status === "open" && byOwner.status === 200;
    record({
      scenario: S,
      check: "A4 another user's guidance request",
      surface: "user-mobile",
      configuration: CONFIGURATION,
      endpoints: ["POST /coaching/guidance-requests", "POST /coaching/guidance-requests/:id/cancel"],
      files: ["apps/user-mobile/src/api/guidanceRequests.ts", "apps/api/src/modules/guidanceRequests/guidanceRequests.service.ts"],
      recordsWritten: [`GuidanceRequest ${requestId} (B; cancelled by B at the end)`],
      recordsRead: [`GuidanceRequest ${requestId}`],
      expected: "user A 404 and the request stays open; owner B can cancel (200)",
      observed: `A ${describeResponse(byOther)}; status after A: ${row?.status}; B ${describeResponse(byOwner)}`,
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);
  });

  it("A5 tokens are not interchangeable between user and coach surfaces", async () => {
    const userOnCoach = await request(j.app).get("/professionals/me").set(bearer(tokenA));
    const coachOnUser = await request(j.app).get("/users/me").set(bearer(coachToken));
    const coachOwn = await request(j.app).get("/professionals/me").set(bearer(coachToken));
    const ok = userOnCoach.status === 401 && coachOnUser.status === 401 && coachOwn.status === 200;
    record({
      scenario: S,
      check: "A5 cross-surface tokens",
      surface: "user-mobile, coach-mobile",
      configuration: CONFIGURATION + "; distinct test-only JWT secrets per identity",
      endpoints: ["POST /professionals/auth/login", "GET /professionals/me", "GET /users/me"],
      files: ["apps/coach-mobile/src/api/professionalAuth.ts", "apps/api/src/middleware/professionalAuth.ts", "apps/api/src/middleware/auth.ts"],
      recordsWritten: [],
      recordsRead: ["Professional coach A", "User A"],
      expected: "user token on coach API 401; coach token on user API 401; coach's own profile 200",
      observed: `user→coach ${describeResponse(userOnCoach)}; coach→user ${describeResponse(coachOnUser)}; coach own ${describeResponse(coachOwn)}`,
      verdict: ok ? "passed" : "failed",
      notes: "Separation depends on the secrets being different. Only test-only secrets were used here; production secret values were not checked.",
    });
    expect(ok).toBe(true);
  });
});
