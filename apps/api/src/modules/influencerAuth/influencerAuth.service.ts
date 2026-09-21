import { prisma } from "../../db/prisma";
import { verifyPassword } from "../../lib/password";
import {
  generateInfluencerRefreshToken,
  hashInfluencerRefreshToken,
  influencerRefreshTokenExpiry,
  signInfluencerAccessToken,
} from "../../lib/influencerJwt";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { InfluencerLoginInput } from "./influencerAuth.schema";

/**
 * Creator Portal auth (R2 Wave 5, 21 Sep 2026) — mirrors
 * modules/professionalAuth/professionalAuth.service.ts's login/refresh/
 * logout shape exactly, for the separate `Influencer` identity, minus
 * signup (see this module's schema file for why). Deliberately does NOT
 * import `Influencer` as a Prisma model type (same convention as
 * toPublicProfessional/toPublicUser — see those files' own comments).
 */

export function toPublicInfluencer(influencer: {
  id: string;
  name: string;
  email: string | null;
  handle: string | null;
  platform: string | null;
  commissionPct: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  passwordHash?: string | null;
  notes?: string | null;
}) {
  // Never return passwordHash to a client. `notes` (an admin's internal
  // note ABOUT this influencer, not written by/for them) is stripped too
  // for the same "don't echo internal staff commentary back to the
  // subject of it" reasoning toPublicProfessional's own comment gives for
  // adminNotes — the Creator Portal's own profile view has no use for it.
  const { passwordHash: _passwordHash, notes: _notes, ...publicInfluencer } = influencer;
  return publicInfluencer;
}

async function issueTokenPair(influencerId: string, email: string) {
  const access = signInfluencerAccessToken({ sub: influencerId, email });
  const refreshToken = generateInfluencerRefreshToken();

  await prisma.influencerRefreshToken.create({
    data: {
      influencerId,
      tokenHash: hashInfluencerRefreshToken(refreshToken),
      expiresAt: influencerRefreshTokenExpiry(),
    },
  });

  return {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken,
  };
}

export async function influencerLogin(input: InfluencerLoginInput) {
  // `Influencer.email` is not a DB-unique column (most rows are pure admin
  // bookkeeping with no login need — see the model's own doc comment), so
  // this is a `findFirst`, not `findUnique`. In practice a row only ever
  // reaches this lookup successfully if it also has a real `passwordHash`
  // (set via setInfluencerPortalPassword, which itself requires a real
  // email first) — a duplicate-email collision between two portal-enabled
  // influencers is a real but narrow admin-data-entry edge case, not one
  // this pass adds a DB constraint for.
  const influencer = await prisma.influencer.findFirst({ where: { email: input.email } });
  // Same "generic invalid_credentials for every failure reason" discipline
  // as professionalLogin/auth.service.ts's login — never reveal via the
  // error message whether the email exists, whether the account is
  // inactive, or whether portal access was simply never granted
  // (passwordHash null).
  if (!influencer || !influencer.passwordHash) {
    throw new ApiHttpError(401, "invalid_credentials", "Incorrect email or password");
  }

  if (influencer.status !== "active") {
    throw new ApiHttpError(401, "invalid_credentials", "Incorrect email or password");
  }

  const valid = await verifyPassword(input.password, influencer.passwordHash);
  if (!valid) {
    throw new ApiHttpError(401, "invalid_credentials", "Incorrect email or password");
  }

  await recordAudit({
    actorInfluencerId: influencer.id,
    action: "influencer.login",
    entityType: "Influencer",
    entityId: influencer.id,
  });

  const tokens = await issueTokenPair(influencer.id, influencer.email as string);
  return { influencer, tokens };
}

export async function influencerRefresh(rawRefreshToken: string) {
  const tokenHash = hashInfluencerRefreshToken(rawRefreshToken);
  const record = await prisma.influencerRefreshToken.findUnique({
    where: { tokenHash },
    include: { influencer: true },
  });

  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new ApiHttpError(401, "invalid_refresh_token", "Refresh token is invalid or expired");
  }

  await prisma.influencerRefreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });

  const tokens = await issueTokenPair(record.influencer.id, record.influencer.email as string);
  return { influencer: record.influencer, tokens };
}

export async function influencerLogout(rawRefreshToken: string) {
  const tokenHash = hashInfluencerRefreshToken(rawRefreshToken);
  await prisma.influencerRefreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getInfluencerById(id: string) {
  const influencer = await prisma.influencer.findUnique({ where: { id } });
  if (!influencer) {
    throw new ApiHttpError(404, "not_found", "Influencer not found");
  }
  return influencer;
}
