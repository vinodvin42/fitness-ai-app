import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { signProfessionalAccessToken } from "../src/lib/professionalJwt";
import {
  notifyCoachOfCredentialDecision,
  notifyCoachOfMessage,
  notifyCoachOfRequest,
  notifyCoachesOfPayout,
} from "../src/modules/professionalNotifications/professionalNotices";
import { sendMessage } from "../src/modules/coachMessages/coachMessages.service";

/**
 * The coach inbox (26 Oct 2026): notices are written for the events a coach
 * needs to hear about, a burst of messages from one client is one notice, and
 * the inbox routes list, count and mark read only the signed-in coach's rows.
 *
 * Rate limits: no signups (rows are created directly); 3 writes.
 */
describe("Coach inbox", () => {
  const app = buildApp();
  let coachId: string;
  let otherCoachId: string;
  let userId: string;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const inbox = (id: string) => prisma.professionalNotification.findMany({ where: { professionalId: id }, orderBy: { createdAt: "asc" } });

  beforeAll(async () => {
    const make = async (tag: string) =>
      prisma.professional.create({
        data: {
          email: `inbox-${tag}-${uniqueSuffix()}@example.com`,
          passwordHash: await hashPassword("unused-not-logged-in-with"),
          fullName: `Inbox ${tag} Coach`,
          status: "active",
          lifecycleStatus: "available",
          maxActiveClients: 15,
        },
      });
    const coach = await make("main");
    const other = await make("other");
    coachId = coach.id;
    otherCoachId = other.id;
    token = signProfessionalAccessToken({ sub: coach.id, email: coach.email }).token;
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail("inbox-member"),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Inbox Member",
        referralCode: await generateUniqueReferralCode(),
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.professionalNotification.deleteMany({ where: { professionalId: { in: [coachId, otherCoachId] } } });
    await prisma.coachMessage.deleteMany({ where: { userId } });
    await prisma.coachSettlement.deleteMany({ where: { professionalId: coachId } });
    await prisma.professionalCredential.deleteMany({ where: { professionalId: coachId } });
    await prisma.relationship.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.professional.deleteMany({ where: { id: { in: [coachId, otherCoachId] } } });
  });

  it("tells the coach about a new request, linking to Requests", async () => {
    const rel = await prisma.relationship.create({
      data: { userId, professionalId: coachId, serviceType: "fitness", status: "requested", requestedAt: new Date() },
    });
    await notifyCoachOfRequest(rel.id);
    const rows = await inbox(coachId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "request", title: "New coaching request from Inbox Member", link: "/clients/requests" });
    // SMTP isn't configured in tests, so nothing was emailed.
    expect(rows[0].emailedAt).toBeNull();
    await prisma.relationship.update({ where: { id: rel.id }, data: { status: "active" } });
  });

  it("writes one notice for a burst of client messages", async () => {
    await sendMessage(userId, coachId, "user", { content: "Hi coach" });
    await sendMessage(userId, coachId, "user", { content: "One more thing" });
    await sendMessage(userId, coachId, "professional", { content: "Hello!" });
    const rows = (await inbox(coachId)).filter((r) => r.kind === "message");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "New message from Inbox Member", body: "Hi coach", link: `/messages/${userId}` });
  });

  it("gives a rejected credential's reason", async () => {
    const cred = await prisma.professionalCredential.create({
      data: { professionalId: coachId, serviceType: "nutrition", status: "rejected", adminNotes: "The certificate is unreadable" },
    });
    await notifyCoachOfCredentialDecision(cred.id);
    const row = (await inbox(coachId)).find((r) => r.kind === "verification");
    expect(row?.title).toBe("Your nutrition credential wasn't accepted");
    expect(row?.body).toContain("Reason: The certificate is unreadable");
  });

  it("tells the coach a payout was paid", async () => {
    const s = await prisma.coachSettlement.create({
      data: {
        professionalId: coachId,
        periodStart: new Date(Date.UTC(2026, 8, 1)),
        periodEnd: new Date(Date.UTC(2026, 9, 1)),
        grossCents: 500000,
        commissionPct: 20,
        commissionCents: 100000,
        netCents: 400000,
        status: "paid",
      },
    });
    await notifyCoachesOfPayout([s.id], "paid");
    const row = (await inbox(coachId)).find((r) => r.kind === "payout");
    expect(row?.title).toBe("₹4,000 paid for September 2026");
    expect(row?.link).toBe("/earnings");
  });

  it("lists only this coach's notices, newest first, with the unread count", async () => {
    await prisma.professionalNotification.create({ data: { professionalId: otherCoachId, kind: "system", title: "Not yours", body: "x" } });
    const res = await request(app).get("/professionals/me/notifications").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(4);
    expect(res.body.items.map((i: { kind: string }) => i.kind)).toEqual(["payout", "verification", "message", "request"]);
    expect(res.body.items.some((i: { title: string }) => i.title === "Not yours")).toBe(false);
  });

  it("marks one, then all, as read; another coach's notice is not found", async () => {
    const [first] = await inbox(coachId);
    const one = await request(app).post(`/professionals/me/notifications/${first.id}/read`).set(auth());
    expect(one.status).toBe(200);
    expect((await prisma.professionalNotification.findUnique({ where: { id: first.id } }))?.readAt).not.toBeNull();

    const theirs = await prisma.professionalNotification.findFirst({ where: { professionalId: otherCoachId } });
    const denied = await request(app).post(`/professionals/me/notifications/${theirs!.id}/read`).set(auth());
    expect(denied.status).toBe(404);

    const all = await request(app).post("/professionals/me/notifications/read-all").set(auth());
    expect(all.body).toEqual({ marked: 3 });
    const after = await request(app).get("/professionals/me/notifications").set(auth());
    expect(after.body.unreadCount).toBe(0);
  });

  it("needs a coach's sign-in", async () => {
    const res = await request(app).get("/professionals/me/notifications");
    expect(res.status).toBe(401);
  });
});
