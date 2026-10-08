import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";
import type { z } from "zod";
import type {
  createAnnouncementSchema,
  createEquipmentSchema,
  createTimingSchema,
  updateEquipmentSchema,
  updateTimingSchema,
} from "./gymPortalManage.schema";

/**
 * Gym staff management of what members see in "My Gym". Every function takes the
 * gymId from the verified gym token and only ever touches that gym's rows.
 */

const notFound = (what: string) => new ApiHttpError(404, `${what}_not_found`, `${what} not found`);

// ---- Timings ----
export const listTimings = (gymId: string) =>
  prisma.gymTiming.findMany({ where: { gymId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });

export function createTiming(gymId: string, input: z.infer<typeof createTimingSchema>) {
  return prisma.gymTiming.create({
    data: {
      gymId,
      label: input.label,
      days: input.days,
      opensAt: input.closed ? null : (input.opensAt ?? null),
      closesAt: input.closed ? null : (input.closesAt ?? null),
      closed: input.closed ?? false,
      kind: input.kind ?? "regular",
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function updateTiming(gymId: string, id: string, input: z.infer<typeof updateTimingSchema>) {
  const existing = await prisma.gymTiming.findFirst({ where: { id, gymId } });
  if (!existing) throw notFound("timing");
  return prisma.gymTiming.update({ where: { id }, data: input });
}

export async function deleteTiming(gymId: string, id: string) {
  const res = await prisma.gymTiming.deleteMany({ where: { id, gymId } });
  if (res.count === 0) throw notFound("timing");
  return { deleted: true as const };
}

// ---- Equipment ----
export const listEquipment = (gymId: string) =>
  prisma.gymEquipment.findMany({ where: { gymId }, orderBy: [{ category: "asc" }, { name: "asc" }] });

export function createEquipment(gymId: string, input: z.infer<typeof createEquipmentSchema>) {
  return prisma.gymEquipment.create({
    data: {
      gymId,
      name: input.name,
      category: input.category,
      exerciseKeyword: input.exerciseKeyword || null,
      quantity: input.quantity ?? null,
      available: input.available ?? true,
      note: input.note || null,
    },
  });
}

export async function updateEquipment(gymId: string, id: string, input: z.infer<typeof updateEquipmentSchema>) {
  const existing = await prisma.gymEquipment.findFirst({ where: { id, gymId } });
  if (!existing) throw notFound("equipment");
  const availabilityChanged = input.available !== undefined && input.available !== existing.available;
  return prisma.gymEquipment.update({
    where: { id },
    data: {
      ...input,
      exerciseKeyword: input.exerciseKeyword === undefined ? undefined : input.exerciseKeyword || null,
      note: input.note === undefined ? undefined : input.note || null,
      ...(availabilityChanged ? { availabilityUpdatedAt: new Date() } : {}),
    },
  });
}

export async function deleteEquipment(gymId: string, id: string) {
  const res = await prisma.gymEquipment.deleteMany({ where: { id, gymId } });
  if (res.count === 0) throw notFound("equipment");
  return { deleted: true as const };
}

// ---- Announcements ----
export const listAnnouncements = (gymId: string) =>
  prisma.gymAnnouncement.findMany({ where: { gymId }, orderBy: { postedAt: "desc" }, take: 50 });

export function createAnnouncement(gymId: string, input: z.infer<typeof createAnnouncementSchema>) {
  return prisma.gymAnnouncement.create({
    data: { gymId, title: input.title, body: input.body, kind: input.kind, expiresAt: input.expiresAt ?? null },
  });
}

export async function deleteAnnouncement(gymId: string, id: string) {
  const res = await prisma.gymAnnouncement.deleteMany({ where: { id, gymId } });
  if (res.count === 0) throw notFound("announcement");
  return { deleted: true as const };
}
