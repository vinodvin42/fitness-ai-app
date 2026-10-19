import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";

/**
 * Maker-checker (FynroX blueprint section 5, decision D21), end to end
 * against a real gated route — PATCH /admin/plans/:id (commerce:edit).
 *
 * - The Super Admin's change applies directly and the audit log keeps his reason.
 * - Finance's change becomes a pending approval request (202); nothing changes.
 * - Only the Super Admin can approve; approving re-runs the route as the
 *   maker and the audit entry records maker + checker.
 * - The co-founder's change is always a request.
 * - Reject / request changes / expiry / withdraw behave as documented.
 *
 * Rate limits: admin login shares authRateLimit (10 per 15 min); this file
 * logs in 4 times.
 */
describe("Maker-checker approvals (D21)", () => {
  const app = buildApp();
  const password = "MakerCheckerPass9!";
  const adminIds: string[] = [];
  const planIds: string[] = [];
  let superToken: string;
  let superId: string;
  let financeToken: string;
  let financeId: string;
  let cofounderToken: string;
  let supportToken: string;

  async function createAdmin(role: string) {
    const admin = await prisma.adminUser.create({
      data: { email: uniqueEmail(`mc-${role}`), passwordHash: await hashPassword(password), fullName: `MC ${role}`, role: role as never, status: "active" },
    });
    adminIds.push(admin.id);
    const login = await request(app).post("/admin/auth/login").send({ email: admin.email, password });
    expect(login.status).toBe(200);
    return { id: admin.id, token: login.body.token as string };
  }

  async function createPlan(priceCents = 29900) {
    const plan = await prisma.subscriptionPlan.create({
      data: { name: `MC plan ${uniqueSuffix()}`, tier: "grow", billingCycle: "monthly", priceCents, isActive: false },
    });
    planIds.push(plan.id);
    return plan;
  }

  beforeAll(async () => {
    ({ id: superId, token: superToken } = await createAdmin("super_admin"));
    ({ id: financeId, token: financeToken } = await createAdmin("finance"));
    ({ token: cofounderToken } = await createAdmin("co_founder"));
    ({ token: supportToken } = await createAdmin("support"));
  });

  afterAll(async () => {
    await prisma.approvalRequest.deleteMany({ where: { makerAdminId: { in: adminIds } } });
    await prisma.auditLog.deleteMany({ where: { actorAdminId: { in: adminIds } } });
    await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } });
    await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
    await prisma.$disconnect();
  });

  it("applies the Super Admin's change directly and records his reason", async () => {
    const plan = await createPlan();
    const res = await request(app)
      .patch(`/admin/plans/${plan.id}`)
      .set("Authorization", `Bearer ${superToken}`)
      .set("X-Change-Reason", "Owner decision: Grow price for testing")
      .send({ priceCents: 34900 });
    expect(res.status).toBe(200);
    expect(res.body.plan.priceCents).toBe(34900);

    const audit = await prisma.auditLog.findFirst({
      where: { actorAdminId: superId, entityId: plan.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.reason).toBe("Owner decision: Grow price for testing");
    expect(audit?.checkerAdminId).toBeNull();
  });

  it("turns Finance's change into a pending request (202) and changes nothing", async () => {
    const plan = await createPlan();
    const res = await request(app)
      .patch(`/admin/plans/${plan.id}`)
      .set("Authorization", `Bearer ${financeToken}`)
      .send({ priceCents: 39900, reason: "Align price with the new Grow plan" });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe("pending_approval");
    expect(res.body.approvalRequest.status).toBe("pending");

    const unchanged = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(unchanged.priceCents).toBe(29900);
  });

  it("refuses a maker's request without a reason", async () => {
    const plan = await createPlan();
    const res = await request(app)
      .patch(`/admin/plans/${plan.id}`)
      .set("Authorization", `Bearer ${financeToken}`)
      .send({ priceCents: 39900 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("reason_required");
  });

  it("lets only the Super Admin approve, applies the change as the maker, and audits maker + checker", async () => {
    const plan = await createPlan();
    const made = await request(app)
      .patch(`/admin/plans/${plan.id}`)
      .set("Authorization", `Bearer ${financeToken}`)
      .send({ priceCents: 44900, reason: "Price review approved in finance meeting" });
    expect(made.status).toBe(202);
    const approvalId = made.body.approvalRequest.id as string;

    const byFinance = await request(app).post(`/admin/approvals/${approvalId}/approve`).set("Authorization", `Bearer ${financeToken}`).send({});
    expect(byFinance.status).toBe(403);

    const byCofounder = await request(app).post(`/admin/approvals/${approvalId}/approve`).set("Authorization", `Bearer ${cofounderToken}`).send({});
    expect(byCofounder.status).toBe(403);

    const approved = await request(app)
      .post(`/admin/approvals/${approvalId}/approve`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ note: "Approved" });
    expect(approved.status).toBe(200);
    expect(approved.body.approval.status).toBe("approved");
    expect(approved.body.approval.resultStatus).toBe(200);

    const changed = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(changed.priceCents).toBe(44900);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: plan.id, approvalRequestId: approvalId, actorAdminId: financeId },
    });
    expect(audit).not.toBeNull();
    expect(audit?.checkerAdminId).toBe(superId);
    expect(audit?.reason).toBe("Price review approved in finance meeting");

    const again = await request(app).post(`/admin/approvals/${approvalId}/approve`).set("Authorization", `Bearer ${superToken}`).send({});
    expect(again.status).toBe(409);
  });

  it("always sends the co-founder's change for approval", async () => {
    const plan = await createPlan();
    const res = await request(app)
      .patch(`/admin/plans/${plan.id}`)
      .set("Authorization", `Bearer ${cofounderToken}`)
      .send({ priceCents: 59900, reason: "Prime price proposal from the co-founder" });
    expect(res.status).toBe(202);
  });

  it("rejects and asks for changes without applying anything", async () => {
    const plan = await createPlan();
    const first = await request(app)
      .patch(`/admin/plans/${plan.id}`)
      .set("Authorization", `Bearer ${financeToken}`)
      .send({ priceCents: 10000, reason: "Trial a lower monthly price" });
    const rejected = await request(app)
      .post(`/admin/approvals/${first.body.approvalRequest.id}/reject`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ note: "Not now" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.approval.status).toBe("rejected");

    const second = await request(app)
      .patch(`/admin/plans/${plan.id}`)
      .set("Authorization", `Bearer ${financeToken}`)
      .send({ priceCents: 12000, reason: "Trial a slightly lower monthly price" });
    const changes = await request(app)
      .post(`/admin/approvals/${second.body.approvalRequest.id}/request-changes`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ note: "Show the revenue impact first" });
    expect(changes.status).toBe(200);
    expect(changes.body.approval.status).toBe("changes_requested");

    const unchanged = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(unchanged.priceCents).toBe(29900);
  });

  it("expires a request past its expiry and refuses to approve it", async () => {
    const plan = await createPlan();
    const made = await request(app)
      .patch(`/admin/plans/${plan.id}`)
      .set("Authorization", `Bearer ${financeToken}`)
      .send({ priceCents: 20000, reason: "This one will be left to expire" });
    const id = made.body.approvalRequest.id as string;
    await prisma.approvalRequest.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await request(app).post(`/admin/approvals/${id}/approve`).set("Authorization", `Bearer ${superToken}`).send({});
    expect(res.status).toBe(409);
    const row = await prisma.approvalRequest.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("expired");
  });

  it("lets the maker withdraw a pending request, and shows makers only their own", async () => {
    const plan = await createPlan();
    const made = await request(app)
      .patch(`/admin/plans/${plan.id}`)
      .set("Authorization", `Bearer ${financeToken}`)
      .send({ priceCents: 25000, reason: "Withdraw test for the inbox" });
    const id = made.body.approvalRequest.id as string;

    const cancelled = await request(app).post(`/admin/approvals/${id}/cancel`).set("Authorization", `Bearer ${financeToken}`).send({});
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.approval.status).toBe("cancelled");

    const supportList = await request(app).get("/admin/approvals").set("Authorization", `Bearer ${supportToken}`);
    expect(supportList.status).toBe(200);
    expect(supportList.body.approvals.every((a: { maker: { id: string } }) => a.maker.id !== financeId)).toBe(true);

    const superList = await request(app).get("/admin/approvals").set("Authorization", `Bearer ${superToken}`);
    expect(superList.body.approvals.some((a: { id: string }) => a.id === id)).toBe(true);
  });

  it("needs a reason from the Super Admin too when SUPER_ADMIN_REASON_REQUIRED is on", async () => {
    const previous = process.env.SUPER_ADMIN_REASON_REQUIRED;
    process.env.SUPER_ADMIN_REASON_REQUIRED = "true";
    try {
      const plan = await createPlan();
      const missing = await request(app).patch(`/admin/plans/${plan.id}`).set("Authorization", `Bearer ${superToken}`).send({ priceCents: 31900 });
      expect(missing.status).toBe(422);
      expect(missing.body.error.code).toBe("reason_required");

      const encoded = await request(app)
        .patch(`/admin/plans/${plan.id}`)
        .set("Authorization", `Bearer ${superToken}`)
        .set("X-Change-Reason", encodeURIComponent("₹319 trial price — मालिक का निर्णय"))
        .send({ priceCents: 31900 });
      expect(encoded.status).toBe(200);
      const audit = await prisma.auditLog.findFirst({ where: { actorAdminId: superId, entityId: plan.id }, orderBy: { createdAt: "desc" } });
      expect(audit?.reason).toBe("₹319 trial price — मालिक का निर्णय");
    } finally {
      if (previous === undefined) delete process.env.SUPER_ADMIN_REASON_REQUIRED;
      else process.env.SUPER_ADMIN_REASON_REQUIRED = previous;
    }
  });

  it("refuses writes from a session whose admin was disabled or changed role", async () => {
    const plan = await createPlan();
    await prisma.adminUser.update({ where: { id: financeId }, data: { role: "support" } });
    try {
      const res = await request(app)
        .patch(`/admin/plans/${plan.id}`)
        .set("Authorization", `Bearer ${financeToken}`)
        .send({ priceCents: 39900, reason: "Old session after a role change" });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("session_outdated");
    } finally {
      await prisma.adminUser.update({ where: { id: financeId }, data: { role: "finance" } });
    }
  });

  it("still lets day-to-day reads through for every role", async () => {
    const res = await request(app).get("/admin/plans").set("Authorization", `Bearer ${financeToken}`);
    expect(res.status).toBe(200);
  });
});
