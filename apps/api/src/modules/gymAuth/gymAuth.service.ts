import { prisma } from "../../db/prisma";
import { verifyPassword } from "../../lib/password";
import { signGymAccessToken } from "../../lib/gymJwt";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { GymLoginInput } from "./gymAuth.schema";

/**
 * Gym Partner Lite portal auth (R2 Wave 5, 21 Sep 2026) — mirrors
 * professionalAuth.service.ts's shape for the separate `Gym` identity, but
 * login-only (no signup/refresh/logout — see gymAuth.schema.ts's own
 * comment and config/env.ts's GYM_JWT_SECRET comment for why this follows
 * AdminUser's simpler single-token precedent instead). Deliberately does
 * NOT import `Gym` as a Prisma model type — same hand-typed-row convention
 * as gyms.service.ts itself.
 */

type GymAuthRow = {
  id: string;
  name: string;
  status: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  inviteCode: string;
  gymPasswordHash: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toPublicGym(gym: GymAuthRow) {
  // Never return gymPasswordHash to a client — same discipline as
  // professionalAuth.service.ts's toPublicProfessional/users.service.ts's
  // toPublicUser.
  const { gymPasswordHash: _gymPasswordHash, ...publicGym } = gym;
  return publicGym;
}

export async function gymLogin(input: GymLoginInput) {
  const gym = (await prisma.gym.findFirst({ where: { contactEmail: input.email } })) as GymAuthRow | null;

  // Deliberately the same generic error for "no such gym", "gym found but
  // gymPasswordHash is still null (admin never set a portal password)",
  // "gym is suspended", and "wrong password" — distinguishing any of these
  // to the caller would let an attacker enumerate which gyms have portal
  // access set up, or fish for a valid contactEmail.
  if (!gym || !gym.gymPasswordHash) {
    throw new ApiHttpError(401, "invalid_credentials", "Incorrect email or password");
  }

  if (gym.status === "suspended") {
    throw new ApiHttpError(401, "invalid_credentials", "Incorrect email or password");
  }

  const valid = await verifyPassword(input.password, gym.gymPasswordHash);
  if (!valid) {
    throw new ApiHttpError(401, "invalid_credentials", "Incorrect email or password");
  }

  await recordAudit({
    action: "gym.portal_login",
    entityType: "Gym",
    entityId: gym.id,
    metadata: { contactEmail: gym.contactEmail },
  });

  // Flat `token`/`tokenExpiresAt` — same response shape as
  // adminAuth.service.ts#adminLogin (single-token, no refresh), not
  // professionalAuth.service.ts's nested `tokens` object (that identity
  // has a real refresh-token flow; this one deliberately doesn't — see
  // config/env.ts's GYM_JWT_SECRET comment).
  const { token, expiresAt } = signGymAccessToken({ sub: gym.id, contactEmail: gym.contactEmail });
  return { gym, token, tokenExpiresAt: expiresAt };
}

export async function getGymAuthById(id: string) {
  const gym = (await prisma.gym.findUnique({ where: { id } })) as GymAuthRow | null;
  if (!gym) {
    throw new ApiHttpError(404, "not_found", "Gym not found");
  }
  return gym;
}
