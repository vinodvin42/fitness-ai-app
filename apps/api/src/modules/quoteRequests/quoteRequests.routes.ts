import { Router } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth";
import { requireProfessionalAuth, ProfessionalAuthedRequest } from "../../middleware/professionalAuth";
import { writeRateLimit } from "../../middleware/rateLimit";
import {
  createQuoteRequestSchema,
  declineQuoteSchema,
  listQuoteRequestsQuerySchema,
  sendQuoteSchema,
} from "./quoteRequests.schema";
import * as quoteRequestsService from "./quoteRequests.service";

/** Mixed auth per route: User Bearer for /coaching/*, Professional Bearer for /professionals/me/*. */
export const quoteRequestsRouter = Router();

quoteRequestsRouter.post("/coaching/quote-requests", requireAuth, writeRateLimit, async (req: AuthedRequest, res, next) => {
  try {
    const input = createQuoteRequestSchema.parse(req.body);
    res.status(201).json(await quoteRequestsService.createQuoteRequest(req.userId!, input));
  } catch (err) {
    next(err);
  }
});

quoteRequestsRouter.get("/coaching/quote-requests", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const query = listQuoteRequestsQuerySchema.parse(req.query);
    res.json(await quoteRequestsService.listMyQuoteRequests(req.userId!, query));
  } catch (err) {
    next(err);
  }
});

quoteRequestsRouter.get("/coaching/quote-requests/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await quoteRequestsService.getMyQuoteRequest(req.userId!, req.params.id));
  } catch (err) {
    next(err);
  }
});

quoteRequestsRouter.post(
  "/coaching/quote-requests/:id/accept",
  requireAuth,
  writeRateLimit,
  async (req: AuthedRequest, res, next) => {
    try {
      res.json(await quoteRequestsService.acceptQuote(req.userId!, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

quoteRequestsRouter.get(
  "/professionals/me/quote-requests",
  requireProfessionalAuth,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const query = listQuoteRequestsQuerySchema.parse(req.query);
      res.json(await quoteRequestsService.listProfessionalQuoteRequests(req.professionalId as string, query));
    } catch (err) {
      next(err);
    }
  },
);

quoteRequestsRouter.post(
  "/professionals/me/quote-requests/:id/quote",
  requireProfessionalAuth,
  writeRateLimit,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const input = sendQuoteSchema.parse(req.body);
      res.json(await quoteRequestsService.sendQuote(req.professionalId as string, req.params.id, input));
    } catch (err) {
      next(err);
    }
  },
);

quoteRequestsRouter.post(
  "/professionals/me/quote-requests/:id/decline",
  requireProfessionalAuth,
  writeRateLimit,
  async (req: ProfessionalAuthedRequest, res, next) => {
    try {
      const input = declineQuoteSchema.parse(req.body ?? {});
      res.json(await quoteRequestsService.declineQuote(req.professionalId as string, req.params.id, input));
    } catch (err) {
      next(err);
    }
  },
);
