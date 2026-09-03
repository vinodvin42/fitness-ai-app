import { Router } from "express";
import { loginSchema, refreshSchema, signupSchema, verifyTwoFactorLoginSchema } from "./auth.schema";
import * as authService from "./auth.service";
import { toPublicUser } from "../users/users.service";
import { authRateLimit, twoFactorRateLimit, writeRateLimit } from "../../middleware/rateLimit";

export const authRouter = Router();

authRouter.post("/signup", writeRateLimit, async (req, res, next) => {
  try {
    const input = signupSchema.parse(req.body);
    const { user, tokens } = await authService.signup(input);
    // A brand-new account has no OnboardingProfile row yet — always false,
    // no need to query for it here.
    res.status(201).json({ user: toPublicUser(user), tokens, onboardingCompleted: false });
  } catch (err) {
    next(err);
  }
});

// §L "Security" — Two-Factor Authentication (25 Aug 2026, gap §17) made
// this a discriminated-union response: either 2FA is required (the client
// must call POST /auth/2fa/verify next with the returned twoFactorToken)
// or login is already complete, same shape as before. See LoginResponse
// in packages/types.
authRouter.post("/login", authRateLimit, async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await authService.login(input);
    if (result.twoFactorRequired) {
      res.status(200).json({ twoFactorRequired: true, twoFactorToken: result.twoFactorToken });
    } else {
      res.status(200).json({
        twoFactorRequired: false,
        user: toPublicUser(result.user),
        tokens: result.tokens,
        onboardingCompleted: result.onboardingCompleted,
      });
    }
  } catch (err) {
    next(err);
  }
});

authRouter.post("/2fa/verify", twoFactorRateLimit, async (req, res, next) => {
  try {
    const { twoFactorToken, code } = verifyTwoFactorLoginSchema.parse(req.body);
    const { user, tokens, onboardingCompleted } = await authService.verifyTwoFactorLogin(twoFactorToken, code);
    res.status(200).json({ user: toPublicUser(user), tokens, onboardingCompleted });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const { user, tokens } = await authService.refresh(refreshToken);
    res.status(200).json({ user: toPublicUser(user), tokens });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    await authService.logout(refreshToken);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
