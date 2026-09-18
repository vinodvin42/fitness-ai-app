import { z } from "zod";

// Log Measurements (docs/mobile/03-screen-inventory.md §F) — every field is
// optional individually (a user might only weigh in, or only take tape
// measurements) but at least one is required per entry.
export const logMeasurementSchema = z
  .object({
    weightKg: z.number().positive().max(500).optional(),
    chestCm: z.number().positive().max(300).optional(),
    waistCm: z.number().positive().max(300).optional(),
    hipsCm: z.number().positive().max(300).optional(),
    armsCm: z.number().positive().max(200).optional(),
    thighsCm: z.number().positive().max(200).optional(),
    // Broader Baseline/measurements (R1 Developer 1, 18 Sep 2026) — same
    // real column the onboarding wizard's baseline step writes to (see
    // schema.prisma's BodyMeasurement.bodyFatPercent comment); clearly
    // optional here too, same as onboarding.
    bodyFatPercent: z.number().positive().max(70).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "At least one measurement is required" });

export type LogMeasurementInput = z.infer<typeof logMeasurementSchema>;

// Progress Photos (docs/mobile/03-screen-inventory.md §F), added 19 Aug
// 2026 — see the ProgressPhoto model's own doc comment in schema.prisma
// for why `imageData` is a base64 data URI stored directly in Postgres
// rather than a reference to object storage. The 6MB ceiling here is a
// deliberate safety margin under app.ts's 10mb express.json() body limit
// (a data URI is ~33% larger than the raw bytes it encodes, plus the rest
// of the JSON envelope) — see gap §34.
export const createProgressPhotoSchema = z.object({
  imageData: z
    .string()
    .startsWith("data:image/", { message: "imageData must be a data URI" })
    .max(6_000_000, { message: "Image is too large" }),
  note: z.string().max(280).optional(),
});

export type CreateProgressPhotoInput = z.infer<typeof createProgressPhotoSchema>;

// Check-In (docs/mobile — R1 Developer 1 U5, 15 Sep 2026) — see the
// CheckIn model's own doc comment in schema.prisma for the full design.
// Three real, self-reported ratings (never an AI guess), 1-5 each, plus an
// optional note. `period` picks which real calendar boundary this entry
// claims (today, or this ISO week) — the service layer, not this schema,
// resolves that into the actual `periodKey` and enforces "once per period"
// via the DB's own unique constraint.
export const submitCheckInSchema = z.object({
  period: z.enum(["daily", "weekly"]),
  energy: z.number().int().min(1).max(5),
  soreness: z.number().int().min(1).max(5),
  adherence: z.number().int().min(1).max(5),
  note: z.string().trim().max(280).optional(),
});

export type SubmitCheckInInput = z.infer<typeof submitCheckInSchema>;
