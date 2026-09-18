import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";

/**
 * Forgot/Reset Password (R1 Developer 1, 18 Sep 2026, gap §53) — the
 * consumer app's real account-recovery flow, against a real
 * Postgres-backed User + PasswordResetToken + RefreshToken. No mocking —
 * see helpers.ts's own doc comment. Email is deliberately left
 * unconfigured in this test environment (no SMTP_* set — see
 * .env.example), so every forgotPassword() call here exercises the
 * `emailSent: false` branch; that's still a real, honest response, not a
 * skipped code path — see auth.service.ts's own doc comment on why a
 * real token is created either way.
 */
describe("Forgot/Reset Password", () => {
  const app = buildApp();
  const password = "OriginalPassword9!";
  let fixtureEmail: string;
  let userId: string;

  beforeAll(async () => {
    fixtureEmail = uniqueEmail("password-reset-fixture");
    const res = await request(app)
      .post("/auth/signup")
      .send({ email: fixtureEmail, password, fullName: "Password Reset Fixture User" });
    expect(res.status).toBe(201);
    userId = res.body.user.id;
  });

  afterAll(async () => {
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("creates a real, hashed (never raw) token and reports emailSent honestly when SMTP is unconfigured", async () => {
    const res = await request(app).post("/auth/forgot-password").send({ email: fixtureEmail });

    expect(res.status).toBe(200);
    expect(res.body.emailSent).toBe(false); // no SMTP_* set in this test environment

    const rows = await prisma.passwordResetToken.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].usedAt).toBeNull();
    expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
    // Never the raw token — a real 64-hex-char SHA-256 hash, not
    // recognizable as (or reversible to) whatever raw value was actually
    // emailed/returned to a real client.
    expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns the exact same generic response for an email with no account (never reveals account existence)", async () => {
    const knownRes = await request(app).post("/auth/forgot-password").send({ email: fixtureEmail });
    const unknownRes = await request(app).post("/auth/forgot-password").send({ email: uniqueEmail("nobody-home") });

    expect(knownRes.status).toBe(unknownRes.status);
    expect(Object.keys(knownRes.body).sort()).toEqual(Object.keys(unknownRes.body).sort());
    expect(unknownRes.body.emailSent).toBe(knownRes.body.emailSent);

    // And no row was created for the nonexistent email — confirms the
    // generic response isn't masking a real difference in DB state that a
    // more sophisticated timing/side-channel probe could exploit.
    const allTokensForFixture = await prisma.passwordResetToken.findMany({ where: { userId } });
    const totalRows = await prisma.passwordResetToken.count();
    expect(totalRows).toBe(allTokensForFixture.length);
  });

  it("rejects an expired token", async () => {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() - 60_000), // already expired
      },
    });

    const res = await request(app)
      .post("/auth/reset-password")
      .send({ token: rawToken, newPassword: "SomeNewPassword9!" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_reset_token");
  });

  it("rejects a garbage/unknown token", async () => {
    const res = await request(app)
      .post("/auth/reset-password")
      .send({ token: "not-a-real-token", newPassword: "SomeNewPassword9!" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_reset_token");
  });

  it("completes a real reset: new password works, old password no longer does, and every existing session is revoked", async () => {
    // Establish two real sessions before the reset, so revocation can be
    // asserted on both, not just the one performing the reset.
    const loginA = await request(app).post("/auth/login").send({ email: fixtureEmail, password });
    const loginB = await request(app).post("/auth/login").send({ email: fixtureEmail, password });
    expect(loginA.status).toBe(200);
    expect(loginB.status).toBe(200);
    const refreshTokenA: string = loginA.body.tokens.refreshToken;
    const refreshTokenB: string = loginB.body.tokens.refreshToken;

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt: new Date(Date.now() + 30 * 60_000) },
    });

    const newPassword = "BrandNewPassword9!";
    const resetRes = await request(app).post("/auth/reset-password").send({ token: rawToken, newPassword });
    expect(resetRes.status).toBe(200);

    // Old password: dead.
    const oldLoginRes = await request(app).post("/auth/login").send({ email: fixtureEmail, password });
    expect(oldLoginRes.status).toBe(401);
    expect(oldLoginRes.body.error.code).toBe("invalid_credentials");

    // New password: works.
    const newLoginRes = await request(app).post("/auth/login").send({ email: fixtureEmail, password: newPassword });
    expect(newLoginRes.status).toBe(200);

    // Every session that existed before the reset is revoked — a real
    // security requirement, not just the reset's own (nonexistent) token.
    const refreshARes = await request(app).post("/auth/refresh").send({ refreshToken: refreshTokenA });
    expect(refreshARes.status).toBe(401);
    const refreshBRes = await request(app).post("/auth/refresh").send({ refreshToken: refreshTokenB });
    expect(refreshBRes.status).toBe(401);
  });

  it("single-use: a token claimed by one reset can never succeed again, even racing two concurrent attempts", async () => {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt: new Date(Date.now() + 30 * 60_000) },
    });

    // Genuine concurrency, matching paymentsActivationRace.test.ts's own
    // style: fire two real reset attempts with the SAME raw token at the
    // same time and assert exactly one succeeds.
    const [resA, resB] = await Promise.all([
      request(app).post("/auth/reset-password").send({ token: rawToken, newPassword: "RaceWinnerPassword9!" }),
      request(app).post("/auth/reset-password").send({ token: rawToken, newPassword: "RaceLoserPassword9!" }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);

    const winner = resA.status === 200 ? resA : resB;
    void winner; // only the status pairing is asserted — which specific attempt wins is a legitimate race outcome

    const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    expect(row?.usedAt).not.toBeNull();

    // Reusing the same (now-used) token a third time, sequentially, also
    // fails — this time via the initial usedAt/expiry guard (the
    // 409-vs-400 split mirrors the race itself: 409 is specifically what
    // a call that LOSES a concurrent claim race sees; a plain sequential
    // reuse of an already-used token reads as "invalid" from the guard
    // before it ever reaches the atomic claim). Either way, the row's
    // usedAt persists a used token as permanently dead, not just "loses
    // one race".
    const thirdRes = await request(app)
      .post("/auth/reset-password")
      .send({ token: rawToken, newPassword: "ThirdAttemptPassword9!" });
    expect(thirdRes.status).toBe(400);
    expect(thirdRes.body.error.code).toBe("invalid_reset_token");
  });
});
