import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";

/**
 * Wave A: notifications inbox, preferences, devices/sync, medicine, AI usage.
 * Real Postgres-backed integration tests (same class as mindfulness.test.ts).
 */
describe("Wave A endpoints", () => {
  const app = buildApp();
  let userId: string;
  let auth: string;

  beforeAll(async () => {
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("wavea"), password: "SomePassword1!", fullName: "Wave A Tester" });
    userId = signupRes.body.user.id;
    auth = `Bearer ${signupRes.body.tokens.accessToken}`;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("401s without auth", async () => {
    expect((await request(app).get("/notifications")).status).toBe(401);
    expect((await request(app).get("/medications/due")).status).toBe(401);
  });

  it("lists, filters and marks notifications read", async () => {
    await prisma.notification.create({ data: { userId, kind: "system", title: "Hi", body: "Welcome" } });
    const list = await request(app).get("/notifications?filter=unread").set("Authorization", auth);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.unreadCount).toBe(1);

    const read = await request(app).post(`/notifications/${list.body.items[0].id}/read`).set("Authorization", auth);
    expect(read.status).toBe(200);
    expect(read.body.readAt).not.toBeNull();

    const all = await request(app).post("/notifications/read-all").set("Authorization", auth);
    expect(all.body.updated).toBe(0);
  });

  it("upserts default notification preferences and patches them", async () => {
    const get = await request(app).get("/users/me/notification-preferences").set("Authorization", auth);
    expect(get.status).toBe(200);
    expect(get.body.marketing).toBe(false);
    const patch = await request(app)
      .patch("/users/me/notification-preferences")
      .set("Authorization", auth)
      .send({ marketing: true, quietHoursStart: "22:00", quietHoursEnd: "07:00" });
    expect(patch.body.marketing).toBe(true);
    expect(patch.body.quietHoursStart).toBe("22:00");
  });

  it("pairs a device and syncs samples into RecoveryLog", async () => {
    const pair = await request(app)
      .post("/devices")
      .set("Authorization", auth)
      .send({ provider: "garmin", name: "Forerunner", kind: "watch" });
    expect(pair.status).toBe(201);

    const sync = await request(app)
      .post(`/devices/${pair.body.id}/sync`)
      .set("Authorization", auth)
      .send({ samples: [{ date: "2026-09-01", restingHr: 55, sleepHours: 7.5, steps: 9000 }] });
    expect(sync.status).toBe(200);
    expect(sync.body.run.recordsIngested).toBe(1);

    const log = await prisma.recoveryLog.findFirst({ where: { userId } });
    expect(log?.restingHeartRate).toBe(55);

    const status = await request(app).get("/devices/sync-status").set("Authorization", auth);
    expect(status.body.items[0].latestRun.status).toBe("success");
  });

  it("logs a dose idempotently and reports it in /medications/due", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const med = await request(app)
      .post("/medications")
      .set("Authorization", auth)
      .send({ name: "Vitamin D", dosage: "1000 IU", scheduleTimes: ["23:59"], startDate: today });
    expect(med.status).toBe(201);

    const due = await request(app).get("/medications/due").set("Authorization", auth);
    expect(due.status).toBe(200);
    expect(due.body.items).toHaveLength(1);
    const scheduledFor = due.body.items[0].scheduledFor;

    for (let i = 0; i < 2; i++) {
      const dose = await request(app)
        .post(`/medications/${med.body.id}/doses`)
        .set("Authorization", auth)
        .send({ scheduledFor, status: "taken" });
      expect(dose.status).toBe(200);
    }
    expect(await prisma.medicationDoseLog.count({ where: { medicationId: med.body.id } })).toBe(1);

    const adherence = await request(app).get(`/medications/${med.body.id}/adherence`).set("Authorization", auth);
    expect(adherence.body.taken).toBe(1);
  });

  it("reports AI Coach usage for the basic tier", async () => {
    const res = await request(app).get("/ai-coach/usage").set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ used: 0, limit: 5, tier: "basic" });
  });
});
