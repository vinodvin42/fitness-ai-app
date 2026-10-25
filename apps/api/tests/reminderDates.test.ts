import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";

/** Reminder date range (owner, 25 Oct 2026: "start date and end date or number of days"). */
describe("Reminder start and end dates", () => {
  const app = buildApp();
  let userId: string;
  let auth: string;

  beforeAll(async () => {
    const res = await request(app).post("/auth/signup").send({ email: uniqueEmail("remdate"), password: "SomePassword1!", fullName: "Date Tester" });
    userId = res.body.user.id;
    auth = `Bearer ${res.body.tokens.accessToken}`;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("stores a date range and returns it", async () => {
    const r = await request(app)
      .post("/reminders")
      .set("Authorization", auth)
      .send({ label: "Stretch", hour: 7, minute: 30, daysOfWeek: [1, 3, 5], startDate: "2026-11-01", endDate: "2026-11-30" });
    expect(r.status).toBe(201);
    expect(r.body.startDate.slice(0, 10)).toBe("2026-11-01");
    expect(r.body.endDate.slice(0, 10)).toBe("2026-11-30");
  });

  it("works without dates, as before", async () => {
    const r = await request(app).post("/reminders").set("Authorization", auth).send({ label: "Water", hour: 10, minute: 0, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] });
    expect(r.status).toBe(201);
    expect(r.body.startDate).toBeNull();
    expect(r.body.endDate).toBeNull();
  });

  it("rejects an end before the start, also when only one end changes", async () => {
    const bad = await request(app)
      .post("/reminders")
      .set("Authorization", auth)
      .send({ label: "X", hour: 7, minute: 0, daysOfWeek: [1], startDate: "2026-11-10", endDate: "2026-11-01" });
    expect(bad.status).toBe(400);
    const ok = await request(app).post("/reminders").set("Authorization", auth).send({ label: "Y", hour: 7, minute: 0, daysOfWeek: [1], startDate: "2026-11-10" });
    const patch = await request(app).patch(`/reminders/${ok.body.id}`).set("Authorization", auth).send({ endDate: "2026-11-05" });
    expect(patch.status).toBe(400);
    const fine = await request(app).patch(`/reminders/${ok.body.id}`).set("Authorization", auth).send({ endDate: "2026-11-20" });
    expect(fine.status).toBe(200);
    expect(fine.body.endDate.slice(0, 10)).toBe("2026-11-20");
    const cleared = await request(app).patch(`/reminders/${ok.body.id}`).set("Authorization", auth).send({ endDate: null });
    expect(cleared.body.endDate).toBeNull();
  });
});
