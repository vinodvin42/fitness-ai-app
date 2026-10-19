import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { generate as generateTotp } from "otplib";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { hashPassword } from "../src/lib/password";

/**
 * Admin sign-in with an authenticator app (blueprint section 5): email +
 * password + 6-digit code, no OTP. ADMIN_MFA_REQUIRED is read at call time,
 * so this file turns it on for itself and restores it afterwards.
 *
 * Rate limits: login and the MFA set-up routes share authRateLimit
 * (10 per 15 min); this file makes 10 such calls (the limit).
 */
describe("Admin MFA", () => {
  const app = buildApp();
  const password = "AdminMfaPass9!";
  let adminId: string;
  let email: string;
  let previousFlag: string | undefined;

  beforeAll(async () => {
    previousFlag = process.env.ADMIN_MFA_REQUIRED;
    process.env.ADMIN_MFA_REQUIRED = "true";
    email = uniqueEmail("admin-mfa");
    const admin = await prisma.adminUser.create({
      data: { email, passwordHash: await hashPassword(password), fullName: "MFA Admin", role: "finance", status: "active" },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    if (previousFlag === undefined) delete process.env.ADMIN_MFA_REQUIRED;
    else process.env.ADMIN_MFA_REQUIRED = previousFlag;
    await prisma.auditLog.deleteMany({ where: { actorAdminId: adminId } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("asks an admin without MFA to set it up, and the set-up token is not a session", async () => {
    const login = await request(app).post("/admin/auth/login").send({ email, password });
    expect(login.status).toBe(200);
    expect(login.body.mfaSetupRequired).toBe(true);
    expect(login.body.token).toBeUndefined();

    const misuse = await request(app).get("/admin/auth/me").set("Authorization", `Bearer ${login.body.setupToken}`);
    expect(misuse.status).toBe(401);
  });

  let secret: string;
  let recoveryCodes: string[];

  it("sets up the authenticator, returns recovery codes once and starts a session", async () => {
    const login = await request(app).post("/admin/auth/login").send({ email, password });
    const setupToken = login.body.setupToken as string;

    const setup = await request(app).post("/admin/auth/mfa/setup").send({ setupToken });
    expect(setup.status).toBe(200);
    expect(setup.body.qrCodeDataUrl).toMatch(/^data:image\/png/);
    secret = setup.body.secret;

    const wrong = await request(app).post("/admin/auth/mfa/confirm").send({ setupToken, code: "000000" });
    expect(wrong.status).toBe(401);

    const confirm = await request(app)
      .post("/admin/auth/mfa/confirm")
      .send({ setupToken, code: await generateTotp({ secret }) });
    expect(confirm.status).toBe(200);
    expect(typeof confirm.body.token).toBe("string");
    expect(confirm.body.recoveryCodes).toHaveLength(10);
    expect(confirm.body.adminUser.mfaSecret).toBeUndefined();
    recoveryCodes = confirm.body.recoveryCodes;
  });

  it("needs the 6-digit code at the next sign-in", async () => {
    const noCode = await request(app).post("/admin/auth/login").send({ email, password });
    expect(noCode.status).toBe(401);
    expect(noCode.body.error.code).toBe("mfa_required");

    const code = await generateTotp({ secret });
    const withCode = await request(app).post("/admin/auth/login").send({ email, password, code });
    expect(withCode.status).toBe(200);
    expect(typeof withCode.body.token).toBe("string");

    // The same code can't be used twice.
    const replayed = await request(app).post("/admin/auth/login").send({ email, password, code });
    expect(replayed.status).toBe(401);
    expect(replayed.body.error.code).toBe("invalid_mfa_code");
  });

  it("accepts a recovery code exactly once", async () => {
    const first = await request(app).post("/admin/auth/login").send({ email, password, recoveryCode: recoveryCodes[0] });
    expect(first.status).toBe(200);
    const reused = await request(app).post("/admin/auth/login").send({ email, password, recoveryCode: recoveryCodes[0] });
    expect(reused.status).toBe(401);
  });
});
