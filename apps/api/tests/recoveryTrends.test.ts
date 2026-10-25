import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";

/**
 * Recovery sleep detail and trends (owner, 25 Oct 2026): device-synced bed/wake times and sleep
 * stages, the member's own bed/wake times, and GET /recovery/trends with a per-day recovery score.
 */
describe("Recovery sleep detail and trends", () => {
  const app = buildApp();
  let userId: string;
  let auth: string;
  const DAY = 86_400_000;
  const ymd = (offsetDays: number) => new Date(Date.now() - offsetDays * DAY).toISOString().slice(0, 10);

  beforeAll(async () => {
    const res = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("rtrend"), password: "SomePassword1!", fullName: "Trend Tester" });
    userId = res.body.user.id;
    auth = `Bearer ${res.body.tokens.accessToken}`;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("stores bed/wake times and stage minutes from a device with the sleep permission", async () => {
    const pair = await request(app).post("/devices").set("Authorization", auth).send({ provider: "health_connect", name: "Health Connect" });
    expect(pair.status).toBe(201);
    const date = ymd(0);
    const sync = await request(app)
      .post(`/devices/${pair.body.id}/sync`)
      .set("Authorization", auth)
      .send({
        samples: [
          {
            date,
            sleepHours: 7.25,
            sleepStart: `${ymd(1)}T17:30:00.000Z`,
            sleepEnd: `${date}T01:15:00.000Z`,
            sleepInBedMin: 465,
            sleepAwakeMin: 30,
            sleepLightMin: 230,
            sleepDeepMin: 95,
            sleepRemMin: 110,
          },
        ],
      });
    expect(sync.status).toBe(200);
    const log = await prisma.recoveryLog.findFirst({ where: { userId } });
    expect(log).toMatchObject({ sleepHours: 7.25, sleepInBedMin: 465, sleepAwakeMin: 30, sleepLightMin: 230, sleepDeepMin: 95, sleepRemMin: 110 });
    expect(log?.sleepStart?.toISOString()).toBe(`${ymd(1)}T17:30:00.000Z`);
    expect(log?.sleepEnd?.toISOString()).toBe(`${date}T01:15:00.000Z`);
  });

  it("drops stage detail when the device lacks the sleep permission", async () => {
    const pair = await request(app)
      .post("/devices")
      .set("Authorization", auth)
      .send({ provider: "garmin", name: "No sleep", kind: "watch", permissions: ["steps"] });
    await request(app)
      .post(`/devices/${pair.body.id}/sync`)
      .set("Authorization", auth)
      .send({ samples: [{ date: ymd(5), steps: 4000, sleepDeepMin: 80, sleepInBedMin: 400 }] });
    const log = await prisma.recoveryLog.findFirst({ where: { userId, date: new Date(`${ymd(5)}T00:00:00.000Z`) } });
    expect(log).toMatchObject({ steps: 4000, sleepDeepMin: null, sleepInBedMin: null });
  });

  it("manual bed and wake times fill time in bed and, without typed hours, hours asleep", async () => {
    const date = ymd(2);
    const put = await request(app)
      .put("/recovery")
      .set("Authorization", auth)
      .send({ date, sleepStart: `${ymd(3)}T17:00:00.000Z`, sleepEnd: `${date}T00:30:00.000Z`, energyLevel: 4 });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ sleepInBedMin: 450, sleepHours: 7.5, energyLevel: 4 });

    const typed = await request(app)
      .put("/recovery")
      .set("Authorization", auth)
      .send({ date, sleepHours: 6.75, sleepStart: `${ymd(3)}T17:00:00.000Z`, sleepEnd: `${date}T00:30:00.000Z` });
    expect(typed.body).toMatchObject({ sleepInBedMin: 450, sleepHours: 6.75 });
  });

  it("rejects one-sided or backwards bed/wake times", async () => {
    const date = ymd(2);
    const one = await request(app).put("/recovery").set("Authorization", auth).send({ date, sleepStart: `${ymd(3)}T17:00:00.000Z` });
    expect(one.status).toBe(400);
    const back = await request(app)
      .put("/recovery")
      .set("Authorization", auth)
      .send({ date, sleepStart: `${date}T01:00:00.000Z`, sleepEnd: `${ymd(3)}T17:00:00.000Z` });
    expect(back.status).toBe(400);
  });

  it("returns logged days oldest first with sleep detail and a per-day recovery score", async () => {
    // Three earlier days give HRV and resting HR a baseline; the latest day has 3+ components.
    for (const [offset, hrv, rhr] of [
      [9, 50, 60],
      [8, 52, 60],
      [7, 54, 58],
    ] as const) {
      await request(app).put("/recovery").set("Authorization", auth).send({ date: ymd(offset), hrvMs: hrv, restingHeartRate: rhr, sleepHours: 7 });
    }
    await request(app).put("/recovery").set("Authorization", auth).send({ date: ymd(0), hrvMs: 58, restingHeartRate: 57, soreness: 2 });

    const r = await request(app).get("/recovery/trends?days=14").set("Authorization", auth);
    expect(r.status).toBe(200);
    expect(r.body.days).toBe(14);
    expect(r.body.sleepNeedHours).toBe(8);
    const dates = r.body.items.map((i: { date: string }) => i.date);
    expect(dates).toEqual([...dates].sort());
    const today = r.body.items[r.body.items.length - 1];
    expect(today).toMatchObject({ date: ymd(0), sleepHours: 7.25, sleepDeepMin: 95, hrvMs: 58, restingHeartRate: 57 });
    expect(typeof today.recoveryScore).toBe("number");
    // The first baseline day has nothing before it, so only sleep counts: no score.
    expect(r.body.items.find((i: { date: string }) => i.date === ymd(9)).recoveryScore).toBeNull();
  });

  it("keeps days to 7-90 and needs a sign-in", async () => {
    expect((await request(app).get("/recovery/trends?days=3").set("Authorization", auth)).status).toBe(400);
    expect((await request(app).get("/recovery/trends?days=200").set("Authorization", auth)).status).toBe(400);
    expect((await request(app).get("/recovery/trends").set("Authorization", auth)).body.days).toBe(30);
    expect((await request(app).get("/recovery/trends")).status).toBe(401);
  });
});
