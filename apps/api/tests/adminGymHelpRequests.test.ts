import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";

const app = buildApp();

/**
 * The staff side of the gym portal's trainer-help requests, built
 * alongside the gym-facing form rather than after it — a request form
 * with no queue behind it collects a promise nobody can keep.
 */
describe("Admin gym help request queue", () => {
  let adminToken = "";
  let adminId = "";
  let gymId = "";
  let requestId = "";
  const suffix = uniqueSuffix();
  const PASSWORD = "AdminPass123!";

  beforeAll(async () => {
    const admin = await prisma.adminUser.create({
      data: {
        email: `admin-gymhelp-${suffix}@example.com`,
        passwordHash: await hashPassword(PASSWORD),
        fullName: "Gym Help Fixture Admin",
        role: "super_admin",
        status: "active",
      },
    });
    adminId = admin.id;
    const login = await request(app).post("/admin/auth/login").send({ email: admin.email, password: PASSWORD });
    adminToken = login.body.token;

    const gym = await prisma.gym.create({
      data: {
        name: "Help Queue Fixture Gym",
        status: "approved",
        contactName: "Owner",
        contactEmail: `gymhelp-${suffix}@example.com`,
        inviteCode: `HQ${suffix.slice(-6).toUpperCase()}`,
      },
    });
    gymId = gym.id;

    const req = await prisma.gymHelpRequest.create({
      data: {
        gymId,
        category: "trainer_support",
        subject: "Programming for a beginner group",
        body: "Eight members starting together, want to know how plans differ.",
      },
    });
    requestId = req.id;
  });

  afterAll(async () => {
    await prisma.gymHelpRequest.deleteMany({ where: { gymId } });
    await prisma.gym.deleteMany({ where: { id: gymId } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
  });

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  it("lists open requests with the gym's contact details", async () => {
    const res = await request(app).get("/admin/gym-help-requests").query({ status: "open" }).set(auth());
    expect(res.status).toBe(200);
    const row = res.body.find((r: { id: string }) => r.id === requestId);
    expect(row).toBeTruthy();
    expect(row.gym.contactEmail).toContain("gymhelp-");
  });

  it("replies and keeps the request open", async () => {
    const res = await request(app)
      .post(`/admin/gym-help-requests/${requestId}/respond`)
      .set(auth())
      .send({ status: "in_progress", resolutionNote: "Looking into this with our programming team." });
    expect(res.status).toBe(200);

    const stored = await prisma.gymHelpRequest.findUnique({ where: { id: requestId } });
    expect(stored!.status).toBe("in_progress");
    expect(stored!.resolvedAt).toBeNull();
    expect(stored!.resolvedByAdminId).toBe(adminId);
  });

  it("resolves the request and records who did it", async () => {
    const res = await request(app)
      .post(`/admin/gym-help-requests/${requestId}/respond`)
      .set(auth())
      .send({ status: "resolved", resolutionNote: "Beginner plans scale by session, details emailed." });
    expect(res.status).toBe(200);

    const stored = await prisma.gymHelpRequest.findUnique({ where: { id: requestId } });
    expect(stored!.status).toBe("resolved");
    expect(stored!.resolvedAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "GymHelpRequest", entityId: requestId, action: "gym.help_request_resolved" },
    });
    expect(audit?.actorAdminId).toBe(adminId);
    expect(audit?.ruleId).toBe("BR-GYM-003");
  });

  it("refuses to reply to an already-resolved request", async () => {
    const res = await request(app)
      .post(`/admin/gym-help-requests/${requestId}/respond`)
      .set(auth())
      .send({ status: "resolved", resolutionNote: "Trying to reply twice." });
    expect(res.status).toBe(409);
  });

  it("requires a reply long enough to be useful to the gym", async () => {
    const fresh = await prisma.gymHelpRequest.create({
      data: { gymId, category: "other", subject: "Short reply probe", body: "Body long enough to pass." },
    });
    const res = await request(app)
      .post(`/admin/gym-help-requests/${fresh.id}/respond`)
      .set(auth())
      .send({ status: "resolved", resolutionNote: "ok" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("requires admin auth", async () => {
    expect((await request(app).get("/admin/gym-help-requests")).status).toBe(401);
  });
});
