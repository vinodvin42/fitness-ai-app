import { prisma } from "../db/prisma";
import { readHealthList } from "./fieldCrypto";

/**
 * The single way to read a user's declared health data.
 *
 * Health fields are encrypted at rest (spec §10), which means every
 * consumer now needs a decrypt step. Leaving that to each call site is
 * the dangerous option: a site that forgets it does not fail, it
 * silently sees an EMPTY list — so a plan generator would produce a
 * programme for someone with a heart condition as though they had
 * declared nothing, and a safety screen would show a clean record.
 * Failing safe is not available here; failing quiet is the default. So
 * there is one accessor, and call sites use it rather than reading the
 * columns.
 *
 * Returns null when the user has no onboarding profile at all, which
 * callers already distinguish from "a profile with nothing declared".
 */
export async function getDecryptedOnboardingProfile(userId: string) {
  const profile = await prisma.onboardingProfile.findUnique({ where: { userId } });
  if (!profile) return null;

  const { medicalConditionsEnc, injuriesEnc, ...rest } = profile;
  return {
    ...rest,
    medicalConditions: readHealthList({ encrypted: medicalConditionsEnc, plaintext: profile.medicalConditions }),
    injuries: readHealthList({ encrypted: injuriesEnc, plaintext: profile.injuries }),
  };
}

/** Same, for the safety-escalation rows that carry a copy of the data. */
export function decryptEscalation<
  T extends {
    medicalConditions: string[];
    injuries: string[];
    medicalConditionsEnc: string | null;
    injuriesEnc: string | null;
  },
>(row: T) {
  const { medicalConditionsEnc, injuriesEnc, ...rest } = row;
  return {
    ...rest,
    medicalConditions: readHealthList({ encrypted: medicalConditionsEnc, plaintext: row.medicalConditions }),
    injuries: readHealthList({ encrypted: injuriesEnc, plaintext: row.injuries }),
  };
}
