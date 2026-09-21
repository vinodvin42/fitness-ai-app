import { z } from "zod";

/**
 * Gym Partner Lite portal (R2 Wave 5, 21 Sep 2026). Login only — a Gym has
 * no self-service signup (see gyms.service.ts's own doc comment: a Gym is
 * created by an admin, and gymPasswordHash is only ever set by an admin
 * via `POST /admin/gyms/:id/portal-password`). Login identity is a Gym's
 * `contactEmail` — the real point-of-contact address already collected at
 * partner creation, not a new field.
 */
export const gymLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});
export type GymLoginInput = z.infer<typeof gymLoginSchema>;
