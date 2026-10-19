import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { complaintDueDate, complaintReference } from "../src/lib/complaints";

/**
 * 08.03 Complaints (Oct 2026): a complaint is a support ticket with category
 * `complaint`. India's Consumer Protection (E-Commerce) Rules 2020, rule
 * 4(5): acknowledged at once with a reference, resolved within one month,
 * closed with an outcome. Real Postgres, no mocked Prisma.
 */
describe("Complaints", () => {
  const app = buildApp();
  const password = "ComplaintsAdmin9!";
  const userIds: string[] = [];
  const adminIds: string[] = [];
  let userId = "";
  let userAuth = "";
  let otherAuth = "";
  let supportAuth = "";
  let financeAuth = "";
  let superAuth = "";
  let complaintId = "";

  async function adminLogin(role: string): Promise<string> {
    const email = uniqueEmail(`cmp-${role}`);
    const admin = await prisma.adminUser.create({
      data: { email, passwordHash: await hashPassword(password), fullName: `CMP ${role}`, role, status: "active" } as never,
    });
    adminIds.push(admin.id);
    const login = await request(app).post("/admin/auth/login").send({ email, password });
    return `Bearer ${login.body.token}`;
  }

  async function signup(prefix: string) {
    const res = await request(app).post("/auth/signup").send({ email: uniqueEmail(prefix), password: "SomePassword1!", fullName: "CMP Member" });
    userIds.push(res.body.user.id);
    return { auth: `Bearer ${res.body.tokens.accessToken}`, id: res.body.user.id as string };
  }

  beforeAll(async () => {
    const u = await signup("cmp-user");
    userId = u.id;
    userAuth = u.auth;
    otherAuth = (await signup("cmp-other")).auth;
    supportAuth = await adminLogin("support");
    financeAuth = await adminLogin("finance");
    superAuth = await adminLogin("super_admin");
    await prisma.payment.create({
      data: {
        userId,
        purpose: "subscription",
        referenceId: "plan-for-complaint-test",
        amountCents: 49900,
        currency: "INR",
        providerOrderId: `order_cmp_${uniqueSuffix()}`,
        status: "paid",
      },
    });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.payment.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.supportTicket.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
    await prisma.$disconnect();
  });

  describe("the one-month resolve-by date", () => {
    it("is the earlier of 30 days and the same date next month, on India's calendar", () => {
      const ist = (d: Date) => d.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
      expect(ist(complaintDueDate(new Date("2027-01-31T06:00:00Z")))).toBe("28 Feb 2027");
      // 20:00 UTC on 30 Jan is already 31 Jan in India.
      expect(ist(complaintDueDate(new Date("2027-01-30T20:00:00Z")))).toBe("28 Feb 2027");
      expect(ist(complaintDueDate(new Date("2027-02-01T06:00:00Z")))).toBe("1 Mar 2027");
      expect(ist(complaintDueDate(new Date("2026-07-15T06:00:00Z")))).toBe("14 Aug 2026");
      expect(ist(complaintDueDate(new Date("2028-01-31T06:00:00Z")))).toBe("29 Feb 2028");
      expect(complaintReference("1a2b3c4d-0000-4000-8000-000000000000")).toBe("C-1A2B3C4D");
    });
  });

  describe("filing from the app", () => {
    it("acknowledges at once with a reference and due date, triages high and notifies the member", async () => {
      const res = await request(app)
        .post("/support/tickets")
        .set("Authorization", userAuth)
        .send({ category: "complaint", subject: "Charged twice", message: "I was charged twice for my plan on 3 Oct." });
      expect(res.status).toBe(201);
      complaintId = res.body.id;
      expect(res.body.priority).toBe("high");
      expect(res.body.complaint.reference).toBe(complaintReference(complaintId));
      expect(new Date(res.body.complaint.dueAt).getTime()).toBe(complaintDueDate(new Date(res.body.createdAt)).getTime());
      expect(res.body.complaint.outcome).toBeNull();
      expect(res.body.complaintClosedByAdminId).toBeUndefined();

      const notice = await prisma.notification.findFirst({ where: { userId, title: "We've received your complaint" } });
      expect(notice?.body).toContain(res.body.complaint.reference);
      expect(notice?.deepLink).toBe(`fynrox://support/tickets?ticketId=${complaintId}`);

      const mine = await request(app).get("/support/tickets").set("Authorization", userAuth);
      expect(mine.body.items[0].complaint.reference).toBe(res.body.complaint.reference);
    });

    it("an ordinary ticket has no complaint block", async () => {
      const res = await request(app).post("/support/tickets").set("Authorization", userAuth).send({ category: "bug", subject: "Crash", message: "It crashed" });
      expect(res.body.complaint).toBeUndefined();
      expect(res.body.priority).toBe("normal");
    });

    it("shows the grievance officer as not set until the owner supplies the details", async () => {
      const res = await request(app).get("/help/grievance-officer");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ name: null, designation: null, email: null, configured: false });
    });
  });

  describe("admin (08.03)", () => {
    it("lists complaints by deadline with stats; finance gets 403; search finds the reference", async () => {
      expect((await request(app).get("/admin/complaints").set("Authorization", financeAuth)).status).toBe(403);
      const res = await request(app).get("/admin/complaints?status=open").set("Authorization", supportAuth);
      expect(res.status).toBe(200);
      const row = res.body.complaints.find((c: { id: string }) => c.id === complaintId);
      expect(row).toMatchObject({ reference: complaintReference(complaintId), overdue: false, closedAt: null });
      expect(row.daysLeft).toBeGreaterThanOrEqual(28);
      expect(res.body.complaints.every((c: { closedAt: string | null }) => c.closedAt === null)).toBe(true);

      const found = await request(app).get("/admin/complaints").query({ search: complaintReference(complaintId) }).set("Authorization", supportAuth);
      expect(found.body.complaints.map((c: { id: string }) => c.id)).toEqual([complaintId]);
    });

    it("flags an overdue complaint", async () => {
      const late = await request(app).post("/support/tickets").set("Authorization", otherAuth).send({ category: "complaint", subject: "Late", message: "Old" });
      await prisma.supportTicket.update({ where: { id: late.body.id }, data: { complaintDueAt: new Date(Date.now() - 2 * 86_400_000) } });
      const res = await request(app).get("/admin/complaints?status=open").set("Authorization", supportAuth);
      const row = res.body.complaints.find((c: { id: string }) => c.id === late.body.id);
      expect(row.overdue).toBe(true);
      expect(res.body.complaints[0].id).toBe(late.body.id); // most urgent first
      expect(res.body.stats.overdue).toBeGreaterThanOrEqual(1);
    });

    it("the dossier shows billing only to roles that can see Commerce", async () => {
      const asSupport = await request(app).get(`/admin/complaints/${complaintId}`).set("Authorization", supportAuth);
      expect(asSupport.status).toBe(200);
      expect(asSupport.body).toMatchObject({ billing: null, billingHidden: true, message: "I was charged twice for my plan on 3 Oct." });
      expect(asSupport.body.user.id).toBe(userId);

      const asSuper = await request(app).get(`/admin/complaints/${complaintId}`).set("Authorization", superAuth);
      expect(asSuper.body.billingHidden).toBe(false);
      expect(asSuper.body.billing.payments).toHaveLength(1);
      expect(asSuper.body.billing.payments[0]).toMatchObject({ amountCents: 49900, status: "paid" });

      const ordinary = await prisma.supportTicket.findFirstOrThrow({ where: { userId, category: "bug" } });
      expect((await request(app).get(`/admin/complaints/${ordinary.id}`).set("Authorization", supportAuth)).status).toBe(404);
    });

    it("a complaint can't be resolved through ordinary triage; re-categorising a ticket as a complaint starts the clock", async () => {
      const blocked = await request(app).patch(`/admin/support-tickets/${complaintId}`).set("Authorization", supportAuth).send({ status: "resolved" });
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe("use_complaint_close");
      expect((await request(app).patch(`/admin/support-tickets/${complaintId}`).set("Authorization", supportAuth).send({ status: "in_progress" })).status).toBe(200);

      const ordinary = await prisma.supportTicket.findFirstOrThrow({ where: { userId, category: "bug" } });
      const moved = await request(app).patch(`/admin/support-tickets/${ordinary.id}`).set("Authorization", supportAuth).send({ category: "complaint" });
      expect(moved.status).toBe(200);
      expect(moved.body.ticket.complaint.reference).toBe(complaintReference(ordinary.id));
      const row = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ordinary.id } });
      expect(row.complaintDueAt?.getTime()).toBe(complaintDueDate(row.createdAt).getTime());
    });

    it("closing needs an outcome and a note; the member gets the note in the thread and a notice; then it's final", async () => {
      expect(
        (await request(app).post(`/admin/complaints/${complaintId}/close`).set("Authorization", supportAuth).send({ outcome: "upheld", reason: "short" })).status,
      ).toBe(400);
      expect(
        (await request(app).post(`/admin/complaints/${complaintId}/close`).set("Authorization", supportAuth).send({ outcome: "maybe", reason: "Refunded the duplicate charge" }))
          .status,
      ).toBe(400);

      const res = await request(app)
        .post(`/admin/complaints/${complaintId}/close`)
        .set("Authorization", supportAuth)
        .send({ outcome: "upheld", reason: "We refunded the duplicate charge of Rs 499 on 18 Oct." });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: "closed", outcome: "upheld", closedLate: false });

      const thread = await request(app).get(`/support/tickets/${complaintId}`).set("Authorization", userAuth);
      expect(thread.body.ticket.status).toBe("closed");
      expect(thread.body.ticket.complaint).toMatchObject({ outcome: "upheld", resolutionNote: "We refunded the duplicate charge of Rs 499 on 18 Oct." });
      expect(thread.body.messages.at(-1)).toMatchObject({ sender: "admin" });
      expect(thread.body.messages.at(-1).body).toContain("Outcome: Upheld.");

      const notice = await prisma.notification.findFirst({ where: { userId, title: "Your complaint has been closed" } });
      expect(notice?.body).toContain("Outcome: Upheld");
      expect(await prisma.auditLog.count({ where: { action: "complaint.closed", entityId: complaintId, reason: { not: null } } })).toBe(1);

      expect(
        (await request(app).post(`/admin/complaints/${complaintId}/close`).set("Authorization", supportAuth).send({ outcome: "not_upheld", reason: "Second try at closing" }))
          .status,
      ).toBe(409);
      const reopen = await request(app).patch(`/admin/support-tickets/${complaintId}`).set("Authorization", supportAuth).send({ status: "open" });
      expect(reopen.status).toBe(409);
      expect(reopen.body.error.code).toBe("complaint_closed");

      const closedList = await request(app).get("/admin/complaints?status=closed").set("Authorization", supportAuth);
      expect(closedList.body.complaints.find((c: { id: string }) => c.id === complaintId)).toMatchObject({ outcome: "upheld", closedByName: "CMP support" });
    });
  });
});
