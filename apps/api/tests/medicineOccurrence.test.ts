import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";

/** Medicine reminder form fields + dose correction (Figma Medicine 01-05). */
describe("Medicine occurrence states", () => {
  const app = buildApp();
  let userId: string;
  let otherId: string;
  let auth: string;
  let otherAuth: string;
  const today = new Date().toISOString().slice(0, 10);

  async function signup(tag: string) {
    const res = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail(tag), password: "SomePassword1!", fullName: "Med Tester" });
    return { id: res.body.user.id as string, auth: `Bearer ${res.body.tokens.accessToken}` };
  }

  beforeAll(async () => {
    const a = await signup("medocc");
    const b = await signup("medocc2");
    userId = a.id;
    auth = a.auth;
    otherId = b.id;
    otherAuth = b.auth;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
    await prisma.$disconnect();
  });

  async function createMed(extra: Record<string, unknown> = {}) {
    const res = await request(app)
      .post("/medications")
      .set("Authorization", auth)
      .send({ name: "Morning BP Medicine", dosage: "as labelled", scheduleTimes: ["00:01"], startDate: today, ...extra });
    expect(res.status).toBe(201);
    return res.body;
  }

  async function scheduledFor() {
    const due = await request(app).get("/medications/due").set("Authorization", auth);
    return due.body.items[0].scheduledFor as string;
  }

  it("persists meal timing, notification toggles and repeat mode with defaults", async () => {
    const def = await createMed();
    expect(def).toMatchObject({
      repeatMode: "daily",
      mealTiming: null,
      pushEnabled: true,
      soundEnabled: true,
      vibrationEnabled: false,
      detailedPreview: false,
    });
    const custom = await createMed({
      mealTiming: "before_food",
      pushEnabled: false,
      soundEnabled: false,
      vibrationEnabled: true,
      detailedPreview: true,
      repeatMode: "selected",
      daysOfWeek: [1, 3],
    });
    expect(custom).toMatchObject({ mealTiming: "before_food", pushEnabled: false, vibrationEnabled: true, detailedPreview: true });
    expect(custom.daysOfWeek).toEqual([1, 3]);

    const patched = await request(app)
      .patch(`/medications/${custom.id}`)
      .set("Authorization", auth)
      .send({ mealTiming: "after_food", detailedPreview: false });
    expect(patched.body.mealTiming).toBe("after_food");
    expect(patched.body.detailedPreview).toBe(false);

    const bad = await request(app)
      .post("/medications")
      .set("Authorization", auth)
      .send({ name: "x", dosage: "y", scheduleTimes: ["08:00"], startDate: today, mealTiming: "with_juice" });
    expect(bad.status).toBe(400);
    await prisma.medication.deleteMany({ where: { userId } });
  });

  it("stores once as a single date and daily as every weekday", async () => {
    const once = await createMed({ repeatMode: "once", daysOfWeek: [2], endDate: "2099-01-01" });
    expect(once.repeatMode).toBe("once");
    expect(once.endDate.slice(0, 10)).toBe(today);
    expect(once.daysOfWeek).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const daily = await createMed({ repeatMode: "daily", daysOfWeek: [1] });
    expect(daily.daysOfWeek).toHaveLength(7);

    const toSelected = await request(app)
      .patch(`/medications/${once.id}`)
      .set("Authorization", auth)
      .send({ repeatMode: "selected", daysOfWeek: [1, 2] });
    expect(toSelected.body.endDate).toBeNull();
    expect(toSelected.body.daysOfWeek).toEqual([1, 2]);
    await prisma.medication.deleteMany({ where: { userId } });
  });

  it("walks due, snoozed, undo snooze, taken, corrected and cleared", async () => {
    const med = await createMed();
    const when = await scheduledFor();
    const doses = `/medications/${med.id}/doses`;

    const snoozedUntil = new Date(Date.now() + 10 * 60000).toISOString();
    const snooze = await request(app).post(doses).set("Authorization", auth).send({ scheduledFor: when, status: "snoozed", snoozedUntil });
    expect(snooze.status).toBe(200);
    let due = await request(app).get("/medications/due").set("Authorization", auth);
    expect(due.body.items[0].status).toBe("snoozed");

    // Undo snooze: back to due (pending / missed), no row left.
    const undo = await request(app).delete(`${doses}?scheduledFor=${encodeURIComponent(when)}`).set("Authorization", auth);
    expect(undo.status).toBe(204);
    due = await request(app).get("/medications/due").set("Authorization", auth);
    expect(["pending", "missed"]).toContain(due.body.items[0].status);

    const taken = await request(app).post(doses).set("Authorization", auth).send({ scheduledFor: when, status: "taken" });
    expect(taken.body.status).toBe("taken");
    const firstLoggedAt = taken.body.loggedAt;

    // Identical repeat is a no-op (loggedAt unchanged).
    const repeat = await request(app).post(doses).set("Authorization", auth).send({ scheduledFor: when, status: "taken" });
    expect(repeat.body.loggedAt).toBe(firstLoggedAt);

    // Flip to skipped within 24h.
    const flip = await request(app).post(doses).set("Authorization", auth).send({ scheduledFor: when, status: "skipped" });
    expect(flip.status).toBe(200);
    expect(flip.body.status).toBe("skipped");
    expect(await prisma.medicationDoseLog.count({ where: { medicationId: med.id } })).toBe(1);

    // Clear a mistaken entry; clearing again is idempotent.
    const clear1 = await request(app).delete(`${doses}?scheduledFor=${encodeURIComponent(when)}`).set("Authorization", auth);
    const clear2 = await request(app).delete(`${doses}?scheduledFor=${encodeURIComponent(when)}`).set("Authorization", auth);
    expect(clear1.status).toBe(204);
    expect(clear2.status).toBe(204);
    expect(await prisma.medicationDoseLog.count({ where: { medicationId: med.id } })).toBe(0);

    // Audit trail records log, correction and clear.
    const audits = await prisma.auditLog.findMany({ where: { actorId: userId, entityType: "MedicationDoseLog" } });
    const actions = audits.map((a) => a.action);
    expect(actions).toContain("medication.dose_logged");
    expect(actions).toContain("medication.dose_corrected");
    expect(actions).toContain("medication.dose_cleared");
    await prisma.medication.deleteMany({ where: { userId } });
  });

  it("refuses to change or clear a Taken/Skipped entry after the 24h window", async () => {
    const med = await createMed({ startDate: "2020-01-01" });
    const old = new Date(Date.now() - 30 * 3600000);
    old.setUTCSeconds(0, 0);
    const when = old.toISOString();
    await prisma.medicationDoseLog.create({ data: { medicationId: med.id, userId, scheduledFor: old, status: "taken" } });
    const doses = `/medications/${med.id}/doses`;

    const flip = await request(app).post(doses).set("Authorization", auth).send({ scheduledFor: when, status: "skipped" });
    expect(flip.status).toBe(409);
    const clear = await request(app).delete(`${doses}?scheduledFor=${encodeURIComponent(when)}`).set("Authorization", auth);
    expect(clear.status).toBe(409);
    // Identical repeat is still fine.
    const same = await request(app).post(doses).set("Authorization", auth).send({ scheduledFor: when, status: "taken" });
    expect(same.status).toBe(200);
    await prisma.medication.deleteMany({ where: { userId } });
  });

  it("hides other users' medications from dose clearing and validates the query", async () => {
    const med = await createMed();
    const when = await scheduledFor();
    const doses = `/medications/${med.id}/doses`;
    const other = await request(app).delete(`${doses}?scheduledFor=${encodeURIComponent(when)}`).set("Authorization", otherAuth);
    expect(other.status).toBe(404);
    expect((await request(app).delete(doses).set("Authorization", auth)).status).toBe(400);
    expect((await request(app).delete(`${doses}?scheduledFor=${encodeURIComponent(when)}`)).status).toBe(401);
    await prisma.medication.deleteMany({ where: { userId } });
  });
});
