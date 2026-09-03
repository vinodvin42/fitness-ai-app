import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { createSupportTicketSchema } from "./support.schema";
import * as supportService from "./support.service";

export const supportRouter = Router();

supportRouter.get("/support/tickets", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ items: await supportService.listMyTickets(req.userId!) });
  } catch (err) {
    next(err);
  }
});

supportRouter.post("/support/tickets", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = createSupportTicketSchema.parse(req.body);
    const ticket = await supportService.createTicket(req.userId!, input);
    res.status(201).json(ticket);
  } catch (err) {
    next(err);
  }
});
