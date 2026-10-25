import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { generate as generateOtpCode } from "otplib";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { hashPassword } from "../src/lib/password";

/**
 * Suspension ends signed-in sessions (coach communication audit B1, 20 Oct
 * 2026). Before this, suspending a coach or client only set `status`: an app
 * that was already signed in kept rotating refresh tokens, and the coach
 * routes checked the JWT alone, so a coach suspended after a safety report
 * could keep messaging clients.
 *
 * What now holds, tested here against real Postgres:
 * - suspend revokes every refresh token of the account;
 * - both refresh endpoints refuse a suspended account even with an
 *   unrevoked token (a status changed outside the suspend action);
 * - a suspended coach's still-unexpired access token is refused on the
 *   coach routes, including sending and reading messages;
 * - a 2FA login can't be completed for an account suspended mid-challenge.
 *
 * Deliberately not asserted: a suspended client's access token keeps
 * working on consumer routes until it expires (JWT_ACCESS_TTL_MIN), because
 * requireAuth doesn't look up status per request. See adminUsers.service.ts's
 * suspendUser comment.
 *
 * Rate limits: the admin, coach and client logins (3) share `authRateLimit`
 * (10); 6 signups and 2 accepted message sends share `writeRateLimit` (30).
 * The refused send never reaches the limiter: auth runs first.
 */
