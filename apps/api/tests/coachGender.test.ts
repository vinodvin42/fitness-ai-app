import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";

/**
 * Coach gender (owner, 20 Oct 2026: "give male and female coaches option").
 * A coach states their gender (or an admin sets it); a member asking for a
 * coach can choose a male or female coach; the admin's candidate list can be
 * narrowed to that gender, and a request is never sent to a coach of another
 * (or no stated) gender. See lib/coachGender.ts.
 *
 * Rate limits: 1 admin login + 2 professional logins + 2 consumer signups.
 */
describe("Coach gender", () => {
  const app = buildApp();
  const PASSWORD = "CoachGender123!";
  const userIds: string[] = [];
  const proIds: string[] = [];
  let adminId: string;
  let adminToken: string;
  let femaleCoach: { id: string; token: string };
  let otherCoach: { id: string; token: string };

  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });

  async function makeCoach(label: string) {
    const email = uniqueEmail(`gender-${label}`);
    const pro = await prisma.professional.create({
      data: {
        email,
        passwordHash: await hashPassword(PASSWORD),
        fullName: `Gender ${label}`,
        status: "active",
        lifecycleStatus: "available",
        maxActiveClients: 20,
      },
    });
    proIds.push(pro.id);
    const login = await request(app).post("/professionals/auth/login").send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
    return { id: pro.id, token: (login.body.tokens?.accessToken ?? login.body.accessToken) as string };
  }

  async function makeMember(label: string) {
    const res = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail(`gender-${label}`), password: "Testpass123!", fullName: `Member ${label}` });
    expect(res.status).toBe(201);
    userIds.push(res.body.user.id);
    return { id: res.body.user.id as string, token: res.body.tokens.accessToken as string };
  }

  beforeAll(async () => {
    const admin = await prisma.adminUser.create({
      data: {
        email: `admin-gender-${uniqueSuffix()}@example.com`,
        passwordHash: await hashPassword(PASSWORD),
        fullName: "Gender Admin",
        role: "super_admin",
        status: "active",
      },
    });
    adminId = admin.id;
    const login = await request(app).post("/admin/auth/login").send({ email: admin.email, password: PASSWORD });
    adminToken = login.body.token;
    femaleCoach = await makeCoach("female");
    otherCoach = await makeCoach("other");
  });

  afterAll(async () => {
    await prisma.guidanceRequest.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.professionalOffer.deleteMany({ where: { professionalId: { in: proIds } } });
    await prisma.relationship.deleteMany({ where: { professionalId: { in: proIds } } });
    await prisma.adminActionItem.deleteMany({ where: { entityType: "GuidanceRequest" } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.professional.deleteMany({ where: { id: { in: proIds } } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("a coach states their own gender, and can clear it", async () => {
    const auth = { Authorization: `Bearer ${femaleCoach.token}` };
    expect((await request(app).patch("/professionals/me/gender").set(auth).send({ gender: "other" })).status).toBe(400);
    expect((await request(app).patch("/professionals/me/gender").set(auth).send({ gender: null })).status).toBe(200);
    const res = await request(app).patch("/professionals/me/gender").set(auth).send({ gender: "female" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ gender: "female" });
    expect((await request(app).get("/professionals/me").set(auth)).body.professional.gender).toBe("female");
  });

  it("an admin sets a coach's gender", async () => {
    const res = await request(app).patch(`/admin/professionals/${otherCoach.id}/gender`).set(asAdmin()).send({ gender: "male" });
    expect(res.status).toBe(200);
    const detail = await request(app).get(`/admin/professionals/${otherCoach.id}`).set(asAdmin());
    expect(detail.body.professional.gender).toBe("male");
  });

  it("the admin's candidate list shows each coach's gender and can be narrowed to one", async () => {
    const all = await request(app).get("/admin/professional-offers/available-professionals").set(asAdmin());
    const mine = all.body.professionals.filter((p: { id: string }) => proIds.includes(p.id));
    expect(mine.map((p: { gender: string }) => p.gender).sort()).toEqual(["female", "male"]);
    const female = await request(app)
      .get("/admin/professional-offers/available-professionals")
      .query({ gender: "female" })
      .set(asAdmin());
    const ids = female.body.professionals.map((p: { id: string }) => p.id);
    expect(ids).toContain(femaleCoach.id);
    expect(ids).not.toContain(otherCoach.id);
  });

  it("a member asks for a female coach; the request only goes to a female coach", async () => {
    const member = await makeMember("wants-female");
    const created = await request(app)
      .post("/coaching/guidance-requests")
      .set({ Authorization: `Bearer ${member.token}` })
      .send({ serviceType: "fitness", coachGender: "female" });
    expect(created.status).toBe(201);
    expect(created.body.coachGenderPreference).toBe("female");

    const wrong = await request(app)
      .post(`/admin/guidance-requests/${created.body.id}/match`)
      .set(asAdmin())
      .send({ professionalId: otherCoach.id });
    expect(wrong.status).toBe(409);
    expect(wrong.body.error.code).toBe("coach_gender_mismatch");
    expect(await prisma.professionalOffer.count({ where: { professionalId: otherCoach.id } })).toBe(0);

    const right = await request(app)
      .post(`/admin/guidance-requests/${created.body.id}/match`)
      .set(asAdmin())
      .send({ professionalId: femaleCoach.id });
    expect(right.status).toBe(201);
    expect(right.body.request.status).toBe("offered");
  });

  it("with no preference, any coach can be offered", async () => {
    const member = await makeMember("no-preference");
    const created = await request(app)
      .post("/coaching/guidance-requests")
      .set({ Authorization: `Bearer ${member.token}` })
      .send({ serviceType: "nutrition" });
    expect(created.status).toBe(201);
    expect(created.body.coachGenderPreference).toBeNull();
    const res = await request(app)
      .post(`/admin/guidance-requests/${created.body.id}/match`)
      .set(asAdmin())
      .send({ professionalId: otherCoach.id });
    expect(res.status).toBe(201);
  });
});
