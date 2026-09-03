import { prisma } from "../../db/prisma";
import { hashPassword, verifyPassword } from "../../lib/password";
import {
  generateProfessionalRefreshToken,
  hashProfessionalRefreshToken,
  professionalRefreshTokenExpiry,
  signProfessionalAccessToken,
} from "../../lib/professionalJwt";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { ProfessionalLoginInput, ProfessionalSignupInput } from "./professionalAuth.schema";

/**
 * Coach marketplace auth (Phase 5, 20 Aug 2026) — mirrors
 * modules/auth/auth.service.ts's signup/login/refresh/logout shape
 * exactly, for the separate `Professional` identity. Deliberately does
 * NOT import `Professional` as a Prisma model type (same reasoning as
 * users.service.ts's toPublicUser — see that file's own comment).
 */

export function toPublicProfessional(professional: {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  bio: string | null;
  specializationTags: string[];
  yearsExperience: number | null;
  status: string;
  kycStatus: string;
  createdAt: Date;
  updatedAt: Date;
  passwordHash?: string;
  kycDocumentData?: string | null;
  adminNotes?: string | null;
}) {
  // Never return passwordHash OR the raw kycDocumentData to a client —
  // the latter is a base64-encoded government ID, no reason to ever echo
  // it back in a profile response. `adminNotes` (26 Aug 2026) — an
  // admin's internal note about why this account was suspended — is
  // stripped for the same reason. This was a real, pre-existing leak:
  // every call site here passes the full Prisma row (no `select`), so
  // `adminNotes` was silently included in every professional's own
  // `/me`-shaped response until this fix — found while adding the exact
  // same field to `User` and building `toPublicUser`'s equivalent
  // omission (users.service.ts).
  const {
    passwordHash: _passwordHash,
    kycDocumentData: _kycDocumentData,
    adminNotes: _adminNotes,
    ...publicProfessional
  } = professional;
  return publicProfessional;
}

async function issueTokenPair(professionalId: string, email: string) {
  const access = signProfessionalAccessToken({ sub: professionalId, email });
  const refreshToken = generateProfessionalRefreshToken();

  await prisma.professionalRefreshToken.create({
    data: {
      professionalId,
      tokenHash: hashProfessionalRefreshToken(refreshToken),
      expiresAt: professionalRefreshTokenExpiry(),
    },
  });

  return {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken,
  };
}

export async function professionalSignup(input: ProfessionalSignupInput) {
  const existing = await prisma.professional.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ApiHttpError(409, "email_taken", "An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);
  const professional = await prisma.professional.create({
    data: { email: input.email, passwordHash, fullName: input.fullName, phone: input.phone ?? null },
  });

  await recordAudit({
    actorProfessionalId: professional.id,
    action: "professional.signup",
    entityType: "Professional",
    entityId: professional.id,
  });

  const tokens = await issueTokenPair(professional.id, professional.email);
  return { professional, tokens };
}

export async function professionalLogin(input: ProfessionalLoginInput) {
  const professional = await prisma.professional.findUnique({ where: { email: input.email } });
  if (!professional) {
    throw new ApiHttpError(401, "invalid_credentials", "Incorrect email or password");
  }

  if (professional.status !== "active") {
    throw new ApiHttpError(401, "invalid_credentials", "Incorrect email or password");
  }

  const valid = await verifyPassword(input.password, professional.passwordHash);
  if (!valid) {
    throw new ApiHttpError(401, "invalid_credentials", "Incorrect email or password");
  }

  await recordAudit({
    actorProfessionalId: professional.id,
    action: "professional.login",
    entityType: "Professional",
    entityId: professional.id,
  });

  const tokens = await issueTokenPair(professional.id, professional.email);
  return { professional, tokens };
}

export async function professionalRefresh(rawRefreshToken: string) {
  const tokenHash = hashProfessionalRefreshToken(rawRefreshToken);
  const record = await prisma.professionalRefreshToken.findUnique({
    where: { tokenHash },
    include: { professional: true },
  });

  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new ApiHttpError(401, "invalid_refresh_token", "Refresh token is invalid or expired");
  }

  await prisma.professionalRefreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });

  const tokens = await issueTokenPair(record.professional.id, record.professional.email);
  return { professional: record.professional, tokens };
}

export async function professionalLogout(rawRefreshToken: string) {
  const tokenHash = hashProfessionalRefreshToken(rawRefreshToken);
  await prisma.professionalRefreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getProfessionalById(id: string) {
  const professional = await prisma.professional.findUnique({ where: { id } });
  if (!professional) {
    throw new ApiHttpError(404, "not_found", "Professional not found");
  }
  return professional;
}
