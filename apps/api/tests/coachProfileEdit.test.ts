import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { hashPassword } from "../src/lib/password";

/**
 * Coach "About you" (owner, 27 Oct 2026): a coach enters their own years of experience, bio and
 * specialties; an admin can correct them. Saved straight away (no approval for the coach), and
 * members see the new values on the coach's profile at once. See lib/coachProfile.ts.
 *
 * Rate limits: 3 admin logins + 1 professional login + 1 consumer signup.
 */
describe("Coach profile edit (About you)", () => {
  const app = buildApp();
  const PASSWORD = "CoachProfile123!";
  const adminIds: string[] = [];
  let proId: string;
  let coachToken: string;
  let memberId: string;
  let memberToken: string;
  let superToken: string;
  let operationsToken: string;
  let supportToken: string;

  const asCoach = () => ({ Authorization: `Bearer ${coachToken}` });
  const asMember = () => ({ Authorization: `Bearer ${memberToken}` });

  async function makeAdmin(role: string) {
    const admin = await prisma.adminUser.create({
      data: { email: uniqueEmail(`cpe-${role}`), passwordHash: await hashPassword(PASSWORD), fullName: `CPE ${role}`, role: role as never, status: "active" },
    });
    adminIds.push(admin.id);
    const login = await request(app).post("/admin/auth/login").send({ email: admin.email, password: PASSWORD });
    expect(login.status).toBe(200);
    return login.body.token as string;
  }

  beforeAll(async () => {
    const email = uniqueEmail("cpe-coach");
    const pro = await prisma.professional.create({
      data: {
        email,
        passwordHash: await hashPassword(PASSWORD),
        fullName: "Profile Coach",
        status: "active",
        lifecycleStatus: "available",
        maxActiveClients: 20,
        bio: "Seed bio",
        yearsExperience: 3,
        specializationTags: ["HIIT"],
      },
    });
    proId = pro.id;
    const login = await request(app).post("/professionals/auth/login").send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
    coachToken = login.body.tokens.accessToken;

    const signup = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("cpe-member"), password: "Testpass123!", fullName: "Profile Member" });
    expect(signup.status).toBe(201);
    memberId = signup.body.user.id;
    memberToken = signup.body.tokens.accessToken;

    superToken = await makeAdmin("super_admin");
    operationsToken = await makeAdmin("operations");
    supportToken = await makeAdmin("support");
  });

  afterAll(async () => {
    await prisma.approvalRequest.deleteMany({ where: { makerAdminId: { in: adminIds } } });
    await prisma.auditLog.deleteMany({
      where: { OR: [{ entityType: "Professional", entityId: proId }, { actorAdminId: { in: adminIds } }] },
    });
    await prisma.user.deleteMany({ where: { id: memberId } });
    await prisma.professional.deleteMany({ where: { id: proId } });
    await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
    await prisma.$disconnect();
  });

  it("a coach saves their years, bio and specialties, and gets the public professional back", async () => {
    const res = await request(app)
      .patch("/professionals/me/profile")
      .set(asCoach())
      .send({
        yearsExperience: 8,
        bio: "  Strength coach for busy people.  ",
        specializationTags: [" Strength Training ", "Mobility", "strength training", "MOBILITY", "Yoga"],
      });
    expect(res.status).toBe(200);
    const p = res.body.professional;
    expect(p.id).toBe(proId);
    expect(p.publicId).toMatch(/^FXP-/);
    expect(p.yearsExperience).toBe(8);
    expect(p.bio).toBe("Strength coach for busy people.");
    // Trimmed, and de-duplicated case-insensitively (first spelling kept).
    expect(p.specializationTags).toEqual(["Strength Training", "Mobility", "Yoga"]);
    expect(p.passwordHash).toBeUndefined();
    expect(p.kycDocumentData).toBeUndefined();
    expect(p.adminNotes).toBeUndefined();

    const audit = await prisma.auditLog.findFirst({
      where: { action: "professional.profile_set", entityId: proId, actorProfessionalId: proId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.stateBefore).toEqual({ bio: "Seed bio", yearsExperience: 3, specializationTags: ["HIIT"] });
    expect(audit?.stateAfter).toEqual({
      bio: "Strength coach for busy people.",
      yearsExperience: 8,
      specializationTags: ["Strength Training", "Mobility", "Yoga"],
    });
  });

  it("a partial update changes only the fields sent", async () => {
    const res = await request(app).patch("/professionals/me/profile").set(asCoach()).send({ yearsExperience: 9 });
    expect(res.status).toBe(200);
    expect(res.body.professional.yearsExperience).toBe(9);
    expect(res.body.professional.bio).toBe("Strength coach for busy people.");
    expect(res.body.professional.specializationTags).toEqual(["Strength Training", "Mobility", "Yoga"]);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "professional.profile_set", entityId: proId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.stateBefore).toEqual({ yearsExperience: 8 });
    expect(audit?.stateAfter).toEqual({ yearsExperience: 9 });

    const me = await request(app).get("/professionals/me").set(asCoach());
    expect(me.body.professional.yearsExperience).toBe(9);
  });

  it("refuses bad values and a member token, and changes nothing", async () => {
    const bad = [
      { yearsExperience: 61 },
      { yearsExperience: -1 },
      { yearsExperience: 2.5 },
      { yearsExperience: "5" },
      { bio: "x".repeat(1001) },
      { specializationTags: Array.from({ length: 13 }, (_, i) => `Tag ${i}`) },
      { specializationTags: ["   "] },
      { specializationTags: ["x".repeat(41)] },
      {},
    ];
    for (const body of bad) {
      const res = await request(app).patch("/professionals/me/profile").set(asCoach()).send(body);
      expect(res.status, JSON.stringify(body).slice(0, 60)).toBe(400);
    }
    expect((await request(app).patch("/professionals/me/profile").set(asMember()).send({ yearsExperience: 1 })).status).toBe(401);
    const row = await prisma.professional.findUnique({ where: { id: proId } });
    expect(row?.yearsExperience).toBe(9);
  });

  it("null or an empty bio clears it; null clears the years", async () => {
    const res = await request(app).patch("/professionals/me/profile").set(asCoach()).send({ bio: "   ", yearsExperience: null });
    expect(res.status).toBe(200);
    expect(res.body.professional.bio).toBeNull();
    expect(res.body.professional.yearsExperience).toBeNull();
    const again = await request(app)
      .patch("/professionals/me/profile")
      .set(asCoach())
      .send({ bio: "Back again.", yearsExperience: 9, specializationTags: [] });
    expect(again.status).toBe(200);
    expect(again.body.professional.specializationTags).toEqual([]);
  });

  it("an admin with professionals:edit corrects the profile; others are refused or sent for approval", async () => {
    const denied = await request(app)
      .patch(`/admin/professionals/${proId}/profile`)
      .set({ Authorization: `Bearer ${supportToken}` })
      .send({ yearsExperience: 1 });
    expect(denied.status).toBe(403);

    // Operations may edit professionals, but the change waits for the Super Admin (maker-checker).
    const pending = await request(app)
      .patch(`/admin/professionals/${proId}/profile`)
      .set({ Authorization: `Bearer ${operationsToken}`, "X-Change-Reason": "Coach asked us to fix their years" })
      .send({ yearsExperience: 2 });
    expect(pending.status).toBe(202);
    expect(pending.body.status).toBe("pending_approval");
    expect((await prisma.professional.findUnique({ where: { id: proId } }))?.yearsExperience).toBe(9);

    const res = await request(app)
      .patch(`/admin/professionals/${proId}/profile`)
      .set({ Authorization: `Bearer ${superToken}` })
      .send({ yearsExperience: 12, specializationTags: ["Nutrition Coaching", "Strength Training"], bio: "Corrected by FynroX." });
    expect(res.status).toBe(200);
    expect(res.body.professional.yearsExperience).toBe(12);
    expect(res.body.professional.publicId).toMatch(/^FXP-/);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "professional.profile_set", entityId: proId, actorAdminId: { in: adminIds } },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.stateBefore).toEqual({ bio: "Back again.", yearsExperience: 9, specializationTags: [] });
    expect(audit?.stateAfter).toEqual({
      bio: "Corrected by FynroX.",
      yearsExperience: 12,
      specializationTags: ["Nutrition Coaching", "Strength Training"],
    });

    const bad = await request(app)
      .patch(`/admin/professionals/${proId}/profile`)
      .set({ Authorization: `Bearer ${superToken}` })
      .send({ yearsExperience: 99 });
    expect(bad.status).toBe(400);

    const detail = await request(app).get(`/admin/professionals/${proId}`).set({ Authorization: `Bearer ${superToken}` });
    expect(detail.body.professional.bio).toBe("Corrected by FynroX.");
  });

  it("members see the new values on the coach's profile straight away", async () => {
    const res = await request(app).get(`/coaching/professionals/${proId}`).set(asMember());
    expect(res.status).toBe(200);
    expect(res.body.yearsExperience).toBe(12);
    expect(res.body.bio).toBe("Corrected by FynroX.");
    expect(res.body.specializationTags).toEqual(["Nutrition Coaching", "Strength Training"]);
  });
});
