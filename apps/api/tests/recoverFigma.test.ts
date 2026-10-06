import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { buildInsight } from "../src/modules/recovery/recovery.service";

/** Recover 01/04/05: device permissions, stored activity values, data streams, summary + insight. */
describe("Recover dashboard / devices", () => {
  const app = buildApp();
  let userId: string;
  let auth: string;
  let deviceId: string;
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    const res = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("recfig"), password: "SomePassword1!", fullName: "Recover Tester" });
    userId = res.body.user.id;
    auth = `Bearer ${res.body.tokens.accessToken}`;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("summary is all-null with no data", async () => {
    const r = await request(app).get("/recovery/summary").set("Authorization", auth);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ activity: null, stress: null, insight: null, device: null });
  });

  it("pairs with permissions and stores only permitted synced values", async () => {
    const pair = await request(app)
      .post("/devices")
      .set("Authorization", auth)
      .send({ provider: "garmin", name: "Mi Band 8", kind: "band", permissions: ["steps", "heart_rate", "stress", "workouts"] });
    expect(pair.status).toBe(201);
    expect(pair.body.permissions).toEqual(["steps", "heart_rate", "stress", "workouts"]);
    deviceId = pair.body.id;

    const sync = await request(app)
      .post(`/devices/${deviceId}/sync`)
      .set("Authorization", auth)
      .send({
        samples: [{ date: today, steps: 8420, activeCalories: 420, activeMinutes: 62, restingHr: 58, sleepHours: 7, spo2: 97, stressScore: 20 }],
      });
    expect(sync.status).toBe(200);
    expect(sync.body.run.recordsIngested).toBe(1);

    const log = await prisma.recoveryLog.findFirst({ where: { userId } });
    expect(log).toMatchObject({ steps: 8420, activeCalories: 420, activeMinutes: 62, restingHeartRate: 58, stressScore: 20 });
    // sleep + spo2 were not permitted -> dropped
    expect(log?.sleepHours).toBeNull();
    expect(log?.spo2).toBeNull();
  });

  it("manual PUT /recovery keeps device-synced values", async () => {
    const put = await request(app).put("/recovery").set("Authorization", auth).send({ date: today, soreness: 2 });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ soreness: 2, restingHeartRate: 58, steps: 8420 });
  });

  it("defaults permissions to everything when omitted", async () => {
    const pair = await request(app).post("/devices").set("Authorization", auth).send({ provider: "oura", name: "Ring", kind: "ring" });
    expect(pair.body.permissions).toHaveLength(6);
    await request(app).delete(`/devices/${pair.body.id}`).set("Authorization", auth);
  });

  it("PATCH updates permissions, rejects bad values, 404s for others", async () => {
    const ok = await request(app).patch(`/devices/${deviceId}`).set("Authorization", auth).send({ permissions: ["sleep", "spo2"] });
    expect(ok.status).toBe(200);
    expect(ok.body.permissions).toEqual(["sleep", "spo2"]);
    expect((await request(app).patch(`/devices/${deviceId}`).set("Authorization", auth).send({ permissions: ["bogus"] })).status).toBe(400);
    expect((await request(app).patch(`/devices/${deviceId}`).send({ permissions: [] })).status).toBe(401);
    expect((await request(app).patch("/devices/nope").set("Authorization", auth).send({ permissions: [] })).status).toBe(404);
  });

  it("summary exposes activity, stress level and the real latest device", async () => {
    const r = await request(app).get("/recovery/summary").set("Authorization", auth);
    expect(r.body.activity).toEqual({ steps: 8420, activeCalories: 420, activeMinutes: 62 });
    expect(r.body.stress).toEqual({ score: 20, level: "low" });
    expect(r.body.device.name).toBe("Mi Band 8");
    expect(r.body.insight).toBeNull();
  });

  it("data streams report latest values with honest source", async () => {
    await request(app).patch(`/devices/${deviceId}`).set("Authorization", auth).send({ permissions: ["steps", "heart_rate", "workouts"] });
    const r = await request(app).get("/devices/streams").set("Authorization", auth);
    expect(r.status).toBe(200);
    const by = Object.fromEntries(r.body.items.map((i: { key: string }) => [i.key, i]));
    expect(by.steps).toMatchObject({ value: 8420, source: "device", deviceName: "Mi Band 8" });
    expect(by.heart_rate.value).toBe(58);
    expect(by.sleep).toMatchObject({ value: null, source: null });
    expect(by.weight.value).toBeNull();
  });
});

describe("buildInsight", () => {
  const now = Date.UTC(2026, 9, 10);
  const day = 86400000;
  const mk = (daysAgo: number, sleepHours: number | null, hrvMs: number | null = null) => ({
    date: new Date(now - daysAgo * day),
    sleepHours,
    hrvMs,
  });

  it("reports a sleep change vs the previous week", () => {
    const logs = [mk(0, 8), mk(1, 8), mk(2, 8), mk(8, 7), mk(9, 7), mk(10, 7)];
    const out = buildInsight(logs, now);
    expect(out?.kind).toBe("sleep");
    expect(out?.changePct).toBe(14);
    expect(out?.text).toContain("up 14%");
  });

  it("returns null for too little data or a flat trend", () => {
    expect(buildInsight([mk(0, 8), mk(8, 7)], now)).toBeNull();
    expect(buildInsight([mk(0, 7), mk(1, 7), mk(2, 7), mk(8, 7), mk(9, 7), mk(10, 7)], now)).toBeNull();
  });

  it("falls back to HRV when sleep is flat", () => {
    const logs = [mk(0, 7, 60), mk(1, 7, 60), mk(2, 7, 60), mk(8, 7, 50), mk(9, 7, 50), mk(10, 7, 50)];
    expect(buildInsight(logs, now)?.kind).toBe("hrv");
  });
});
