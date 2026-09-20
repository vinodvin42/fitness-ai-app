import { Router } from "express";
import { requireProfessionalAuth, ProfessionalAuthedRequest } from "../../middleware/professionalAuth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { createCoachNoteSchema, updateCoachNoteSchema } from "./coachNotes.schema";
import * as coachNotesService from "./coachNotes.service";

/**
 * Coach Private Notes (R2 Wave 3, 20 Sep 2026) — professional-authed
 * throughout, same `requireProfessionalAuth` guard and
 * `/professionals/me/clients/:userId/...` nesting as
 * `professionalClients.routes.ts`. Deliberately NOT mounted under any
 * User-authed path — see coachNotes.service.ts's doc comment for why this
 * content must never reach a consumer-facing endpoint.
 */
export const coachNotesRouter = Router();

coachNotesRouter.get(
  "/professionals/me/clients/:userId/notes",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      res.json(await coachNotesService.listNotesForClient(req.professionalId as string, req.params.userId));
    } catch (err) {
      next(err);
    }
  },
);

coachNotesRouter.post(
  "/professionals/me/clients/:userId/notes",
  requireProfessionalAuth,
  writeRateLimit,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const input = createCoachNoteSchema.parse(req.body);
      res
        .status(201)
        .json(await coachNotesService.createNote(req.professionalId as string, req.params.userId, input));
    } catch (err) {
      next(err);
    }
  },
);

coachNotesRouter.patch(
  "/professionals/me/clients/:userId/notes/:noteId",
  requireProfessionalAuth,
  writeRateLimit,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const input = updateCoachNoteSchema.parse(req.body);
      res.json(
        await coachNotesService.updateNote(
          req.professionalId as string,
          req.params.userId,
          req.params.noteId,
          input,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

coachNotesRouter.delete(
  "/professionals/me/clients/:userId/notes/:noteId",
  requireProfessionalAuth,
  writeRateLimit,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      await coachNotesService.deleteNote(req.professionalId as string, req.params.userId, req.params.noteId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);
