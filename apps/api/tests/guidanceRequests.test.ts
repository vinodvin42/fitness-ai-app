import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { r1Flags } from "@fitness-ai-app/config";
import { returnToQueue } from "../src/modules/guidanceRequests/guidanceRequests.service";

const app = buildApp();

/**
 * Handoff §2 decision #4 (controlled assignment, no browsing) and
 * journey F5, which the handoff records as broken because "Nothing turns
 * a request into an offer".
 *
 * This is the whole chain end to end over real HTTP: user requests
 * guidance without naming anyone -> it lands in A-M1's queue -> an admin
 * matches a professional -> an offer goes out -> the professional
 * accepts or declines -> the request is fulfilled or returns to the
 * queue, up to D11's re-match limit.
 */
describe("Guidance requests — controlled assignment (decision #4, journey F5)", () => {
  let adminToken: string;
  let adminId: string;
  let professionalId: string;
  let professionalToken: string;
  const cleanupUserIds: string[] = [];
  const ADMIN_PASSWORD = "AdminPass123!";
  const PRO_PASSWORD = "ProPass123!";

  async function makeUser(label: string) {
    const email = uniqueEmail(label);
    const res = await request(app)
      .post("/auth/signup")
      .send({ email, password: "Testpass123!", fullName: `F5 ${label}` });
    expect(res.status).toBe(201);
    cleanupUserIds.push(res.body.user.id);
    return { id: res.body.user.id as string, token: res.body.tokens.accessToken as string };
  }

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    const admin = await prisma.adminUser.create({
      data: {
        email: `admin-guidance-${suffix}@example.com`,
        passwordHash: await hashPassword(ADMIN_PASSWORD),
        fullName: "Guidance Fixture Admin",
        role: "super_admin",
        status: "active",
      },
    });
    adminId = admin.id;
    const login = await request(app).post("/admin/auth/login").send({ email: admin.email, password: ADMIN_PASSWORD });
    adminToken = login.body.token;

    const proEmail = `pro-guidance-${suffix}@example.com`;
    const pro = await prisma.professional.create({
      data: {
        email: proEmail,
        passwordHash: await hashPassword(PRO_PASSWORD),
        fullName: "Guidance Fixture Coach",
        status: "active",
        lifecycleStatus: "available",
        maxActiveClients: 20,
      },
    });
    professionalId = pro.id;
    const proLogin = await request(app)
      .post("/professionals/auth/login")
      .send({ email: proEmail, password: PRO_PASSWORD });
    professionalToken = proLogin.body.tokens?.accessToken ?? proLogin.body.accessToken ?? proLogin.body.token;
    expect(professionalToken).toBeTruthy();
  });

  afterAll(async () => {
    await prisma.guidanceRequest.deleteMany({ where: { userId: { in: cleanupUserIds } } });
    await prisma.professionalOffer.deleteMany({ where: { professionalId } });
    await prisma.relationship.deleteMany({ where: { professionalId } });
    await prisma.adminActionItem.deleteMany({ where: { entityType: "GuidanceRequest" } });
    await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
    await prisma.professional.deleteMany({ where: { id: professionalId } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
  });

  it("lets a user ask for guidance without naming a professional", async () => {
    const user = await makeUser("request");
    const res = await request(app)
      .post("/coaching/guidance-requests")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ serviceType: "fitness", userNote: "Training for a 10k" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("open");
    // The whole point: no professionalId anywhere in the request.
    expect(res.body).not.toHaveProperty("professionalId");
  });

  it("surfaces an unmatched request on the admin action queue (A-M1)", async () => {
    const user = await makeUser("queued");
    const created = await request(app)
      .post("/coaching/guidance-requests")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ serviceType: "fitness" });

    const items = await prisma.adminActionItem.findMany({
      where: { entityType: "GuidanceRequest", entityId: created.body.id },
    });
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("professional_assignment_pending");
  });

  it("coalesces a repeated request rather than queueing it twice", async () => {
    const user = await makeUser("repeat");
    const auth = { Authorization: `Bearer ${user.token}` };
    const a = await request(app).post("/coaching/guidance-requests").set(auth).send({ serviceType: "fitness" });
    const b = await request(app).post("/coaching/guidance-requests").set(auth).send({ serviceType: "fitness" });
    expect(b.body.id).toBe(a.body.id);
    expect(await prisma.guidanceRequest.count({ where: { userId: user.id } })).toBe(1);
  });

  it("matches a request to a professional and sends a real offer", async () => {
    const user = await makeUser("matched");
    const created = await request(app)
      .post("/coaching/guidance-requests")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ serviceType: "fitness" });

    const matched = await request(app)
      .post(`/admin/guidance-requests/${created.body.id}/match`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ professionalId });
    expect(matched.status).toBe(201);
    expect(matched.body.request.status).toBe("offered");

    const offer = await prisma.professionalOffer.findUnique({ where: { id: matched.body.offer.id } });
    expect(offer?.userId).toBe(user.id);
    expect(offer?.professionalId).toBe(professionalId);
    expect(offer?.status).toBe("offered");
  });

  it("marks the request fulfilled once the professional accepts", async () => {
    const user = await makeUser("accepted");
    const created = await request(app)
      .post("/coaching/guidance-requests")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ serviceType: "fitness" });
    const matched = await request(app)
      .post(`/admin/guidance-requests/${created.body.id}/match`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ professionalId });

    const accept = await request(app)
      .post(`/professionals/me/offers/${matched.body.offer.id}/accept`)
      .set("Authorization", `Bearer ${professionalToken}`)
      .send();
    expect(accept.status).toBe(200);

    const req = await prisma.guidanceRequest.findUnique({ where: { id: created.body.id } });
    expect(req?.status).toBe("fulfilled");
    expect(req?.resolvedAt).not.toBeNull();
  });

  it("returns the request to the queue when the professional declines", async () => {
    const user = await makeUser("declined");
    const created = await request(app)
      .post("/coaching/guidance-requests")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ serviceType: "nutrition" });
    const matched = await request(app)
      .post(`/admin/guidance-requests/${created.body.id}/match`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ professionalId });

    const decline = await request(app)
      .post(`/professionals/me/offers/${matched.body.offer.id}/decline`)
      .set("Authorization", `Bearer ${professionalToken}`)
      .send({ reason: "At capacity this month" });
    expect(decline.status).toBe(200);

    const req = await prisma.guidanceRequest.findUnique({ where: { id: created.body.id } });
    expect(req?.status).toBe("open");
    expect(req?.rematchCount).toBe(1);
    expect(req?.offerId).toBeNull();
  });

  it("stops re-matching at D11's limit and escalates instead of looping", async () => {
    const user = await makeUser("exhausted");
    const created = await request(app)
      .post("/coaching/guidance-requests")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ serviceType: "fitness" });
    const id = created.body.id as string;

    for (let i = 0; i < r1Flags.MAX_REMATCH_ATTEMPTS; i++) {
      await prisma.guidanceRequest.update({ where: { id }, data: { status: "offered" } });
      await returnToQueue(id, "declined");
    }

    const req = await prisma.guidanceRequest.findUnique({ where: { id } });
    expect(req?.status).toBe("exhausted");
    expect(req?.rematchCount).toBe(r1Flags.MAX_REMATCH_ATTEMPTS);

    const escalations = await prisma.adminActionItem.findMany({
      where: { entityType: "GuidanceRequest", entityId: id, severity: "high" },
    });
    expect(escalations.length).toBeGreaterThan(0);
  });

  it("refuses a second request for a service the user already has active (§10 limit)", async () => {
    const user = await makeUser("limited");
    await prisma.relationship.create({
      data: { userId: user.id, professionalId, serviceType: "fitness", status: "active" },
    });

    const res = await request(app)
      .post("/coaching/guidance-requests")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ serviceType: "fitness" });
    expect(res.status).toBe(409);
  });

  it("refuses to match a request that is not open", async () => {
    const user = await makeUser("closed");
    const created = await request(app)
      .post("/coaching/guidance-requests")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ serviceType: "fitness" });
    await request(app)
      .post(`/coaching/guidance-requests/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${user.token}`)
      .send();

    const res = await request(app)
      .post(`/admin/guidance-requests/${created.body.id}/match`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ professionalId });
    expect(res.status).toBe(409);
  });

  it("does not let one user see or cancel another user's request", async () => {
    const owner = await makeUser("gr-owner");
    const stranger = await makeUser("gr-stranger");
    const created = await request(app)
      .post("/coaching/guidance-requests")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ serviceType: "fitness" });

    const list = await request(app)
      .get("/coaching/guidance-requests")
      .set("Authorization", `Bearer ${stranger.token}`);
    expect(list.body).toHaveLength(0);

    const cancel = await request(app)
      .post(`/coaching/guidance-requests/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .send();
    expect(cancel.status).toBe(404);
  });

  it("requires admin auth for the assignment queue", async () => {
    expect((await request(app).get("/admin/guidance-requests")).status).toBe(401);
  });
});
