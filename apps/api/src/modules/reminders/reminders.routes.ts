import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { createReminderSchema, updateReminderSchema } from "./reminders.schema";
import * as remindersService from "./reminders.service";

export const remindersRouter = Router();

remindersRouter.get("/reminders", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ items: await remindersService.listReminders(req.userId!) });
  } catch (err) {
    next(err);
  }
});

remindersRouter.post("/reminders", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = createReminderSchema.parse(req.body);
    const reminder = await remindersService.createReminder(req.userId!, input);
    res.status(201).json(reminder);
  } catch (err) {
    next(err);
  }
});

remindersRouter.patch("/reminders/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = updateReminderSchema.parse(req.body);
    const reminder = await remindersService.updateReminder(req.userId!, req.params.id, input);
    res.json(reminder);
  } catch (err) {
    next(err);
  }
});

remindersRouter.delete("/reminders/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await remindersService.deleteReminder(req.userId!, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
