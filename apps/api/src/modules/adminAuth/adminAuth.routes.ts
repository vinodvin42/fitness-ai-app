import { Router } from "express";
import { adminChangePasswordSchema, adminLoginSchema, adminMfaConfirmSchema, adminMfaSetupSchema } from "./adminAuth.schema";
import * as adminAuthService from "./adminAuth.service";
import { AdminAuthedRequest, requireAdminAuth } from "../../middleware/adminAuth";
import { requirePermission } from "../../middleware/adminPermissions";
import { authRateLimit } from "../../middleware/rateLimit";

export const adminAuthRouter = Router();

adminAuthRouter.post("/admin/auth/login", authRateLimit, async (req, res, next) => {
  try {
    const input = adminLoginSchema.parse(req.body);
    const result = await adminAuthService.adminLogin(input);
    if (result.mfaSetupRequired) {
      // Password was right, but this admin must set up an authenticator
      // app first. No session yet.
      res.status(200).json({ mfaSetupRequired: true, setupToken: result.setupToken });
      return;
    }
    res.status(200).json({
      adminUser: adminAuthService.toPublicAdminUser(result.adminUser),
      token: result.token,
      tokenExpiresAt: result.tokenExpiresAt,
    });
  } catch (err) {
    next(err);
  }
});

// Lets the admin-web shell re-hydrate "who am I" after a page reload
// without re-prompting for a password, as long as the stored token is
// still valid — there's no refresh flow, so once this 401s the client
// just routes back to /login (see admin-web's src/lib/auth.tsx).
adminAuthRouter.get("/admin/auth/me", requireAdminAuth, async (req: AdminAuthedRequest, res, next) => {
  try {
    const adminUser = await adminAuthService.getAdminUserById(req.adminUserId as string);
    res.status(200).json({ adminUser: adminAuthService.toPublicAdminUser(adminUser) });
  } catch (err) {
    next(err);
  }
});

// Go-live hardening (25 Aug 2026) — see adminAuth.service.ts's
// changeAdminPassword doc comment for why this exists now: without it,
// the seeded bootstrap admin credential had no rotation path short of
// editing the database directly. No admin-web UI calls this yet (see
// apps/api/README.md's Deployment section) — call it directly against
// the deployed API to rotate the seeded credential after first login.
adminAuthRouter.patch(
  "/admin/auth/password",
  requireAdminAuth,
  async (req: AdminAuthedRequest, res, next) => {
    try {
      const input = adminChangePasswordSchema.parse(req.body);
      await adminAuthService.changeAdminPassword(req.adminUserId as string, input);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// Admin MFA set-up (blueprint section 5). Both steps take the short-lived
// set-up token from login, never a session token.
adminAuthRouter.post("/admin/auth/mfa/setup", authRateLimit, async (req, res, next) => {
  try {
    const input = adminMfaSetupSchema.parse(req.body);
    res.status(200).json(await adminAuthService.startAdminMfaSetup(input.setupToken));
  } catch (err) {
    next(err);
  }
});

adminAuthRouter.post("/admin/auth/mfa/confirm", authRateLimit, async (req, res, next) => {
  try {
    const input = adminMfaConfirmSchema.parse(req.body);
    const { adminUser, token, tokenExpiresAt, recoveryCodes } = await adminAuthService.confirmAdminMfaSetup(input);
    res.status(200).json({
      adminUser: adminAuthService.toPublicAdminUser(adminUser),
      token,
      tokenExpiresAt,
      // Shown once. Each works one time in place of a code.
      recoveryCodes,
    });
  } catch (err) {
    next(err);
  }
});

// Reset another admin's authenticator (lost phone). Applies directly for
// the Super Admin; for anyone else it becomes an approval request.
adminAuthRouter.post(
  "/admin/admin-users/:id/mfa/reset",
  requireAdminAuth,
  requirePermission("admin", "edit"),
  async (req: AdminAuthedRequest, res, next) => {
    try {
      res.status(200).json({ adminUser: await adminAuthService.resetAdminMfa(req.adminUserId as string, req.params.id) });
    } catch (err) {
      next(err);
    }
  },
);
