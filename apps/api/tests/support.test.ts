import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { hashPassword } from "../src/lib/password";

/**
 * Support tickets: consumer create/read/reply (support.service.ts), the
 * 404-not-403 ownership convention (getMyTicketOrThrow), and the admin
 * reply path (adminSupport.service.ts's addSupportTicketMessage, gated by
 * requirePermission("support", "edit")) — including that an admin's reply
 * shows up in the ticket owner's own view of the thread, and that it
 * writes a real AuditLog row.
 *
 * Rate limits: POST /support/tickets/:id/messages shares `writeRateLimit`
 * (30/15min) — only a couple of calls happen here. This file makes exactly
 * one admin login (`authRateLimit`, shared with consumer login — see
 * auth.test.ts's own comment), well clear of that limiter too.
 */
describe("Support tickets: ownership, replies, admin triage", () => {
  const app = buildApp();
  let ownerEmail: string;
  let ownerId: string;
  let ownerToken: string;
  let otherEmail: string;
  let otherId: string;
  let otherToken: string;
  let adminEmail: string;
  let adminId: string;
  let adminToken: string;
  let ticketId: string;

  beforeAll(async () => {
    ownerEmail = uniqueEmail("support-owner");
    const ownerRes = await request(app)
      .post("/auth/signup")
      .send({ email: ownerEmail, password: "SomePassword1!", fullName: "Ticket Owner" });
    ownerId = ownerRes.body.user.id;
    ownerToken = ownerRes.body.tokens.accessToken;

    otherEmail = uniqueEmail("support-other");
    const otherRes = await request(app)
      .post("/auth/signup")
      .send({ email: otherEmail, password: "SomePassword1!", fullName: "Unrelated User" });
    otherId = otherRes.body.user.id;
    otherToken = otherRes.body.tokens.accessToken;

    adminEmail = uniqueEmail("support-admin");
    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        passwordHash: await hashPassword("AdminOnlyPass9!"),
        fullName: "Support Admin",
        role: "support", // has support:view + support:edit per PERMISSION_MATRIX
        status: "active",
      },
    });
    adminId = admin.id;

    const adminLoginRes = await request(app)
      .post("/admin/auth/login")
      .send({ email: adminEmail, password: "AdminOnlyPass9!" });
    adminToken = adminLoginRes.body.token;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } }); // cascades the ticket + its messages
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("lets a user create a support ticket", async () => {
    const res = await request(app)
      .post("/support/tickets")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ category: "billing", subject: "Charged twice", message: "I was charged twice for Pro." });

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(ownerId);
    expect(res.body.status).toBe("open");
    ticketId = res.body.id;
  });

  it("lets the owner fetch the ticket's detail + thread, and reply to it", async () => {
    const detailRes = await request(app)
      .get(`/support/tickets/${ticketId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.ticket.id).toBe(ticketId);
    expect(detailRes.body.messages).toEqual([]);

    const replyRes = await request(app)
      .post(`/support/tickets/${ticketId}/messages`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ body: "Any update on this?" });
    expect(replyRes.status).toBe(201);
    expect(replyRes.body.sender).toBe("user");
    expect(replyRes.body.body).toBe("Any update on this?");
  });

  it("404s (not 403) for a different user reading or replying to someone else's ticket", async () => {
    const readRes = await request(app)
      .get(`/support/tickets/${ticketId}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(readRes.status).toBe(404);
    expect(readRes.body.error.code).toBe("support_ticket_not_found");

    const writeRes = await request(app)
      .post(`/support/tickets/${ticketId}/messages`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ body: "Trying to snoop" });
    expect(writeRes.status).toBe(404);
    expect(writeRes.body.error.code).toBe("support_ticket_not_found");
  });

  it("lets an admin with support:edit reply, and the reply shows up in the owner's own view", async () => {
    const adminReplyRes = await request(app)
      .post(`/admin/support-tickets/${ticketId}/messages`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ body: "We've refunded the duplicate charge." });

    expect(adminReplyRes.status).toBe(201);
    expect(adminReplyRes.body.message.sender).toBe("admin");
    expect(adminReplyRes.body.message.senderAdminName).toBe("Support Admin");
    const adminMessageId = adminReplyRes.body.message.id;

    const ownerViewRes = await request(app)
      .get(`/support/tickets/${ticketId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(ownerViewRes.status).toBe(200);
    expect(ownerViewRes.body.messages).toHaveLength(2);
    const adminMessageAsSeenByOwner = ownerViewRes.body.messages.find((m: { id: string }) => m.id === adminMessageId);
    expect(adminMessageAsSeenByOwner).toBeDefined();
    expect(adminMessageAsSeenByOwner.sender).toBe("admin");
    expect(adminMessageAsSeenByOwner.body).toBe("We've refunded the duplicate charge.");

    const auditRows = await prisma.auditLog.findMany({
      where: { action: "admin.supportTicketMessage.created", entityId: adminMessageId },
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].actorAdminId).toBe(adminId);
  });
});
