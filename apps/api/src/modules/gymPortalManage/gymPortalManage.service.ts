import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";
import { createNotification } from "../notifications/notifications.service";
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

// ---- Help requests (staff see only what members sent; never userId) ----
type StaffHelpRow = {
  id: string;
  memberFirstName: string;
  memberNumber: string;
  topic: string;
  exerciseName: string | null;
  workoutName: string | null;
  note: string | null;
  status: string;
  createdAt: Date;
  respondedAt: Date | null;
  location: { name: string } | null;
};

export function toStaffHelpRequest(r: StaffHelpRow) {
  return {
    id: r.id,
    memberFirstName: r.memberFirstName,
    memberNumber: r.memberNumber,
    topic: r.topic,
    exerciseName: r.exerciseName,
    workoutName: r.workoutName,
    note: r.note,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null,
    locationName: r.location?.name ?? null,
  };
}

export async function listHelpRequests(gymId: string, status?: "open" | "seen" | "resolved") {
  const rows = await prisma.gymHelpRequest.findMany({
    where: { gymId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      memberFirstName: true,
      memberNumber: true,
      topic: true,
      exerciseName: true,
      workoutName: true,
      note: true,
      status: true,
      createdAt: true,
      respondedAt: true,
      location: { select: { name: true } },
    },
  });
  return rows.map(toStaffHelpRequest);
}

export async function updateHelpRequestStatus(gymId: string, id: string, status: "seen" | "resolved") {
  const existing = await prisma.gymHelpRequest.findFirst({ where: { id, gymId }, select: { id: true, userId: true, status: true, gym: { select: { name: true } } } });
  if (!existing) throw notFound("help_request");
  const row = await prisma.gymHelpRequest.update({
    where: { id },
    data: { status, respondedAt: new Date() },
    select: {
      id: true,
      memberFirstName: true,
      memberNumber: true,
      topic: true,
      exerciseName: true,
      workoutName: true,
      note: true,
      status: true,
      createdAt: true,
      respondedAt: true,
      location: { select: { name: true } },
    },
  });
  if (status === "resolved" && existing.status !== "resolved") {
    await createNotification(existing.userId, {
      kind: "system",
      title: "Your gym handled your request",
      body: `${existing.gym.name} marked your help request as resolved.`,
      deepLink: null,
    });
  }
  return toStaffHelpRequest(row);
}
