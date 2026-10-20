import { z } from "zod";
import { prisma } from "../db/prisma";
import { recordAudit } from "../middleware/auditLog";
import { ApiHttpError } from "../middleware/errorHandler";

/**
 * Coach gender (owner, 20 Oct 2026: "give male and female coaches option").
 * A coach states their gender (coach app: onboarding or More > My profile)
 * or an admin sets it (Professionals > profile). A member asking for a coach
 * can choose a male or female coach, or no preference; an admin can then only
 * send that request to a coach of that gender. Null means "not stated" on a
 * coach and "no preference" on a request.
 */
export const COACH_GENDERS = ["male", "female"] as const;
export type CoachGender = (typeof COACH_GENDERS)[number];

/** Body of PATCH /professionals/me/gender and PATCH /admin/professionals/:id/gender. */
export const setCoachGenderSchema = z.object({ gender: z.enum(COACH_GENDERS).nullable() });
export type SetCoachGenderInput = z.infer<typeof setCoachGenderSchema>;

/** Whether a coach of `coachGender` can take a request with this preference. */
export function coachGenderFits(preference: string | null | undefined, coachGender: string | null | undefined): boolean {
  return !preference || preference === coachGender;
}

/** Records a coach's gender, audited as the coach themself or as an admin. */
export async function setCoachGender(
  professionalId: string,
  input: SetCoachGenderInput,
  actor: { adminId: string } | { professionalId: string },
) {
  const existing = (await prisma.professional.findUnique({ where: { id: professionalId }, select: { gender: true } })) as
    | { gender: string | null }
    | null;
  if (!existing) throw new ApiHttpError(404, "not_found", "Professional not found");
  await prisma.professional.update({ where: { id: professionalId }, data: { gender: input.gender } });
  await recordAudit({
    ...("adminId" in actor ? { actorAdminId: actor.adminId } : { actorProfessionalId: actor.professionalId }),
    action: "professional.gender_set",
    entityType: "Professional",
    entityId: professionalId,
    stateBefore: { gender: existing.gender },
    stateAfter: { gender: input.gender },
  });
  return { gender: input.gender };
}

/** Refuses to send a request that asks for a male or female coach to a coach of another (or no stated) gender. */
export async function assertCoachGenderFits(preference: string | null | undefined, professionalId: string) {
  if (!preference) return;
  const coach = (await prisma.professional.findUnique({ where: { id: professionalId }, select: { gender: true } })) as
    | { gender: string | null }
    | null;
  if (!coachGenderFits(preference, coach?.gender)) {
    throw new ApiHttpError(409, "coach_gender_mismatch", `This member asked for a ${preference} coach`);
  }
}
