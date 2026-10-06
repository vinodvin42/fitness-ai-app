import type { NextFunction, Response } from "express";
import type { AuthedRequest } from "./auth";
import { assertGuardianCleared } from "../lib/guardianGate";

/** Route middleware (after requireAuth): 403 while guardian authorization is not verified. See lib/guardianGate.ts. */
export async function requireGuardianCleared(req: AuthedRequest, _res: Response, next: NextFunction) {
  try {
    await assertGuardianCleared(req.userId!);
    next();
  } catch (err) {
    next(err);
  }
}
