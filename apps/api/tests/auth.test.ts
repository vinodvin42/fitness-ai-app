import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";

/**
 * Real signup/login/refresh/logout, against a real Postgres-backed User +
 * RefreshToken. No mocking — see helpers.ts's own doc comment.
 *
 * Rate limits (middleware/rateLimit.ts): POST /auth/login shares
 * `authRateLimit` (10 requests / 15 min, keyed by IP) with POST
 * /admin/auth/login — this file only ever hits the former, and keeps its
 * total login-endpoint calls well under 10 so it never trips that limiter
 * regardless of run order.
 */
describe("Auth: signup, login, refresh, logout", () => {
  const app = buildApp();
  const password = "CorrectHorseBattery9!";
  let fixtureEmail: string;

  beforeAll(async () => {
    fixtureEmail = uniqueEmail("auth-fixture");
    const res = await request(app)
      .post("/auth/signup")
      .send({ email: fixtureEmail, password, fullName: "Auth Fixture User" });
    expect(res.status).toBe(201);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: "@example.com" }, fullName: { in: ["Auth Fixture User", "New Signup User"] } } });
    await prisma.$disconnect();
  });

  it("creates a real user and returns a token pair", async () => {
    const email = uniqueEmail("auth-signup");
    const res = await request(app)
      .post("/auth/signup")
      .send({ email, password, fullName: "New Signup User" });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(typeof res.body.tokens.accessToken).toBe("string");
    expect(typeof res.body.tokens.refreshToken).toBe("string");
    expect(res.body.onboardingCompleted).toBe(false);

    const dbUser = await prisma.user.findUnique({ where: { email } });
    expect(dbUser).not.toBeNull();
    expect(dbUser?.fullName).toBe("New Signup User");
  });

  it("rejects a signup for an email that already has an account", async () => {
    const res = await request(app)
      .post("/auth/signup")
      .send({ email: fixtureEmail, password, fullName: "Duplicate Attempt" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("email_taken");
  });

  it("logs in with the correct password", async () => {
    const res = await request(app).post("/auth/login").send({ email: fixtureEmail, password });

    expect(res.status).toBe(200);
    expect(res.body.twoFactorRequired).toBe(false);
    expect(res.body.user.email).toBe(fixtureEmail);
    expect(typeof res.body.tokens.accessToken).toBe("string");
    expect(typeof res.body.tokens.refreshToken).toBe("string");
  });

  it("rejects login with an incorrect password", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: fixtureEmail, password: "TheWrongPassword1!" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_credentials");
  });

  it("rejects login for an email with no account, with the same generic error", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: uniqueEmail("nobody-home"), password: "whatever-1234" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_credentials");
  });

  it("refreshes a token pair and rotates away the old refresh token", async () => {
    const loginRes = await request(app).post("/auth/login").send({ email: fixtureEmail, password });
    const originalRefreshToken: string = loginRes.body.tokens.refreshToken;

    const refreshRes = await request(app).post("/auth/refresh").send({ refreshToken: originalRefreshToken });
    expect(refreshRes.status).toBe(200);
    expect(typeof refreshRes.body.tokens.accessToken).toBe("string");
    expect(refreshRes.body.tokens.refreshToken).not.toBe(originalRefreshToken);

    // Replay protection: the token /refresh just rotated away must never
    // work again, even though it was valid (unexpired, unrevoked) seconds
    // ago — this is the real security property, not just "some token works".
    const reuseRes = await request(app).post("/auth/refresh").send({ refreshToken: originalRefreshToken });
    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.error.code).toBe("invalid_refresh_token");
  });

  it("logout revokes the refresh token so it can never be reused", async () => {
    const loginRes = await request(app).post("/auth/login").send({ email: fixtureEmail, password });
    const { refreshToken } = loginRes.body.tokens;

    const logoutRes = await request(app).post("/auth/logout").send({ refreshToken });
    expect(logoutRes.status).toBe(204);

    const reuseRes = await request(app).post("/auth/refresh").send({ refreshToken });
    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.error.code).toBe("invalid_refresh_token");
  });
});
