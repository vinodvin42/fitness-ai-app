import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { captureException } from "../lib/sentry";

export class ApiHttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: { code: "not_found", message: `No route for ${req.method} ${req.path}` },
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiHttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: "validation_error", message: "Invalid request body", details: err.flatten() },
    });
    return;
  }

  // Only genuinely unhandled errors reach here — ApiHttpError/ZodError
  // (expected, already-handled cases) return above before this line. This
  // is exactly the "invisible until a user complains" gap error
  // monitoring was added to close (25 Aug 2026, go-live hardening) — see
  // lib/sentry.ts; a no-op when SENTRY_DSN isn't set.
  captureException(err);
  console.error("Unhandled error:", err);
  res.status(500).json({ error: { code: "internal_error", message: "Something went wrong" } });
}
