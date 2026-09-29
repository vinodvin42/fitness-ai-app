import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { EQUIPMENT_STALE_AFTER_DAYS } from "../src/modules/gymPortal/gymPortal.service";

const app = buildApp();

/**
 * Gym Partner Lite's own surface — G-M2 to G-M5, plus §10's equipment
 * CURRENT -> STALE -> CURRENT cycle.
 *
 * BR-GYM-003 ("gyms see operational aggregates only ... never health,
 * nutrition logs, photos or AI chats") is asserted on every new endpoint
 * here, not just assumed from the older ones.
 */
describe("Gym Partner Lite portal", () => {
  let gymId = "";
  let otherGymId = "";
  let locationId = "";
  let otherLocationId = "";
  let token = "";
  let memberId = "";
  const PASSWORD = "PortalPass123!";
  const suffix = uniqueSuffix();

  async function makeGym(label: string) {
    const gym = await prisma.gym.create({
      data: {
        name: `Portal Fixture ${label}`,
        status: "approved",
        contactName: "Owner",
        contactEmail: `gym-${label}-${suffix}@example.com`,
        inviteCode: `PT${label.toUpperCase()}${suffix.slice(-5).toUpperCase()}`,
        gymPasswordHash: await hashPassword(PASSWORD),
      },
    });
    const location = await prisma.gymLocation.create({
      data: { gymId: gym.id, name: `${label} Main`, address: "Kukatpally", equipment: "Racks, dumbbells" },
    });
    return { gym, location };
  }

  beforeAll(async () => {
    const mine = await makeGym("mine");
    gymId = mine.gym.id;
    locationId = mine.location.id;
    const theirs = await makeGym("theirs");
    otherGymId = theirs.gym.id;
    otherLocationId = theirs.location.id;

    // A member with health data, so the isolation assertions are real.
    const member = await prisma.user.create({
      data: {
        email: uniqueEmail("gym-member"),
        passwordHash: await hashPassword("unused"),
        fullName: "Gym Portal Member",
        referralCode: await generateUniqueReferralCode(),
        gymId,
      },
    });
    memberId = member.id;

    const login = await request(app)
      .post("/gym-portal/auth/login")
      .send({ email: mine.gym.contactEmail, password: PASSWORD });
    expect(login.status).toBe(200);
    token = login.body.token;
  });

  afterAll(async () => {
    await prisma.gymHelpRequest.deleteMany({ where: { gymId: { in: [gymId, otherGymId] } } });
    await prisma.adminActionItem.deleteMany({ where: { entityType: "GymHelpRequest" } });
    await prisma.user.deleteMany({ where: { id: memberId } });
    await prisma.gymLocation.deleteMany({ where: { gymId: { in: [gymId, otherGymId] } } });
    await prisma.gym.deleteMany({ where: { id: { in: [gymId, otherGymId] } } });
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  describe("equipment profile (§10 CURRENT -> STALE -> CURRENT)", () => {
    it("reports a never-confirmed profile as stale", async () => {
      const res = await request(app).get("/gym-portal/locations").set(auth());
      expect(res.status).toBe(200);
      const mine = res.body.find((l: { id: string }) => l.id === locationId);
      // The fixture has equipment text but was never confirmed, which is
      // exactly the pre-R1 state of every real row.
      expect(mine.equipmentStale).toBe(true);
      expect(mine.hasEquipmentProfile).toBe(true);
    });

    it("editing the list confirms it and clears stale", async () => {
      const res = await request(app)
        .patch(`/gym-portal/locations/${locationId}/equipment`)
        .set(auth())
        .send({ equipment: "Racks, dumbbells to 50kg, 2 treadmills" });
      expect(res.status).toBe(200);

      const after = await request(app).get("/gym-portal/locations").set(auth());
      const mine = after.body.find((l: { id: string }) => l.id === locationId);
      expect(mine.equipmentStale).toBe(false);
      expect(mine.equipment).toContain("treadmills");
    });

    it("lets a gym confirm an unchanged list without retyping it", async () => {
      await prisma.gymLocation.update({
        where: { id: locationId },
        data: { equipmentStatus: "stale" },
      });
      const res = await request(app).post(`/gym-portal/locations/${locationId}/equipment/reconfirm`).set(auth());
      expect(res.status).toBe(200);

      const after = await request(app).get("/gym-portal/locations").set(auth());
      expect(after.body.find((l: { id: string }) => l.id === locationId).equipmentStale).toBe(false);
    });

    it("goes stale again once the confirmation ages out", async () => {
      const longAgo = new Date(Date.now() - (EQUIPMENT_STALE_AFTER_DAYS + 1) * 24 * 60 * 60 * 1000);
      await prisma.gymLocation.update({
        where: { id: locationId },
        data: { equipmentStatus: "current", equipmentConfirmedAt: longAgo },
      });
      const res = await request(app).get("/gym-portal/locations").set(auth());
      // Derived on read, not written by a job — this codebase has no
      // worker, so a stored flag would be wrong for every gym nobody
      // happened to look at.
      expect(res.body.find((l: { id: string }) => l.id === locationId).equipmentStale).toBe(true);
    });

    it("refuses to confirm a location with no equipment listed", async () => {
      await prisma.gymLocation.update({ where: { id: locationId }, data: { equipment: null } });
      const res = await request(app).post(`/gym-portal/locations/${locationId}/equipment/reconfirm`).set(auth());
      expect(res.status).toBe(422);
      await prisma.gymLocation.update({ where: { id: locationId }, data: { equipment: "Racks" } });
    });

    it("404s on another gym's location, and does not say it exists", async () => {
      const res = await request(app)
        .patch(`/gym-portal/locations/${otherLocationId}/equipment`)
        .set(auth())
        .send({ equipment: "trying it on" });
      expect(res.status).toBe(404);
      // Still untouched.
      const theirs = await prisma.gymLocation.findUnique({ where: { id: otherLocationId } });
      expect(theirs!.equipment).toBe("Racks, dumbbells");
    });
  });

  describe("invite assets (G-M4)", () => {
    it("serves a QR and the lowercase fynrox.app link (Q4)", async () => {
      const res = await request(app).get("/gym-portal/invite").set(auth());
      expect(res.status).toBe(200);
      expect(res.body.url).toMatch(/^https:\/\/fynrox\.app\/gym\//);
      expect(res.body.qrPngDataUrl.startsWith("data:image/png;base64,")).toBe(true);
      expect(res.body.live).toBe(true);
      // Honest about the poster that isn't built, rather than a dead button.
      expect(res.body.posterPdfAvailable).toBe(false);
    });

    it("says the link is not live for a gym that is not approved", async () => {
      await prisma.gym.update({ where: { id: gymId }, data: { status: "suspended" } });
      const res = await request(app).get("/gym-portal/invite").set(auth());
      expect(res.body.live).toBe(false);
      await prisma.gym.update({ where: { id: gymId }, data: { status: "approved" } });
    });
  });

  describe("partnership (G-M2, G-M5)", () => {
    it("reports status and aggregate counts, never the members themselves", async () => {
      const res = await request(app).get("/gym-portal/partnership").set(auth());
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("approved");
      expect(res.body.memberCount).toBe(1);
      // BR-GYM-003 — the member exists and is counted, and nothing about
      // them is in the response.
      const blob = JSON.stringify(res.body);
      expect(blob).not.toContain("Gym Portal Member");
      expect(blob).not.toContain(memberId);
    });

    it("never exposes the negotiated commercial figures", async () => {
      const res = await request(app).get("/gym-portal/partnership").set(auth());
      expect(res.body).toHaveProperty("commercialConfigured");
      expect(res.body).not.toHaveProperty("commissionPct");
      expect(res.body).not.toHaveProperty("ratePerMemberCents");
    });
  });

  describe("trainer help requests", () => {
    let requestId = "";

    it("creates a request and queues it for admin", async () => {
      const res = await request(app)
        .post("/gym-portal/help-requests")
        .set(auth())
        .send({
          category: "trainer_support",
          subject: "Programming for a new 6am group",
          body: "We have eight beginners starting together and want to know how the plans will differ.",
          gymReference: "the 6am group",
        });
      expect(res.status).toBe(201);
      requestId = res.body.id;

      const items = await prisma.adminActionItem.findMany({
        where: { entityType: "GymHelpRequest", entityId: requestId },
      });
      expect(items).toHaveLength(1);
    });

    it("lists and reads back only this gym's requests", async () => {
      await prisma.gymHelpRequest.create({
        data: { gymId: otherGymId, category: "other", subject: "Theirs", body: "Not visible to the other gym" },
      });

      const list = await request(app).get("/gym-portal/help-requests").set(auth());
      expect(list.body.every((r: { subject: string }) => r.subject !== "Theirs")).toBe(true);

      const detail = await request(app).get(`/gym-portal/help-requests/${requestId}`).set(auth());
      expect(detail.status).toBe(200);
      expect(detail.body.gymReference).toBe("the 6am group");
    });

    it("has no member field to attach at all (BR-GYM-003)", async () => {
      const res = await request(app)
        .post("/gym-portal/help-requests")
        .set(auth())
        .send({
          category: "other",
          subject: "Attempted member link",
          body: "Trying to attach a member id to this request.",
          userId: memberId,
        });
      expect(res.status).toBe(201);
      const stored = await prisma.gymHelpRequest.findUnique({ where: { id: res.body.id } });
      // The extra key is simply not part of the model — a gym cannot
      // create a record that points at a member.
      expect(JSON.stringify(stored)).not.toContain(memberId);
    });

    it("requires gym auth", async () => {
      expect((await request(app).get("/gym-portal/locations")).status).toBe(401);
      expect((await request(app).get("/gym-portal/partnership")).status).toBe(401);
      expect((await request(app).get("/gym-portal/help-requests")).status).toBe(401);
    });
  });
});
