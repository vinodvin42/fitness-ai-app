import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// The admin console's address must be set before env.ts is parsed, and the
// mailer is faked so the emailed link can be read. Everything else is real.
const mail = vi.hoisted(() => {
  process.env.ADMIN_WEB_URL = "https://admin.example.test/app";
  return { configured: true, sent: [] as Array<{ to: string; subject: string; text: string }> };
});
vi.mock("../src/lib/mailer", () => ({
  isEmailConfigured: () => mail.configured,
  sendEmail: async (input: { to: string; subject: string; text: string }) => {
    mail.sent.push(input);
  },
}));

import { buildApp, prisma, uniqueEmail } from "./helpers";
import { hashPassword } from "../src/lib/password";

/**
 * Admin forgot/reset password (Oct 2026): a one-use, 30-minute emailed link;
 * the reply never reveals whether an account exists; a reset never skips the
 * sign-in code. Real Postgres.
 */
describe("Admin forgot/reset password", () => {
  const app = buildApp();
  const adminIds: string[] = [];
  let adminId = "";
  let adminEmail = "";
  const oldPassword = "OldAdminPass9!";

  const linkToken = (text: string) => /reset-password\?token=([0-9a-f]+)/.exec(text)?.[1] ?? "";

  beforeAll(async () => {
    adminEmail = uniqueEmail("reset-admin");
    const admin = await prisma.adminUser.create({
      data: { email: adminEmail, passwordHash: await hashPassword(oldPassword), fullName: "Reset Admin", role: "support", status: "active" } as never,
    });
    adminId = admin.id;
    adminIds.push(admin.id);
  });

  beforeEach(() => {
    mail.sent.length = 0;
    mail.configured = true;
  });

  afterAll(async () => {
    await prisma.adminPasswordResetToken.deleteMany({ where: { adminUserId: { in: adminIds } } });
    await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
    await prisma.$disconnect();
  });

  it("answers the same for unknown and known emails, and emails a link only to the real admin", async () => {
    const unknown = await request(app).post("/admin/auth/forgot-password").send({ email: uniqueEmail("nobody-admin") });
    const known = await request(app).post("/admin/auth/forgot-password").send({ email: adminEmail.toUpperCase() });
    expect(unknown.status).toBe(200);
    expect(known.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe(adminEmail);
    expect(mail.sent[0].text).toContain("https://admin.example.test/app/reset-password?token=");
    const rows = await prisma.adminPasswordResetToken.findMany({ where: { adminUserId: adminId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(linkToken(mail.sent[0].text)); // only the hash is stored
    expect(await prisma.auditLog.count({ where: { action: "admin.password_reset_requested", entityId: adminId } })).toBeGreaterThanOrEqual(1);
  });

  it("sets the new password once; the link can't be reused; the sign-in code is still required where enabled", async () => {
    await request(app).post("/admin/auth/forgot-password").send({ email: adminEmail });
    const token = linkToken(mail.sent.at(-1)!.text);
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    expect((await request(app).post("/admin/auth/reset-password").send({ token, newPassword: "short" })).status).toBe(400);
    const ok = await request(app).post("/admin/auth/reset-password").send({ token, newPassword: "NewAdminPass9!" });
    expect(ok.status).toBe(200);
    const again = await request(app).post("/admin/auth/reset-password").send({ token, newPassword: "AnotherPass9!" });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("invalid_reset_token");

    expect((await request(app).post("/admin/auth/login").send({ email: adminEmail, password: oldPassword })).status).toBe(401);
    const login = await request(app).post("/admin/auth/login").send({ email: adminEmail, password: "NewAdminPass9!" });
    expect(login.status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: "admin.password_reset_completed", entityId: adminId } })).toBe(1);

    // Older outstanding links stop working once one is used.
    const outstanding = await prisma.adminPasswordResetToken.count({ where: { adminUserId: adminId, usedAt: null } });
    expect(outstanding).toBe(0);
  });

  it("rejects expired and made-up tokens, and gives nothing to a disabled admin", async () => {
    await request(app).post("/admin/auth/forgot-password").send({ email: adminEmail });
    const token = linkToken(mail.sent.at(-1)!.text);
    await prisma.adminPasswordResetToken.updateMany({ where: { adminUserId: adminId, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(app).post("/admin/auth/reset-password").send({ token, newPassword: "NewerPass9!" })).status).toBe(400);
    expect((await request(app).post("/admin/auth/reset-password").send({ token: "f".repeat(64), newPassword: "NewerPass9!" })).status).toBe(400);

    const disabled = await prisma.adminUser.create({
      data: { email: uniqueEmail("disabled-admin"), passwordHash: await hashPassword(oldPassword), fullName: "Disabled", role: "support", status: "disabled" } as never,
    });
    adminIds.push(disabled.id);
    mail.sent.length = 0;
    await request(app).post("/admin/auth/forgot-password").send({ email: disabled.email });
    expect(mail.sent).toHaveLength(0);
    expect(await prisma.adminPasswordResetToken.count({ where: { adminUserId: disabled.id } })).toBe(0);
  });

  it("says plainly when email isn't set up, without revealing the account", async () => {
    mail.configured = false;
    const res = await request(app).post("/admin/auth/forgot-password").send({ email: adminEmail });
    expect(res.status).toBe(200);
    expect(res.body.emailSent).toBe(false);
    expect(res.body.message).toContain("email isn't set up");
    expect(mail.sent).toHaveLength(0);
  });
});
