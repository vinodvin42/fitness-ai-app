import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { hashPassword } from "../src/lib/password";

const { generateCompletion, isAiConfigured } = vi.hoisted(() => ({
  generateCompletion: vi.fn(),
  isAiConfigured: vi.fn(() => true),
}));
vi.mock("../src/lib/aiClient", () => ({ generateCompletion, isAiConfigured }));

/** Start a live workout session from a saved Routine (personal-program materialization). */
describe("POST /routines/:id/start", () => {
  const app = buildApp();
  let userId = "";
  let otherId = "";
  let auth = "";
  let otherAuth = "";
  let adminId = "";
  let adminEmail = "";
  const adminPassword = "RoutineStartAdm9!";
  const exerciseIds: string[] = [];
  let routineId = "";

  beforeAll(async () => {
    const a = await request(app).post("/auth/signup").send({ email: uniqueEmail("rs-a"), password: "SomePassword1!", fullName: "RS A" });
    userId = a.body.user.id;
    auth = `Bearer ${a.body.tokens.accessToken}`;
    const b = await request(app).post("/auth/signup").send({ email: uniqueEmail("rs-b"), password: "SomePassword1!", fullName: "RS B" });
    otherId = b.body.user.id;
    otherAuth = `Bearer ${b.body.tokens.accessToken}`;
    for (const n of ["rs-ex-1", "rs-ex-2"]) {
      const ex = await prisma.exercise.create({
        data: { name: `${n}-${Date.now()}`, muscleGroup: "chest", equipment: "barbell", difficulty: "beginner", instructions: ["x"], status: "published" } as never,
      });
      exerciseIds.push(ex.id);
    }
    adminEmail = uniqueEmail("rs-admin");
    const admin = await prisma.adminUser.create({
      data: { email: adminEmail, passwordHash: await hashPassword(adminPassword), fullName: "RS Admin", role: "super_admin", status: "active" },
    });
    adminId = admin.id;
    await prisma.onboardingProfile.upsert({
      where: { userId },
      create: { userId, goals: ["build_muscle"], trainingLevel: "beginner", medicalConditions: [], injuries: [], completedAt: new Date() },
      update: { completedAt: new Date() },
    });
    const r = await request(app)
      .post("/routines")
      .set("Authorization", auth)
      .send({ name: "Push day", exercises: [{ exerciseId: exerciseIds[0], targetSets: 4, targetReps: 8 }] });
    routineId = r.body.id;
  });

  beforeEach(() => {
    generateCompletion.mockReset();
    isAiConfigured.mockReturnValue(true);
  });

  afterAll(async () => {
    await prisma.workoutSession.deleteMany({ where: { userId: { in: [userId, otherId] } } });
    await prisma.program.deleteMany({ where: { ownerUserId: { in: [userId, otherId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } });
    await prisma.$disconnect();
  });

  it("rejects an empty routine", async () => {
    const empty = await request(app).post("/routines").set("Authorization", auth).send({ name: "Empty" });
    const res = await request(app).post(`/routines/${empty.body.id}/start`).set("Authorization", auth);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("routine_empty");
  });

  it("starts a session, reuses the workout on a second start, and reflects edits", async () => {
    const first = await request(app).post(`/routines/${routineId}/start`).set("Authorization", auth);
    expect(first.status).toBe(201);
    const workoutId = first.body.workoutId;
    expect(first.body.session.status).toBe("in_progress");

    const detail = await request(app).get(`/workouts/${workoutId}`).set("Authorization", auth);
    expect(detail.status).toBe(200);
    expect(detail.body.exercises).toHaveLength(1);
    expect(detail.body.exercises[0].targetSets).toBe(4);

    const second = await request(app).post(`/routines/${routineId}/start`).set("Authorization", auth);
    expect(second.body.workoutId).toBe(workoutId);

    // edit while a session is in progress -> existing workout untouched
    await request(app)
      .patch(`/routines/${routineId}`)
      .set("Authorization", auth)
      .send({ exercises: [{ exerciseId: exerciseIds[0], targetSets: 5, targetReps: 5 }, { exerciseId: exerciseIds[1], targetSets: 3, targetReps: 12 }] });
    await request(app).post(`/routines/${routineId}/start`).set("Authorization", auth);
    expect((await request(app).get(`/workouts/${workoutId}`).set("Authorization", auth)).body.exercises).toHaveLength(1);

    // close sessions, then start again -> refreshed
    await prisma.workoutSession.updateMany({ where: { userId }, data: { status: "completed", completedAt: new Date() } });
    const third = await request(app).post(`/routines/${routineId}/start`).set("Authorization", auth);
    expect(third.body.workoutId).toBe(workoutId);
    const refreshed = await request(app).get(`/workouts/${workoutId}`).set("Authorization", auth);
    expect(refreshed.body.exercises).toHaveLength(2);
    expect(refreshed.body.exercises[0].targetSets).toBe(5);
    await prisma.workoutSession.updateMany({ where: { userId }, data: { status: "completed", completedAt: new Date() } });
  });

  it("404s for another user's routine and hides the personal workout/program from them", async () => {
    const res = await request(app).post(`/routines/${routineId}/start`).set("Authorization", otherAuth);
    expect(res.status).toBe(404);
    const routine = await prisma.routine.findUnique({ where: { id: routineId } });
    const wid = routine!.workoutId!;
    expect((await request(app).get(`/workouts/${wid}`).set("Authorization", otherAuth)).status).toBe(404);
    expect((await request(app).post(`/workouts/${wid}/sessions`).set("Authorization", otherAuth)).status).toBe(404);
    const w = await prisma.workout.findUnique({ where: { id: wid } });
    expect((await request(app).get(`/programs/${w!.programId}`).set("Authorization", otherAuth)).status).toBe(404);
  });

  it("keeps the personal program out of the catalog, plan candidates and admin list", async () => {
    const routine = await prisma.routine.findUnique({ where: { id: routineId } });
    const w = await prisma.workout.findUnique({ where: { id: routine!.workoutId! } });
    const personalId = w!.programId;
    // even if mis-published, ownerUserId must keep it private
    await prisma.program.update({ where: { id: personalId }, data: { status: "published" } });

    const list = await request(app).get("/programs").set("Authorization", auth);
    expect(list.body.items.map((p: { id: string }) => p.id)).not.toContain(personalId);

    generateCompletion.mockResolvedValueOnce("PROGRAM_ID: nope\nRATIONALE: x");
    await request(app).post("/plans/generate").set("Authorization", auth).send();
    expect(JSON.stringify(generateCompletion.mock.calls)).not.toContain(personalId);

    const login = await request(app).post("/admin/auth/login").send({ email: adminEmail, password: adminPassword });
    const adminList = await request(app).get("/admin/programs").set("Authorization", `Bearer ${login.body.token}`);
    expect(adminList.status).toBe(200);
    expect(adminList.body.programs.map((p: { id: string }) => p.id)).not.toContain(personalId);

    await prisma.program.update({ where: { id: personalId }, data: { status: "draft" } });
  });

  it("deleting a routine keeps the workout so past sessions stay intact", async () => {
    const routine = await prisma.routine.findUnique({ where: { id: routineId } });
    const wid = routine!.workoutId!;
    expect((await request(app).delete(`/routines/${routineId}`).set("Authorization", auth)).status).toBe(200);
    expect(await prisma.workout.findUnique({ where: { id: wid } })).not.toBeNull();
    expect(await prisma.workoutSession.count({ where: { workoutId: wid } })).toBeGreaterThan(0);
  });
});
