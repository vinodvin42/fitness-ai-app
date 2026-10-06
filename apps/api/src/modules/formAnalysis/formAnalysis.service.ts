import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";
import { createNotification } from "../notifications/notifications.service";
import type { CreateFormAnalysisInput } from "./formAnalysis.schema";

/**
 * Train 18 form-analysis capture. Deliberately NO automated analysis: a
 * submission stays `queued` until a human coach reviews it (reviewer flow below), and `coachNote` stays null until then.
 */

type Row = {
  id: string;
  exerciseId: string | null;
  videoUrl: string | null;
  status: string;
  coachNote: string | null;
  reviewedAt?: Date | null;
  reviewedByProfessionalId?: string | null;
  createdAt: Date;
};

// List responses omit the (possibly large) video payload; detail returns it.
function toSubmission(r: Row, withVideo: boolean, exerciseName: string | null) {
  return {
    id: r.id,
    exerciseId: r.exerciseId,
    exerciseName,
    videoUrl: withVideo ? r.videoUrl : null,
    hasVideo: r.videoUrl != null,
    status: r.status as "queued" | "reviewed",
    coachNote: r.coachNote,
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

async function exerciseNames(ids: Array<string | null>) {
  const unique = [...new Set(ids.filter((i): i is string => !!i))];
  if (unique.length === 0) return new Map<string, string>();
  const rows = (await prisma.exercise.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  })) as Array<{ id: string; name: string }>;
  return new Map(rows.map((e) => [e.id, e.name]));
}

export async function createSubmission(userId: string, input: CreateFormAnalysisInput) {
  if (input.exerciseId) {
    const ex = await prisma.exercise.findUnique({ where: { id: input.exerciseId }, select: { id: true } });
    if (!ex) throw new ApiHttpError(404, "exercise_not_found", "Exercise not found");
  }
  const row = (await prisma.formAnalysisSubmission.create({
    data: { userId, exerciseId: input.exerciseId, videoUrl: input.videoUrl },
  })) as Row;
  const names = await exerciseNames([row.exerciseId]);
  return toSubmission(row, true, row.exerciseId ? names.get(row.exerciseId) ?? null : null);
}

export async function listSubmissions(userId: string) {
  const rows = (await prisma.formAnalysisSubmission.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  })) as Row[];
  const names = await exerciseNames(rows.map((r) => r.exerciseId));
  return { items: rows.map((r) => toSubmission(r, false, r.exerciseId ? names.get(r.exerciseId) ?? null : null)) };
}

export async function getSubmission(userId: string, id: string) {
  const row = (await prisma.formAnalysisSubmission.findFirst({ where: { id, userId } })) as Row | null;
  if (!row) throw new ApiHttpError(404, "form_analysis_not_found", "Submission not found");
  const names = await exerciseNames([row.exerciseId]);
  return toSubmission(row, true, row.exerciseId ? names.get(row.exerciseId) ?? null : null);
}

// ---- Coach-side review (professional-authed) ------------------------------

const notFound = () => new ApiHttpError(404, "form_analysis_not_found", "Submission not found");

/** Only submissions from users with an ACTIVE relationship with this professional. */
async function activeClientIds(professionalId: string): Promise<string[]> {
  const rels = (await prisma.relationship.findMany({
    where: { professionalId, status: "active" },
    select: { userId: true },
  })) as Array<{ userId: string }>;
  return [...new Set(rels.map((r) => r.userId))];
}

function firstName(fullName: string | null | undefined): string {
  return (fullName ?? "").trim().split(/\s+/)[0] || "Client";
}

async function userFirstNames(ids: string[]) {
  const users = (await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullName: true },
  })) as Array<{ id: string; fullName: string }>;
  return new Map(users.map((u) => [u.id, firstName(u.fullName)]));
}

export async function listForProfessional(professionalId: string) {
  const clientIds = await activeClientIds(professionalId);
  if (clientIds.length === 0) return { items: [] };
  const rows = (await prisma.formAnalysisSubmission.findMany({
    where: { userId: { in: clientIds } },
    select: {
      id: true,
      userId: true,
      exerciseId: true,
      status: true,
      coachNote: true,
      reviewedAt: true,
      reviewedByProfessionalId: true,
      createdAt: true,
      // existence only; the payload itself is never selected for lists
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  })) as Array<Omit<Row, "videoUrl"> & { userId: string }>;
  const withVideoIds = new Set(
    (
      (await prisma.formAnalysisSubmission.findMany({
        where: { id: { in: rows.map((r) => r.id) }, videoUrl: { not: null } },
        select: { id: true },
      })) as Array<{ id: string }>
    ).map((r) => r.id),
  );
  const [names, firsts] = await Promise.all([
    exerciseNames(rows.map((r) => r.exerciseId)),
    userFirstNames([...new Set(rows.map((r) => r.userId))]),
  ]);
  const items = rows.map((r) => ({
    ...toSubmission({ ...r, videoUrl: withVideoIds.has(r.id) ? "x" : null }, false, r.exerciseId ? names.get(r.exerciseId) ?? null : null),
    userFirstName: firsts.get(r.userId) ?? "Client",
  }));
  // queued first, then newest first (stable within group)
  items.sort((a, b) => (a.status === b.status ? 0 : a.status === "queued" ? -1 : 1));
  return { items };
}

async function loadForProfessional(professionalId: string, id: string) {
  const row = (await prisma.formAnalysisSubmission.findUnique({ where: { id } })) as
    | (Row & { userId: string })
    | null;
  if (!row) throw notFound();
  const rel = await prisma.relationship.count({ where: { professionalId, userId: row.userId, status: "active" } });
  if (rel === 0) throw notFound();
  return row;
}

export async function getForProfessional(professionalId: string, id: string) {
  const row = await loadForProfessional(professionalId, id);
  const [names, firsts] = await Promise.all([exerciseNames([row.exerciseId]), userFirstNames([row.userId])]);
  return {
    ...toSubmission(row, true, row.exerciseId ? names.get(row.exerciseId) ?? null : null),
    userFirstName: firsts.get(row.userId) ?? "Client",
  };
}

export async function reviewSubmission(professionalId: string, id: string, coachNote: string) {
  const row = await loadForProfessional(professionalId, id);
  if (row.status === "reviewed" && row.reviewedByProfessionalId && row.reviewedByProfessionalId !== professionalId) {
    throw new ApiHttpError(409, "already_reviewed", "This clip was already reviewed by another professional");
  }
  const updated = (await prisma.formAnalysisSubmission.update({
    where: { id },
    data: { status: "reviewed", coachNote, reviewedAt: new Date(), reviewedByProfessionalId: professionalId },
  })) as Row;
  const names = await exerciseNames([updated.exerciseId]);
  const exName = updated.exerciseId ? names.get(updated.exerciseId) ?? null : null;
  await createNotification(row.userId, {
    kind: "coach",
    title: "Your form check was reviewed",
    body: exName ? `Your coach left feedback on your ${exName} clip.` : "Your coach left feedback on your form clip.",
    deepLink: "primefit://train/form-analysis",
  });
  return toSubmission(updated, false, exName);
}
