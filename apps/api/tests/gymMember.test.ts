import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { computeOpenState, parseDays, type TimingLike } from "../src/lib/gymHours";
import { exerciseAvailability, pickAlternative, type EquipmentLike } from "../src/lib/gymEquipment";
import { signGymAccessToken } from "../src/lib/gymJwt";
import { hashPassword } from "../src/lib/password";

const t = (days: string, opensAt: string | null, closesAt: string | null, extra: Partial<TimingLike> = {}): TimingLike => ({
  days,
  opensAt,
  closesAt,
  closed: false,
  kind: "regular",
  ...extra,
});
// 2026-10-10 is a Saturday. IST = UTC+5:30.
const ist = (iso: string) => new Date(`${iso}+05:30`);

describe("gym hours (pure)", () => {
  it("parses day expressions, including wrap-around ranges", () => {
    expect([...parseDays("mon-sat")!].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...parseDays("fri-mon")!].sort()).toEqual([0, 1, 5, 6]);
    expect(parseDays("daily")!.size).toBe(7);
    expect(parseDays("someday")).toBeNull();
  });

  const timings = [t("mon-sat", "05:00", "22:00"), t("sun", null, null, { closed: true })];

  it("is open inside hours and closed outside, in the gym timezone", () => {
    expect(computeOpenState(timings, ist("2026-10-10T07:00:00"), "Asia/Kolkata").openNow).toBe(true);
    expect(computeOpenState(timings, ist("2026-10-10T22:30:00"), "Asia/Kolkata").openNow).toBe(false);
    expect(computeOpenState(timings, ist("2026-10-10T04:59:00"), "Asia/Kolkata").openNow).toBe(false);
    // Saturday 12:00 in IST is 02:30 (still before opening) in New York.
    const s = computeOpenState(timings, ist("2026-10-10T12:00:00"), "America/New_York");
    expect(s.dayIndex).toBe(6);
    expect(s.openNow).toBe(false);
    expect(computeOpenState(timings, ist("2026-10-10T12:00:00"), "Asia/Kolkata").openNow).toBe(true);
  });

  it("is closed all day on a closed day", () => {
    const s = computeOpenState(timings, ist("2026-10-11T12:00:00"), "Asia/Kolkata");
    expect(s.openNow).toBe(false);
    expect(s.todayClosed).toBe(true);
  });

  it("handles overnight windows, including the early-morning spill-over", () => {
    const night = [t("fri", "20:00", "02:00")];
    expect(computeOpenState(night, ist("2026-10-09T23:00:00"), "Asia/Kolkata").openNow).toBe(true);
    expect(computeOpenState(night, ist("2026-10-10T01:00:00"), "Asia/Kolkata").openNow).toBe(true);
    expect(computeOpenState(night, ist("2026-10-10T03:00:00"), "Asia/Kolkata").openNow).toBe(false);
  });

  it("lets a special row override regular hours and ignores women-only rows", () => {
    const withSpecial = [t("daily", "05:00", "22:00"), t("sat", "08:00", "12:00", { kind: "special" }), t("mon", "06:00", "08:00", { kind: "women_only" })];
    expect(computeOpenState(withSpecial, ist("2026-10-10T15:00:00"), "Asia/Kolkata").openNow).toBe(false);
    expect(computeOpenState(withSpecial, ist("2026-10-10T09:00:00"), "Asia/Kolkata").openNow).toBe(true);
    expect(computeOpenState(withSpecial, ist("2026-10-12T14:00:00"), "Asia/Kolkata").openNow).toBe(true);
  });

  it("is unknown with no hours at all, and closed on a day with no row", () => {
    expect(computeOpenState([], ist("2026-10-10T07:00:00"), "Asia/Kolkata").openNow).toBeNull();
    expect(computeOpenState([t("mon", "05:00", "22:00")], ist("2026-10-10T07:00:00"), "Asia/Kolkata").openNow).toBe(false);
  });
});

