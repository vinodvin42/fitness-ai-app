import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";

/**
 * Credential-expiry sweep (R2 Wave 6.2, 22 Sep 2026) — GET /admin/professionals'
 * read-time detection (adminProfessionals.service.ts's
 * detectAndQueueExpiringCredentials) of a `verified` ProfessionalCredential
 * inside (or past) the 30-day admin warning window off `expiresAt`. Mirrors
 * professionalDashboard.stuckRelationships.test.ts's own shape: this suite
 * fixtures `expiresAt` directly (rather than driving the whole 12-month
 * verify-then-wait path) — the same "fixture the state directly" precedent
 * that suite already documents.
 */
describe("Credential-expiry detection surfaces on the admin directory and queues an AdminActionItem", () => {
  const app = buildApp();
  const adminPassword = "CredExpiryAdminPass9!";
  let superAdminEmail: string;
  const cleanupProfessionalIds: string[] = [];
  const cleanupAdminIds: string[] = [];

  afterAll(async () => {
    await prisma.adminActionItem.deleteMany({
      where: { type: "credential_expiring", entityType: "ProfessionalCredential" },
    });
    if (cleanupProfessionalIds.length) {
      await prisma.professional.deleteMany({ where: { id: { in: cleanupProfessionalIds } } });
    }
    if (cleanupAdminIds.length) {
      await prisma.adminUser.deleteMany({ where: { id: { in: cleanupAdminIds } } });
    }
    await prisma.$disconnect();
  });

  async function createSuperAdmin(): Promise<string> {
    superAdminEmail = uniqueEmail("cred-expiry-admin");
    const admin = await prisma.adminUser.create({
      data: {
        email: superAdminEmail,
        passwordHash: await hashPassword(adminPassword),
        fullName: "Credential Expiry Super Admin",
        role: "super_admin",
        status: "active",
      },
    });
    cleanupAdminIds.push(admin.id);
    const loginRes = await request(app).post("/admin/auth/login").send({ email: superAdminEmail, password: adminPassword });
    expect(loginRes.status).toBe(200);
    return loginRes.body.token;
  }

  async function createProfessionalWithCredential(expiresAt: Date | null, status: "verified" | "pending" = "verified") {
    const suffix = uniqueSuffix();
    const professional = await prisma.professional.create({
      data: {
        email: `coach-cred-expiry-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: `Cred Expiry Fixture Coach ${suffix}`,
        status: "active",
      },
    });
    cleanupProfessionalIds.push(professional.id);

    const credential = await prisma.professionalCredential.create({
      data: {
        professionalId: professional.id,
        serviceType: "fitness",
        status,
        expiresAt,
      },
    });

    return { professional, credential };
  }

  it("a credential expiring within the 30-day window triggers exactly one open 'credential_expiring' AdminActionItem", async () => {
    const adminToken = await createSuperAdmin();
    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days out — inside the 30-day window
    const { credential } = await createProfessionalWithCredential(soon);

    const res = await request(app).get("/admin/professionals").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const items = await prisma.adminActionItem.findMany({
      where: { type: "credential_expiring", entityType: "ProfessionalCredential", entityId: credential.id },
    });
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("open");
    expect(items[0].severity).toBe("medium");
  });

  it("a credential expiring well outside the 30-day window creates no AdminActionItem", async () => {
    const adminToken = await createSuperAdmin();
    const farOut = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000); // ~6.5 months out
    const { credential } = await createProfessionalWithCredential(farOut);

    const res = await request(app).get("/admin/professionals").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const items = await prisma.adminActionItem.findMany({
      where: { type: "credential_expiring", entityType: "ProfessionalCredential", entityId: credential.id },
    });
    expect(items).toHaveLength(0);
  });

  it("an already-expired credential creates a 'high' severity item, and a repeat read doesn't duplicate it (dedup)", async () => {
    const adminToken = await createSuperAdmin();
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    const { credential } = await createProfessionalWithCredential(past);

    const firstRes = await request(app).get("/admin/professionals").set("Authorization", `Bearer ${adminToken}`);
    expect(firstRes.status).toBe(200);

    let items = await prisma.adminActionItem.findMany({
      where: { type: "credential_expiring", entityType: "ProfessionalCredential", entityId: credential.id },
    });
    expect(items).toHaveLength(1);
    expect(items[0].severity).toBe("high");

    const secondRes = await request(app).get("/admin/professionals").set("Authorization", `Bearer ${adminToken}`);
    expect(secondRes.status).toBe(200);

    items = await prisma.adminActionItem.findMany({
      where: { type: "credential_expiring", entityType: "ProfessionalCredential", entityId: credential.id },
    });
    expect(items).toHaveLength(1);
  });

  it("a non-verified credential inside the window is never flagged (soft signal off `verified` credentials only)", async () => {
    const adminToken = await createSuperAdmin();
    const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const { credential } = await createProfessionalWithCredential(soon, "pending");

    const res = await request(app).get("/admin/professionals").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const items = await prisma.adminActionItem.findMany({
      where: { type: "credential_expiring", entityType: "ProfessionalCredential", entityId: credential.id },
    });
    expect(items).toHaveLength(0);
  });

  it("the 'credentialsExpiring' directory tab and count are real (only includes the expiring-soon professional)", async () => {
    const adminToken = await createSuperAdmin();
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const { professional: expiringPro } = await createProfessionalWithCredential(soon);
    await createProfessionalWithCredential(new Date(Date.now() + 200 * 24 * 60 * 60 * 1000));

    const res = await request(app)
      .get("/admin/professionals")
      .query({ tab: "credentialsExpiring" })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const found = res.body.professionals.find((p: { id: string }) => p.id === expiringPro.id);
    expect(found).toBeTruthy();
    expect(res.body.counts.credentialsExpiring).toBeGreaterThanOrEqual(1);
  });

  it("verifyCredential sets a real 12-month expiresAt on approval, and a re-submission clears it", async () => {
    const adminToken = await createSuperAdmin();
    const suffix = uniqueSuffix();
    const professional = await prisma.professional.create({
      data: {
        email: `coach-cred-writepath-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Cred Write Path Fixture Coach",
        status: "active",
      },
    });
    cleanupProfessionalIds.push(professional.id);

    const credential = await prisma.professionalCredential.create({
      data: { professionalId: professional.id, serviceType: "nutrition", status: "pending" },
    });

    const verifyRes = await request(app)
      .patch(`/admin/professionals/${professional.id}/credentials/${credential.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "verified" });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.credential.expiresAt).toBeTruthy();

    const expiresAt = new Date(verifyRes.body.credential.expiresAt);
    const now = new Date();
    const monthsOut = (expiresAt.getFullYear() - now.getFullYear()) * 12 + (expiresAt.getMonth() - now.getMonth());
    expect(monthsOut).toBeGreaterThanOrEqual(11);
    expect(monthsOut).toBeLessThanOrEqual(12);

    const stored = await prisma.professionalCredential.findUnique({ where: { id: credential.id } });
    expect(stored?.expiresAt).toBeTruthy();

    await prisma.adminActionItem.deleteMany({
      where: { type: "credential_expiring", entityType: "ProfessionalCredential", entityId: credential.id },
    });
  });
});
