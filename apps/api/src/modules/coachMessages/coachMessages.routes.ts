import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { requireProfessionalAuth, ProfessionalAuthedRequest } from "../../middleware/professionalAuth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { sendCoachMessageSchema } from "./coachMessages.schema";
import * as coachMessagesService from "./coachMessages.service";

/**
 * Coach ↔ Client Messaging (docs/coach/03-screen-inventory.md), added 31 Aug
 * 2026 — one module, mixed auth per route (same precedent as coaching.routes
 * .ts): the consumer-facing `/coaching/conversations*` routes take a User
 * Bearer, the coach-facing `/professionals/me/conversations*` routes take a
 * Professional Bearer. Both call the same service, which distinguishes the
 * viewer. See coachMessages.service.ts's doc comment for the relationship
 * gating and read-marking behaviour.
 */
export const coachMessagesRouter = Router();

// ---- Consumer side (User Bearer) ----
coachMessagesRouter.get("/coaching/conversations", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await coachMessagesService.listConversationsForUser(req.userId!));
  } catch (err) {
    next(err);
  }
});

coachMessagesRouter.get(
  "/coaching/conversations/:professionalId",
  requireAuth,
  async (req: AuthedRequest, res, next) => {
    try {
      res.json(await coachMessagesService.getThread(req.userId!, req.params.professionalId, "user"));
    } catch (err) {
      next(err);
    }
  },
);

coachMessagesRouter.post(
  "/coaching/conversations/:professionalId",
  requireAuth,
  writeRateLimit,
  async (req: AuthedRequest, res, next) => {
    try {
      const input = sendCoachMessageSchema.parse(req.body);
      res
        .status(201)
        .json(await coachMessagesService.sendMessage(req.userId!, req.params.professionalId, "user", input));
    } catch (err) {
      next(err);
    }
  },
);

// ---- Coach side (Professional Bearer) ----
coachMessagesRouter.get(
  "/professionals/me/conversations",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      res.json(await coachMessagesService.listConversationsForProfessional(req.professionalId as string));
    } catch (err) {
      next(err);
    }
  },
);

coachMessagesRouter.get(
  "/professionals/me/conversations/:userId",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      res.json(
        await coachMessagesService.getThread(req.params.userId, req.professionalId as string, "professional"),
      );
    } catch (err) {
      next(err);
    }
  },
);

coachMessagesRouter.post(
  "/professionals/me/conversations/:userId",
  requireProfessionalAuth,
  writeRateLimit,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const input = sendCoachMessageSchema.parse(req.body);
      res
        .status(201)
        .json(
          await coachMessagesService.sendMessage(req.params.userId, req.professionalId as string, "professional", input),
        );
    } catch (err) {
      next(err);
    }
  },
);
