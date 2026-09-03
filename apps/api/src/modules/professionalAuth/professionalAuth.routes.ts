import { Router } from "express";
import { professionalLoginSchema, professionalRefreshSchema, professionalSignupSchema } from "./professionalAuth.schema";
import * as professionalAuthService from "./professionalAuth.service";
import { hasSelectedServices } from "../professionalOnboarding/professionalOnboarding.service";
import { requireProfessionalAuth, ProfessionalAuthedRequest } from "../../middleware/professionalAuth";
import { authRateLimit, writeRateLimit } from "../../middleware/rateLimit";

export const professionalAuthRouter = Router();

professionalAuthRouter.post("/professionals/auth/signup", writeRateLimit, async (req, res, next) => {
  try {
    const input = professionalSignupSchema.parse(req.body);
    const { professional, tokens } = await professionalAuthService.professionalSignup(input);
    // A brand-new account has selected no services yet — always false.
    res.status(201).json({
      professional: professionalAuthService.toPublicProfessional(professional),
      tokens,
      onboardingCompleted: false,
    });
  } catch (err) {
    next(err);
  }
});

professionalAuthRouter.post("/professionals/auth/login", authRateLimit, async (req, res, next) => {
  try {
    const input = professionalLoginSchema.parse(req.body);
    const { professional, tokens } = await professionalAuthService.professionalLogin(input);
    const onboardingCompleted = await hasSelectedServices(professional.id);
    res.status(200).json({
      professional: professionalAuthService.toPublicProfessional(professional),
      tokens,
      onboardingCompleted,
    });
  } catch (err) {
    next(err);
  }
});

professionalAuthRouter.post("/professionals/auth/refresh", async (req, res, next) => {
  try {
    const { refreshToken } = professionalRefreshSchema.parse(req.body);
    const { professional, tokens } = await professionalAuthService.professionalRefresh(refreshToken);
    res.status(200).json({ professional: professionalAuthService.toPublicProfessional(professional), tokens });
  } catch (err) {
    next(err);
  }
});

professionalAuthRouter.post("/professionals/auth/logout", async (req, res, next) => {
  try {
    const { refreshToken } = professionalRefreshSchema.parse(req.body);
    await professionalAuthService.professionalLogout(refreshToken);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Mirrors GET /users/me — used by apps/coach-mobile's AuthContext to
// resolve "who am I + is onboarding done" on launch when a token is
// already stored.
professionalAuthRouter.get(
  "/professionals/me",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const professional = await professionalAuthService.getProfessionalById(req.professionalId as string);
      const onboardingCompleted = await hasSelectedServices(professional.id);
      res.status(200).json({
        professional: professionalAuthService.toPublicProfessional(professional),
        onboardingCompleted,
      });
    } catch (err) {
      next(err);
    }
  },
);
