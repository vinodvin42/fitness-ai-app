import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";
import type { ProfilePhotoInput } from "../users/users.schema";

/**
 * Professional profile photo (owner, 25 Oct 2026: profiles should show a picture). The coach sets it
 * from My profile in the coach app; members see it on the professional's profile and in Find a
 * professional. Same storage and checks as the member's own photo (UserProfilePhoto): a JPEG or PNG
 * data URI in Postgres, one row per professional, deleted with the account. See
 * ProfessionalProfilePhoto in schema.prisma.
 */

/** First bytes of each accepted image type, checked after decoding (as users.service does). */
const PHOTO_SIGNATURES: Record<string, number[]> = {
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

function toPhoto(row: { imageData: string; updatedAt: Date }) {
  return { imageData: row.imageData, updatedAt: row.updatedAt };
}

export async function getMyPhoto(professionalId: string) {
  const row = await prisma.professionalProfilePhoto.findUnique({ where: { professionalId } });
  return row ? toPhoto(row) : null;
}

/** Sets (or replaces) the professional's own profile photo. */
export async function setMyPhoto(professionalId: string, input: ProfilePhotoInput) {
  const match = /^data:image\/(jpeg|png);base64,/.exec(input.imageData);
  const head = match ? Buffer.from(input.imageData.slice(match[0].length, match[0].length + 16), "base64") : Buffer.alloc(0);
  const signature = match ? PHOTO_SIGNATURES[match[1]] : undefined;
  if (!signature || !signature.every((byte, i) => head[i] === byte)) {
    throw new ApiHttpError(400, "invalid_image", "That file isn't a JPEG or PNG photo");
  }
  const row = await prisma.professionalProfilePhoto.upsert({
    where: { professionalId },
    create: { professionalId, imageData: input.imageData },
    update: { imageData: input.imageData },
  });
  return toPhoto(row);
}

export async function deleteMyPhoto(professionalId: string) {
  await prisma.professionalProfilePhoto.deleteMany({ where: { professionalId } });
}

/** A member reading an active professional's photo; null when they haven't set one. */
export async function getProfessionalPhoto(professionalId: string) {
  const professional = await prisma.professional.findUnique({
    where: { id: professionalId },
    select: { status: true, profilePhoto: { select: { imageData: true, updatedAt: true } } },
  });
  if (!professional || professional.status !== "active") {
    throw new ApiHttpError(404, "professional_not_found", "Coach not found");
  }
  return professional.profilePhoto ? toPhoto(professional.profilePhoto) : null;
}
