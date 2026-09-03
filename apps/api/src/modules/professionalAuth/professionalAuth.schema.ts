import { z } from "zod";

// docs/coach/03-screen-inventory.md §A: Coach Signup (full name, email,
// phone, password/confirm — confirm is a client-side-only check, not sent)
// and Coach Login (email/password). No Google SSO (no OAuth provider
// configured in this build, same "plain functional auth" precedent as
// every other app's auth in this project).
export const professionalSignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(1).max(120),
  phone: z.string().trim().min(1).max(32).optional(),
});

export const professionalLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const professionalRefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type ProfessionalSignupInput = z.infer<typeof professionalSignupSchema>;
export type ProfessionalLoginInput = z.infer<typeof professionalLoginSchema>;
