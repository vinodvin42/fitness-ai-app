import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { twoFactorRateLimit } from "../../middleware/rateLimit";
import {
  changePasswordSchema,
  deleteAccountSchema,
  disableTwoFactorSchema,
  editOnboardingProfileSchema,
  enableTwoFactorSchema,
  guardianReviewSchema,
  onboardingProfileSchema,
  updateConsentSchema,
  updateProfileSchema,
} from "./users.schema";
import * as usersService from "./users.service";

export const usersRouter = Router();

usersRouter.get("/me", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const [user, onboardingCompleted] = await Promise.all([
      usersService.getUserById(req.userId!),
      usersService.hasCompletedOnboarding(req.userId!),
    ]);
    res.json({ user: usersService.toPublicUser(user), onboardingCompleted });
  } catch (err) {
    next(err);
  }
});

usersRouter.patch("/me", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = updateProfileSchema.parse(req.body);
    const user = await usersService.updateProfile(req.userId!, input);
    res.json({ user: usersService.toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});

usersRouter.put("/me/onboarding", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = onboardingProfileSchema.parse(req.body);
    const profile = await usersService.upsertOnboardingProfile(req.userId!, input);
    res.json({ onboardingProfile: profile });
  } catch (err) {
    next(err);
  }
});

usersRouter.get("/me/onboarding", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ onboardingProfile: await usersService.getOnboardingProfile(req.userId!) });
  } catch (err) {
    next(err);
  }
});

usersRouter.patch("/me/onboarding", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = editOnboardingProfileSchema.parse(req.body);
    const profile = await usersService.editOnboardingProfile(req.userId!, input);
    res.json({ onboardingProfile: profile });
  } catch (err) {
    next(err);
  }
});

usersRouter.patch("/me/password", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = changePasswordSchema.parse(req.body);
    await usersService.changePassword(req.userId!, input);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

usersRouter.get("/me/sessions", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ items: await usersService.listSessions(req.userId!) });
  } catch (err) {
    next(err);
  }
});

usersRouter.delete("/me/sessions/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await usersService.revokeSession(req.userId!, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

usersRouter.get("/me/export", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await usersService.exportUserData(req.userId!));
  } catch (err) {
    next(err);
  }
});

usersRouter.delete("/me", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = deleteAccountSchema.parse(req.body);
    await usersService.deleteAccount(req.userId!, input);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// §L "Security" — Two-Factor Authentication (25 Aug 2026, gap §17).
usersRouter.post("/me/2fa/setup", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await usersService.setupTwoFactor(req.userId!));
  } catch (err) {
    next(err);
  }
});

usersRouter.post("/me/2fa/enable", requireAuth, twoFactorRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = enableTwoFactorSchema.parse(req.body);
    res.json(await usersService.enableTwoFactor(req.userId!, input));
  } catch (err) {
    next(err);
  }
});

usersRouter.post("/me/2fa/disable", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = disableTwoFactorSchema.parse(req.body);
    await usersService.disableTwoFactor(req.userId!, input);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// §4 Privacy/Consent settings (R1 Developer 1, 18 Sep 2026) — see
// users.service.ts's listConsents/updateConsent for the full design.
usersRouter.get("/me/consents", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ items: await usersService.listConsents(req.userId!) });
  } catch (err) {
    next(err);
  }
});

usersRouter.patch("/me/consents", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = updateConsentSchema.parse(req.body);
    const consent = await usersService.updateConsent(req.userId!, input);
    res.json({ consent });
  } catch (err) {
    next(err);
  }
});

// Under-18 guardian review (onboarding/11) — see users.service.ts.
usersRouter.post("/me/guardian-review", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = guardianReviewSchema.parse(req.body);
    res.status(201).json({ guardianReview: await usersService.submitGuardianReview(req.userId!, input) });
  } catch (err) {
    next(err);
  }
});

usersRouter.get("/me/guardian-review", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ guardianReview: await usersService.getGuardianReview(req.userId!) });
  } catch (err) {
    next(err);
  }
});
