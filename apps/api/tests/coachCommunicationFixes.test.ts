import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { signProfessionalAccessToken } from "../src/lib/professionalJwt";
import { endRelationship } from "../src/modules/relationshipLifecycle/relationshipLifecycle.service";

/**
 * Coach ↔ client communication audit (20 Oct 2026), smaller findings fixed
 * on 25 Oct 2026. Real Postgres, no mocked Prisma.
 * - S2: chat sends have their own per-account rate limit instead of the
 *   IP-keyed writeRateLimit every other write route shares.
 * - S3: the client gets an inbox row when their coaching is ended.
 * - S6: when staff remove a coach's message, its copy in the client's inbox
 *   is hidden too.
 */
describe("Coach ↔ client communication fixes (audit S2, S3, S6)", () => {
  const app = buildApp();
  const adminPassword = "CoachCommsAdmin9!";
  const userIds: string[] = [];
  const professionalIds: string[] = [];
  let adminId = "";
  let supportAuth = "";

  async function makeUser(label: string) {
    const res = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail(`comms-${label}`), password: "SomePassword1!", fullName: `Comms ${label} Client` });
    userIds.push(res.body.user.id);
    return { id: res.body.user.id as string, auth: `Bearer ${res.body.tokens.accessToken}` };
  }

  async function makeProfessional(label: string) {
    const professional = await prisma.professional.create({
      data: {
        email: `comms-${label}-${uniqueSuffix()}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: `Comms ${label} Coach`,
        status: "active",
      },
    });
    professionalIds.push(professional.id);
    return {
      id: professional.id,
      fullName: professional.fullName,
      auth: `Bearer ${signProfessionalAccessToken({ sub: professional.id, email: professional.email }).token}`,
    };
  }

  beforeAll(async () => {
    const admin = await prisma.adminUser.create({
      data: {
        email: uniqueEmail("comms-support"),
        passwordHash: await hashPassword(adminPassword),
        fullName: "Comms Support Admin",
        role: "support",
        status: "active",
      } as never,
    });
    adminId = admin.id;
    const login = await request(app).post("/admin/auth/login").send({ email: admin.email, password: adminPassword });
    supportAuth = `Bearer ${login.body.token}`;
  });

  afterAll(async () => {
    await prisma.safetyReport.deleteMany({ where: { OR: [{ reporterUserId: { in: userIds } }, { reportedProfessionalId: { in: professionalIds } }] } });
    await prisma.coachChatBlock.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.coachMessage.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.relationship.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.professional.deleteMany({ where: { id: { in: professionalIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  describe("S2: chat rate limit", () => {
    it(
      "is per account and separate from other writes: 120 sends go through, the next is refused, the client and the coach's other writes are unaffected",
      async () => {
        const client = await makeUser("chat");
        const coach = await makeProfessional("chat");
        await prisma.relationship.create({ data: { userId: client.id, professionalId: coach.id, serviceType: "fitness", status: "active" } });

        // The old shared write limit refused the 31st write in 15 minutes.
        const statuses: number[] = [];
        for (let i = 1; i <= 120; i += 1) {
          const res = await request(app)
            .post(`/professionals/me/conversations/${client.id}`)
            .set("Authorization", coach.auth)
            .send({ content: `Reply ${i}` });
          statuses.push(res.status);
        }
        expect(statuses.filter((s) => s !== 201)).toEqual([]);

        const over = await request(app)
          .post(`/professionals/me/conversations/${client.id}`)
          .set("Authorization", coach.auth)
          .send({ content: "One too many" });
        expect(over.status).toBe(429);
        expect(over.body.error.code).toBe("too_many_requests");

        // Same IP (supertest's loopback), different account: its own allowance.
        const reply = await request(app)
          .post(`/coaching/conversations/${coach.id}`)
          .set("Authorization", client.auth)
          .send({ content: "Thanks!" });
        expect(reply.status).toBe(201);

        // Chat didn't use up the coach's other writes (block is on writeRateLimit).
        const block = await request(app).post(`/professionals/me/conversations/${client.id}/block`).set("Authorization", coach.auth);
        expect(block.status).toBe(200);
      },
      120_000,
    );
  });

  describe("S6: removed coach message in the inbox", () => {
    it("hides the removed message's inbox copy and leaves the coach's other messages alone", async () => {
      const client = await makeUser("removed");
      const coach = await makeProfessional("removed");
      await prisma.relationship.create({ data: { userId: client.id, professionalId: coach.id, serviceType: "fitness", status: "active" } });

      const removedText = "Pay me in cash or I stop coaching you";
      const keptText = "See you on Tuesday at 7";
      const bad = await request(app).post(`/professionals/me/conversations/${client.id}`).set("Authorization", coach.auth).send({ content: removedText });
      expect(bad.status).toBe(201);
      const kept = await request(app).post(`/professionals/me/conversations/${client.id}`).set("Authorization", coach.auth).send({ content: keptText });
      expect(kept.status).toBe(201);

      const report = await request(app)
        .post(`/coaching/conversations/${coach.id}/report`)
        .set("Authorization", client.auth)
        .send({ reason: "spam_or_scam", messageId: bad.body.id });
      expect(report.status).toBe(201);
      const resolved = await request(app)
        .post(`/admin/safety-reports/${report.body.id}/resolve`)
        .set("Authorization", supportAuth)
        .send({ outcome: "message_removed", reason: "Asked a client for off-platform payment" });
      expect(resolved.status).toBe(200);

      const inbox = await request(app).get("/notifications?limit=100").set("Authorization", client.auth);
      expect(inbox.status).toBe(200);
      const fromCoach = (inbox.body.items as Array<{ title: string; body: string }>).filter((n) => n.title === "New message from your coach");
      expect(fromCoach.map((n) => n.body).sort()).toEqual(["Removed by Fynrox", keptText].sort());
      const leaked = await prisma.notification.count({ where: { userId: client.id, body: { contains: "cash" } } });
      expect(leaked).toBe(0);
    });
  });

  describe("S3: the client hears when coaching ends", () => {
    it("a coach ending active coaching leaves the client a plain inbox row, without the coach's reason", async () => {
      const client = await makeUser("ended");
      const coach = await makeProfessional("ended");
      const relationship = await prisma.relationship.create({
        data: { userId: client.id, professionalId: coach.id, serviceType: "nutrition", status: "active" },
      });

      const res = await request(app)
        .post(`/professionals/me/relationships/${relationship.id}/end`)
        .set("Authorization", coach.auth)
        .send({ reason: "Client keeps missing sessions" });
      expect(res.status).toBe(200);

      const rows = await prisma.notification.findMany({ where: { userId: client.id, kind: "coach" } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        title: "Your coaching has ended",
        body: `Your nutrition coaching with ${coach.fullName} has ended. You can ask for a new coach whenever you're ready.`,
        deepLink: null,
      });
      expect(rows[0].body).not.toContain("missing sessions");
    });

    it("ending a request that never started says the request was closed; ending finished coaching adds nothing", async () => {
      const client = await makeUser("closed");
      const coach = await makeProfessional("closed");
      const requested = await prisma.relationship.create({
        data: { userId: client.id, professionalId: coach.id, serviceType: "fitness", status: "requested" },
      });
      const completed = await prisma.relationship.create({
        data: { userId: client.id, professionalId: coach.id, serviceType: "nutrition", status: "completed" },
      });

      await endRelationship({ adminId }, requested.id, "Coach is no longer taking clients");
      await endRelationship({ adminId }, completed.id, "Tidying up a finished programme");

      const rows = await prisma.notification.findMany({ where: { userId: client.id, kind: "coach" } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        title: "Your coaching request was closed",
        body: `Your fitness coaching request with ${coach.fullName} was closed. You can ask for a new coach whenever you're ready.`,
      });
    });
  });
});
