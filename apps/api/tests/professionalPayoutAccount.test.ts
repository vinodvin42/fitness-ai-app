import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import { buildApp, prisma, uniqueSuffix } from "./helpers";
import { env } from "../src/config/env";
import { hashPassword } from "../src/lib/password";
import { signProfessionalAccessToken } from "../src/lib/professionalJwt";
import { signAdminAccessToken } from "../src/lib/adminJwt";

/**
 * Coach payout details (27 Oct 2026): a coach saves a bank account or UPI ID,
 * it's stored encrypted and shown masked, any edit goes back to pending, an
 * admin verifies or rejects (and the coach hears about it), and only the
 * reason-gated reveal returns the full details, on the audit log.
 *
 * The key is set on the parsed env for this file (and restored after), so the
 * suite runs the same with or without PAYOUT_DETAILS_ENCRYPTION_KEY exported.
 */
type MutableEnv = { PAYOUT_DETAILS_ENCRYPTION_KEY?: string };
const mutableEnv = env as unknown as MutableEnv;

const ACCOUNT_NUMBER = "123456789012";
const IFSC = "HDFC0001234";
const UPI = "ravi.kumar@okhdfcbank";

describe("Coach payout details", () => {
  const app = buildApp();
  const originalKey = mutableEnv.PAYOUT_DETAILS_ENCRYPTION_KEY;
  let coachId: string;
  let otherCoachId: string;
  let coachToken: string;
  let otherCoachToken: string;
  const adminIds: string[] = [];
  let superAuth: string;
  let opsAuth: string;
  let financeAuth: string;

  const coach = () => ({ Authorization: `Bearer ${coachToken}` });
  const otherCoach = () => ({ Authorization: `Bearer ${otherCoachToken}` });
  const bank = (overrides: Record<string, unknown> = {}) => ({
    method: "bank",
    accountHolderName: "Ravi Kumar",
    accountNumber: ACCOUNT_NUMBER,
    ifsc: IFSC,
    ...overrides,
  });

  beforeAll(async () => {
    mutableEnv.PAYOUT_DETAILS_ENCRYPTION_KEY = originalKey ?? crypto.randomBytes(32).toString("hex");
    const make = async (tag: string) =>
      prisma.professional.create({
        data: {
          email: `payout-${tag}-${uniqueSuffix()}@example.com`,
          passwordHash: await hashPassword("unused-not-logged-in-with"),
          fullName: `Payout ${tag} Coach`,
          status: "active",
          lifecycleStatus: "available",
          maxActiveClients: 15,
        },
      });
    const a = await make("main");
    const b = await make("other");
    coachId = a.id;
    otherCoachId = b.id;
    coachToken = signProfessionalAccessToken({ sub: a.id, email: a.email }).token;
    otherCoachToken = signProfessionalAccessToken({ sub: b.id, email: b.email }).token;

    const admin = async (role: "super_admin" | "operations" | "finance") => {
      const row = await prisma.adminUser.create({
        data: {
          email: `payout-${role}-${uniqueSuffix()}@example.com`,
          passwordHash: await hashPassword("unused"),
          fullName: `Payout ${role}`,
          role,
          status: "active",
        },
      });
      adminIds.push(row.id);
      return `Bearer ${signAdminAccessToken({ sub: row.id, email: row.email, role }).token}`;
    };
    superAuth = await admin("super_admin");
    opsAuth = await admin("operations");
    financeAuth = await admin("finance");
  });

  afterAll(async () => {
    mutableEnv.PAYOUT_DETAILS_ENCRYPTION_KEY = originalKey;
    const ids = [coachId, otherCoachId];
    const accounts = await prisma.professionalPayoutAccount.findMany({ where: { professionalId: { in: ids } }, select: { id: true } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: accounts.map((r) => r.id) } } });
    await prisma.auditLog.deleteMany({ where: { actorAdminId: { in: adminIds } } });
    await prisma.professionalNotification.deleteMany({ where: { professionalId: { in: ids } } });
    await prisma.professionalPayoutAccount.deleteMany({ where: { professionalId: { in: ids } } });
    await prisma.professional.deleteMany({ where: { id: { in: ids } } });
    await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
  });

  it("starts empty and editable", async () => {
    const res = await request(app).get("/professionals/me/payout-account").set(coach());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ account: null, editable: true });
  });

  it("rejects invalid details without echoing them back", async () => {
    const cases = [
      bank({ ifsc: "HDFC1001234" }), // 5th character must be 0
      bank({ ifsc: "HDF00012345" }),
      bank({ accountNumber: "12345678" }), // 8 digits
      bank({ accountNumber: "1234567890123456789" }), // 19 digits
      bank({ accountNumber: "12345abc901" }),
      bank({ accountHolderName: "" }),
      { method: "upi", accountHolderName: "Ravi Kumar", upiId: "ravi.kumar" },
      { method: "upi", accountHolderName: "Ravi Kumar", upiId: "ravi@1bank" },
      { method: "cash", accountHolderName: "Ravi Kumar" },
    ];
    for (const body of cases) {
      const res = await request(app).put("/professionals/me/payout-account").set(coach()).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe("validation_error");
      const text = JSON.stringify(res.body);
      if ("accountNumber" in body) expect(text).not.toContain(String(body.accountNumber));
    }
    expect(await prisma.professionalPayoutAccount.count({ where: { professionalId: coachId } })).toBe(0);
  });

  it("saves a bank account encrypted at rest and returns it masked", async () => {
    // Spaces and lower-case are normalised.
    const res = await request(app)
      .put("/professionals/me/payout-account")
      .set(coach())
      .send(bank({ accountNumber: "1234 5678 9012", ifsc: "hdfc0001234" }));
    expect(res.status).toBe(200);
    expect(res.body.account).toMatchObject({
      method: "bank",
      accountHolderName: "Ravi Kumar",
      maskedDisplay: "XXXXXX9012",
      last4: "9012",
      ifsc: IFSC,
      status: "pending",
      adminNotes: null,
    });
    expect(JSON.stringify(res.body)).not.toContain(ACCOUNT_NUMBER);

    const [raw] = await prisma.$queryRaw<
      Array<{ accountNumberEncrypted: string; ifscEncrypted: string; upiIdEncrypted: string | null }>
    >`SELECT "accountNumberEncrypted", "ifscEncrypted", "upiIdEncrypted" FROM professional_payout_accounts WHERE "professionalId" = ${coachId}`;
    expect(raw.accountNumberEncrypted).not.toBe(ACCOUNT_NUMBER);
    expect(raw.accountNumberEncrypted).not.toContain(ACCOUNT_NUMBER);
    expect(raw.accountNumberEncrypted).toMatch(/^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);
    expect(raw.ifscEncrypted).not.toContain(IFSC);
    expect(raw.upiIdEncrypted).toBeNull();

    // The audit entry records the change without the plaintext.
    const audits = await prisma.auditLog.findMany({ where: { entityType: "ProfessionalPayoutAccount", actorProfessionalId: coachId } });
    expect(audits.map((a) => a.action)).toEqual(["professional.payout_account.created"]);
    expect(JSON.stringify(audits)).not.toContain(ACCOUNT_NUMBER);
    expect(JSON.stringify(audits)).not.toContain(IFSC);
  });

  it("doesn't show one coach's details to another", async () => {
    const res = await request(app).get("/professionals/me/payout-account").set(otherCoach());
    expect(res.status).toBe(200);
    expect(res.body.account).toBeNull();
    // And the admin routes don't accept a coach token at all.
    const admin = await request(app).get(`/admin/professionals/${coachId}/payout-account`).set(coach());
    expect(admin.status).toBe(401);
  });

  it("shows admins the masked details; operations can't reveal", async () => {
    const res = await request(app).get(`/admin/professionals/${coachId}/payout-account`).set("Authorization", superAuth);
    expect(res.status).toBe(200);
    expect(res.body.revealAvailable).toBe(true);
    expect(res.body.account).toMatchObject({ maskedDisplay: "XXXXXX9012", status: "pending", ifsc: IFSC });
    expect(JSON.stringify(res.body)).not.toContain(ACCOUNT_NUMBER);

    const ops = await request(app)
      .post(`/admin/professionals/${coachId}/payout-account/reveal`)
      .set("Authorization", opsAuth)
      .send({ reason: "Paying the October settlement" });
    expect(ops.status).toBe(403);
  });

  it("reveals the full details only with a reason, and audits the reveal", async () => {
    const noReason = await request(app)
      .post(`/admin/professionals/${coachId}/payout-account/reveal`)
      .set("Authorization", superAuth)
      .send({ reason: "short" });
    expect(noReason.status).toBe(400);

    const res = await request(app)
      .post(`/admin/professionals/${coachId}/payout-account/reveal`)
      .set("Authorization", financeAuth)
      .send({ reason: "Paying the October settlement" });
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toEqual({ method: "bank", accountHolderName: "Ravi Kumar", accountNumber: ACCOUNT_NUMBER, ifsc: IFSC, upiId: null });

    const audit = await prisma.auditLog.findFirst({ where: { action: "admin.professional_payout_account.revealed", metadata: { path: ["professionalId"], equals: coachId } } });
    expect(audit).not.toBeNull();
    expect(audit?.reason).toBe("Paying the October settlement");
    expect(JSON.stringify(audit)).not.toContain(ACCOUNT_NUMBER);
  });

  it("verifies (super admin), notifies the coach, and refuses a decision on stale details", async () => {
    const before = await prisma.professionalPayoutAccount.findUniqueOrThrow({ where: { professionalId: coachId } });
    const stale = await request(app)
      .post(`/admin/professionals/${coachId}/payout-account/verify`)
      .set("Authorization", superAuth)
      .send({ status: "verified", updatedAt: new Date(before.updatedAt.getTime() - 1000).toISOString() });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("payout_account_changed");

    const res = await request(app)
      .post(`/admin/professionals/${coachId}/payout-account/verify`)
      .set("Authorization", superAuth)
      .send({ status: "verified", updatedAt: before.updatedAt.toISOString() });
    expect(res.status).toBe(200);
    expect(res.body.account).toMatchObject({ status: "verified" });
    expect(res.body.account.verifiedAt).not.toBeNull();

    const notice = await prisma.professionalNotification.findFirst({ where: { professionalId: coachId, kind: "payout" } });
    expect(notice).toMatchObject({ title: "Your payout details are verified", link: "/earnings" });
    expect(notice?.body).toContain("XXXXXX9012");
    expect(notice?.body).not.toContain(ACCOUNT_NUMBER);
    expect(await prisma.auditLog.count({ where: { action: "admin.professional_payout_account.verified", entityId: before.id } })).toBe(1);

    const coachView = await request(app).get("/professionals/me/payout-account").set(coach());
    expect(coachView.body.account.status).toBe("verified");
  });

  it("a finance admin's verify becomes an approval request, not a change", async () => {
    const row = await prisma.professionalPayoutAccount.findUniqueOrThrow({ where: { professionalId: coachId } });
    const res = await request(app)
      .post(`/admin/professionals/${coachId}/payout-account/verify`)
      .set("Authorization", financeAuth)
      .set("X-Change-Reason", "Rejecting after a call with the coach")
      .send({ status: "rejected", adminNotes: "Name doesn't match", updatedAt: row.updatedAt.toISOString() });
    expect(res.status).toBe(202);
    expect((await prisma.professionalPayoutAccount.findUniqueOrThrow({ where: { professionalId: coachId } })).status).toBe("verified");
    await prisma.approvalRequest.deleteMany({ where: { makerAdminId: { in: adminIds } } });
  });

  it("an edit by the coach sends verified details back to pending", async () => {
    const res = await request(app)
      .put("/professionals/me/payout-account")
      .set(coach())
      .send({ method: "upi", accountHolderName: "Ravi Kumar", upiId: " Ravi.Kumar@OKHDFCBANK " });
    expect(res.status).toBe(200);
    expect(res.body.account).toMatchObject({ method: "upi", maskedDisplay: "ra***@okhdfcbank", last4: null, ifsc: null, status: "pending", verifiedAt: null });

    const row = await prisma.professionalPayoutAccount.findUniqueOrThrow({ where: { professionalId: coachId } });
    expect(row.accountNumberEncrypted).toBeNull();
    expect(row.ifscEncrypted).toBeNull();
    expect(row.upiIdEncrypted).not.toContain(UPI);
    expect(row.verifiedByAdminId).toBeNull();

    const audit = await prisma.auditLog.findFirst({ where: { action: "professional.payout_account.updated", entityId: row.id } });
    expect(audit?.stateBefore).toMatchObject({ status: "verified", method: "bank" });
    expect(audit?.stateAfter).toMatchObject({ status: "pending", method: "upi" });
    expect(JSON.stringify(audit)).not.toContain(UPI);
  });

  it("rejecting needs a note, which the coach sees", async () => {
    const row = await prisma.professionalPayoutAccount.findUniqueOrThrow({ where: { professionalId: coachId } });
    const noNote = await request(app)
      .post(`/admin/professionals/${coachId}/payout-account/verify`)
      .set("Authorization", superAuth)
      .send({ status: "rejected", updatedAt: row.updatedAt.toISOString() });
    expect(noNote.status).toBe(400);

    const res = await request(app)
      .post(`/admin/professionals/${coachId}/payout-account/verify`)
      .set("Authorization", superAuth)
      .send({ status: "rejected", adminNotes: "This UPI ID is in another name", updatedAt: row.updatedAt.toISOString() });
    expect(res.status).toBe(200);
    const notice = await prisma.professionalNotification.findFirst({
      where: { professionalId: coachId, kind: "payout", title: "Your payout details weren't accepted" },
    });
    expect(notice?.body).toContain("Reason: This UPI ID is in another name");
    const coachView = await request(app).get("/professionals/me/payout-account").set(coach());
    expect(coachView.body.account).toMatchObject({ status: "rejected", adminNotes: "This UPI ID is in another name" });
  });

  it("without the key: saving is 503, reads are masked only, reveal is 503", async () => {
    mutableEnv.PAYOUT_DETAILS_ENCRYPTION_KEY = undefined;
    try {
      const save = await request(app).put("/professionals/me/payout-account").set(coach()).send(bank());
      expect(save.status).toBe(503);
      expect(save.body.error.code).toBe("payout_details_unavailable");

      const read = await request(app).get("/professionals/me/payout-account").set(coach());
      expect(read.status).toBe(200);
      expect(read.body.editable).toBe(false);
      expect(read.body.account).toMatchObject({ maskedDisplay: "ra***@okhdfcbank", status: "rejected" });

      const adminRead = await request(app).get(`/admin/professionals/${coachId}/payout-account`).set("Authorization", superAuth);
      expect(adminRead.body.revealAvailable).toBe(false);

      const reveal = await request(app)
        .post(`/admin/professionals/${coachId}/payout-account/reveal`)
        .set("Authorization", superAuth)
        .send({ reason: "Paying the October settlement" });
      expect(reveal.status).toBe(503);
    } finally {
      mutableEnv.PAYOUT_DETAILS_ENCRYPTION_KEY = originalKey ?? crypto.randomBytes(32).toString("hex");
    }
  });

  it("a ciphertext moved to another coach's row doesn't decrypt", async () => {
    const mine = await prisma.professionalPayoutAccount.findUniqueOrThrow({ where: { professionalId: coachId } });
    // Re-encrypt with the restored key so this test doesn't depend on which key the earlier rows used.
    await request(app).put("/professionals/me/payout-account").set(coach()).send(bank());
    const fresh = await prisma.professionalPayoutAccount.findUniqueOrThrow({ where: { professionalId: coachId } });
    await prisma.professionalPayoutAccount.create({
      data: {
        professionalId: otherCoachId,
        method: "bank",
        accountHolderName: "Someone Else",
        accountNumberEncrypted: fresh.accountNumberEncrypted,
        ifscEncrypted: fresh.ifscEncrypted,
        last4: "9012",
        maskedDisplay: "XXXXXX9012",
      },
    });
    const res = await request(app)
      .post(`/admin/professionals/${otherCoachId}/payout-account/reveal`)
      .set("Authorization", superAuth)
      .send({ reason: "Checking a copied ciphertext" });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("payout_details_unreadable");
    expect(JSON.stringify(res.body)).not.toContain(ACCOUNT_NUMBER);
    expect(mine.id).toBe(fresh.id);
  });
});
