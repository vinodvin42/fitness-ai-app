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
