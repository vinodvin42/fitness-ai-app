import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { createMedicationSchema, dayQuerySchema, logDoseSchema, updateMedicationSchema } from "./medications.schema";
import * as medicationsService from "./medications.service";

export const medicationsRouter = Router();

medicationsRouter.get("/medications", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await medicationsService.listMedications(req.userId!));
  } catch (err) {
    next(err);
  }
});

// Registered before the "/medications/:id/..." routes so "due" is never an :id.
medicationsRouter.get("/medications/due", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const query = dayQuerySchema.parse(req.query);
    res.json(await medicationsService.getDueDoses(req.userId!, query));
  } catch (err) {
    next(err);
  }
});

medicationsRouter.post("/medications", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = createMedicationSchema.parse(req.body);
    res.status(201).json(await medicationsService.createMedication(req.userId!, input));
  } catch (err) {
    next(err);
  }
});

medicationsRouter.patch("/medications/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = updateMedicationSchema.parse(req.body);
    res.json(await medicationsService.updateMedication(req.userId!, req.params.id, input));
  } catch (err) {
    next(err);
  }
});

medicationsRouter.delete("/medications/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await medicationsService.deleteMedication(req.userId!, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

medicationsRouter.post("/medications/:id/doses", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = logDoseSchema.parse(req.body);
    res.status(200).json(await medicationsService.logDose(req.userId!, req.params.id, input));
  } catch (err) {
    next(err);
  }
});

medicationsRouter.get("/medications/:id/adherence", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const query = dayQuerySchema.parse(req.query);
    res.json(await medicationsService.getAdherence(req.userId!, req.params.id, query));
  } catch (err) {
    next(err);
  }
});