describe("gym equipment mapping (pure)", () => {
  const d = (n: number) => new Date(2026, 9, n);
  const eq = (over: Partial<EquipmentLike>): EquipmentLike => ({
    id: over.name ?? "x",
    name: "x",
    category: "Machine",
    exerciseKeyword: null,
    available: true,
    availabilityUpdatedAt: d(1),
    ...over,
  });
  const ex = (id: string, name: string, equipment: string, difficulty = "beginner") => ({ id, name, muscleGroup: "back", equipment, difficulty });

  it("flags only exercises whose listed equipment is entirely unavailable", () => {
    const rows = [eq({ name: "Rowing machine", exerciseKeyword: "row", available: false, availabilityUpdatedAt: d(22) }), eq({ name: "Machine zone" })];
    expect(exerciseAvailability(ex("1", "Machine Row", "Machine"), rows).status).toBe("unavailable");
    expect(exerciseAvailability(ex("2", "Chest Press", "Machine"), rows).status).toBe("available");
    expect(exerciseAvailability(ex("3", "Plank", "None"), rows).status).toBe("none_needed");
    expect(exerciseAvailability(ex("4", "Kettlebell Swing", "Kettlebell"), rows).status).toBe("unknown");
  });

  it("suggests a real, available alternative and skips unavailable, unknown and already-used ones", () => {
    const rows = [
      eq({ name: "Rowing machine", exerciseKeyword: "row", available: false }),
      eq({ name: "Cable station", category: "Cable machine" }),
    ];
    const from = ex("a", "Machine Row", "Machine");
    const pool = [
      from,
      ex("b", "Seated Cable Row", "Cable machine"),
      ex("c", "Kettlebell Row", "Kettlebell"), // unknown at this gym
      ex("d", "Lat Pulldown", "Cable machine"),
      ex("e", "Machine Row Wide", "Machine"), // also unavailable
    ];
    const alt = pickAlternative(from, pool, rows, new Set(["a"]));
    expect(alt?.exercise.id).toBe("b");
    expect(alt?.availability.status === "available" && alt.availability.item.name).toBe("Cable station");
    expect(pickAlternative(from, pool, rows, new Set(["a", "b", "d"]))).toBeNull();
  });
});

