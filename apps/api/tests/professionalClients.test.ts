import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { signProfessionalAccessToken } from "../src/lib/professionalJwt";

/**
 * Client 360 Summary (Wave 2, 20 Sep 2026) —
 * GET /professionals/me/clients/:userId/summary. Covers the real, load-
 * bearing gate this wave adds: an active Relationship is necessary but not
 * sufficient — health data additionally requires the client's own
 * `health_data_processing` Consent to read `granted: true`. See
 * professionalClients.service.ts's getClientSummary doc comment.
 */
describe("Client 360 Summary — consent-gated health data", () => {
  const app = buildApp();
  let userId: string;
  let professionalId: string;
  let professionalAccessToken: string;
  let programId: string;
  let workoutId: string;
  let otherProfessionalId: string;
  let otherProfessionalAccessToken: string;

  beforeAll(async () => {
    const email = uniqueEmail("client360");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email, password: "SomePassword1!", fullName: "Client 360 Tester" });
    userId = signupRes.body.user.id;

    const suffix = uniqueSuffix();

    const professional = await prisma.professional.create({
      data: {
        email: `coach-360-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Test Fixture Coach 360",
        status: "active",
      },
    });
    professionalId = professional.id;
    professionalAccessToken = signProfessionalAccessToken({
      sub: professionalId,
      email: professional.email,
    }).token;

    // A second, unrelated professional — used to confirm a coach with no
    // real Relationship to this user gets a 404, not a 403.
    const otherProfessional = await prisma.professional.create({
      data: {
        email: `coach-360-other-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Unrelated Fixture Coach",
        status: "active",
      },
    });
    otherProfessionalId = otherProfessional.id;
    otherProfessionalAccessToken = signProfessionalAccessToken({
      sub: otherProfessionalId,
      email: otherProfessional.email,
    }).token;

    await prisma.relationship.create({
      data: { userId, professionalId, serviceType: "fitness", status: "active" },
    });

    const program = await prisma.program.create({
      data: {
        id: `test-client360-program-${suffix}`,
        name: "Client 360 Fixture Program",
        type: "fitness",
        description: "A fixture program for the Client 360 summary test suite.",
        durationWeeks: 4,
        isAiOnly: true,
        priceCents: 0,
        status: "published",
      },
    });
    programId = program.id;

    const workout = await prisma.workout.create({
      data: {
        programId,
        name: "Client 360 Fixture Workout",
        order: 0,
        durationMinutes: 30,
        intensity: "beginner",
      },
    });
    workoutId = workout.id;
  });

  afterAll(async () => {
    await prisma.workoutSession.deleteMany({ where: { userId } });
    await prisma.workout.deleteMany({ where: { programId } });
    await prisma.program.deleteMany({ where: { id: programId } });
    await prisma.mealLog.deleteMany({ where: { userId } });
    await prisma.checkIn.deleteMany({ where: { userId } });
    await prisma.bodyMeasurement.deleteMany({ where: { userId } });
    await prisma.consent.deleteMany({ where: { userId } });
    await prisma.relationship.deleteMany({ where: { professionalId, userId } });
    await prisma.professional.deleteMany({ where: { id: { in: [professionalId, otherProfessionalId] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("404s for a professional with no active Relationship to this user", async () => {
    const res = await request(app)
      .get(`/professionals/me/clients/${userId}/summary`)
      .set("Authorization", `Bearer ${otherProfessionalAccessToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("client_not_found");
  });

  it("has an active Relationship but NO health_data_processing consent — honestly withholds health data", async () => {
    const res = await request(app)
      .get(`/professionals/me/clients/${userId}/summary`)
      .set("Authorization", `Bearer ${professionalAccessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ consentGranted: false });
  });

  it("grants health_data_processing consent and returns real aggregated data matching real rows", async () => {
    await prisma.consent.upsert({
      where: { userId_type: { userId, type: "health_data_processing" } },
      create: { userId, type: "health_data_processing", granted: true },
      update: { granted: true },
    });

    const session = await prisma.workoutSession.create({
      data: { userId, workoutId, status: "completed", completedAt: new Date() },
    });
    const mealLog = await prisma.mealLog.create({
      data: {
        userId,
        mealType: "breakfast",
        name: "Client 360 fixture meal",
        calories: 450,
        proteinG: 30,
        carbsG: 40,
        fatG: 12,
      },
    });
    const checkIn = await prisma.checkIn.create({
      data: {
        userId,
        period: "daily",
        periodKey: "client360-fixture-period",
        energy: 4,
        soreness: 2,
        adherence: 5,
        note: "Fixture check-in",
      },
    });
    const measurement = await prisma.bodyMeasurement.create({
      data: { userId, weightKg: 72.5, bodyFatPercent: 18.2 },
    });

    const res = await request(app)
      .get(`/professionals/me/clients/${userId}/summary`)
      .set("Authorization", `Bearer ${professionalAccessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.consentGranted).toBe(true);

    expect(res.body.training.completedCount).toBe(1);
    expect(res.body.training.totalCount).toBe(1);
    expect(res.body.training.recentSessions).toHaveLength(1);
    expect(res.body.training.recentSessions[0]).toEqual(
      expect.objectContaining({
        id: session.id,
        workoutName: "Client 360 Fixture Workout",
        status: "completed",
      }),
    );

    expect(res.body.nutrition.recentLogs).toHaveLength(1);
    expect(res.body.nutrition.recentLogs[0]).toEqual(
      expect.objectContaining({
        id: mealLog.id,
        mealType: "breakfast",
        calories: 450,
        proteinG: 30,
        carbsG: 40,
        fatG: 12,
      }),
    );

    expect(res.body.checkIns).toHaveLength(1);
    expect(res.body.checkIns[0]).toEqual(
      expect.objectContaining({
        id: checkIn.id,
        period: "daily",
        periodKey: "client360-fixture-period",
        energy: 4,
        soreness: 2,
        adherence: 5,
        note: "Fixture check-in",
      }),
    );

    expect(res.body.bodyMeasurements).toHaveLength(1);
    expect(res.body.bodyMeasurements[0]).toEqual(
      expect.objectContaining({
        id: measurement.id,
        weightKg: 72.5,
        bodyFatPercent: 18.2,
      }),
    );

    expect(res.body.notAvailable.sort()).toEqual(["aiCoachConversation", "progressPhotos"]);

    // Cross-check directly against Postgres, not just the HTTP response.
    const dbSession = await prisma.workoutSession.findUnique({ where: { id: session.id } });
    expect(dbSession?.status).toBe("completed");
    const dbConsent = await prisma.consent.findUnique({
      where: { userId_type: { userId, type: "health_data_processing" } },
    });
    expect(dbConsent?.granted).toBe(true);
  });

  it("revoking consent goes back to honestly withholding health data", async () => {
    await prisma.consent.update({
      where: { userId_type: { userId, type: "health_data_processing" } },
      data: { granted: false },
    });

    const res = await request(app)
      .get(`/professionals/me/clients/${userId}/summary`)
      .set("Authorization", `Bearer ${professionalAccessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ consentGranted: false });
  });

  it("401s without professional auth", async () => {
    const res = await request(app).get(`/professionals/me/clients/${userId}/summary`);
    expect(res.status).toBe(401);
  });
});
