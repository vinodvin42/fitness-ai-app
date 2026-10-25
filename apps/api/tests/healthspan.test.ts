import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { estimateVo2max, fitnessAge, framinghamRisk, heartAge, heartAgeDrivers, paIndex, whoBand, whoSouthAsiaRisk } from "../src/modules/healthspan/healthspan.math";

/** Healthspan (owner, 25 Oct 2026, phases 1 and 2): fitness age, heart age, BP / VO2max readings, trends. */
describe("healthspan maths", () => {
  const normal = { age: 30, bmi: 22.5, sbp: 125, bpTreated: false, smoker: false, diabetes: false };

  it("matches the Framingham Heart Study calculator (gencardio_bmi.xls) at normal levels", () => {
    expect(framinghamRisk({ sex: "female", ...normal })).toBeCloseTo(0.010801167676829593, 10);
    expect(framinghamRisk({ sex: "male", ...normal })).toBeCloseTo(0.0177611311514575, 10);
    expect(heartAge({ sex: "female", ...normal })).toBeCloseTo(30, 6);
    expect(heartAge({ sex: "male", ...normal })).toBeCloseTo(30, 6);
    // Same, on blood-pressure medicine.
    expect(heartAge({ sex: "female", ...normal, bpTreated: true })).toBeCloseTo(33.95311946625494, 6);
    expect(heartAge({ sex: "male", ...normal, bpTreated: true })).toBeCloseTo(33.525743857299965, 6);
    // The calculator's "optimal" levels: SBP 110, BMI 22.
    expect(framinghamRisk({ sex: "female", ...normal, sbp: 110, bmi: 22 })).toBeCloseTo(0.007465272832395842, 10);
  });

  it("WHO 2019 South Asia: at the centring values only the baseline and the regional recalibration apply", () => {
    // Man, 60, SBP 120, BMI 25, non-smoker: uncalibrated CHD = 1 - 0.9544258, stroke = 1 - 0.984826, then
    // 1 - exp(-exp(cons + slope * ln(-ln(1 - p)))) with the IND 2017 region values, combined 1 - (1-a)(1-b).
    const r = whoSouthAsiaRisk({ sex: "male", age: 60, sbp: 120, bmi: 25, smoker: false });
    const recal = (p: number, cons: number, slope: number) => 1 - Math.exp(-Math.exp(cons + slope * Math.log(-Math.log(1 - p))));
    const chd = recal(1 - 0.9544258, -0.20811593532562256, 0.9884583950042725);
    const stroke = recal(1 - 0.984826, -1.3655134439468384, 0.5289114713668823);
    expect(r.chd).toBeCloseTo(chd, 12);
    expect(r.stroke).toBeCloseTo(stroke, 12);
    expect(r.cvd).toBeCloseTo(1 - (1 - chd) * (1 - stroke), 12);
    expect(r.cvd * 100).toBeCloseTo(6.5, 1);
    // Smoking, higher pressure and age raise it; a young, lean non-smoker is low.
    expect(whoSouthAsiaRisk({ sex: "female", age: 65, sbp: 160, bmi: 30, smoker: true }).cvd).toBeGreaterThan(0.15);
    expect(whoSouthAsiaRisk({ sex: "male", age: 40, sbp: 120, bmi: 22, smoker: false }).cvd).toBeLessThan(0.05);
    expect([whoBand(4.9), whoBand(5), whoBand(12), whoBand(25), whoBand(30)]).toEqual(["<5", "5-10", "10-20", "20-30", ">=30"]);
  });

  it("names what raises heart age", () => {
    expect(heartAgeDrivers({ sex: "male", ...normal })).toEqual([]);
    expect(heartAgeDrivers({ sex: "male", ...normal, sbp: 138, bmi: 27, smoker: true })).toEqual(["blood_pressure", "bmi", "smoking"]);
    expect(heartAge({ sex: "male", ...normal, age: 45, sbp: 138, bmi: 27, smoker: true })).toBeGreaterThan(45);
  });

  it("estimates VO2max with the NTNU / HUNT model and the HUNT activity index", () => {
    expect(paIndex({ frequency: "two_three_weekly", intensity: "breathless", duration: "from_30_to_60" })).toBeCloseTo(3.75, 10);
    expect(paIndex({ frequency: "never" })).toBe(0);
    expect(paIndex({ frequency: "weekly" })).toBeNull();
    expect(paIndex({ frequency: "almost_daily", intensity: "near_exhaustion", duration: "over_60" })).toBe(15);
    expect(estimateVo2max({ sex: "male", age: 40, waistCm: 90, restingHr: 60, paIndex: 3.75 })).toBeCloseTo(46.7675, 6);
    expect(estimateVo2max({ sex: "female", age: 40, waistCm: 80, restingHr: 62, paIndex: 3.75 })).toBeCloseTo(
      74.736 - 0.247 * 40 - 0.259 * 80 - 0.114 * 62 + 0.198 * 3.75,
      10,
    );
  });

  it("turns VO2max into a fitness age on the HUNT3 averages, held at 20 and 90", () => {
    expect(fitnessAge("male", 46.7675).age).toBeCloseTo(45.465, 6);
    expect(fitnessAge("female", 43)).toEqual({ age: 25, bound: null });
    expect(fitnessAge("female", 60)).toEqual({ age: 20, bound: "under" });
    expect(fitnessAge("male", 20)).toEqual({ age: 90, bound: "over" });
    expect(fitnessAge("male", 34).age).toBeCloseTo(75, 10);
  });
});

