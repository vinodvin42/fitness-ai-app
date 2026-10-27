import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueSuffix, createPricedOffering } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { signAdminAccessToken } from "../src/lib/adminJwt";

/**
 * GET /admin/professionals/:id/fees (27 Oct 2026): a coach's level and fee
 * structure on their admin profile — the same view the coach sees on Earnings.
 */
describe("Admin view of a coach's fees", () => {
  const app = buildApp();
  let coachId: string;
  const adminIds: string[] = [];
  let superAuth: string;
  let pricing: Awaited<ReturnType<typeof createPricedOffering>> | undefined;

  const admin = async (role: string) => {
    const a = await prisma.adminUser.create({
      data: { email: `fees-${role}-${uniqueSuffix()}@example.com`, passwordHash: await hashPassword("unused-not-logged-in-with"), fullName: `Fees ${role}`, role: role as never, status: "active" },
    });
    adminIds.push(a.id);
    return `Bearer ${signAdminAccessToken({ sub: a.id, email: a.email, role }).token}`;
  };

  beforeAll(async () => {
    const coach = await prisma.professional.create({
      data: { email: `fees-coach-${uniqueSuffix()}@example.com`, passwordHash: await hashPassword("unused-not-logged-in-with"), fullName: "Fees Coach", status: "active" },
    });
    coachId = coach.id;
    pricing = await createPricedOffering(coachId, { serviceType: "fitness", feeCents: 200000, durationMinutes: 45, label: "Fees Session" });
    superAuth = await admin("super_admin");
  });

  afterAll(async () => {
    await prisma.professionalServiceOffering.deleteMany({ where: { professionalId: coachId } });
    await prisma.professional.deleteMany({ where: { id: coachId } });
    await pricing?.cleanup();
    await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
  });

  it("returns the coach's level, fees, commission and GST", async () => {
    const res = await request(app).get(`/admin/professionals/${coachId}/fees`).set("Authorization", superAuth);
    expect(res.status).toBe(200);
    expect(res.body.level?.name).toMatch(/^Test level/);
    expect(typeof res.body.commissionPct).toBe("number");
    expect(typeof res.body.gstPercent).toBe("number");
    expect(res.body.fees.some((f: { priceCents: number | null }) => f.priceCents === 200000)).toBe(true);
  });

  it("needs an admin, and 404s for an unknown coach", async () => {
    expect((await request(app).get(`/admin/professionals/${coachId}/fees`)).status).toBe(401);
    const missing = await request(app).get(`/admin/professionals/does-not-exist/fees`).set("Authorization", superAuth);
    expect(missing.status).toBe(404);
  });
});
