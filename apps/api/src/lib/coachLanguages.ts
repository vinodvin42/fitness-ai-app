import { z } from "zod";
import { prisma } from "../db/prisma";
import { recordAudit } from "../middleware/auditLog";
import { ApiHttpError } from "../middleware/errorHandler";

/**
 * Professional languages (owner, 25 Oct 2026: "add choose language option"). A professional picks the
 * languages they can coach in (coach app: More > My profile); members see them on the profile and can
 * filter Find a professional by one. ISO 639-1 codes: the same ten the member app's Language setting
 * offers. Empty means "not stated".
 */
export const SPOKEN_LANGUAGE_CODES = ["en", "hi", "ta", "te", "kn", "mr", "bn", "gu", "ml", "pa"] as const;
export type SpokenLanguageCode = (typeof SPOKEN_LANGUAGE_CODES)[number];

/** Body of PATCH /professionals/me/languages. */
export const setCoachLanguagesSchema = z.object({
  languages: z.array(z.enum(SPOKEN_LANGUAGE_CODES)).max(SPOKEN_LANGUAGE_CODES.length),
});
export type SetCoachLanguagesInput = z.infer<typeof setCoachLanguagesSchema>;

/** Records the languages a professional speaks (duplicates dropped, kept in list order), audited. */
export async function setCoachLanguages(professionalId: string, input: SetCoachLanguagesInput, actor: { professionalId: string }) {
  const existing = (await prisma.professional.findUnique({ where: { id: professionalId }, select: { languages: true } })) as
    | { languages: string[] }
    | null;
  if (!existing) throw new ApiHttpError(404, "not_found", "Professional not found");
  const languages = SPOKEN_LANGUAGE_CODES.filter((code) => input.languages.includes(code));
  await prisma.professional.update({ where: { id: professionalId }, data: { languages } });
  await recordAudit({
    actorProfessionalId: actor.professionalId,
    action: "professional.languages_set",
    entityType: "Professional",
    entityId: professionalId,
    stateBefore: { languages: existing.languages },
    stateAfter: { languages },
  });
  return { languages };
}
