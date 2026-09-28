import { z } from "zod";

/**
 * Spec §8: the Public Website's Early Access, partner application and
 * contact forms, and the four states it names for them — success,
 * error, already-registered, and consent.
 *
 * Three of those four are decided here. `consentContact` is required by
 * the schema rather than defaulted, so a submission that lost the
 * checkbox fails validation instead of silently becoming a lawful basis
 * to email someone; already-registered is the `(kind, email)` unique in
 * Prisma, surfaced by the service; error is everything else.
 */
export const applicationKind = z.enum(["early_access", "gym", "creator", "professional", "contact"]);

/**
 * Deliberately permissive on shape and strict on consent. A partner
 * application that rejects a gym because its phone number has a space
 * in it costs a real lead; one that records consent it never received
 * costs a DPDP finding. Only the second is worth being strict about.
 */
const base = {
  email: z.string().trim().toLowerCase().email().max(200),
  fullName: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(40).optional(),
  organisation: z.string().trim().max(160).optional(),
  city: z.string().trim().max(120).optional(),
  detail: z.string().trim().max(400).optional(),
  message: z.string().trim().max(4000).optional(),
  // Carried from a gym invite or creator referral landing so interest
  // registered instead of an install is still attributed (F2/F3).
  sourceCode: z.string().trim().max(64).optional(),
  sourceKind: z.enum(["gym", "creator"]).optional(),
  // `literal(true)` rather than `boolean()`: false is not a submission
  // with consent recorded as false, it is a submission that must not
  // happen at all.
  consentContact: z.literal(true),
  consentMarketing: z.boolean().default(false),
};

export const createApplicationSchema = z
  .object({ kind: applicationKind, ...base })
  .superRefine((value, ctx) => {
    // Per-kind requirements live here rather than in four schemas,
    // matching the single-table decision in schema.prisma.
    if (value.kind === "contact" && !value.message) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["message"], message: "Tell us what you need help with" });
    }
    if ((value.kind === "gym" || value.kind === "creator") && !value.organisation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["organisation"],
        message: value.kind === "gym" ? "Gym name is required" : "Channel or handle is required",
      });
    }
    if (value.kind === "professional" && !value.detail) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["detail"], message: "Tell us your discipline" });
    }
  });

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

export const listApplicationsQuery = z.object({
  kind: applicationKind.optional(),
  status: z.enum(["new", "in_review", "contacted", "converted", "rejected"]).optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

export const updateApplicationSchema = z.object({
  status: z.enum(["new", "in_review", "contacted", "converted", "rejected"]),
  adminNote: z.string().trim().max(2000).optional(),
});
