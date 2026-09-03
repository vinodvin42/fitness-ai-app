import { z } from "zod";

// docs/coach/03-screen-inventory.md §B. Same base64-data-URI-in-Postgres
// precedent as progress.schema.ts's createProgressPhotoSchema (no object
// storage exists in this build) — extended here to also accept
// `data:application/pdf` since certification/qualification documents and
// government ID scans are realistically PDFs as often as photos, unlike a
// Progress Photo which is always a camera/gallery image. Same 6MB ceiling
// under app.ts's 10mb express.json() limit.
const documentDataSchema = z
  .string()
  .regex(/^data:(image\/|application\/pdf)/, { message: "must be a data URI (image or PDF)" })
  .max(6_000_000, { message: "File is too large" });

// docs/coach/03-screen-inventory.md §B "Service Selection" — multi-select,
// not mutually exclusive.
export const selectServicesSchema = z.object({
  services: z.array(z.enum(["fitness", "nutrition"])).min(1, "Select at least one service"),
});

// docs/coach/03-screen-inventory.md §B "Credential Verification Upload" —
// one call per service (the credential row it targets is inferred from
// `serviceType`; a professional must have already selected that service
// via selectServicesSchema above). Submitting moves that service's
// credential status from `not_verified` to `pending` — see
// professionalOnboarding.service.ts.
export const submitCredentialSchema = z.object({
  serviceType: z.enum(["fitness", "nutrition"]),
  certificationName: z.string().trim().min(1).max(200).optional(),
  certifyingBody: z.string().trim().min(1).max(200).optional(),
  yearObtained: z.coerce.number().int().min(1950).max(2100).optional(),
  certificationDocData: documentDataSchema.optional(),
  qualificationDocData: documentDataSchema.optional(),
});

// The shared KYC step — one per professional, not per service. See
// prisma/schema.prisma's `Professional.kycDocumentData` comment for the
// real, flagged privacy caveat before treating this as production-ready.
export const submitKycSchema = z.object({
  kycDocumentData: documentDataSchema,
});

export type SelectServicesInput = z.infer<typeof selectServicesSchema>;
export type SubmitCredentialInput = z.infer<typeof submitCredentialSchema>;
export type SubmitKycInput = z.infer<typeof submitKycSchema>;
