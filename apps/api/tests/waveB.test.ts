import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";

/**
 * Wave B (Oct 2026): routines, workout settings, activities, form-analysis
 * capture, meal-log edit + nutrition summary/calendar, training analytics.
 * Real Postgres-backed like the other files here; only rows created by this
 * file are asserted on.
 */
describe("Wave B endpoints", () => {
  const app = buildApp();
  let userId: string;
  let auth: string;

  beforeAll(async () => {
    const res = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail("waveb"), password: "SomePassword1!", fullName: "Wave B Tester" });
    userId = res.body.user.id;
    auth = `Bearer ${res.body.tokens.accessToken}`;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("upserts default workout settings on read and patches them", async () => {
    const get = await request(app).get("/users/me/workout-settings").set("Authorization", auth);
    expect(get.status).toBe(200);
    expect(get.body.restTimerSeconds).toBe(90);
    const patch = await request(app)
      .patch("/users/me/workout-settings")
      .set("Authorization", auth)
      .send({ weightUnit: "lb", restTimerSeconds: 120 });
    expect(patch.body.weightUnit).toBe("lb");
    expect(patch.body.restTimerSeconds).toBe(120);
    const empty = await request(app).patch("/users/me/workout-settings").set("Authorization", auth).send({});
    expect(empty.status).toBe(400);
  });

  it("creates, reads and deletes a routine; rejects unknown exercises", async () => {
    const bad = await request(app)
      .post("/routines")
      .set("Authorization", auth)
      .send({ name: "Bad", exercises: [{ exerciseId: "does-not-exist" }] });
    expect(bad.status).toBe(400);
    const created = await request(app).post("/routines").set("Authorization", auth).send({ name: "Push day" });
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect((await request(app).get(`/routines/${id}`).set("Authorization", auth)).body.name).toBe("Push day");
    expect((await request(app).delete(`/routines/${id}`).set("Authorization", auth)).body.deleted).toBe(true);
    expect((await request(app).get(`/routines/${id}`).set("Authorization", auth)).status).toBe(404);
  });

  it("logs an activity, derives pace, and summarises", async () => {
    const res = await request(app)
      .post("/activities")
      .set("Authorization", auth)
      .send({ kind: "run", startedAt: new Date(Date.now() - 3600_000).toISOString(), durationSeconds: 1500, distanceMeters: 5000 });
    expect(res.status).toBe(201);
    expect(res.body.avgPaceSecPerKm).toBe(300);
    const summary = await request(app).get("/activities/summary?kind=run&range=4w").set("Authorization", auth);
    expect(summary.body.count).toBe(1);
    expect(summary.body.distanceMeters).toBe(5000);
    const future = await request(app)
      .post("/activities")
      .set("Authorization", auth)
      .send({ kind: "run", startedAt: new Date(Date.now() + 86400_000).toISOString(), durationSeconds: 1500, distanceMeters: 5000 });
    expect(future.status).toBe(400);
  });

  it("captures a form-analysis submission as queued", async () => {
    const res = await request(app)
      .post("/form-analysis")
      .set("Authorization", auth)
      .send({ videoUrl: "https://example.com/squat.mp4" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("queued");
    expect(res.body.coachNote).toBeNull();
  });

  it("edits/deletes a meal log and reports the day summary + month calendar", async () => {
    const meal = await request(app)
      .post("/meal-logs")
      .set("Authorization", auth)
      .send({ mealType: "lunch", name: "Rice", calories: 400 });
    const patched = await request(app).patch(`/meal-logs/${meal.body.id}`).set("Authorization", auth).send({ calories: 500 });
    expect(patched.body.calories).toBe(500);
    const today = new Date().toISOString().slice(0, 10);
    const summary = await request(app).get(`/nutrition/summary?date=${today}`).set("Authorization", auth);
    expect(summary.body.totals.calories).toBe(500);
    const cal = await request(app).get(`/nutrition/calendar?month=${today.slice(0, 7)}`).set("Authorization", auth);
    expect(cal.body.days.find((d: { date: string }) => d.date === today).calories).toBe(500);
    expect((await request(app).delete(`/meal-logs/${meal.body.id}`).set("Authorization", auth)).body.deleted).toBe(true);
  });

  it("returns empty analytics with null ACWR for a brand-new user", async () => {
    const res = await request(app).get("/training/analytics?range=4w").set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(res.body.weeks).toHaveLength(4);
    expect(res.body.acwr).toBeNull();
    expect(res.body.muscleDistribution).toEqual([]);
    expect(res.body.personalRecords).toEqual([]);
  });
});
