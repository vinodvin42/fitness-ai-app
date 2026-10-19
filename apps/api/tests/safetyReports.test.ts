import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { signProfessionalAccessToken } from "../src/lib/professionalJwt";

/**
 * Safety & Abuse Reports and chat blocking (Oct 2026): app-store rules for
 * apps where people message each other require reporting and blocking. Real
 * Postgres, no mocked Prisma.
 */
describe("Safety reports and chat blocking", () => {
  const app = buildApp();
  const password = "SafetyReportsAdm9!";
  let userId = "";
  let userAuth = "";
  let strangerAuth = "";
  let strangerId = "";
  let professionalId = "";
  let proAuth = "";
  let supportAuth = "";
  let financeAuth = "";
  const adminIds: string[] = [];
  let coachMessageId = "";
  let userMessageId = "";

  async function adminLogin(role: string): Promise<string> {
    const email = uniqueEmail(`sr-${role}`);
    const admin = await prisma.adminUser.create({
      data: { email, passwordHash: await hashPassword(password), fullName: `SR ${role}`, role, status: "active" } as never,
    });
    adminIds.push(admin.id);
    const login = await request(app).post("/admin/auth/login").send({ email, password });
    return `Bearer ${login.body.token}`;
  }

  beforeAll(async () => {
    const u = await request(app).post("/auth/signup").send({ email: uniqueEmail("sr-user"), password: "SomePassword1!", fullName: "SR Client" });
    userId = u.body.user.id;
    userAuth = `Bearer ${u.body.tokens.accessToken}`;
    const s = await request(app).post("/auth/signup").send({ email: uniqueEmail("sr-stranger"), password: "SomePassword1!", fullName: "SR Stranger" });
    strangerId = s.body.user.id;
    strangerAuth = `Bearer ${s.body.tokens.accessToken}`;
    const professional = await prisma.professional.create({
      data: { email: `sr-coach-${uniqueSuffix()}@example.com`, passwordHash: await hashPassword("unused"), fullName: "SR Coach", status: "active" },
    });
    professionalId = professional.id;
    proAuth = `Bearer ${signProfessionalAccessToken({ sub: professionalId, email: professional.email }).token}`;
    await prisma.relationship.create({ data: { userId, professionalId, serviceType: "fitness", status: "active" } });

    const fromCoach = await request(app).post(`/professionals/me/conversations/${userId}`).set("Authorization", proAuth).send({ content: "You're useless, pay me more" });
    coachMessageId = fromCoach.body.id;
    const fromUser = await request(app).post(`/coaching/conversations/${professionalId}`).set("Authorization", userAuth).send({ content: "Please stop" });
    userMessageId = fromUser.body.id;

    supportAuth = await adminLogin("support");
    financeAuth = await adminLogin("finance");
  });

  afterAll(async () => {
    await prisma.safetyReport.deleteMany({ where: { OR: [{ reporterUserId: userId }, { reportedUserId: userId }, { reportedProfessionalId: professionalId }] } });
    await prisma.coachChatBlock.deleteMany({ where: { userId } });
    await prisma.coachMessage.deleteMany({ where: { userId } });
    await prisma.relationship.deleteMany({ where: { userId } });
    await prisma.professional.deleteMany({ where: { id: professionalId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, strangerId] } } });
    await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
    await prisma.$disconnect();
  });

  describe("reporting from the apps", () => {
    it("a client reports a coach's message; severity comes from the reason; reporting again returns the same open report", async () => {
      const first = await request(app)
        .post(`/coaching/conversations/${professionalId}/report`)
        .set("Authorization", userAuth)
        .send({ reason: "threats_or_hate", details: "Abusive", messageId: coachMessageId });
      expect(first.status).toBe(201);
      const again = await request(app)
        .post(`/coaching/conversations/${professionalId}/report`)
        .set("Authorization", userAuth)
        .send({ reason: "threats_or_hate", messageId: coachMessageId });
      expect(again.body.id).toBe(first.body.id);
      const row = await prisma.safetyReport.findUnique({ where: { id: first.body.id } });
      expect(row).toMatchObject({ severity: "high", reportedProfessionalId: professionalId, reporterUserId: userId, messageExcerpt: "You're useless, pay me more" });
    });

    it("you can only report the other party's messages, and only someone you coach with", async () => {
      const ownMessage = await request(app)
        .post(`/coaching/conversations/${professionalId}/report`)
        .set("Authorization", userAuth)
        .send({ reason: "spam_or_scam", messageId: userMessageId });
      expect(ownMessage.status).toBe(404);
      const stranger = await request(app).post(`/coaching/conversations/${professionalId}/report`).set("Authorization", strangerAuth).send({ reason: "other" });
      expect(stranger.status).toBe(404);
      const badReason = await request(app).post(`/coaching/conversations/${professionalId}/report`).set("Authorization", userAuth).send({ reason: "rude" });
      expect(badReason.status).toBe(400);
    });

    it("a coach reports a client", async () => {
      const res = await request(app).post(`/professionals/me/conversations/${userId}/report`).set("Authorization", proAuth).send({ reason: "spam_or_scam" });
      expect(res.status).toBe(201);
      const row = await prisma.safetyReport.findUnique({ where: { id: res.body.id } });
      expect(row).toMatchObject({ severity: "normal", reportedUserId: userId, reporterProfessionalId: professionalId });
    });
  });

  describe("blocking", () => {
    it("a block stops messages both ways, shows in the thread, and unblocking restores them", async () => {
      const block = await request(app).post(`/coaching/conversations/${professionalId}/block`).set("Authorization", userAuth);
      expect(block.status).toBe(200);
      expect(block.body).toEqual({ byMe: true, byThem: false });

      const userSend = await request(app).post(`/coaching/conversations/${professionalId}`).set("Authorization", userAuth).send({ content: "hi" });
      expect(userSend.status).toBe(403);
      expect(userSend.body.error.code).toBe("conversation_blocked");
      const coachSend = await request(app).post(`/professionals/me/conversations/${userId}`).set("Authorization", proAuth).send({ content: "hi" });
      expect(coachSend.status).toBe(403);

      const coachView = await request(app).get(`/professionals/me/conversations/${userId}`).set("Authorization", proAuth);
      expect(coachView.body.blocked).toEqual({ byMe: false, byThem: true });

      const unblock = await request(app).delete(`/coaching/conversations/${professionalId}/block`).set("Authorization", userAuth);
      expect(unblock.body).toEqual({ byMe: false, byThem: false });
      const again = await request(app).post(`/coaching/conversations/${professionalId}`).set("Authorization", userAuth).send({ content: "back" });
      expect(again.status).toBe(201);
    });
  });

  describe("admin queue (08.04)", () => {
    it("lists open reports with stats; a role without support access gets 403", async () => {
      const res = await request(app).get("/admin/safety-reports").set("Authorization", supportAuth);
      expect(res.status).toBe(200);
      expect(res.body.stats.open).toBeGreaterThanOrEqual(2);
      expect(res.body.stats.highOpen).toBeGreaterThanOrEqual(1);
      expect((await request(app).get("/admin/safety-reports").set("Authorization", financeAuth)).status).toBe(403);
    });

    it("shows the conversation around the reported message and logs the view", async () => {
      const report = await prisma.safetyReport.findFirstOrThrow({ where: { messageId: coachMessageId } });
      const res = await request(app).get(`/admin/safety-reports/${report.id}`).set("Authorization", supportAuth);
      expect(res.status).toBe(200);
      expect(res.body.context.find((m: { reported: boolean }) => m.reported).id).toBe(coachMessageId);
      const viewed = await prisma.auditLog.count({ where: { entityType: "SafetyReport", entityId: report.id, action: "safety_report.viewed" } });
      expect(viewed).toBeGreaterThanOrEqual(1);
    });

    it("removing the message hides it in both apps, notifies the reporter, and can't be done twice", async () => {
      const report = await prisma.safetyReport.findFirstOrThrow({ where: { messageId: coachMessageId } });
      const res = await request(app)
        .post(`/admin/safety-reports/${report.id}/resolve`)
        .set("Authorization", supportAuth)
        .send({ outcome: "message_removed", reason: "Abusive message to a client" });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: "actioned", outcome: "message_removed" });

      const thread = await request(app).get(`/coaching/conversations/${professionalId}`).set("Authorization", userAuth);
      const removed = thread.body.messages.find((m: { id: string }) => m.id === coachMessageId);
      expect(removed).toMatchObject({ removed: true, content: "Removed by Fynrox" });
      const coachThread = await request(app).get(`/professionals/me/conversations/${userId}`).set("Authorization", proAuth);
      expect(coachThread.body.messages.find((m: { id: string }) => m.id === coachMessageId).content).toBe("Removed by Fynrox");

      const notice = await prisma.notification.findFirst({ where: { userId, title: "Thanks for your report" } });
      expect(notice).not.toBeNull();

      const twice = await request(app)
        .post(`/admin/safety-reports/${report.id}/resolve`)
        .set("Authorization", supportAuth)
        .send({ outcome: "dismissed", reason: "Second decision attempt" });
      expect(twice.status).toBe(409);
    });

    it("records a suspension only after the account really is suspended", async () => {
      const report = await prisma.safetyReport.findFirstOrThrow({ where: { reportedUserId: userId, status: "open" } });
      const early = await request(app)
        .post(`/admin/safety-reports/${report.id}/resolve`)
        .set("Authorization", supportAuth)
        .send({ outcome: "account_suspended", reason: "Spam to the coach repeatedly" });
      expect(early.status).toBe(409);
      expect(early.body.error.code).toBe("suspend_first");

      const warn = await request(app)
        .post(`/admin/safety-reports/${report.id}/resolve`)
        .set("Authorization", supportAuth)
        .send({ outcome: "warning", reason: "First report, a warning is enough" });
      expect(warn.status).toBe(200);
      const warning = await prisma.notification.findFirst({ where: { userId, title: "A message you sent was reported" } });
      expect(warning).not.toBeNull();
    });
  });
});
