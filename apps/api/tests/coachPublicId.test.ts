import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { signAdminAccessToken } from "../src/lib/adminJwt";
import { signProfessionalAccessToken } from "../src/lib/professionalJwt";
import { professionalPublicId } from "../src/lib/professionalCode";

/**
 * Every coach's public FXP- ID (27 Oct 2026, owner: "every coach should have
 * a unique id"): the coach sees it on their own profile, admins see it in the
 * directory and can find the coach by it in global search.
 */
describe("Coach public ID", () => {
  const app = buildApp();
  let coachId: string;
  let adminId: string;
  let coachAuth: string;
  let adminAuth: string;

  beforeAll(async () => {
    const coach = await prisma.professional.create({
      data: { email: `pubid-${uniqueSuffix()}@example.com`, passwordHash: await hashPassword("unused-not-logged-in-with"), fullName: "Public Id Coach", status: "active" },
    });
    coachId = coach.id;
    coachAuth = `Bearer ${signProfessionalAccessToken({ sub: coach.id, email: coach.email }).token}`;
    const admin = await prisma.adminUser.create({
      data: { email: `pubid-admin-${uniqueSuffix()}@example.com`, passwordHash: await hashPassword("unused-not-logged-in-with"), fullName: "Public Id Admin", role: "super_admin", status: "active" },
    });
    adminId = admin.id;
    adminAuth = `Bearer ${signAdminAccessToken({ sub: admin.id, email: admin.email, role: "super_admin" }).token}`;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorAdminId: adminId }, { actorProfessionalId: coachId }] } });
    await prisma.professional.deleteMany({ where: { id: coachId } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
  });

  it("is on the coach's own profile and is the same every time", async () => {
    const res = await request(app).get("/professionals/me").set("Authorization", coachAuth);
    expect(res.status).toBe(200);
    expect(res.body.professional.publicId).toMatch(/^FXP-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(res.body.professional.publicId).toBe(professionalPublicId(coachId));
  });

  it("is in the admin directory and finds the coach in global search, dashes or not", async () => {
    const code = professionalPublicId(coachId);
    const list = await request(app).get("/admin/professionals").query({ search: "Public Id Coach" }).set("Authorization", adminAuth);
    expect(list.status).toBe(200);
    expect(list.body.professionals.find((p: { id: string }) => p.id === coachId)?.publicId).toBe(code);

    for (const q of [code, code.replace(/-/g, "").toLowerCase()]) {
      const res = await request(app).get("/admin/search").query({ q }).set("Authorization", adminAuth);
      expect(res.status).toBe(200);
      expect(res.body.results.map((r: { id: string }) => r.id)).toContain(coachId);
    }
  });
});
