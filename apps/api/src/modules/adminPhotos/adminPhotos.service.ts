import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";

/**
 * Admin console profile photos (owner decision, 27 Oct 2026: admins may see members' and coaches'
 * profile photos in the console). Read-only and not audited, like the rest of the directory reads.
 * The photos themselves are the base64 JPEG/PNG data URIs in UserProfilePhoto and
 * ProfessionalProfilePhoto; the directory lists only carry `photoUpdatedAt` (never the image), so the
 * console fetches a photo only for people who have one, keyed by that timestamp.
 */

type PhotoRow = { imageData: string; updatedAt: Date } | null;

function toPhoto(row: PhotoRow) {
  return row ? { imageData: row.imageData, updatedAt: row.updatedAt } : null;
}

/** A member's profile photo, or null when they haven't set one. 404 for an unknown member. */
export async function getUserPhoto(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { profilePhoto: { select: { imageData: true, updatedAt: true } } },
  });
  if (!user) throw new ApiHttpError(404, "not_found", "User not found");
  return toPhoto(user.profilePhoto);
}

/** A professional's profile photo (any status), or null when none is set. 404 for an unknown professional. */
export async function getProfessionalPhoto(professionalId: string) {
  const professional = await prisma.professional.findUnique({
    where: { id: professionalId },
    select: { profilePhoto: { select: { imageData: true, updatedAt: true } } },
  });
  if (!professional) throw new ApiHttpError(404, "not_found", "Professional not found");
  return toPhoto(professional.profilePhoto);
}

/** userId -> photo updatedAt for the given members (only those with a photo). Never reads imageData. */
export async function userPhotoUpdatedAtMap(userIds: string[]): Promise<Map<string, Date>> {
  if (!userIds.length) return new Map();
  const rows = await prisma.userProfilePhoto.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, updatedAt: true },
  });
  return new Map(rows.map((r) => [r.userId, r.updatedAt]));
}

/** professionalId -> photo updatedAt for the given professionals (only those with a photo). Never reads imageData. */
export async function professionalPhotoUpdatedAtMap(professionalIds: string[]): Promise<Map<string, Date>> {
  if (!professionalIds.length) return new Map();
  const rows = await prisma.professionalProfilePhoto.findMany({
    where: { professionalId: { in: professionalIds } },
    select: { professionalId: true, updatedAt: true },
  });
  return new Map(rows.map((r) => [r.professionalId, r.updatedAt]));
}