describe("Suspension ends signed-in sessions", () => {
  const app = buildApp();
  const adminPassword = "SuspendSessionsAdm9!";
  const accountPassword = "SuspendSessions9!";
  let adminId = "";
  let adminAuth = "";
  const userIds: string[] = [];
  const professionalIds: string[] = [];

  async function signupUser(prefix: string) {
    const email = uniqueEmail(prefix);
    const res = await request(app).post("/auth/signup").send({ email, password: accountPassword, fullName: "Suspension Client" });
    expect(res.status).toBe(201);
    userIds.push(res.body.user.id);
    return { id: res.body.user.id as string, email, accessToken: res.body.tokens.accessToken as string, refreshToken: res.body.tokens.refreshToken as string };
  }

  async function signupCoach(prefix: string) {
    const email = uniqueEmail(prefix);
    const res = await request(app)
      .post("/professionals/auth/signup")
      .send({ email, password: accountPassword, fullName: "Suspension Coach" });
    expect(res.status).toBe(201);
    professionalIds.push(res.body.professional.id);
    return {
      id: res.body.professional.id as string,
      email,
      accessToken: res.body.tokens.accessToken as string,
      refreshToken: res.body.tokens.refreshToken as string,
    };
  }

  beforeAll(async () => {
    // super_admin applies suspensions directly (no maker-checker request).
    const adminEmail = uniqueEmail("suspend-sessions-admin");
    const admin = await prisma.adminUser.create({
      data: { email: adminEmail, passwordHash: await hashPassword(adminPassword), fullName: "Suspension Test Admin", role: "super_admin", status: "active" },
    });
    adminId = admin.id;
    const login = await request(app).post("/admin/auth/login").send({ email: adminEmail, password: adminPassword });
    expect(login.status).toBe(200);
    adminAuth = `Bearer ${login.body.token}`;
  });

  afterAll(async () => {
    await prisma.coachMessage.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { professionalId: { in: professionalIds } }] } });
    await prisma.relationship.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { professionalId: { in: professionalIds } }] } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [...userIds, ...professionalIds] } } });
    await prisma.professional.deleteMany({ where: { id: { in: professionalIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  describe("coach", () => {
    it("suspension revokes the coach's sessions and refuses their unexpired access token, including for messages", async () => {
      const coach = await signupCoach("suspend-coach");
      const client = await signupUser("suspend-coach-client");
      await prisma.relationship.create({ data: { userId: client.id, professionalId: coach.id, serviceType: "fitness", status: "active" } });
      const coachAuth = `Bearer ${coach.accessToken}`;

      const before = await request(app).post(`/professionals/me/conversations/${client.id}`).set("Authorization", coachAuth).send({ content: "Before suspension" });
      expect(before.status).toBe(201);

      const suspend = await request(app)
        .post(`/admin/professionals/${coach.id}/suspend`)
        .set("Authorization", adminAuth)
        .send({ adminNotes: "Safety report" });
      expect(suspend.status).toBe(200);

      const sessions = await prisma.professionalRefreshToken.findMany({ where: { professionalId: coach.id } });
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.every((s) => s.revokedAt !== null)).toBe(true);
      const audit = await prisma.auditLog.findFirst({ where: { entityId: coach.id, action: "admin.professional.suspended" } });
      expect((audit?.metadata as { revokedSessions?: number } | null)?.revokedSessions).toBe(sessions.length);

      const refresh = await request(app).post("/professionals/auth/refresh").send({ refreshToken: coach.refreshToken });
      expect(refresh.status).toBe(401);

      // The access token from signup is still an unexpired JWT.
      const send = await request(app).post(`/professionals/me/conversations/${client.id}`).set("Authorization", coachAuth).send({ content: "After suspension" });
      expect(send.status).toBe(401);
      expect(send.body.error.code).toBe("account_suspended");
      expect(await prisma.coachMessage.count({ where: { professionalId: coach.id } })).toBe(1);

      const thread = await request(app).get(`/professionals/me/conversations/${client.id}`).set("Authorization", coachAuth);
      expect(thread.status).toBe(401);
      expect(thread.body.error.code).toBe("account_suspended");

      // Reactivation restores access through a fresh login.
      const reactivate = await request(app).post(`/admin/professionals/${coach.id}/reactivate`).set("Authorization", adminAuth);
      expect(reactivate.status).toBe(200);
      const login = await request(app).post("/professionals/auth/login").send({ email: coach.email, password: accountPassword });
      expect(login.status).toBe(200);
      const after = await request(app)
        .post(`/professionals/me/conversations/${client.id}`)
        .set("Authorization", `Bearer ${login.body.tokens.accessToken}`)
        .send({ content: "After reactivation" });
      expect(after.status).toBe(201);
    });

    it("refresh refuses a suspended coach even when the refresh token was never revoked", async () => {
      const coach = await signupCoach("suspend-coach-direct");
      // A status change that bypasses suspendProfessional, so nothing is revoked.
      await prisma.professional.update({ where: { id: coach.id }, data: { status: "suspended" } });

      const refresh = await request(app).post("/professionals/auth/refresh").send({ refreshToken: coach.refreshToken });
      expect(refresh.status).toBe(401);
      expect(refresh.body.error.code).toBe("account_suspended");
      expect(await prisma.professionalRefreshToken.count({ where: { professionalId: coach.id } })).toBe(1);
    });
  });

  describe("client", () => {
    it("suspension revokes every refresh token and refresh is refused", async () => {
      const user = await signupUser("suspend-user");

      const suspend = await request(app).post(`/admin/users/${user.id}/suspend`).set("Authorization", adminAuth).send({ adminNotes: "Safety report" });
      expect(suspend.status).toBe(200);

      const sessions = await prisma.refreshToken.findMany({ where: { userId: user.id } });
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.every((s) => s.revokedAt !== null)).toBe(true);
      const audit = await prisma.auditLog.findFirst({ where: { entityId: user.id, action: "admin.user.suspended" } });
      expect((audit?.metadata as { revokedSessions?: number } | null)?.revokedSessions).toBe(sessions.length);

      const refresh = await request(app).post("/auth/refresh").send({ refreshToken: user.refreshToken });
      expect(refresh.status).toBe(401);
    });

    it("refresh refuses a suspended client even when the refresh token was never revoked", async () => {
      const user = await signupUser("suspend-user-direct");
      await prisma.user.update({ where: { id: user.id }, data: { status: "suspended" } });

      const refresh = await request(app).post("/auth/refresh").send({ refreshToken: user.refreshToken });
      expect(refresh.status).toBe(401);
      expect(refresh.body.error.code).toBe("account_suspended");
      expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(1);
    });

    it("a 2FA login can't be completed after the account is suspended mid-challenge", async () => {
      const user = await signupUser("suspend-user-2fa");
      const userAuth = `Bearer ${user.accessToken}`;
      const setup = await request(app).post("/users/me/2fa/setup").set("Authorization", userAuth).send();
      expect(setup.status).toBe(200);
      const secret: string = setup.body.secret;
      const enable = await request(app).post("/users/me/2fa/enable").set("Authorization", userAuth).send({ code: await generateOtpCode({ secret }) });
      expect(enable.status).toBe(200);

      const login = await request(app).post("/auth/login").send({ email: user.email, password: accountPassword });
      expect(login.status).toBe(200);
      expect(login.body.twoFactorRequired).toBe(true);

      const suspend = await request(app).post(`/admin/users/${user.id}/suspend`).set("Authorization", adminAuth).send({});
      expect(suspend.status).toBe(200);

      const verify = await request(app)
        .post("/auth/2fa/verify")
        .send({ twoFactorToken: login.body.twoFactorToken, code: await generateOtpCode({ secret }) });
      expect(verify.status).toBe(401);
      expect(verify.body.error.code).toBe("invalid_challenge");
      expect(verify.body.tokens).toBeUndefined();
    });
  });
});
