import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";

/**
 * §4 Privacy/Consent settings + the real `consent.changed` event (R1
 * Developer 1, 18 Sep 2026) — closes the gap §50 left honestly open:
 * no `Consent` model existed, so `consent.changed` had no real event to
 * attach to. See apps/api's users.service.ts (listConsents/updateConsent)
 * for the full design.
 */
describe("Privacy/Consent settings", () => {
  const app = buildApp();
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    const email = uniqueEmail("consents");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email, password: "SomePassword1!", fullName: "Consent Tester" });
    userId = signupRes.body.user.id;
    accessToken = signupRes.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.analyticsEvent.deleteMany({ where: { userId } });
    await prisma.consent.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("GET /users/me/consents returns all three real consent types with an honest 'not yet set' default", async () => {
    const res = await request(app).get("/users/me/consents").set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(3);
    const types = res.body.items.map((i: { type: string }) => i.type);
    expect(types.sort()).toEqual(["data_analytics", "health_data_processing", "marketing_emails"]);
    for (const item of res.body.items) {
      expect(item.granted).toBe(false);
      expect(item.updatedAt).toBeNull();
    }
  });

  it("PATCH /users/me/consents creates a real Consent row and fires consent.changed with the real metadata", async () => {
    const res = await request(app)
      .patch("/users/me/consents")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ type: "health_data_processing", granted: true });

    expect(res.status).toBe(200);
    expect(res.body.consent).toEqual(
      expect.objectContaining({ type: "health_data_processing", granted: true }),
    );
    expect(res.body.consent.updatedAt).not.toBeNull();

    const row = await prisma.consent.findUnique({
      where: { userId_type: { userId, type: "health_data_processing" } },
    });
    expect(row).not.toBeNull();
    expect(row?.granted).toBe(true);

    const events = await prisma.analyticsEvent.findMany({ where: { userId, name: "consent.changed" } });
    expect(events).toHaveLength(1);
    expect((events[0].entityIds as Record<string, unknown>).consentId).toBe(row?.id);
    expect(events[0].metadata).toEqual({ consentType: "health_data_processing", granted: true });
  });

  it("PATCH /users/me/consents toggling the SAME type again updates the same row, not a new one", async () => {
    const res = await request(app)
      .patch("/users/me/consents")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ type: "health_data_processing", granted: false });

    expect(res.status).toBe(200);
    expect(res.body.consent.granted).toBe(false);

    const rows = await prisma.consent.findMany({ where: { userId, type: "health_data_processing" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].granted).toBe(false);

    const events = await prisma.analyticsEvent.findMany({ where: { userId, name: "consent.changed" } });
    expect(events).toHaveLength(2);
  });

  it("PATCH /users/me/consents rejects a type outside the real closed enum", async () => {
    const res = await request(app)
      .patch("/users/me/consents")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ type: "not_a_real_consent_type", granted: true });

    expect(res.status).toBe(400);
  });

  it("PATCH /users/me/consents 401s without auth", async () => {
    const res = await request(app).patch("/users/me/consents").send({ type: "marketing_emails", granted: true });
    expect(res.status).toBe(401);
  });
});
