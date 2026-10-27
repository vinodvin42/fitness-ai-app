import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";

/**
 * Admin console profile photos (owner decision, 27 Oct 2026): GET /admin/users/:id/photo
 * (users:view) and GET /admin/professionals/:id/photo (professionals:view), plus the
 * `photoUpdatedAt` the directory lists and detail responses carry so the console only fetches
 * photos people actually have. The lists must never carry the image itself.
 */
describe("Admin profile photos", () => {
  const app = buildApp();
  const adminPassword = "AdminPhotosPass9!";
  const imageData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const tag = `adminphotos${uniqueSuffix().replace(/[^a-z0-9]/gi, "")}`;
  const cleanupUserIds: string[] = [];
  const cleanupProfessionalIds: string[] = [];
  const cleanupAdminIds: string[] = [];
  const tokens: Record<"super_admin" | "support" | "finance", string> = { super_admin: "", support: "", finance: "" };

  let userWithPhotoId: string;
  let userWithoutPhotoId: string;
  let proWithPhotoId: string;
  let proWithoutPhotoId: string;
  let relationshipId: string;

  async function adminToken(role: "super_admin" | "support" | "finance") {
    const email = uniqueEmail(`admin-photos-${role}`);
    const admin = await prisma.adminUser.create({
      data: { email, passwordHash: await hashPassword(adminPassword), fullName: `Photos ${role}`, role, status: "active" },
    });
    cleanupAdminIds.push(admin.id);
    const res = await request(app).post("/admin/auth/login").send({ email, password: adminPassword });
    expect(res.status).toBe(200);
    return res.body.token as string;
  }

  async function signupUser(label: string) {
    const res = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail(`${tag}-${label}`), password: "SomePassword1!", fullName: `Photo ${label} ${tag}` });
    expect(res.status).toBe(201);
    cleanupUserIds.push(res.body.user.id);
    return res.body.user.id as string;
  }

  async function createProfessional(label: string) {
    const professional = await prisma.professional.create({
      data: {
        email: `${tag}-${label}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: `Photo Coach ${label} ${tag}`,
        status: "active",
      },
    });
    cleanupProfessionalIds.push(professional.id);
    return professional.id;
  }

  beforeAll(async () => {
    tokens.super_admin = await adminToken("super_admin");
    tokens.support = await adminToken("support");
    tokens.finance = await adminToken("finance");

    userWithPhotoId = await signupUser("with");
    userWithoutPhotoId = await signupUser("without");
    await prisma.userProfilePhoto.create({ data: { userId: userWithPhotoId, imageData } });

    proWithPhotoId = await createProfessional("with");
    proWithoutPhotoId = await createProfessional("without");
    await prisma.professionalProfilePhoto.create({ data: { professionalId: proWithPhotoId, imageData } });

    const relationship = await prisma.relationship.create({
      data: { userId: userWithPhotoId, professionalId: proWithoutPhotoId, serviceType: "fitness", status: "active" },
    });
    relationshipId = relationship.id;
  });

  afterAll(async () => {
    if (cleanupUserIds.length) await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
    if (cleanupProfessionalIds.length) await prisma.professional.deleteMany({ where: { id: { in: cleanupProfessionalIds } } });
    if (cleanupAdminIds.length) await prisma.adminUser.deleteMany({ where: { id: { in: cleanupAdminIds } } });
    await prisma.$disconnect();
  });

  it("401s without an admin token", async () => {
    expect((await request(app).get(`/admin/users/${userWithPhotoId}/photo`)).status).toBe(401);
    expect((await request(app).get(`/admin/professionals/${proWithPhotoId}/photo`)).status).toBe(401);
  });

  it("403s for a role without users:view / professionals:view", async () => {
    const auth = { Authorization: `Bearer ${tokens.finance}` };
    expect((await request(app).get(`/admin/users/${userWithPhotoId}/photo`).set(auth)).status).toBe(403);
    expect((await request(app).get(`/admin/professionals/${proWithPhotoId}/photo`).set(auth)).status).toBe(403);
    // Support holds users:view but not professionals:view.
    const support = { Authorization: `Bearer ${tokens.support}` };
    expect((await request(app).get(`/admin/users/${userWithPhotoId}/photo`).set(support)).status).toBe(200);
    expect((await request(app).get(`/admin/professionals/${proWithPhotoId}/photo`).set(support)).status).toBe(403);
  });

  it("returns the member's and the coach's photo, privately cacheable", async () => {
    const auth = { Authorization: `Bearer ${tokens.super_admin}` };
    const userRes = await request(app).get(`/admin/users/${userWithPhotoId}/photo`).set(auth);
    expect(userRes.status).toBe(200);
    expect(userRes.body.photo.imageData).toBe(imageData);
    expect(typeof userRes.body.photo.updatedAt).toBe("string");
    expect(userRes.headers["cache-control"]).toBe("private, max-age=300");

    const proRes = await request(app).get(`/admin/professionals/${proWithPhotoId}/photo`).set(auth);
    expect(proRes.status).toBe(200);
    expect(proRes.body.photo.imageData).toBe(imageData);
    expect(proRes.headers["cache-control"]).toBe("private, max-age=300");
  });

  it("returns photo: null when none is set, and 404 for unknown ids", async () => {
    const auth = { Authorization: `Bearer ${tokens.super_admin}` };
    const userRes = await request(app).get(`/admin/users/${userWithoutPhotoId}/photo`).set(auth);
    expect(userRes.status).toBe(200);
    expect(userRes.body).toEqual({ photo: null });
    const proRes = await request(app).get(`/admin/professionals/${proWithoutPhotoId}/photo`).set(auth);
    expect(proRes.status).toBe(200);
    expect(proRes.body).toEqual({ photo: null });

    const missing = "00000000-0000-0000-0000-000000000000";
    expect((await request(app).get(`/admin/users/${missing}/photo`).set(auth)).status).toBe(404);
    expect((await request(app).get(`/admin/professionals/${missing}/photo`).set(auth)).status).toBe(404);
  });

  it("list rows carry photoUpdatedAt and never the image", async () => {
    const auth = { Authorization: `Bearer ${tokens.super_admin}` };
    const photoRow = await prisma.userProfilePhoto.findUniqueOrThrow({ where: { userId: userWithPhotoId } });

    const users = await request(app).get(`/admin/users?search=${tag}`).set(auth);
    expect(users.status).toBe(200);
    expect(JSON.stringify(users.body)).not.toContain("base64");
    const byUserId = new Map<string, { photoUpdatedAt: string | null }>(
      users.body.users.map((u: { id: string; photoUpdatedAt: string | null }) => [u.id, u]),
    );
    expect(byUserId.get(userWithPhotoId)?.photoUpdatedAt).toBe(photoRow.updatedAt.toISOString());
    expect(byUserId.get(userWithoutPhotoId)?.photoUpdatedAt).toBeNull();

    const pros = await request(app).get(`/admin/professionals?search=${tag}`).set(auth);
    expect(pros.status).toBe(200);
    expect(JSON.stringify(pros.body)).not.toContain("base64");
    const byProId = new Map<string, { photoUpdatedAt: string | null }>(
      pros.body.professionals.map((p: { id: string; photoUpdatedAt: string | null }) => [p.id, p]),
    );
    expect(byProId.get(proWithPhotoId)?.photoUpdatedAt).toEqual(expect.any(String));
    expect(byProId.get(proWithoutPhotoId)?.photoUpdatedAt).toBeNull();
  });

  it("detail responses carry photoUpdatedAt without the image", async () => {
    const auth = { Authorization: `Bearer ${tokens.super_admin}` };
    const userDetail = await request(app).get(`/admin/users/${userWithPhotoId}`).set(auth);
    expect(userDetail.status).toBe(200);
    expect(userDetail.body.user.photoUpdatedAt).toEqual(expect.any(String));
    expect(userDetail.body.user.profilePhoto).toBeUndefined();
    expect(JSON.stringify(userDetail.body)).not.toContain("base64");

    const otherUser = await request(app).get(`/admin/users/${userWithoutPhotoId}`).set(auth);
    expect(otherUser.body.user.photoUpdatedAt).toBeNull();

    const proDetail = await request(app).get(`/admin/professionals/${proWithPhotoId}`).set(auth);
    expect(proDetail.status).toBe(200);
    expect(proDetail.body.professional.photoUpdatedAt).toEqual(expect.any(String));
    expect(JSON.stringify(proDetail.body)).not.toContain("base64");

    const relDetail = await request(app).get(`/admin/relationships/${relationshipId}`).set(auth);
    expect(relDetail.status).toBe(200);
    expect(relDetail.body.userPhotoUpdatedAt).toEqual(expect.any(String));
    expect(relDetail.body.professionalPhotoUpdatedAt).toBeNull();
  });
});
