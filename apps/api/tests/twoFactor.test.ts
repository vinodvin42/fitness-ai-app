import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { generate as generateOtpCode } from "otplib";
import { buildApp, prisma, uniqueEmail } from "./helpers";

/**
 * Two-Factor Authentication (src/lib/twoFactor.ts) is plain TOTP (RFC 6238)
 * checked against a shared secret — no third-party authenticator app or
 * SMS gateway is actually needed to exercise it for real. This file
 * computes a currently-valid 6-digit code for the SAME secret the API
 * itself just issued, using otplib's own `generate()` — the exact library,
 * and the same default algorithm/digits/period, that lib/twoFactor.ts's
 * verifyTotpCode() checks a submitted code against — the same way a real
 * authenticator app derives one from a scanned secret.
 *
 * Rate limits: this file's POST /auth/login calls share `authRateLimit`
 * with every other consumer/admin login route (see auth.test.ts's own
 * comment) — only 2 calls happen here, well under the 10/15min ceiling.
 * POST /users/me/2fa/enable and POST /auth/2fa/verify share
 * `twoFactorRateLimit` (10/15min) — 4 calls happen here, also well clear.
 */

/** A 6-digit code guaranteed to differ from `correct` (flips the first digit) — no reliance on random collision odds. */
function wrongCodeFor(correct: string): string {
  const firstDigit = correct[0];
  return (firstDigit === "0" ? "1" : "0") + correct.slice(1);
}

describe("Two-factor authentication", () => {
  const app = buildApp();
  const password = "Sup3rSecure!Pass";
  let email: string;
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    email = uniqueEmail("twofactor");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email, password, fullName: "Two Factor Tester" });
    expect(signupRes.status).toBe(201);
    userId = signupRes.body.user.id;
    accessToken = signupRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("rejects enabling 2FA with an incorrect code", async () => {
    const setupRes = await request(app)
      .post("/users/me/2fa/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send();
    expect(setupRes.status).toBe(200);
    expect(typeof setupRes.body.secret).toBe("string");

    const enableRes = await request(app)
      .post("/users/me/2fa/enable")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ code: "000000" });

    expect(enableRes.status).toBe(401);
    expect(enableRes.body.error.code).toBe("invalid_code");

    const dbUser = await prisma.user.findUnique({ where: { id: userId } });
    expect(dbUser?.twoFactorEnabled).toBe(false);
  });

  it("requires a second factor at login once enabled, accepts a correct code, and rejects an incorrect one", async () => {
    // Real setup -> enable, same flow the mobile Security screen drives.
    const setupRes = await request(app)
      .post("/users/me/2fa/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send();
    const secret: string = setupRes.body.secret;

    const enableCode = await generateOtpCode({ secret });
    const enableRes = await request(app)
      .post("/users/me/2fa/enable")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ code: enableCode });

    expect(enableRes.status).toBe(200);
    expect(Array.isArray(enableRes.body.recoveryCodes)).toBe(true);
    expect(enableRes.body.recoveryCodes.length).toBeGreaterThan(0);

    const dbUserAfterEnable = await prisma.user.findUnique({ where: { id: userId } });
    expect(dbUserAfterEnable?.twoFactorEnabled).toBe(true);

    // Login now only gets as far as a challenge — no real session yet.
    const loginRes = await request(app).post("/auth/login").send({ email, password });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.twoFactorRequired).toBe(true);
    expect(typeof loginRes.body.twoFactorToken).toBe("string");
    expect(loginRes.body.tokens).toBeUndefined();
    expect(loginRes.body.user).toBeUndefined();
    const { twoFactorToken } = loginRes.body;

    // Wrong code against the real challenge: rejected, no session issued.
    const correctVerifyCode = await generateOtpCode({ secret });
    const badVerify = await request(app)
      .post("/auth/2fa/verify")
      .send({ twoFactorToken, code: wrongCodeFor(correctVerifyCode) });
    expect(badVerify.status).toBe(401);
    expect(badVerify.body.error.code).toBe("invalid_code");

    // Correct code (freshly generated, in case a 30s TOTP window rolled
    // over since the earlier one) completes the login for real.
    const freshCode = await generateOtpCode({ secret });
    const goodVerify = await request(app).post("/auth/2fa/verify").send({ twoFactorToken, code: freshCode });
    expect(goodVerify.status).toBe(200);
    expect(goodVerify.body.user.email).toBe(email);
    expect(typeof goodVerify.body.tokens.accessToken).toBe("string");
    expect(typeof goodVerify.body.tokens.refreshToken).toBe("string");
  });
});
