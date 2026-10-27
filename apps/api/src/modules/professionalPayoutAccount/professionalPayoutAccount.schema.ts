import { z } from "zod";
import { MIN_REASON_LENGTH } from "../../lib/highImpactAction";

/** Indian Financial System Code: 4 letters (the bank), a 0, then 6 letters or digits (the branch). */
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
/** Indian bank account numbers are 9 to 18 digits. */
export const ACCOUNT_NUMBER_REGEX = /^\d{9,18}$/;
/** name@bank, e.g. ravi.k@okhdfcbank or 9876543210@ybl. */
export const UPI_ID_REGEX = /^[a-z0-9._-]{2,256}@[a-z][a-z0-9]{1,63}$/;

const holderName = z
  .string()
  .trim()
  .min(2, "Enter the name on the account")
  .max(100)
  // Letters (any script), spaces and the punctuation names use.
  .regex(/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u, "Use the name exactly as it appears on the account");

/**
 * Validation messages never echo the value back, so a typo'd account number
 * doesn't end up in an error response or a log line.
 */
export const savePayoutAccountSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("bank"),
    accountHolderName: holderName,
    // Spaces and dashes people type for readability are dropped first.
    accountNumber: z
      .string()
      .transform((v) => v.replace(/[\s-]/g, ""))
      .pipe(z.string().regex(ACCOUNT_NUMBER_REGEX, "Account number must be 9 to 18 digits")),
    ifsc: z
      .string()
      .transform((v) => v.trim().toUpperCase())
      .pipe(z.string().regex(IFSC_REGEX, "Enter a valid 11-character IFSC, e.g. HDFC0001234")),
  }),
  z.object({
    method: z.literal("upi"),
    accountHolderName: holderName,
    upiId: z
      .string()
      .transform((v) => v.trim().toLowerCase())
      .pipe(z.string().regex(UPI_ID_REGEX, "Enter a valid UPI ID, e.g. name@okhdfcbank")),
  }),
]);

export type SavePayoutAccountInput = z.infer<typeof savePayoutAccountSchema>;

export const revealPayoutAccountSchema = z.object({
  reason: z.string().trim().min(MIN_REASON_LENGTH, `Give a reason of at least ${MIN_REASON_LENGTH} characters`).max(300),
});

export const verifyPayoutAccountSchema = z
  .object({
    status: z.enum(["verified", "rejected"]),
    adminNotes: z.string().trim().max(500).optional(),
    /**
     * The `updatedAt` of the details the admin looked at. If the coach has
     * changed them since (or an approved request is replayed days later),
     * the decision is refused rather than applied to details nobody checked.
     */
    updatedAt: z.string().datetime(),
  })
  .refine((v) => v.status !== "rejected" || (v.adminNotes ?? "").length >= 3, {
    message: "Tell the coach why the details were rejected",
    path: ["adminNotes"],
  });

export type VerifyPayoutAccountInput = z.infer<typeof verifyPayoutAccountSchema>;
