import { z } from "zod";
import { PA_DURATION, PA_FREQUENCY, PA_INTENSITY } from "./healthspan.math";

const keys = <T extends Record<string, unknown>>(o: T) => Object.keys(o) as [keyof T & string, ...Array<keyof T & string>];

/** PUT /healthspan/answers - the few answers heart age and fitness age need (stored encrypted). */
export const healthspanAnswersSchema = z
  .object({
    smoking: z.enum(["never", "former", "current"]).optional(),
    bpMedication: z.boolean().optional(),
    activity: z
      .object({
        frequency: z.enum(keys(PA_FREQUENCY)),
        intensity: z.enum(keys(PA_INTENSITY)).nullable().optional(),
        duration: z.enum(keys(PA_DURATION)).nullable().optional(),
      })
      .refine((a) => a.frequency === "never" || (a.intensity != null && a.duration != null), {
        message: "Say how hard and how long you usually exercise",
      })
      .optional(),
  })
  .refine((v) => v.smoking != null || v.bpMedication != null || v.activity != null, { message: "Send at least one answer" });
export type HealthspanAnswersInput = z.infer<typeof healthspanAnswersSchema>;

/** POST /healthspan/readings - a blood-pressure or VO2max reading the member typed in. */
export const healthReadingSchema = z.union([
  z
    .object({
      kind: z.literal("blood_pressure"),
      systolic: z.number().int().min(70).max(260),
      diastolic: z.number().int().min(40).max(160),
      measuredAt: z.string().datetime({ offset: true }).optional(),
    })
    .refine((v) => v.systolic > v.diastolic, { message: "The top number (systolic) is higher than the bottom one", path: ["systolic"] }),
  z.object({
    kind: z.literal("vo2max"),
    vo2max: z.number().min(10).max(90),
    measuredAt: z.string().datetime({ offset: true }).optional(),
  }),
]);
export type HealthReadingInput = z.infer<typeof healthReadingSchema>;

export const readingsQuerySchema = z.object({ kind: z.enum(["blood_pressure", "vo2max"]) });
export const trendsQuerySchema = z.object({ months: z.coerce.number().int().min(6).max(24).default(12) });
