import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { signProfessionalAccessToken } from "../src/lib/professionalJwt";
import { createActionItem, resolveActionItem } from "../src/lib/adminActionQueue";

/**
 * Admin Action Required queue (R2 Wave 1, 20 Sep 2026) — the real,
 * persisted `AdminActionItem` aggregation model and its write-path (see
 * schema.prisma's own doc comment and lib/adminActionQueue.ts's top
 * comment for the full design this wave built).
 *
 * Covers:
 *  - createActionItem() itself (direct unit-level call).
 *  - Each of the 5 real, ongoing call sites wired this wave actually
 *    creates a real AdminActionItem when its own real trigger fires:
 *    support ticket creation, escalation, a pending refund, a
 *    relationship change request, a submitted credential, and (the sixth
 *    real source within the "5 siloed screens" group) a safety
 *    escalation.
 *  - The atomic claim-once resolve discipline (two concurrent resolves,
 *    exactly one succeeds) — same shape as refundOverRefundRace.test.ts /
 *    paymentsActivationRace.test.ts.
 *  - The filterable GET /admin/action-items read endpoint.
 */
describe("Admin Action Required queue: AdminActionItem write-path + read endpoint", () => {
  const app = buildApp();
  const adminPassword = "AdminActionQueuePass9!";
  let superAdminEmail: string;
  let superAdminId: string;
  const cleanupUserIds: string[] = [];
  const cleanupAdminIds: string[] = [];
  const cleanupProfessionalIds: string[] = [];

  beforeAll(async () => {
    superAdminEmail = uniqueEmail("admin-action-queue-super");
    const superAdmin = await prisma.adminUser.create({
      data: {
        email: superAdminEmail,
        passwordHash: await hashPassword(adminPassword),
        fullName: "Action Queue Super Admin",
        role: "super_admin",
        status: "active",
      },
    });
    superAdminId = superAdmin.id;
    cleanupAdminIds.push(superAdminId);
  });

  afterAll(async () => {
    await prisma.adminActionItem.deleteMany({
      where: { OR: [{ assignedToAdminId: { in: cleanupAdminIds } }, { resolvedByAdminId: { in: cleanupAdminIds } }] },
    });
    if (cleanupUserIds.length) await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
    if (cleanupProfessionalIds.length) await prisma.professional.deleteMany({ where: { id: { in: cleanupProfessionalIds } } });
    await prisma.adminUser.deleteMany({ where: { id: { in: cleanupAdminIds } } });
    await prisma.$disconnect();
  });

  async function loginSuperAdmin(): Promise<string> {
    const res = await request(app).post("/admin/auth/login").send({ email: superAdminEmail, password: adminPassword });
    expect(res.status).toBe(200);
    return res.body.token;
  }

  it("createActionItem() persists a real, filterable-by-type row", async () => {
    const created = await createActionItem({
      type: "chargeback",
      entityType: "Payment",
      entityId: `test-payment-${uniqueSuffix()}`,
      severity: "high",
      metadata: { reason: "unit test" },
    });

    const row = await prisma.adminActionItem.findUnique({ where: { id: created.id } });
    expect(row).toBeTruthy();
    expect(row?.type).toBe("chargeback");
    expect(row?.severity).toBe("high");
    expect(row?.status).toBe("open");

    await prisma.adminActionItem.delete({ where: { id: created.id } });
  });

  it("a submitted SupportTicket creates a real, low-severity 'support_ticket_open' item", async () => {
    const email = uniqueEmail("aq-support");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email, password: "SomePassword1!", fullName: "Action Queue Ticket Tester" });
    const userId = signupRes.body.user.id;
    cleanupUserIds.push(userId);
    const token = signupRes.body.tokens.accessToken;

    const ticketRes = await request(app)
      .post("/support/tickets")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "billing", subject: "Action queue test", message: "Testing the real queue wiring." });
    expect(ticketRes.status).toBe(201);
    const ticketId = ticketRes.body.id;

    const items = await prisma.adminActionItem.findMany({ where: { entityType: "SupportTicket", entityId: ticketId } });
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("support_ticket_open");
    expect(items[0].severity).toBe("low");
    expect(items[0].status).toBe("open");
  });

  it("escalating a ticket creates a real, medium-severity 'support_escalation' item", async () => {
    const email = uniqueEmail("aq-escalation");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email, password: "SomePassword1!", fullName: "Action Queue Escalation Tester" });
    const userId = signupRes.body.user.id;
    cleanupUserIds.push(userId);
    const token = signupRes.body.tokens.accessToken;

    const ticketRes = await request(app)
      .post("/support/tickets")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "bug", subject: "Escalation source test", message: "Needs escalation." });
    const ticketId = ticketRes.body.id;

    const adminToken = await loginSuperAdmin();
    const escalateRes = await request(app)
      .post(`/admin/support-tickets/${ticketId}/escalate`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "Needs finance review" });
    expect(escalateRes.status).toBe(201);
    const escalationId = escalateRes.body.escalation.id;

    const items = await prisma.adminActionItem.findMany({ where: { entityType: "Escalation", entityId: escalationId } });
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("support_escalation");
    expect(items[0].severity).toBe("medium");
  });

  it("onboarding with real medical/injury data creates a real, high-severity 'safety_escalation' item", async () => {
    const email = uniqueEmail("aq-safety");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email, password: "SomePassword1!", fullName: "Action Queue Safety Tester" });
    const userId = signupRes.body.user.id;
    cleanupUserIds.push(userId);
    const token = signupRes.body.tokens.accessToken;

    const res = await request(app)
      .put("/users/me/onboarding")
      .set("Authorization", `Bearer ${token}`)
      .send({ goals: ["strength"], trainingLevel: "beginner", medicalConditions: ["asthma"], injuries: [] });
    expect(res.status).toBe(200);

    const escalation = await prisma.safetyEscalation.findFirst({ where: { userId } });
    expect(escalation).toBeTruthy();

    const items = await prisma.adminActionItem.findMany({
      where: { entityType: "SafetyEscalation", entityId: escalation!.id },
    });
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("safety_escalation");
    expect(items[0].severity).toBe("high");
  });

  it("an admin-issued refund that lands 'pending' (no gateway configured) creates a real 'refund_impact' item", async () => {
    const email = uniqueEmail("aq-refund");
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Action Queue Refund Tester",
        referralCode: await generateUniqueReferralCode(),
      },
    });
    cleanupUserIds.push(user.id);

    const planId = `test-plan-aq-refund-${uniqueSuffix()}`;
    await prisma.subscriptionPlan.create({
      data: { id: planId, tier: "pro", name: "Action Queue Refund Plan", priceCents: 50000, billingCycle: "monthly", isActive: true },
    });

    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        purpose: "subscription",
        referenceId: planId,
        amountCents: 50000,
        currency: "INR",
        providerOrderId: `order_aq_refund_${uniqueSuffix()}`,
        status: "paid",
      },
    });

    const adminToken = await loginSuperAdmin();
    const refundRes = await request(app)
      .post(`/admin/payments/${payment.id}/refunds`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ amountCents: 50000, reason: "Test refund" });
    expect(refundRes.status).toBe(201);
    expect(refundRes.body.refund.status).toBe("pending"); // Razorpay is unconfigured in this suite
    const refundId = refundRes.body.refund.id;

    const items = await prisma.adminActionItem.findMany({ where: { entityType: "Refund", entityId: refundId } });
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("refund_impact");

    await prisma.refund.deleteMany({ where: { paymentId: payment.id } });
    await prisma.payment.deleteMany({ where: { id: payment.id } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: planId } });
  });

  it("a submitted RelationshipChangeRequest creates a real 'relationship_change_pending' item", async () => {
    const email = uniqueEmail("aq-changereq");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email, password: "SomePassword1!", fullName: "Action Queue Change Request Tester" });
    const userId = signupRes.body.user.id;
    cleanupUserIds.push(userId);
    const token = signupRes.body.tokens.accessToken;

    const suffix = uniqueSuffix();
    const professional = await prisma.professional.create({
      data: {
        email: `coach-aq-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Action Queue Fixture Coach",
        status: "active",
      },
    });
    cleanupProfessionalIds.push(professional.id);

    const relationship = await prisma.relationship.create({
      data: { userId, professionalId: professional.id, serviceType: "fitness", status: "active" },
    });

    const res = await request(app)
      .post(`/coaching/relationships/${relationship.id}/change-request`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "schedule_conflict" });
    expect(res.status).toBe(201);
    const changeRequestId = res.body.id;

    const items = await prisma.adminActionItem.findMany({
      where: { entityType: "RelationshipChangeRequest", entityId: changeRequestId },
    });
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("relationship_change_pending");

    await prisma.relationshipChangeRequest.deleteMany({ where: { relationshipId: relationship.id } });
    await prisma.relationship.deleteMany({ where: { id: relationship.id } });
  });

  it("a submitted ProfessionalCredential creates a real 'credential_verification_pending' item", async () => {
    const suffix = uniqueSuffix();
    const professional = await prisma.professional.create({
      data: {
        email: `coach-aq-cred-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Action Queue Fixture Credential Coach",
        status: "active",
      },
    });
    cleanupProfessionalIds.push(professional.id);
    const professionalToken = signProfessionalAccessToken({ sub: professional.id, email: professional.email }).token;

    const selectRes = await request(app)
      .put("/professionals/me/services")
      .set("Authorization", `Bearer ${professionalToken}`)
      .send({ services: ["fitness"] });
    expect(selectRes.status).toBe(200);

    const credRes = await request(app)
      .post("/professionals/me/credentials")
      .set("Authorization", `Bearer ${professionalToken}`)
      .send({ serviceType: "fitness", certificationName: "CPT", certifyingBody: "NASM", yearObtained: 2020 });
    expect(credRes.status).toBe(200);
    const credentialId = credRes.body.credential.id;

    const items = await prisma.adminActionItem.findMany({
      where: { entityType: "ProfessionalCredential", entityId: credentialId },
    });
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("credential_verification_pending");
  });

  it("resolveActionItem: exactly one of two concurrent resolves succeeds (claim-once discipline)", async () => {
    const created = await createActionItem({
      type: "payout_failed",
      entityType: "CoachSettlement",
      entityId: `test-settlement-${uniqueSuffix()}`,
      severity: "high",
    });

    const results = await Promise.allSettled([
      resolveActionItem(created.id, superAdminId, "Resolved by admin A"),
      resolveActionItem(created.id, superAdminId, "Resolved by admin B"),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ status: 409, code: "action_item_already_resolved" });

    const row = await prisma.adminActionItem.findUnique({ where: { id: created.id } });
    expect(row?.status).toBe("resolved");
    expect(row?.resolvedByAdminId).toBe(superAdminId);

    const auditRows = await prisma.auditLog.findMany({
      where: { action: "admin_action_item.resolved", entityId: created.id },
    });
    expect(auditRows).toHaveLength(1);

    await prisma.adminActionItem.delete({ where: { id: created.id } });
  });

  it("GET /admin/action-items is filterable by type/severity/status and requires dashboard:view", async () => {
    const unique = uniqueSuffix();
    const openItem = await createActionItem({
      type: "professional_complaint",
      entityType: "Professional",
      entityId: `test-professional-${unique}`,
      severity: "high",
    });

    const adminToken = await loginSuperAdmin();

    const noAuthRes = await request(app).get("/admin/action-items");
    expect(noAuthRes.status).toBe(401);

    const listRes = await request(app)
      .get("/admin/action-items")
      .query({ type: "professional_complaint", severity: "high", status: "open" })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    const found = listRes.body.items.find((i: { id: string }) => i.id === openItem.id);
    expect(found).toBeTruthy();
    expect(found.entityId).toBe(`test-professional-${unique}`);

    // POST assign/resolve real HTTP round trip too, not just the direct
    // lib-level calls exercised above.
    const assignRes = await request(app)
      .post(`/admin/action-items/${openItem.id}/assign`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ adminId: superAdminId });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.item.assignedToAdminId).toBe(superAdminId);

    const resolveRes = await request(app)
      .post(`/admin/action-items/${openItem.id}/resolve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ resolutionNote: "Handled via HTTP test" });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.item.status).toBe("resolved");
    expect(resolveRes.body.item.resolutionNote).toBe("Handled via HTTP test");

    const secondResolveRes = await request(app)
      .post(`/admin/action-items/${openItem.id}/resolve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(secondResolveRes.status).toBe(409);

    await prisma.adminActionItem.delete({ where: { id: openItem.id } });
  });
});
