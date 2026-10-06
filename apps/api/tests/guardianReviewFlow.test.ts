import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Capture the emailed guardian link instead of sending real mail.
const sent: Array<{ to: string; text: string }> = [];
vi.mock("../src/lib/mailer", () => ({
  isEmailConfigured: () => true,
  sendEmail: async (m: { to: string; subject: string; text: string }) => {
    sent.push({ to: m.to, text: m.text });
  },
}));

import { buildApp, prisma, uniqueEmail } from "./helpers";
import { ageFromDateOfBirth, parseDateOnly } from "../src/lib/age";

/**
 * Guardian gate + token flow (Figma onboarding 11), real Postgres.
 * Covers: DOB-derived age, 403 gating while pending, valid/expired/reused/
 * wrong/replaced tokens, decline, and the unlocked path after approval.
 */
describe("Guardian review: gate and approval token flow", () => {
  const app = buildApp();
  let userId: string;
  let token: string;

  const tokenFromLastEmail = () => {
    const m = /token=([a-f0-9]{64})/.exec(sent[sent.length - 1].text);
    expect(m).not.toBeNull();
    return m![1];
  };
  const bearer = () => ({ Authorization: `Bearer ${token}` });
  const minorDob = () => `${new Date().getUTCFullYear() - 15}-01-15`;

  beforeAll(async () => {
    const signup = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("guardianflow"), password: "SomePassword1!", fullName: "Minor Tester" });
    userId = signup.body.user.id;
    token = signup.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.analyticsEvent.deleteMany({ where: { userId } });
    await prisma.consent.deleteMany({ where: { userId } });
    await prisma.guardianReview.deleteMany({ where: { userId } });
    await prisma.bodyMeasurement.deleteMany({ where: { userId } });
    await prisma.onboardingProfile.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("derives age from a date of birth", () => {
    const now = new Date(Date.UTC(2026, 9, 6));
    expect(ageFromDateOfBirth(parseDateOnly("1995-01-15")!, now)).toBe(31);
    expect(ageFromDateOfBirth(parseDateOnly("2008-10-07")!, now)).toBe(17);
    expect(ageFromDateOfBirth(parseDateOnly("2008-10-06")!, now)).toBe(18);
    expect(parseDateOnly("2026-02-30")).toBeNull();
  });

  it("blocks onboarding submission for a DOB-derived minor with no approved review (server-side age check)", async () => {
    const res = await request(app)
      .put("/users/me/onboarding")
      .set(bearer())
      .send({ dateOfBirth: minorDob(), goals: [], allergens: [], medicalConditions: ["Asthma"], injuries: [] });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("guardian_authorization_required");
  });

  it("submitting a guardian email creates a pending review, emails a link, and gates plan generation with 403", async () => {
    const res = await request(app).post("/users/me/guardian-review").set(bearer()).send({ guardianEmail: "Guardian@Example.com" });
    expect(res.status).toBe(201);
    expect(res.body.guardianReview.status).toBe("pending");
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("guardian@example.com");

    for (const [method, path] of [
      ["post", "/plans/generate"],
      ["post", "/recommendations/generate"],
      ["post", "/nutrition/meal-plans/generate"],
      ["post", "/ai-coach/messages"],
    ] as const) {
      const blocked = await request(app)[method](path).set(bearer()).send({ content: "hi" });
      expect(blocked.status, path).toBe(403);
      expect(blocked.body.error.code, path).toBe("guardian_authorization_pending");
    }

    const put = await request(app)
      .put("/users/me/onboarding")
      .set(bearer())
      .send({ age: 25, goals: [], allergens: [], medicalConditions: [], injuries: [] });
    expect(put.status).toBe(403);
    expect(put.body.error.code).toBe("guardian_authorization_pending");
  });

  it("stores only a hash of the token and an expiry about 7 days out", async () => {
    const raw = tokenFromLastEmail();
    const row = await prisma.guardianReview.findUnique({ where: { userId } });
    expect(row!.tokenHash).toBeTruthy();
    expect(row!.tokenHash).not.toContain(raw);
    const days = (row!.tokenExpiresAt!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7.01);
  });

  it("rejects a wrong token (404) and a malformed one", async () => {
    const wrong = await request(app).get(`/guardian-review/approve?token=${"a".repeat(64)}`);
    expect(wrong.status).toBe(404);
    const junk = await request(app).get("/guardian-review/approve?token=nope");
    expect(junk.status).toBe(404);
    const post = await request(app).post("/guardian-review/decide").type("form").send({ token: "a".repeat(64), decision: "approve" });
    expect(post.status).toBe(404);
  });

  it("resend invalidates the previous link", async () => {
    const oldToken = tokenFromLastEmail();
    const resend = await request(app).post("/users/me/guardian-review").set(bearer()).send({ guardianEmail: "guardian@example.com" });
    expect(resend.status).toBe(201);
    const newToken = tokenFromLastEmail();
    expect(newToken).not.toBe(oldToken);
    const stale = await request(app).get(`/guardian-review/approve?token=${oldToken}`);
    expect(stale.status).toBe(404);
    const fresh = await request(app).get(`/guardian-review/approve?token=${newToken}`);
    expect(fresh.status).toBe(200);
    expect(fresh.text).toContain("Minor Tester");
    expect(fresh.text).toContain("Approve");
  });

  it("an expired token shows 410 and cannot be used", async () => {
    const t = tokenFromLastEmail();
    await prisma.guardianReview.update({ where: { userId }, data: { tokenExpiresAt: new Date(Date.now() - 1000) } });
    const page = await request(app).get(`/guardian-review/approve?token=${t}`);
    expect(page.status).toBe(410);
    const post = await request(app).post("/guardian-review/decide").type("form").send({ token: t, decision: "approve" });
    expect(post.status).toBe(410);
    expect((await prisma.guardianReview.findUnique({ where: { userId } }))!.status).toBe("pending");
    await prisma.guardianReview.update({ where: { userId }, data: { tokenExpiresAt: new Date(Date.now() + 86_400_000) } });
  });

  it("a valid token approves once; reuse is rejected; the gate then lifts", async () => {
    const t = tokenFromLastEmail();
    const ok = await request(app).post("/guardian-review/decide").type("form").send({ token: t, decision: "approve" });
    expect(ok.status).toBe(200);
    expect(ok.text).toContain("Authorization recorded");

    const again = await request(app).post("/guardian-review/decide").type("form").send({ token: t, decision: "decline" });
    expect(again.status).toBe(409);
    const view = await request(app).get(`/guardian-review/approve?token=${t}`);
    expect(view.status).toBe(409);

    const got = await request(app).get("/users/me/guardian-review").set(bearer());
    expect(got.body.guardianReview.status).toBe("approved");

    // Resubmitting after approval does not reset it or send mail.
    const before = sent.length;
    const re = await request(app).post("/users/me/guardian-review").set(bearer()).send({ guardianEmail: "other@example.com" });
    expect(re.body.guardianReview.status).toBe("approved");
    expect(sent.length).toBe(before);

    const put = await request(app)
      .put("/users/me/onboarding")
      .set(bearer())
      .send({ dateOfBirth: minorDob(), goals: [], allergens: [], medicalConditions: [], injuries: [], healthDataConsent: true });
    expect(put.status).toBe(200);
    expect(put.body.onboardingProfile.age).toBe(15);
    expect(put.body.onboardingProfile.dateOfBirth).toContain(`${new Date().getUTCFullYear() - 15}-01-15`);

    const plan = await request(app).post("/plans/generate").set(bearer()).send({});
    expect(plan.body?.error?.code).not.toBe("guardian_authorization_pending");
  });

  it("a declined review keeps the gate closed, and the minor can resubmit", async () => {
    await prisma.guardianReview.update({ where: { userId }, data: { status: "pending" } });
    const re = await request(app).post("/users/me/guardian-review").set(bearer()).send({ guardianEmail: "guardian@example.com" });
    expect(re.status).toBe(201);
    const t = tokenFromLastEmail();
    const decl = await request(app).post("/guardian-review/decide").type("form").send({ token: t, decision: "decline" });
    expect(decl.status).toBe(200);
    const blocked = await request(app).post("/plans/generate").set(bearer()).send({});
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("guardian_authorization_declined");

    const retry = await request(app).post("/users/me/guardian-review").set(bearer()).send({ guardianEmail: "new@example.com" });
    expect(retry.body.guardianReview.status).toBe("pending");
  });
});
