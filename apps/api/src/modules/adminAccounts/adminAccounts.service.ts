import crypto from "node:crypto";
import { prisma } from "../../db/prisma";
import { hashPassword } from "../../lib/password";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { toPublicAdminUser } from "../adminAuth/adminAuth.service";
import { CreateAdminUserInput, ListAdminUsersQuery } from "./adminAccounts.schema";

/**
 * Module 12.01 — Admin Users (docs/admin/03-screen-inventory.md §12.01),
 * added 22 Aug 2026 — the admin console's own staff-account management
 * screen. Closes the exact gap adminAuth.service.ts's own doc comment
 * flagged: "AdminUser accounts are provisioned by scripts/seed.ts for now;
 * a real Admin Users management screen ... is still unbuilt." This is
 * that screen.
 *
 * Named `adminAccounts` rather than `adminUsers` (already taken — see
 * modules/adminUsers, Module 02, the *consumer* User directory) or
 * `adminAdminUsers` (redundant/confusing) — this module manages `AdminUser`
 * rows, the exact same entity adminAuth.service.ts authenticates against.
 *
 * Scope: 12.01 only. 12.02 Roles & Permissions remains deliberately
 * deferred (gap §7 in docs/admin/07-open-questions-gaps.md — the other 7
 * AdminRole values are real, assignable, confirmed role names, but their
 * permission matrices are still a derived starter set, not a confirmed
 * spec; no screen exists to edit them). **25 Aug 2026:** this module's own
 * routes now gate on real per-role RBAC too (`requirePermission("admin",
 * ...)`, see apps/api/src/middleware/adminPermissions.ts) — creating,
 * disabling, or enabling an admin account requires the `admin` module's
 * `create`/`edit` grants, which today only `super_admin` actually holds
 * (see `PERMISSION_MATRIX`). Before this update every authenticated admin
 * could manage any other admin account regardless of role; that's no
 * longer true.
 *
 * What's real vs. honestly not modeled, against the Figma's fuller spec:
 * - The security-summary strip (Total/Active/Disabled) and the
 *   role/status/search filters are all real, backed directly by
 *   `AdminUser` columns — no derived or fabricated figures.
 * - "Invite" (the Figma's label for adding a new admin) is relabeled
 *   "Create Admin User" here and in the UI — there is no email/SMTP
 *   infrastructure anywhere in this build to actually send an invite
 *   (same substitution precedent as Module 03's "Request Info", except
 *   here a real, different action replaces it entirely rather than being
 *   disabled). `createAdminUser` below generates a strong random
 *   temporary password server-side (never accepted from the client),
 *   hashes and stores it, and returns the plaintext ONCE in the create
 *   response for the creating admin to relay out-of-band. It is never
 *   logged, never stored in plaintext, and not retrievable again after
 *   that one response.
 * - Disable/Enable map directly to `AdminUserStatus` (active/disabled),
 *   the same mutable-status precedent as Professional suspend/reactivate
 *   and Relationship end/reactivate. One safety rail beyond those two
 *   precedents: an admin cannot disable their own account (400
 *   `cannot_disable_self`), to prevent an accidental self-lockout, since
 *   no second super_admin-recovery path exists anywhere in this console.
 * - There is no `GET /admin/admin-users/:id` and no detail screen — the
 *   Figma's 12.01 has no separate detail sub-screen for an admin account,
 *   and there is no per-admin activity/session data beyond what already
 *   lives in `AuditLog` (queryable, but a dedicated per-admin history tab
 *   is out of scope this pass — same "don't build UI the spec didn't ask
 *   for" discipline as every Detail screen shipped so far).
 * - No "change role after creation" action — not in the Figma's 12.01 key
 *   data; a deliberate gap to avoid scope creep, not an oversight.
 *
 * Deliberately does NOT import `AdminUser` as a Prisma model type — same
 * reasoning as adminAuth.service.ts's own toPublicAdminUser, which this
 * module reuses directly rather than duplicating the passwordHash-
 * stripping logic.
 */

