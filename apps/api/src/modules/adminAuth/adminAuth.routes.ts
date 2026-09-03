import { Router } from "express";
import { adminChangePasswordSchema, adminLoginSchema } from "./adminAuth.schema";
import * as adminAuthService from "./adminAuth.service";
import { AdminAuthedRequest, requireAdminAuth } from "../../middleware/adminAuth";
import { authRateLimit } from "../../middleware/rateLimit";

export const adminAuthRouter = Router();

adminAuthRouter.post("/admin/auth/login", authRateLimit, async (req, res, next) => {
  try {
    const input = adminLoginSchema.parse(req.body);
    const { adminUser, token, tokenExpiresAt } = await adminAuthService.adminLogin(input);
    res.status(200).json({
      adminUser: adminAuthService.toPublicAdminUser(adminUser),
      token,
      tokenExpiresAt,
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
