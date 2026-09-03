import { z } from "zod";

// docs/admin/03-screen-inventory.md 03.01's tab strip. "credentialsExpiring"
// is accepted here (so the frontend can request it like any other tab
// without a special case) but always returns an empty list server-side —
// see adminProfessionals.service.ts's own comment for why (no expiry-date
// field exists on ProfessionalCredential).
export const professionalDirectoryTabs = [
  "all",
  "pendingVerification",
  "active",
  "rejected",
  "suspended",
  "credentialsExpiring",
] as const;

export const listProfessionalsQuerySchema = z.object({
  tab: z.enum(professionalDirectoryTabs).default("all"),
  search: z.string().trim().max(200).optional(),
});

// 03.03 Credential Verification's "Approve / Reject" actions — "Request
// Info" isn't included: CredentialStatus has no state that represents it,
// see this module's own doc comment for why that's left unbuilt rather
// than faked with a status value that doesn't really mean that.
export const verifyCredentialSchema = z.object({
  status: z.enum(["verified", "rejected"]),
  adminNotes: z.string().trim().max(2000).optional(),
});

export const verifyKycSchema = z.object({
  status: z.enum(["verified", "rejected"]),
  adminNotes: z.string().trim().max(2000).optional(),
});

export const suspendProfessionalSchema = z.object({
  adminNotes: z.string().trim().max(2000).optional(),
});

export type ListProfessionalsQuery = z.infer<typeof listProfessionalsQuerySchema>;
export type VerifyCredentialInput = z.infer<typeof verifyCredentialSchema>;
export type VerifyKycInput = z.infer<typeof verifyKycSchema>;
export type SuspendProfessionalInput = z.infer<typeof suspendProfessionalSchema>;
