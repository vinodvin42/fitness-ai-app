import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { hashPassword } from "../src/lib/password";

/** 25 Oct 2026: a disabled admin, or one whose role changed, is cut off on the next read, not when the token expires. */
describe("Admin reads re-check the account", () => {
  const app = buildApp();
  const password = "AdminReadCheck-1";
  let adminId: string;
  let token: string;

  beforeAll(async () => {
    const admin = await prisma.adminUser.create({
      data: { email: uniqueEmail("read-check"), passwordHash: await hashPassword(password), fullName: "Read check", role: "finance", status: "active" },
    });
    adminId = admin.id;
    const login = await request(app).post("/admin/auth/login").send({ email: admin.email, password });
    expect(login.status).toBe(200);
    token = login.body.token as string;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorAdminId: adminId } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("reads work while the account is active", async () => {
    const res = await request(app).get("/admin/plans").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("a role change ends the old session for reads too", async () => {
    await prisma.adminUser.update({ where: { id: adminId }, data: { role: "support" } });
    const res = await request(app).get("/admin/plans").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("session_outdated");
    await prisma.adminUser.update({ where: { id: adminId }, data: { role: "finance" } });
  });

  it("a disabled admin can't read with an old token", async () => {
    await prisma.adminUser.update({ where: { id: adminId }, data: { status: "disabled" } });
    const res = await request(app).get("/admin/plans").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("session_outdated");
  });
});
