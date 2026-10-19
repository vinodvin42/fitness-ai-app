import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { PERMISSION_MATRIX } from "../src/middleware/adminPermissions";

/**
 * Role-aware admin menus (Oct 2026): the signed-in admin carries its role's
 * grants so the console can hide modules the role can't open. The grants are
 * exactly the server's own PERMISSION_MATRIX (the server still enforces every
 * route).
 */
describe("Admin role permissions in the session", () => {
  const app = buildApp();
  const password = "RoleMenus9!";
  const adminIds: string[] = [];

  async function login(role: string) {
    const email = uniqueEmail(`menus-${role}`);
    const admin = await prisma.adminUser.create({
      data: { email, passwordHash: await hashPassword(password), fullName: `Menus ${role}`, role, status: "active" } as never,
    });
    adminIds.push(admin.id);
    return request(app).post("/admin/auth/login").send({ email, password });
  }

  afterAll(async () => {
    await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
    await prisma.$disconnect();
  });

  it("login and /admin/auth/me return the role's grants, matching the server's matrix", async () => {
    const res = await login("support");
    expect(res.status).toBe(200);
    expect(res.body.adminUser.permissions).toEqual(PERMISSION_MATRIX.support);
    expect(res.body.adminUser.permissions.support).toContain("view");
    expect(res.body.adminUser.permissions.commerce).toBeUndefined();
    expect(res.body.adminUser.passwordHash).toBeUndefined();

    const me = await request(app).get("/admin/auth/me").set("Authorization", `Bearer ${res.body.token}`);
    expect(me.body.adminUser.permissions).toEqual(PERMISSION_MATRIX.support);
  });

  it("co-founder sees everything but sensitive data; safety/privacy gets sensitive data", async () => {
    const coFounder = await login("co_founder");
    expect(coFounder.body.adminUser.permissions.sensitiveData).toEqual([]);
    expect(coFounder.body.adminUser.permissions.commerce).toContain("view");
    const safety = await login("safety_privacy");
    expect(safety.body.adminUser.permissions.sensitiveData).toContain("view");
  });
});
