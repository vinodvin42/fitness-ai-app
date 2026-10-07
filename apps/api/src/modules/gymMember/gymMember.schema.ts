import { z } from "zod";

export const GYM_HELP_TOPICS = ["form_check", "machine_help", "trainer_available", "other"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/**
 * Strict on purpose: only these fields ever reach the gym. Anything else in the
 * body (health data, food logs, ...) is rejected rather than silently stored.
 */
export const createHelpRequestSchema = z
  .object({
    topic: z.enum(GYM_HELP_TOPICS),
    exerciseName: optionalText(120),
    workoutName: optionalText(120),
    note: optionalText(300),
  })
  .strict();
export type CreateHelpRequestInput = z.infer<typeof createHelpRequestSchema>;
