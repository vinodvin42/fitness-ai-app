import { z } from "zod";

// docs/admin/03-screen-inventory.md 03.01's tab strip. "credentialsExpiring"
// is real as of R2 Wave 6.2 (22 Sep 2026) — filters to professionals with a
// `verified` ProfessionalCredential inside (or past) the 30-day admin
// warning window off `expiresAt`. See adminProfessionals.service.ts's
// detectAndQueueExpiringCredentials/computeDirectoryBucket.
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

// R2 Wave 1 (20 Sep 2026) — admin-editable capacity (the same
// professionalLifecycle.service.ts#updateMaxActiveClients the professional
// can also call on their own account). 1–500 is a sanity bound, matching
// professionalLifecycle.schema.ts's own updateMaxActiveClientsSchema.
export const adminUpdateMaxActiveClientsSchema = z.object({
  maxActiveClients: z.coerce.number().int().min(1).max(500),
});

export type ListProfessionalsQuery = z.infer<typeof listProfessionalsQuerySchema>;
export type VerifyCredentialInput = z.infer<typeof verifyCredentialSchema>;
export type VerifyKycInput = z.infer<typeof verifyKycSchema>;
export type SuspendProfessionalInput = z.infer<typeof suspendProfessionalSchema>;
export type AdminUpdateMaxActiveClientsInput = z.infer<typeof adminUpdateMaxActiveClientsSchema>;