type AdminUserRow = {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: string;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Server-generated only — never accepted from a client. 9 random bytes
 * base64url-encoded gives a 12-character string drawn from a 64-symbol
 * alphabet (~54 bits of entropy), comfortably clearing every password
 * policy in this build (min 8 chars) while staying easy to read aloud/copy
 * for the one-time hand-off.
 */
function generateTemporaryPassword(): string {
  return crypto.randomBytes(9).toString("base64url");
}

async function getAdminUserOrThrow(id: string): Promise<AdminUserRow> {
  const adminUser = await prisma.adminUser.findUnique({ where: { id } });
  if (!adminUser) {
    throw new ApiHttpError(404, "not_found", "Admin user not found");
  }
  return adminUser as AdminUserRow;
}

export async function listAdminUsers(query: ListAdminUsersQuery) {
  const adminUsers = await prisma.adminUser.findMany({
    where: query.search
      ? {
          OR: [
            { fullName: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
  });

  const rows = adminUsers as AdminUserRow[];

  // Counts reflect the search-scoped set (same convention as
  // adminProfessionals.service.ts's listProfessionals: counts computed
  // before the role/status filter below, so the security-summary strip
  // stays a stable superset of whatever the filtered table shows).
  const counts = {
    total: rows.length,
    active: rows.filter((r) => r.status === "active").length,
    disabled: rows.filter((r) => r.status === "disabled").length,
  };

  const filtered = rows.filter(
    (r) => (query.role ? r.role === query.role : true) && (query.status ? r.status === query.status : true),
  );

  return {
    adminUsers: filtered.map((r) => toPublicAdminUser(r)),
    counts,
  };
}

export async function createAdminUser(actorAdminId: string, input: CreateAdminUserInput) {
  const existing = await prisma.adminUser.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ApiHttpError(409, "email_taken", "An admin account with this email already exists");
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const adminUser = await prisma.adminUser.create({
    data: {
      email: input.email,
      fullName: input.fullName,
      role: input.role,
      passwordHash,
    },
  });

  await recordAudit({
    actorAdminId,
    action: "admin_user.create",
    entityType: "AdminUser",
    entityId: adminUser.id,
    metadata: { role: input.role },
  });

  // temporaryPassword appears in this response and nowhere else — not
  // logged, not persisted in plaintext, not returned by any other
  // endpoint. See this file's top comment.
  return { adminUser: toPublicAdminUser(adminUser as AdminUserRow), temporaryPassword };
}

export async function disableAdminUser(actorAdminId: string, targetId: string) {
  if (actorAdminId === targetId) {
    throw new ApiHttpError(400, "cannot_disable_self", "You cannot disable your own admin account");
  }

  const target = await getAdminUserOrThrow(targetId);
  if (target.status === "disabled") {
    throw new ApiHttpError(409, "admin_user_already_disabled", "This admin account is already disabled");
  }

  const updated = await prisma.adminUser.update({ where: { id: targetId }, data: { status: "disabled" } });

  await recordAudit({
    actorAdminId,
    action: "admin_user.disable",
    entityType: "AdminUser",
    entityId: targetId,
  });

  return toPublicAdminUser(updated as AdminUserRow);
}

export async function enableAdminUser(actorAdminId: string, targetId: string) {
  const target = await getAdminUserOrThrow(targetId);
  if (target.status === "active") {
    throw new ApiHttpError(409, "admin_user_already_active", "This admin account is already active");
  }

  const updated = await prisma.adminUser.update({ where: { id: targetId }, data: { status: "active" } });

  await recordAudit({
    actorAdminId,
    action: "admin_user.enable",
    entityType: "AdminUser",
    entityId: targetId,
  });

  return toPublicAdminUser(updated as AdminUserRow);
}
