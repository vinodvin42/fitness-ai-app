import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { hashPassword } from "../src/lib/password";

/**
 * R2 Wave 1 (20 Sep 2026) — Professional.lifecycleStatus's real
 * `application -> verification -> approved -> available` transitions, the
 * `available` precondition (>= 1 verified ProfessionalCredential), and the
 * suspend/reactivate <-> lifecycleStatus interaction. See
 * professionalLifecycle.service.ts's own doc comment for the full design.
 *
 * Real Postgres-backed integration test, same "no mocked Prisma/Express"
 * discipline as the rest of this directory — walks a real professional
 * through the full flow over HTTP, then asserts against the DB directly
 * (not just response bodies) at each real transition.
 */
describe("Professional R1 lifecycle (application -> verification -> approved -> available)", () => {
  const app = buildApp();
  const professionalPassword = "CoachOnlyPass9!";
  const adminPassword = "AdminOnlyPass9!";

  let professionalId: string;
  let professionalEmail: string;
  let professionalToken: string;
  let credentialId: string;

  let adminId: string;
  let adminEmail: string;
  let adminToken: string;

  beforeAll(async () => {
    professionalEmail = uniqueEmail("lifecycle-coach");
    const signupRes = await request(app)
      .post("/professionals/auth/signup")
      .send({ email: professionalEmail, password: professionalPassword, fullName: "Lifecycle Test Coach" });
    expect(signupRes.status).toBe(201);
    professionalId = signupRes.body.professional.id;
    professionalToken = signupRes.body.tokens.accessToken;

    // coach_operations holds professionals:view/edit/approve (see
    // adminPermissions.ts's PERMISSION_MATRIX) — real gated actions below.
    const passwordHash = await hashPassword(adminPassword);
    adminEmail = uniqueEmail("lifecycle-admin");
    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        passwordHash,
        fullName: "Lifecycle Test Admin",
        role: "coach_operations",
        status: "active",
      },
    });
    adminId = admin.id;

    const adminLoginRes = await request(app).post("/admin/auth/login").send({ email: adminEmail, password: adminPassword });
    expect(adminLoginRes.status).toBe(200);
    adminToken = adminLoginRes.body.token;
  });

  afterAll(async () => {
    await prisma.professionalCredential.deleteMany({ where: { professionalId } });
    await prisma.professionalRefreshToken.deleteMany({ where: { professionalId } });
    await prisma.auditLog.deleteMany({ where: { entityId: professionalId, entityType: "Professional" } });
    await prisma.professional.deleteMany({ where: { id: professionalId } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("starts a brand-new professional at lifecycleStatus 'application'", async () => {
    const dbProfessional = await prisma.professional.findUnique({ where: { id: professionalId } });
    expect(dbProfessional?.lifecycleStatus).toBe("application");
    expect(dbProfessional?.maxActiveClients).toBe(15);

    const res = await request(app)
      .get("/professionals/me/lifecycle")
      .set("Authorization", `Bearer ${professionalToken}`);
    expect(res.status).toBe(200);
    expect(res.body.lifecycleStatus).toBe("application");
    expect(res.body.isAvailableForNewClients).toBe(false);
  });

  it("moves application -> verification the moment a first credential is submitted (system-driven)", async () => {
    const selectRes = await request(app)
      .put("/professionals/me/services")
      .set("Authorization", `Bearer ${professionalToken}`)
      .send({ services: ["fitness"] });
    expect(selectRes.status).toBe(200);

    const submitRes = await request(app)
      .post("/professionals/me/credentials")
      .set("Authorization", `Bearer ${professionalToken}`)
      .send({ serviceType: "fitness", certificationName: "CPT", certifyingBody: "NASM", yearObtained: 2020 });
    expect(submitRes.status).toBe(200);
    credentialId = submitRes.body.credential.id;

    const dbProfessional = await prisma.professional.findUnique({ where: { id: professionalId } });
    expect(dbProfessional?.lifecycleStatus).toBe("verification");

    const auditEntry = await prisma.auditLog.findFirst({
      where: { entityId: professionalId, action: "professional.lifecycle.verification" },
    });
    expect(auditEntry).not.toBeNull();
  });

  it("does NOT advance to approved on KYC verification alone (credential still pending)", async () => {
    const kycSubmitRes = await request(app)
      .post("/professionals/me/kyc")
      .set("Authorization", `Bearer ${professionalToken}`)
      .send({ kycDocumentData: "data:image/png;base64,AAAA" });
    expect(kycSubmitRes.status).toBe(200);

    const kycVerifyRes = await request(app)
      .patch(`/admin/professionals/${professionalId}/kyc`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "verified" });
    expect(kycVerifyRes.status).toBe(200);

    const dbProfessional = await prisma.professional.findUnique({ where: { id: professionalId } });
    expect(dbProfessional?.lifecycleStatus).toBe("verification");
  });

  it("refuses 'available' with zero verified credentials — isAvailableForNewClients stays false through 'approved'", async () => {
    // Precondition still not met (KYC alone isn't enough — see the enum's
    // own doc comment: `available` requires >= 1 verified credential).
    const summaryBefore = await request(app)
      .get("/professionals/me/lifecycle")
      .set("Authorization", `Bearer ${professionalToken}`);
    expect(summaryBefore.body.lifecycleStatus).toBe("verification");
    expect(summaryBefore.body.isAvailableForNewClients).toBe(false);
  });

  it("verifying the credential clears BOTH conditions -> auto-advances verification -> approved -> available in one real admin action", async () => {
    const verifyCredentialRes = await request(app)
      .patch(`/admin/professionals/${professionalId}/credentials/${credentialId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "verified" });
    expect(verifyCredentialRes.status).toBe(200);
    expect(verifyCredentialRes.body.credential.status).toBe("verified");

    const dbProfessional = await prisma.professional.findUnique({ where: { id: professionalId } });
    // Both approved -> available transitions landed for real, not just an
    // intermediate 'approved' — recomputeAvailability runs right after
    // maybeAdvanceToApproved within verifyCredential.
    expect(dbProfessional?.lifecycleStatus).toBe("available");

    const approvedAudit = await prisma.auditLog.findFirst({
      where: { entityId: professionalId, action: "professional.lifecycle.approved" },
    });
    expect(approvedAudit).not.toBeNull();
    const availableAudit = await prisma.auditLog.findFirst({
      where: { entityId: professionalId, action: "professional.lifecycle.available" },
    });
    expect(availableAudit).not.toBeNull();

    const summary = await request(app)
      .get("/professionals/me/lifecycle")
      .set("Authorization", `Bearer ${professionalToken}`);
    expect(summary.body.lifecycleStatus).toBe("available");
    expect(summary.body.isAvailableForNewClients).toBe(true);
  });

  it("rejecting the professional's only verified credential demotes available -> approved (real precondition enforcement, not stale)", async () => {
    const rejectRes = await request(app)
      .patch(`/admin/professionals/${professionalId}/credentials/${credentialId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "rejected" });
    expect(rejectRes.status).toBe(200);

    const dbProfessional = await prisma.professional.findUnique({ where: { id: professionalId } });
    expect(dbProfessional?.lifecycleStatus).toBe("approved");

    const demotedAudit = await prisma.auditLog.findFirst({
      where: { entityId: professionalId, action: "professional.lifecycle.demoted_to_approved" },
    });
    expect(demotedAudit).not.toBeNull();

    const summary = await request(app)
      .get("/professionals/me/lifecycle")
      .set("Authorization", `Bearer ${professionalToken}`);
    expect(summary.body.lifecycleStatus).toBe("approved");
    expect(summary.body.isAvailableForNewClients).toBe(false);

    // Re-verify so later tests resume from 'available'.
    const reverifyRes = await request(app)
      .patch(`/admin/professionals/${professionalId}/credentials/${credentialId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "verified" });
    expect(reverifyRes.status).toBe(200);
    const dbAfterReverify = await prisma.professional.findUnique({ where: { id: professionalId } });
    expect(dbAfterReverify?.lifecycleStatus).toBe("available");
  });

  it("a professional can read/set their own maxActiveClients", async () => {
    const updateRes = await request(app)
      .put("/professionals/me/capacity")
      .set("Authorization", `Bearer ${professionalToken}`)
      .send({ maxActiveClients: 8 });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.maxActiveClients).toBe(8);

    const dbProfessional = await prisma.professional.findUnique({ where: { id: professionalId } });
    expect(dbProfessional?.maxActiveClients).toBe(8);

    const capacityAudit = await prisma.auditLog.findFirst({
      where: { entityId: professionalId, action: "professional.max_active_clients_updated", actorProfessionalId: professionalId },
    });
    expect(capacityAudit).not.toBeNull();
  });

  it("an admin can also edit the same professional's maxActiveClients", async () => {
    const updateRes = await request(app)
      .patch(`/admin/professionals/${professionalId}/capacity`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ maxActiveClients: 20 });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.professional.maxActiveClients).toBe(20);

    const capacityAudit = await prisma.auditLog.findFirst({
      where: { entityId: professionalId, action: "professional.max_active_clients_updated", actorAdminId: adminId },
    });
    expect(capacityAudit).not.toBeNull();
  });

  it("suspend sets lifecycleStatus to 'suspended' (snapshotting the prior stage) and reactivate restores it — real interaction, not left stale", async () => {
    const beforeSuspend = await prisma.professional.findUnique({ where: { id: professionalId } });
    expect(beforeSuspend?.lifecycleStatus).toBe("available");

    const suspendRes = await request(app)
      .post(`/admin/professionals/${professionalId}/suspend`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ adminNotes: "Test suspension" });
    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.professional.status).toBe("suspended");

    const suspended = await prisma.professional.findUnique({ where: { id: professionalId } });
    expect(suspended?.status).toBe("suspended");
    expect(suspended?.lifecycleStatus).toBe("suspended");

    const suspendAudit = await prisma.auditLog.findFirst({
      where: { entityId: professionalId, action: "professional.lifecycle.suspended" },
      orderBy: { createdAt: "desc" },
    });
    expect(suspendAudit).not.toBeNull();
    expect((suspendAudit?.metadata as { previousLifecycleStatus?: string } | null)?.previousLifecycleStatus).toBe("available");

    // While suspended, isAvailableForNewClients must read false even
    // though lifecycleStatus alone might not — Professional.status is the
    // authoritative "can this professional do anything" gate.
    const summaryWhileSuspended = await request(app)
      .get("/professionals/me/lifecycle")
      .set("Authorization", `Bearer ${professionalToken}`);
    expect(summaryWhileSuspended.status).toBe(200);
    expect(summaryWhileSuspended.body.status).toBe("suspended");
    expect(summaryWhileSuspended.body.isAvailableForNewClients).toBe(false);

    const reactivateRes = await request(app)
      .post(`/admin/professionals/${professionalId}/reactivate`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.professional.status).toBe("active");

    const reactivated = await prisma.professional.findUnique({ where: { id: professionalId } });
    expect(reactivated?.status).toBe("active");
    expect(reactivated?.lifecycleStatus).toBe("available");

    const restoredAudit = await prisma.auditLog.findFirst({
      where: { entityId: professionalId, action: "professional.lifecycle.restored" },
      orderBy: { createdAt: "desc" },
    });
    expect(restoredAudit).not.toBeNull();
    expect((restoredAudit?.metadata as { restoredTo?: string } | null)?.restoredTo).toBe("available");

    const summaryAfterReactivate = await request(app)
      .get("/professionals/me/lifecycle")
      .set("Authorization", `Bearer ${professionalToken}`);
    expect(summaryAfterReactivate.body.lifecycleStatus).toBe("available");
    expect(summaryAfterReactivate.body.isAvailableForNewClients).toBe(true);
  });
});
