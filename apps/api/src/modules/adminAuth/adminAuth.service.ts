import { prisma } from "../../db/prisma";
import { hashPassword, verifyPassword } from "../../lib/password";
import { signAdminAccessToken } from "../../lib/adminJwt";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { AdminChangePasswordInput, AdminLoginInput } from "./adminAuth.schema";

/**
 * Admin console auth (Phase 6, 20 Aug 2026). Deliberately minimal —
 * login only, no signup/MFA/SSO/password-reset (see adminAuth.schema.ts's
 * doc comment) and no refresh-token rotation (see config/env.ts's
 * ADMIN_JWT_ACCESS_TTL_MIN comment). AdminUser accounts are provisioned by
 * scripts/seed.ts for now; a real Admin Users management screen
 * (docs/admin/03-screen-inventory.md 12.01) is still unbuilt.
 *
 * Deliberately does NOT import `AdminUser` as a Prisma model type (same
 * reasoning as users.service.ts's toPublicUser — see that file's own
 * history / docs/platform/mvp-launch-plan.md §2: `prisma generate` can't
 * run in this build sandbox, so named model type imports from
 * "@prisma/client" fail to resolve here even though `prisma.<model>.*`
 * calls themselves still typecheck fine against the client's `any`-typed
 * stub).
*/

/** Never return passwordHash to a client — mirrors users.service.ts's toPublicUser boundary. */
export function toPublicAdminUser(adminUser: {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  passwordHash?: string;
}) {
  const { passwordHash: _passwordHash, ...publicAdminUser } = adminUser;
  return publicAdminUser;
}

export async function adminLogin(input: AdminLoginInput) {
  const adminUser = await prisma.adminUser.findUnique({ where: { email: input.email } });
  if (!adminUser) {
    throw new ApiHttpError(401, "invalid_credentials", "Incorrect email or password");
  }

  if (adminUser.status !== "active") {
    // Deliberately the same generic message as a bad password — don't leak
    // account-existence/status to an unauthenticated caller.
    throw new ApiHttpError(401, "invalid_credentials", "Incorrect email or password");
  }

  const valid = await verifyPassword(input.password, adminUser.passwordHash);
  if (!valid) {
    throw new ApiHttpError(401, "invalid_credentials", "Incorrect email or password");
  }

  const updated = await prisma.adminUser.update({
    where: { id: adminUser.id },
    data: { lastLoginAt: new Date() },
  });

  await recordAudit({
    actorAdminId: adminUser.id,
    action: "admin_user.login",
    entityType: "AdminUser",
    entityId: adminUser.id,
  });

  const access = signAdminAccessToken({ sub: adminUser.id, email: adminUser.email, role: adminUser.role });

  return { adminUser: updated, token: access.token, tokenExpiresAt: access.expiresAt };
}

export async function getAdminUserById(id: string) {
  const adminUser = await prisma.adminUser.findUnique({ where: { id } });
  if (!adminUser) {
    throw new ApiHttpError(404, "not_found", "Admin user not found");
  }
  return adminUser;
}

/**
 * Go-live hardening (25 Aug 2026) — closes the gap scripts/seed.ts's own
 * comment flagged: before this, an AdminUser's password could only be
 * rotated by editing the database directly, which meant the seeded
 * bootstrap credential (published in this repo's own RUN-LOCALLY.md) had
 * no real path off a fresh deploy. Mirrors users.service.ts's
 * changePassword — verify current password, hash and store the new one,
 * audit the action — minus that function's refresh-token revocation step,
 * since admin sessions have no refresh flow to revoke (see
 * adminAuth.service.ts's own module doc comment).
 */
export async function changeAdminPassword(adminUserId: string, input: AdminChangePasswordInput) {
  const adminUser = await getAdminUserById(adminUserId);

  const valid = await verifyPassword(input.currentPassword, adminUser.passwordHash);
  if (!valid) {
    throw new ApiHttpError(401, "incorrect_password", "Current password is incorrect");
  }

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.adminUser.update({ where: { id: adminUserId }, data: { passwordHash } });

  await recordAudit({
    actorAdminId: adminUserId,
    action: "admin_user.password_changed",
    entityType: "AdminUser",
    entityId: adminUserId,
  });
}
