import { z } from "zod";
import { prisma } from "../db/prisma";
import { recordAudit } from "../middleware/auditLog";
import { ApiHttpError } from "../middleware/errorHandler";
import { toPublicProfessional } from "../modules/professionalAuth/professionalAuth.service";

/**
 * Coach "About you" (owner, 27 Oct 2026: coaches enter their own years of experience, bio and
 * specialties; admins can correct them). Saved straight away, no approval step: members see the new
 * values on the coach's profile at once (coaching.service.ts getProfessionalDetail). The coach edits
 * them in coach-web (Account > My profile); an admin in Professionals > profile > Overview.
 */
export const COACH_BIO_MAX_LENGTH = 1000;
export const COACH_YEARS_EXPERIENCE_MAX = 60;
export const COACH_SPECIALTIES_MAX = 12;
export const COACH_SPECIALTY_MAX_LENGTH = 40;

/** Keeps the first spelling of each tag, dropping later ones that differ only in case. */
function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Body of PATCH /professionals/me/profile and PATCH /admin/professionals/:id/profile. Every field is
 * optional (only the ones sent change); an empty bio clears it, as does null.
 */
export const setCoachProfileSchema = z
  .object({
    bio: z
      .string()
      .trim()
      .max(COACH_BIO_MAX_LENGTH)
      .nullable()
      .optional()
      .transform((bio) => (bio === "" ? null : bio)),
    yearsExperience: z.number().int().min(0).max(COACH_YEARS_EXPERIENCE_MAX).nullable().optional(),
    specializationTags: z
      .array(z.string().trim().min(1).max(COACH_SPECIALTY_MAX_LENGTH))
      .max(COACH_SPECIALTIES_MAX)
      .transform(dedupeTags)
      .optional(),
  })
  .refine((v) => v.bio !== undefined || v.yearsExperience !== undefined || v.specializationTags !== undefined, {
    message: "Send at least one of bio, yearsExperience or specializationTags",
  });
export type SetCoachProfileInput = z.infer<typeof setCoachProfileSchema>;

type ProfileFields = { bio: string | null; yearsExperience: number | null; specializationTags: string[] };

/** Updates the fields sent, audited as the coach themself or as an admin; returns the public professional. */
export async function setCoachProfile(
  professionalId: string,
  input: SetCoachProfileInput,
  actor: { adminId: string } | { professionalId: string },
) {
  const existing = (await prisma.professional.findUnique({
    where: { id: professionalId },
    select: { bio: true, yearsExperience: true, specializationTags: true },
  })) as ProfileFields | null;
  if (!existing) throw new ApiHttpError(404, "not_found", "Professional not found");

  const data: Partial<ProfileFields> = {};
  if (input.bio !== undefined) data.bio = input.bio;
  if (input.yearsExperience !== undefined) data.yearsExperience = input.yearsExperience;
  if (input.specializationTags !== undefined) data.specializationTags = input.specializationTags;
  const keys = Object.keys(data) as Array<keyof ProfileFields>;

  const updated = await prisma.professional.update({ where: { id: professionalId }, data });
  await recordAudit({
    ...("adminId" in actor ? { actorAdminId: actor.adminId } : { actorProfessionalId: actor.professionalId }),
    action: "professional.profile_set",
    entityType: "Professional",
    entityId: professionalId,
    stateBefore: Object.fromEntries(keys.map((k) => [k, existing[k]])),
    stateAfter: Object.fromEntries(keys.map((k) => [k, data[k]])),
  });
  return toPublicProfessional(updated);
}
