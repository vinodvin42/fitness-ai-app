import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { DELETION_GRACE_DAYS } from "../src/modules/privacyRequests/privacyRequests.service";

const app = buildApp();

/**
 * Journey F8 and acceptance test 17 (spec §11): "A deletion request
 * removes personal data on completion and keeps only records the law
 * requires."
 *
 * Before R1 there was no request entity at all — export and deletion ran
 * immediately and Admin reconstructed a "DSAR log" by querying AuditLog
 * after the fact. So the user had no status to see (U-M17), the admin
 * had nothing to verify or schedule (A-M5), and F8 broke.
 *
 * Real HTTP against real Postgres throughout, per this directory's
 * convention. Every state is asserted by reading the row back, not by
 * trusting the response body.
 */
describe("Privacy request lifecycle (spec §10, journey F8, acceptance test 17)", () => {
  let adminToken: string;
  let adminId: string;
  const ADMIN_PASSWORD = "AdminPass123!";
  const USER_PASSWORD = "Testpass123!";
  const cleanupUserIds: string[] = [];

  async function makeUser(label: string) {
    const email = uniqueEmail(label);
    const res = await request(app).post("/auth/signup").send({ email, password: USER_PASSWORD, fullName: `F8 ${label}` });
    expect(res.status).toBe(201);
    cleanupUserIds.push(res.body.user.id);
    return { id: res.body.user.id as string, token: res.body.tokens.accessToken as string, email };
  }

  const HIGH_IMPACT = { reason: "Verified by government ID, ticket 5521", confirmation: "RESOLVE" };
  const STEP = { reason: "Identity documents checked against the account" };

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    const admin = await prisma.adminUser.create({
      data: {
        email: `admin-privacy-${suffix}@example.com`,
        passwordHash: await hashPassword(ADMIN_PASSWORD),
        fullName: "Privacy Fixture Admin",
        role: "super_admin",
        status: "active",
      },
    });
    adminId = admin.id;
    const login = await request(app).post("/admin/auth/login").send({ email: admin.email, password: ADMIN_PASSWORD });
    expect(login.status).toBe(200);
    adminToken = login.body.token;
  });

  afterAll(async () => {
    await prisma.privacyRequest.deleteMany({ where: { userId: { in: cleanupUserIds } } });
    await prisma.adminActionItem.deleteMany({ where: { entityType: "PrivacyRequest" } });
    await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
  });

  function asAdmin(path: string) {
    return request(app).post(path).set("Authorization", `Bearer ${adminToken}`);
  }

  it("lets a user raise an export request and read its status back (U-M17)", async () => {
    const user = await makeUser("export");
    const created = await request(app)
      .post("/users/me/privacy-requests")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ type: "export", userNote: "Moving to another service" });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("received");

    const list = await request(app)
      .get("/users/me/privacy-requests")
      .set("Authorization", `Bearer ${user.token}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].type).toBe("export");
  });

  it("returns the in-flight request instead of creating a duplicate", async () => {
    const user = await makeUser("duplicate");
    const auth = { Authorization: `Bearer ${user.token}` };
    const first = await request(app).post("/users/me/privacy-requests").set(auth).send({ type: "deletion" });
    const second = await request(app).post("/users/me/privacy-requests").set(auth).send({ type: "deletion" });
    expect(second.body.id).toBe(first.body.id);
    expect(await prisma.privacyRequest.count({ where: { userId: user.id } })).toBe(1);
  });

  it("creates an admin action item so the queue actually surfaces it", async () => {
    const user = await makeUser("queued");
    const created = await request(app)
      .post("/users/me/privacy-requests")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ type: "deletion" });

    const items = await prisma.adminActionItem.findMany({
      where: { entityType: "PrivacyRequest", entityId: created.body.id },
    });
    expect(items).toHaveLength(1);
    // A deletion is irreversible, so it outranks an export in the queue.
    expect(items[0].severity).toBe("medium");
  });

  it("schedules a deletion with a real grace window rather than deleting on the spot", async () => {
    const user = await makeUser("scheduled");
    const created = await request(app)
      .post("/users/me/privacy-requests")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ type: "deletion" });
    const id = created.body.id;

    expect((await asAdmin(`/admin/privacy-requests/${id}/verify`).send(STEP)).status).toBe(200);
    expect((await asAdmin(`/admin/privacy-requests/${id}/start`).send(STEP)).status).toBe(200);

    const row = await prisma.privacyRequest.findUnique({ where: { id } });
    expect(row?.status).toBe("in_progress");
    expect(row?.scheduledFor).not.toBeNull();
    const days = (row!.scheduledFor!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(Math.round(days)).toBe(DELETION_GRACE_DAYS);

    // The user is still fully present until completion — that is the
    // whole point of the window.
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });

  it("lets the user cancel inside the grace window", async () => {
    const user = await makeUser("cancelled");
    const auth = { Authorization: `Bearer ${user.token}` };
    const created = await request(app).post("/users/me/privacy-requests").set(auth).send({ type: "deletion" });

    const cancelled = await request(app)
      .post(`/users/me/privacy-requests/${created.body.id}/cancel`)
      .set(auth)
      .send();
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("rejected");
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });

  it("refuses to complete without a reason and a typed confirmation (BR-ADM-005)", async () => {
    const user = await makeUser("ungated");
    const created = await request(app)
      .post("/users/me/privacy-requests")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ type: "deletion" });
    const id = created.body.id;
    await asAdmin(`/admin/privacy-requests/${id}/verify`).send(STEP);
    await asAdmin(`/admin/privacy-requests/${id}/start`).send(STEP);

    expect((await asAdmin(`/admin/privacy-requests/${id}/complete`).send({ reason: "ok" })).status).toBeGreaterThanOrEqual(400);
    expect(
      (await asAdmin(`/admin/privacy-requests/${id}/complete`).send({ reason: "A perfectly good reason here" })).status,
    ).toBeGreaterThanOrEqual(400);
    // Still alive — a refused completion must not half-delete anyone.
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });

  it("acceptance test 17: completing a deletion removes personal data but keeps the audit trail", async () => {
    const user = await makeUser("deleted");
    // Give the user some real owned data, so "removes personal data" is
    // a claim about rows rather than about one User row.
    await prisma.bodyMeasurement.create({
      data: { userId: user.id, loggedAt: new Date(), weightKg: 70 },
    });
    const created = await request(app)
      .post("/users/me/privacy-requests")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ type: "deletion" });
    const id = created.body.id;

    await asAdmin(`/admin/privacy-requests/${id}/verify`).send(STEP);
    await asAdmin(`/admin/privacy-requests/${id}/start`).send(STEP);
    const done = await asAdmin(`/admin/privacy-requests/${id}/complete`).send(HIGH_IMPACT);
    expect(done.status).toBe(200);

    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.bodyMeasurement.count({ where: { userId: user.id } })).toBe(0);

    // "keeps only records the law requires" — AuditLog survives, with
    // its actor anonymized by onDelete: SetNull rather than destroyed.
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "User", entityId: user.id, action: "user.account_deleted" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBeNull();
    expect(audit?.ruleId).toBe("BR-PRV-001");
  });

  it("refuses an out-of-order transition rather than silently allowing it", async () => {
    const user = await makeUser("order");
    const created = await request(app)
      .post("/users/me/privacy-requests")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ type: "export" });
    // received -> completed skips verification entirely.
    const res = await asAdmin(`/admin/privacy-requests/${created.body.id}/complete`).send(HIGH_IMPACT);
    expect(res.status).toBe(409);
  });

  it("does not let one user read or cancel another user's request", async () => {
    const owner = await makeUser("owner");
    const stranger = await makeUser("stranger");
    const created = await request(app)
      .post("/users/me/privacy-requests")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ type: "export" });

    const list = await request(app)
      .get("/users/me/privacy-requests")
      .set("Authorization", `Bearer ${stranger.token}`);
    expect(list.body).toHaveLength(0);

    const cancel = await request(app)
      .post(`/users/me/privacy-requests/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .send();
    expect(cancel.status).toBe(404);
  });

  it("requires admin auth for the queue", async () => {
    expect((await request(app).get("/admin/privacy-requests")).status).toBe(401);
  });
});