describe("healthspan API", () => {
  const app = buildApp();
  let userId: string;
  let auth: string;
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    const res = await request(app).post("/auth/signup").send({ email: uniqueEmail("hspan"), password: "SomePassword1!", fullName: "Span Tester" });
    userId = res.body.user.id;
    auth = `Bearer ${res.body.tokens.accessToken}`;
    const dob = new Date(Date.UTC(new Date().getUTCFullYear() - 45, 0, 15));
    await prisma.onboardingProfile.upsert({
      where: { userId },
      create: { userId, gender: "male", dateOfBirth: dob, heightCm: 175, weightKg: 78, medicalConditions: ["None"] },
      update: { gender: "male", dateOfBirth: dob, heightCm: 175, weightKg: 78, medicalConditions: ["None"] },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("names what's missing before anything can be worked out", async () => {
    const r = await request(app).get("/healthspan").set("Authorization", auth);
    expect(r.status).toBe(200);
    expect(r.body.age).toBe(45);
    expect(r.body.fitness).toMatchObject({ status: "missing", fitnessAge: null, missing: ["waist", "resting_hr", "activity"] });
    expect(r.body.heart).toMatchObject({ status: "missing", heartAge: null, missing: ["blood_pressure", "smoking", "bp_medication"] });
    expect(r.body.risk).toMatchObject({ status: "missing", riskPct: null, missing: ["blood_pressure", "smoking"] });
  });

  it("stores the answers encrypted and validates them", async () => {
    const bad = await request(app).put("/healthspan/answers").set("Authorization", auth).send({ activity: { frequency: "weekly" } });
    expect(bad.status).toBe(400);
    const ok = await request(app)
      .put("/healthspan/answers")
      .set("Authorization", auth)
      .send({ smoking: "never", bpMedication: false, activity: { frequency: "two_three_weekly", intensity: "breathless", duration: "from_30_to_60" } });
    expect(ok.status).toBe(200);
    const row = await prisma.onboardingProfile.findUnique({ where: { userId } });
    expect(row?.healthspanEnc).toBeTruthy();
    expect(row?.healthspanEnc).not.toContain("never");
    expect(row?.healthspanEnc).not.toContain("two_three_weekly");
  });

  it("checks readings: top above bottom, not in the future", async () => {
    expect((await request(app).post("/healthspan/readings").set("Authorization", auth).send({ kind: "blood_pressure", systolic: 80, diastolic: 90 })).status).toBe(400);
    const future = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    expect(
      (await request(app).post("/healthspan/readings").set("Authorization", auth).send({ kind: "blood_pressure", systolic: 120, diastolic: 80, measuredAt: future })).status,
    ).toBe(400);
    expect((await request(app).post("/healthspan/readings").set("Authorization", auth).send({ kind: "vo2max", vo2max: 120 })).status).toBe(400);
  });

  it("works out fitness age and heart age once the inputs are there", async () => {
    await prisma.bodyMeasurement.create({ data: { userId, waistCm: 90, weightKg: 78, loggedAt: new Date() } });
    await request(app).put("/recovery").set("Authorization", auth).send({ date: today, restingHeartRate: 60 });
    const bp = await request(app).post("/healthspan/readings").set("Authorization", auth).send({ kind: "blood_pressure", systolic: 128, diastolic: 82 });
    expect(bp.status).toBe(201);
    expect(bp.body).toMatchObject({ kind: "blood_pressure", systolic: 128, diastolic: 82, source: "manual" });

    const r = await request(app).get("/healthspan").set("Authorization", auth);
    const vo2 = estimateVo2max({ sex: "male", age: 45, waistCm: 90, restingHr: 60, paIndex: 3.75 });
    expect(r.body.fitness).toMatchObject({ status: "ready", vo2Source: "estimated", missing: [] });
    expect(r.body.fitness.vo2max).toBeCloseTo(vo2, 1);
    expect(r.body.fitness.fitnessAge).toBe(Math.round(fitnessAge("male", vo2).age));
    const bmi = 78 / (1.75 * 1.75);
    const inputs = { sex: "male" as const, age: 45, bmi, sbp: 128, bpTreated: false, smoker: false, diabetes: false };
    expect(r.body.heart).toMatchObject({ status: "ready", heartAge: Math.round(heartAge(inputs)), drivers: ["blood_pressure", "bmi"], missing: [] });
    expect(r.body.heart.riskPct).toBeCloseTo(framinghamRisk(inputs) * 100, 1);
    const who = whoSouthAsiaRisk({ sex: "male", age: 45, sbp: 128, bmi, smoker: false }).cvd * 100;
    expect(r.body.risk).toMatchObject({ status: "ready", model: "who_2019_south_asia", band: whoBand(who), diabetesNotIncluded: false, missing: [] });
    expect(r.body.risk.riskPct).toBeCloseTo(who, 1);
  });

  it("prefers a measured VO2max", async () => {
    await request(app).post("/healthspan/readings").set("Authorization", auth).send({ kind: "vo2max", vo2max: 50 });
    const r = await request(app).get("/healthspan").set("Authorization", auth);
    expect(r.body.fitness).toMatchObject({ vo2Source: "measured", vo2max: 50, fitnessAge: Math.round(fitnessAge("male", 50).age) });
    const list = await request(app).get("/healthspan/readings?kind=vo2max").set("Authorization", auth);
    expect(list.body.items).toHaveLength(1);
  });

  it("keeps one device reading per day from a sync", async () => {
    const pair = await request(app).post("/devices").set("Authorization", auth).send({ provider: "health_connect", name: "Health Connect" });
    for (const systolicBp of [131, 133]) {
      await request(app)
        .post(`/devices/${pair.body.id}/sync`)
        .set("Authorization", auth)
        .send({ samples: [{ date: today, systolicBp, diastolicBp: 84, vo2max: 48.5 }] });
    }
    const bps = await prisma.healthReading.findMany({ where: { userId, kind: "blood_pressure", source: "device" } });
    expect(bps.map((b) => b.systolic)).toEqual([133]);
    expect(await prisma.healthReading.count({ where: { userId, kind: "vo2max", source: "device" } })).toBe(1);
  });

  it("gives 12 months of monthly averages, oldest first", async () => {
    const r = await request(app).get("/healthspan/trends").set("Authorization", auth);
    expect(r.status).toBe(200);
    expect(r.body.months).toBe(12);
    expect(r.body.items).toHaveLength(12);
    const last = r.body.items[11];
    expect(last.month).toBe(today.slice(0, 7));
    expect(last).toMatchObject({ waistCm: 90, restingHr: 60 });
    expect(last.systolic).toBeGreaterThanOrEqual(128);
    expect((await request(app).get("/healthspan/trends?months=3").set("Authorization", auth)).status).toBe(400);
    expect((await request(app).get("/healthspan")).status).toBe(401);
  });
});
