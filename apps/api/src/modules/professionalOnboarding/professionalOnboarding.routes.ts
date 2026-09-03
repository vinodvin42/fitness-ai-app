import { Router } from "express";
import { requireProfessionalAuth, ProfessionalAuthedRequest } from "../../middleware/professionalAuth";
import { selectServicesSchema, submitCredentialSchema, submitKycSchema } from "./professionalOnboarding.schema";
import * as professionalOnboardingService from "./professionalOnboarding.service";

export const professionalOnboardingRouter = Router();

professionalOnboardingRouter.get(
  "/professionals/me/onboarding",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const status = await professionalOnboardingService.getOnboardingStatus(req.professionalId as string);
      res.status(200).json(status);
    } catch (err) {
      next(err);
    }
  },
);

professionalOnboardingRouter.put(
  "/professionals/me/services",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const input = selectServicesSchema.parse(req.body);
      const status = await professionalOnboardingService.selectServices(req.professionalId as string, input);
      res.status(200).json(status);
    } catch (err) {
      next(err);
    }
  },
);

professionalOnboardingRouter.post(
  "/professionals/me/credentials",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const input = submitCredentialSchema.parse(req.body);
      const updated = await professionalOnboardingService.submitCredential(req.professionalId as string, input);
      res.status(200).json({ credential: updated });
    } catch (err) {
      next(err);
    }
  },
);

professionalOnboardingRouter.post(
  "/professionals/me/kyc",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const input = submitKycSchema.parse(req.body);
      await professionalOnboardingService.submitKyc(req.professionalId as string, input);
      res.status(200).json({ kycStatus: "pending" });
    } catch (err) {
      next(err);
    }
  },
);
