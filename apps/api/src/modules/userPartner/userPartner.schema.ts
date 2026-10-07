import { z } from "zod";

// Profile & Settings 09 "Partner code". Gym invite codes are short
// alphanumeric strings; accept any reasonable input and normalise it.
export const linkPartnerCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Enter a partner code")
    .max(40)
    .transform((v) => v.toUpperCase()),
  // Change-code flow: replace an existing link, but only once the new code validated.
  replace: z.boolean().optional(),
});
export type LinkPartnerCodeInput = z.infer<typeof linkPartnerCodeSchema>;
