import type { NextFunction, Response } from "express";
import type { AuthedRequest } from "./auth";
import { assertAdultUser } from "../lib/adultGate";

/** Route middleware (after requireAuth): 403 for any account whose stored age is under 18. See lib/adultGate.ts. */
export async function requireAdult(req: AuthedRequest, _res: Response, next: NextFunction) {
  try {
    await assertAdultUser(req.userId!);
    next();
  } catch (err) {
    next(err);
  }
}