describe("My Gym API", () => {
  const app = buildApp();
  const suffix = uniqueSuffix();
  const muscle = `gymtest-${suffix}`;
  let gymId: string;
  let otherGymId: string;
  let code: string;
  let userId: string;
  let token: string;
  let strangerToken: string;
  let gymToken: string;
  let otherGymToken: string;
  let locationId: string;
  const userIds: string[] = [];
  const programIds: string[] = [];
  const exerciseIds: string[] = [];

  async function signup(name: string) {
    const res = await request(app).post("/auth/signup").send({ email: uniqueEmail("gymmember"), password: "SomePassword1!", fullName: name });
    expect(res.status).toBe(201);
    userIds.push(res.body.user.id);
    return { id: res.body.user.id as string, token: res.body.tokens.accessToken as string };
  }
  const auth = (tk: string) => ({ Authorization: `Bearer ${tk}` });

  beforeAll(async () => {
    const mk = async (name: string) => {
      const g = await prisma.gym.create({
        data: { name, contactName: "Staff", contactEmail: uniqueEmail("gym"), inviteCode: `GM${uniqueSuffix().replace(/[^a-z0-9]/gi, "").slice(-8).toUpperCase()}`, status: "approved", gymPasswordHash: await hashPassword("GymPass12345!") },
      });
      return g;
    };
    const gym = await mk(`Elevation Test ${suffix}`);
    const other = await mk(`Other Gym ${suffix}`);
    gymId = gym.id;
    otherGymId = other.id;
    code = gym.inviteCode;
    locationId = (await prisma.gymLocation.create({ data: { gymId, name: "Koramangala", address: "Bengaluru" } })).id;
    gymToken = signGymAccessToken({ sub: gymId, contactEmail: gym.contactEmail }).token;
    otherGymToken = signGymAccessToken({ sub: otherGymId, contactEmail: other.contactEmail }).token;

    const u = await signup("Priya Sharma");
    userId = u.id;
    token = u.token;
    strangerToken = (await signup("Stranger Person")).token;
    const link = await request(app).post("/users/me/partner-code").set(auth(token)).send({ code });
    expect(link.status).toBe(201);

    // Fixture exercises (own muscle group so only these compete for swaps).
    const mkEx = async (id: string, name: string, equipment: string) => {
      const e = await prisma.exercise.create({ data: { id: `gt-${id}-${suffix}`, name, muscleGroup: muscle, equipment, difficulty: "beginner", status: "published" } });
      exerciseIds.push(e.id);
      return e;
    };
    const machineRow = await mkEx("mr", "Machine Row", "Machine");
    const cableRow = await mkEx("cr", "Seated Cable Row", "Cable machine");
    const plank = await mkEx("pl", "Plank Hold", "None");
    const program = await prisma.program.create({
      data: { id: `gt-prog-${suffix}`, name: "Gym Test Program", type: "fitness", description: "fixture", durationWeeks: 4, status: "published" },
    });
    programIds.push(program.id);
    const workout = await prisma.workout.create({ data: { id: `gt-wo-${suffix}`, programId: program.id, name: "Upper Body Strength", order: 0, durationMinutes: 52 } });
    await prisma.workoutExercise.createMany({
      data: [
        { workoutId: workout.id, exerciseId: machineRow.id, order: 0, targetSets: 4, targetReps: 10 },
        { workoutId: workout.id, exerciseId: plank.id, order: 1, targetSets: 3, targetReps: 30 },
      ],
    });
    void cableRow;
    await prisma.plan.create({ data: { userId, version: 1, status: "generated", programId: program.id, isActive: true } });

    await prisma.gymTiming.createMany({
      data: [
        { gymId, label: "Mon - Sat", days: "mon-sat", opensAt: "00:00", closesAt: "23:59" },
        { gymId, label: "Sunday", days: "sun", closed: true },
      ],
    });
    await prisma.gymEquipment.createMany({
      data: [
        { gymId, name: "Rowing machine", category: "Machine", exerciseKeyword: "row", available: false, availabilityUpdatedAt: new Date("2026-10-22T08:00:00Z") },
        { gymId, name: "Cable station", category: "Cable machine", available: true },
      ],
    });
  });

  afterAll(async () => {
    await prisma.gymHelpRequest.deleteMany({ where: { gymId: { in: [gymId, otherGymId] } } });
    await prisma.plan.deleteMany({ where: { userId } });
    await prisma.workout.deleteMany({ where: { programId: { in: programIds } } });
    await prisma.program.deleteMany({ where: { id: { in: programIds } } });
    await prisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } });
    await prisma.userPartnerLink.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.gym.deleteMany({ where: { id: { in: [gymId, otherGymId] } } });
    await prisma.$disconnect();
  });

  it("returns 404 gym_not_linked for a user without a partner link, on every member endpoint", async () => {
    for (const path of ["/gym/me", "/gym/workout/today", "/gym/help-requests"]) {
      const res = await request(app).get(path).set(auth(strangerToken));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("gym_not_linked");
    }
    const post = await request(app).post("/gym/help-requests").set(auth(strangerToken)).send({ topic: "other" });
    expect(post.status).toBe(404);
    expect((await request(app).get("/gym/me")).status).toBe(401);
  });

  it("GET /gym/me returns gym, hours, equipment and only an active announcement", async () => {
    await prisma.gymAnnouncement.createMany({
      data: [
        { gymId, title: "Old notice", body: "expired", kind: "notice", postedAt: new Date(Date.now() - 5 * 86400_000), expiresAt: new Date(Date.now() - 86400_000) },
      ],
    });
    let res = await request(app).get("/gym/me").set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.gym.name).toContain("Elevation Test");
    expect(res.body.location.name).toBe("Koramangala");
    expect(res.body.joinedWithCode).toBe(code);
    expect(res.body.announcement).toBeNull(); // the only announcement has expired
    expect(res.body.timings).toHaveLength(2);
    expect(res.body.equipment.map((e: { name: string; available: boolean }) => [e.name, e.available]).sort()).toEqual([
      ["Cable station", true],
      ["Rowing machine", false],
    ]);
    expect(res.body.equipmentUpdatedAt).toBeTruthy();
    expect(typeof res.body.openNow === "boolean" || res.body.openNow === null).toBe(true);

    await prisma.gymAnnouncement.create({ data: { gymId, title: "Holiday update", body: "Closed Diwali", kind: "holiday", expiresAt: new Date(Date.now() + 86400_000) } });
    res = await request(app).get("/gym/me").set(auth(token));
    expect(res.body.announcement.title).toBe("Holiday update");
    // Another gym's announcements never leak.
    await prisma.gymAnnouncement.create({ data: { gymId: otherGymId, title: "Other gym", body: "x", kind: "notice" } });
    res = await request(app).get("/gym/me").set(auth(token));
    expect(res.body.announcement.title).toBe("Holiday update");
  });

  it("GET /gym/workout/today flags the unavailable machine and suggests the cable alternative", async () => {
    const res = await request(app).get("/gym/workout/today").set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.workout.name).toBe("Upper Body Strength");
    const row = res.body.exercises.find((e: { name: string }) => e.name === "Machine Row");
    expect(row.gymUnavailable).toBe(true);
    const plank = res.body.exercises.find((e: { name: string }) => e.name === "Plank Hold");
    expect(plank.gymUnavailable).toBe(false);
    expect(res.body.swapSuggestion.from.name).toBe("Machine Row");
    expect(res.body.swapSuggestion.to.name).toBe("Seated Cable Row");
    expect(res.body.swapSuggestion.toEquipmentLabel).toBe("Cable station");
    expect(res.body.swapSuggestion.unavailableEquipmentName).toBe("Rowing machine");
    expect(res.body.swapSuggestion.updatedAt).toBe("2026-10-22T08:00:00.000Z");
  });

  it("GET /gym/workout/today is an honest empty state without a plan", async () => {
    const u = await signup("No Plan");
    await request(app).post("/users/me/partner-code").set(auth(u.token)).send({ code });
    const res = await request(app).get("/gym/workout/today").set(auth(u.token));
    expect(res.status).toBe(200);
    expect(res.body.workout).toBeNull();
    expect(res.body.emptyReason).toBe("no_plan");
    expect(res.body.swapSuggestion).toBeNull();
  });

  it("member help requests are stored on the partner help-request model with no member identity", async () => {
    const bad = await request(app)
      .post("/gym/help-requests")
      .set(auth(token))
      .send({ topic: "form_check", exerciseName: "Machine Row", weightKg: 80, healthConditions: ["asthma"] });
    expect(bad.status).toBe(400);
    const long = await request(app).post("/gym/help-requests").set(auth(token)).send({ topic: "other", note: "x".repeat(301) });
    expect(long.status).toBe(400);

    const ok = await request(app)
      .post("/gym/help-requests")
      .set(auth(token))
      .send({ topic: "form_check", exerciseName: "Machine Row", workoutName: "Upper Body Strength", note: "Lower back feels off" });
    expect(ok.status).toBe(201);
    expect(ok.body.request).toMatchObject({ topic: "form_check", exerciseName: "Machine Row", status: "open" });
    const row = await prisma.gymHelpRequest.findUnique({ where: { id: ok.body.request.id } });
    expect(row).toMatchObject({ gymId, category: "trainer_support", status: "open" });
    expect(row!.body).toContain("Machine Row");
    // No member identity is stored or returned (BR-GYM-003).
    expect(JSON.stringify(row)).not.toContain(userId);
    expect(Object.keys(row!)).not.toContain("userId");

    // ...and the gym sees it in its own (origin) help queue.
    const list = await request(app).get("/gym-portal/help-requests").set(auth(gymToken));
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).toContain("Machine Row");
    expect(JSON.stringify((await request(app).get("/gym-portal/help-requests").set(auth(otherGymToken))).body)).not.toContain("Machine Row");
  });

  it("staff can manage timings, equipment and announcements; equipment toggle stamps the update time", async () => {
    const timing = await request(app).post("/gym-portal/timings").set(auth(gymToken)).send({ label: "Women only", days: "mon,wed", opensAt: "09:00", closesAt: "11:00", kind: "women_only" });
    expect(timing.status).toBe(201);
    expect((await request(app).post("/gym-portal/timings").set(auth(gymToken)).send({ label: "Bad", days: "funday", opensAt: "09:00", closesAt: "11:00" })).status).toBe(400);
    expect((await request(app).post("/gym-portal/timings").set(auth(gymToken)).send({ label: "Bad", days: "mon", opensAt: "9am", closesAt: "11:00" })).status).toBe(400);
    expect((await request(app).delete(`/gym-portal/timings/${timing.body.timing.id}`).set(auth(otherGymToken))).status).toBe(404);

    const item = await request(app).post("/gym-portal/equipment").set(auth(gymToken)).send({ name: "Leg press", category: "Machine", exerciseKeyword: "leg press", quantity: 2 });
    expect(item.status).toBe(201);
    const before = new Date(item.body.equipment.availabilityUpdatedAt).getTime();
    await new Promise((r) => setTimeout(r, 15));
    const toggled = await request(app).patch(`/gym-portal/equipment/${item.body.equipment.id}`).set(auth(gymToken)).send({ available: false });
    expect(toggled.body.equipment.available).toBe(false);
    expect(new Date(toggled.body.equipment.availabilityUpdatedAt).getTime()).toBeGreaterThan(before);
    const renamed = await request(app).patch(`/gym-portal/equipment/${item.body.equipment.id}`).set(auth(gymToken)).send({ note: "Repair" });
    expect(new Date(renamed.body.equipment.availabilityUpdatedAt).getTime()).toBe(new Date(toggled.body.equipment.availabilityUpdatedAt).getTime());

    const ann = await request(app).post("/gym-portal/announcements").set(auth(gymToken)).send({ title: "Notice", body: "New hours", kind: "notice" });
    expect(ann.status).toBe(201);
    const me = await request(app).get("/gym/me").set(auth(token));
    expect(me.body.announcement.title).toBe("Notice");
    expect((await request(app).delete(`/gym-portal/announcements/${ann.body.announcement.id}`).set(auth(gymToken))).status).toBe(200);
  });
});
