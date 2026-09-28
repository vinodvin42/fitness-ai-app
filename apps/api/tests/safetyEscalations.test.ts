import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { decryptStringList } from "../src/lib/fieldCrypto";

/**
 * BR-SAF-004 Safety Escalations (R1 Developer 1, 18 Sep 2026) — closes the
 * gap §43/§50 left honestly open: `AssessmentSummaryScreen`'s Safety card
 * rendered a user's reported medical conditions/injuries, but nothing
 * escalated that data to a real human anywhere. Covers the real trigger
 * point (`users.service.ts#upsertOnboardingProfile`), the "does NOT fire
 * on the partial-edit path" guarantee, and the admin queue
 * (`adminSafety.service.ts`).
 */
describe("BR-SAF-004 Safety Escalations", () => {
  const app = buildApp();
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    const email = uniqueEmail("safety-escalation");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email, password: "SomePassword1!", fullName: "Safety Escalation Tester" });
    userId = signupRes.body.user.id;
    accessToken = signupRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.analyticsEvent.deleteMany({ where: { userId } });
    await prisma.safetyEscalation.deleteMany({ where: { userId } });
    await prisma.onboardingProfile.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("does NOT create a SafetyEscalation for a real onboarding completion with no medical conditions/injuries", async () => {
    const otherEmail = uniqueEmail("safety-escalation-clean");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email: otherEmail, password: "SomePassword1!", fullName: "Clean Onboarding Tester" });
    const otherUserId = signupRes.body.user.id;
    const otherToken = signupRes.body.tokens.accessToken;

    const res = await request(app)
      .put("/users/me/onboarding")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ goals: ["strength"], trainingLevel: "beginner", medicalConditions: [], injuries: [] });
    expect(res.status).toBe(200);

    const rows = await prisma.safetyEscalation.findMany({ where: { userId: otherUserId } });
    expect(rows).toHaveLength(0);
    const events = await prisma.analyticsEvent.findMany({ where: { userId: otherUserId, name: "safety.escalated" } });
    expect(events).toHaveLength(0);

    await prisma.onboardingProfile.deleteMany({ where: { userId: otherUserId } });
    await prisma.user.deleteMany({ where: { id: otherUserId } });
  });

  it("creates a real SafetyEscalation and fires safety.escalated on real onboarding completion WITH medical/injury data", async () => {
    const res = await request(app)
      .put("/users/me/onboarding")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        goals: ["strength"],
        trainingLevel: "beginner",
        medicalConditions: ["asthma"],
        injuries: ["knee ligament tear"],
      });
    expect(res.status).toBe(200);

    const rows = await prisma.safetyEscalation.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);

    // §10: health data is stored encrypted. The plaintext columns must be
    // EMPTY on a new write — that is the whole point, and asserting it
    // here is what would catch the encryption being quietly bypassed.
    expect(rows[0].medicalConditions).toEqual([]);
    expect(rows[0].injuries).toEqual([]);
    expect(rows[0].medicalConditionsEnc).toBeTruthy();
    // Ciphertext, not the words themselves, is what lands in a backup.
    expect(rows[0].medicalConditionsEnc).not.toContain("asthma");

    // And it round-trips: the real values come back through the one
    // accessor every consumer uses.
    expect(decryptStringList(rows[0].medicalConditionsEnc)).toEqual(["asthma"]);
    expect(decryptStringList(rows[0].injuriesEnc)).toEqual(["knee ligament tear"]);
    expect(rows[0].reviewedAt).toBeNull();
    expect(rows[0].reviewedByAdminId).toBeNull();

    const events = await prisma.analyticsEvent.findMany({ where: { userId, name: "safety.escalated" } });
    expect(events).toHaveLength(1);
    expect(events[0].ruleId).toBe("BR-SAF-004");
    expect((events[0].entityIds as Record<string, unknown>).safetyEscalationId).toBe(rows[0].id);
    // D14 tiering: asthma is not a Safety Pause condition, so this is
    // the WARNING tier — still a real escalation row and a real event
    // (the safety team must see reported health data either way), but
    // the user is not stopped.
    expect(events[0].metadata).toEqual({ medicalConditionsCount: 1, injuriesCount: 1, outcome: "warning" });
    expect(res.body.safetyOutcome).toBe("warning");
  });

  it("acceptance test 5: a SERIOUS condition pauses, with a high-severity queue item", async () => {
    // A separate user, because the escalation only fires on first
    // completion and the fixture user above already completed.
    const email = `safety-pause-${Date.now()}@example.com`;
    const signup = await request(app)
      .post("/auth/signup")
      .send({ email, password: "Testpass123!", fullName: "Safety Pause Probe" });
    const token = signup.body.tokens.accessToken;
    const pauseUserId = signup.body.user.id as string;

    const res = await request(app)
      .put("/users/me/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .send({
        goals: ["strength"],
        trainingLevel: "beginner",
        medicalConditions: ["diagnosed heart condition"],
        injuries: [],
      });
    expect(res.status).toBe(200);
    // D14: "Heart condition -> Pause". This is what the client branches
    // on to show the Safety Pause screen.
    expect(res.body.safetyOutcome).toBe("pause");

    const events = await prisma.analyticsEvent.findMany({
      where: { userId: pauseUserId, name: "safety.escalated" },
    });
    expect(events).toHaveLength(1);
    expect((events[0].metadata as Record<string, unknown>).outcome).toBe("pause");

    const escalation = await prisma.safetyEscalation.findFirst({ where: { userId: pauseUserId } });
    const items = await prisma.adminActionItem.findMany({
      where: { entityType: "SafetyEscalation", entityId: escalation!.id },
    });
    expect(items).toHaveLength(1);
    expect(items[0].severity).toBe("high");

    await prisma.adminActionItem.deleteMany({ where: { entityType: "SafetyEscalation", entityId: escalation!.id } });
    await prisma.user.deleteMany({ where: { id: pauseUserId } });
  });

  it("a user who reports nothing gets neither a pause nor a warning", async () => {
    const email = `safety-none-${Date.now()}@example.com`;
    const signup = await request(app)
      .post("/auth/signup")
      .send({ email, password: "Testpass123!", fullName: "Safety None Probe" });
    const res = await request(app)
      .put("/users/me/onboarding")
      .set("Authorization", `Bearer ${signup.body.tokens.accessToken}`)
      .send({ goals: ["strength"], trainingLevel: "beginner", medicalConditions: [], injuries: [] });

    expect(res.body.safetyOutcome).toBe("none");
    expect(await prisma.safetyEscalation.count({ where: { userId: signup.body.user.id } })).toBe(0);
    await prisma.user.deleteMany({ where: { id: signup.body.user.id } });
  });

  it("does NOT fire again on a second PUT (re-submission is not a new completion)", async () => {
    const res = await request(app)
      .put("/users/me/onboarding")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        goals: ["strength", "endurance"],
        trainingLevel: "intermediate",
        medicalConditions: ["asthma"],
        injuries: ["knee ligament tear"],
      });
    expect(res.status).toBe(200);

    const rows = await prisma.safetyEscalation.findMany({ where: { userId } });
    expect(rows).toHaveLength(1); // still just the one from the first completion

    const events = await prisma.analyticsEvent.findMany({ where: { userId, name: "safety.escalated" } });
    expect(events).toHaveLength(1);
  });

  it("does NOT fire on the existing partial-edit path (PATCH /users/me/onboarding), which structurally excludes medical/injury fields", async () => {
    const res = await request(app)
      .patch("/users/me/onboarding")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ age: 30 });
    expect(res.status).toBe(200);

    const rows = await prisma.safetyEscalation.findMany({ where: { userId } });
    expect(rows).toHaveLength(1); // unchanged

    const events = await prisma.analyticsEvent.findMany({ where: { userId, name: "safety.escalated" } });
    expect(events).toHaveLength(1); // unchanged
  });

  describe("GET/POST /admin/safety-escalations (admin queue)", () => {
    const adminPassword = "AdminSafetyPass9!";
    let supportAdminEmail: string;
    let readonlyAdminEmail: string;
    let adminUserIds: string[] = [];
    let escalationId: string;

    beforeAll(async () => {
      const passwordHash = await hashPassword(adminPassword);
      supportAdminEmail = uniqueEmail("admin-safety-support");
      const supportAdmin = await prisma.adminUser.create({
        data: { email: supportAdminEmail, passwordHash, fullName: "Support Role Admin", role: "support", status: "active" },
      });
      readonlyAdminEmail = uniqueEmail("admin-safety-finance");
      const financeAdmin = await prisma.adminUser.create({
        data: { email: readonlyAdminEmail, passwordHash, fullName: "Finance Role Admin (no support grant)", role: "finance", status: "active" },
      });
      adminUserIds = [supportAdmin.id, financeAdmin.id];

      const rows = await prisma.safetyEscalation.findMany({ where: { userId } });
      escalationId = rows[0].id;
    });

    afterAll(async () => {
      await prisma.adminUser.deleteMany({ where: { id: { in: adminUserIds } } });
    });

    it("a 'support' role admin can list unreviewed safety escalations and see the real reported data", async () => {
      const loginRes = await request(app).post("/admin/auth/login").send({ email: supportAdminEmail, password: adminPassword });
      expect(loginRes.status).toBe(200);
      const adminToken = loginRes.body.token;

      const res = await request(app)
        .get("/admin/safety-escalations")
        .query({ reviewed: "false" })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const entry = res.body.escalations.find((e: { id: string }) => e.id === escalationId);
      expect(entry).toBeTruthy();
      expect(entry.medicalConditions).toEqual(["asthma"]);
      expect(entry.injuries).toEqual(["knee ligament tear"]);
      expect(entry.reviewedAt).toBeNull();
    });

    it("a 'finance' role admin (no support grant) is blocked with 403", async () => {
      const loginRes = await request(app).post("/admin/auth/login").send({ email: readonlyAdminEmail, password: adminPassword });
      expect(loginRes.status).toBe(200);
      const adminToken = loginRes.body.token;

      const res = await request(app).get("/admin/safety-escalations").set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(403);
    });

    it("POST /admin/safety-escalations/:id/review marks it reviewed with the real admin id", async () => {
      const loginRes = await request(app).post("/admin/auth/login").send({ email: supportAdminEmail, password: adminPassword });
      const adminToken = loginRes.body.token;

      const res = await request(app)
        .post(`/admin/safety-escalations/${escalationId}/review`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.escalation.reviewedAt).not.toBeNull();
      expect(res.body.escalation.reviewedByAdminId).toBe(adminUserIds[0]);

      const row = await prisma.safetyEscalation.findUnique({ where: { id: escalationId } });
      expect(row?.reviewedAt).not.toBeNull();
      expect(row?.reviewedByAdminId).toBe(adminUserIds[0]);
    });

    it("reviewing an already-reviewed escalation 409s", async () => {
      const loginRes = await request(app).post("/admin/auth/login").send({ email: supportAdminEmail, password: adminPassword });
      const adminToken = loginRes.body.token;

      const res = await request(app)
        .post(`/admin/safety-escalations/${escalationId}/review`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(409);
    });
  });
});
