import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { writeRateLimit } from "../../middleware/rateLimit";
import { createSupportTicketSchema, sendSupportTicketMessageSchema } from "./support.schema";
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

// Support Ticket Messages (added 3 Sep 2026) — see support.service.ts's
// own comment. Owner-only: getMyTicketDetail/addMyTicketMessage both 404
// for a ticket that isn't this user's own.
supportRouter.get("/support/tickets/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await supportService.getMyTicketDetail(req.userId!, req.params.id));
  } catch (err) {
    next(err);
  }
});

supportRouter.post(
  "/support/tickets/:id/messages",
  requireAuth,
  writeRateLimit,
  async (req: AuthedRequest, res, next) => {
    try {
      const input = sendSupportTicketMessageSchema.parse(req.body);
      const message = await supportService.addMyTicketMessage(req.userId!, req.params.id, input);
      res.status(201).json(message);
    } catch (err) {
      next(err);
    }
  },
);
