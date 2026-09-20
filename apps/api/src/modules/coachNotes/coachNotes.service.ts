import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { CreateCoachNoteInput, UpdateCoachNoteInput } from "./coachNotes.schema";

/**
 * Coach Private Notes (R2 Wave 3, 20 Sep 2026) — a dedicated audit of this
 * build (trusted, not re-verified here) confirmed real 2-way `CoachMessage`
 * messaging exists (see that model's own doc comment) but NO private,
 * coach-only notes capability anywhere. This module is that capability: a
 * coach can privately record an observation about a client
 * ("struggles with morning sessions") that the client themselves never
 * sees. Plain text only — no rich-text, tags, or structured fields, same
 * "smallest real slice" discipline `CheckIn`/`WaterLog` already use.
 *
 * **CRITICAL, the entire point of this feature: `CoachNote.body` is never
 * exposed through any User-authed (consumer-facing) endpoint.** Verified by
 * inspection — every route in this codebase that reads a `User`'s own data
 * (`users.routes.ts`, `coaching.routes.ts`, `progress.routes.ts`, etc.)
 * selects specific fields or specific models, never a wildcard `include`
 * that could pull in `coachNotes`; `schema.prisma`'s `CoachNote` model does
 * declare the Prisma-required back-relation array on `User` (Prisma has no
 * way to express a one-sided FK), but Prisma never returns a relation
 * unless a query explicitly `select`s/`include`s it by name — see that
 * model's own doc comment. `coachNotes.test.ts`'s "never exposed to the
 * user" suite asserts this with a real HTTP request: a user-authed request
 * to every existing endpoint that could plausibly join against this data
 * (the consumer "My Professional Team" relationship list, the real
 * `getThread`/messaging endpoints, the profile endpoint) never contains
 * `CoachNote` content anywhere in its response.
 *
 * **Authorization is a deliberately asymmetric gate — a genuine product
 * decision, not a reused `assertActiveRelationship`:**
 * - CREATE requires an ACTIVE `Relationship` — `assertActiveRelationship`
 *   below is the exact same check (and 404-not-403 precedent)
 *   `professionalClients.service.ts` already established for Client 360/
 *   Recommendations: a coach can only start a new private note about
 *   someone they're actually coaching right now.
 * - READ (list) does NOT require the relationship to still be active —
 *   only that one existed, ever (`active` or `ended`). A coach's own
 *   historical notes about a client they used to coach are their own
 *   private record, written while the relationship was real; the client
 *   later ending it shouldn't retroactively 404 the coach out of their own
 *   past observations. `assertAnyRelationshipEverExisted` below is the
 *   real, separate query this performs.
 * - UPDATE/DELETE require both: the ANY-relationship read gate (this note
 *   is even visible to this coach) AND that the acting professional is the
 *   note's own author (`professionalId` on the row) — a coach can't edit or
 *   delete another coach's note, even about a client they share.
 *   `Relationship` allows multiple professionals per user across different
 *   `serviceType`s (see that model's own doc comment), so notes are scoped
 *   to `(professionalId, userId)`, never `userId` alone — a fitness coach
 *   and a nutrition coach sharing a client each see only their own notes
 *   about that client, never each other's.
 *
 * Real `recordAudit()` on create/update/delete — a private note about a
 * person's health/fitness context deserves the same audit discipline as
 * every other mutation in this build, even though its CONTENT is never
 * admin- or client-visible (only the fact that a note was
 * created/edited/deleted is recorded in metadata, same "audit the action,
 * not necessarily every byte" precedent `AuditLog.metadata` already uses
 * elsewhere, e.g. `coach_message.sent` never logs message content either).
 *
 * Deliberately does NOT import Prisma model types — the un-generated
 * `@prisma/client` stub has no real model exports in this sandbox; see
 * apps/api/README.md.
 */

async function assertActiveRelationship(professionalId: string, userId: string): Promise<void> {
  const count = await prisma.relationship.count({ where: { professionalId, userId, status: "active" } });
  if (count === 0) {
    throw new ApiHttpError(404, "client_not_found", "This client could not be found");
  }
}

/**
 * The read-gate: has ANY relationship (active or ended) ever existed
 * between this professional and this user? Deliberately distinct from
 * `assertActiveRelationship` above — see this module's own top comment for
 * why a coach's past notes about a former client must stay readable.
 */
async function assertAnyRelationshipEverExisted(professionalId: string, userId: string): Promise<void> {
  const count = await prisma.relationship.count({ where: { professionalId, userId } });
  if (count === 0) {
    throw new ApiHttpError(404, "client_not_found", "This client could not be found");
  }
}

type CoachNoteRow = {
  id: string;
  professionalId: string;
  userId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
};

function toNoteDTO(n: CoachNoteRow) {
  return {
    id: n.id,
    userId: n.userId,
    body: n.body,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}

/** POST /professionals/me/clients/:userId/notes — requires an ACTIVE Relationship. */
export async function createNote(professionalId: string, userId: string, input: CreateCoachNoteInput) {
  await assertActiveRelationship(professionalId, userId);

  const note = (await prisma.coachNote.create({
    data: { professionalId, userId, body: input.body },
  })) as CoachNoteRow;

  await recordAudit({
    actorProfessionalId: professionalId,
    action: "coach_note.created",
    entityType: "CoachNote",
    entityId: note.id,
    metadata: { userId },
  });

  return toNoteDTO(note);
}

/**
 * GET /professionals/me/clients/:userId/notes — every note this coach has
 * ever written about this client, most recent first. Requires only that
 * ANY relationship (active or ended) has ever existed — see this module's
 * top comment.
 */
export async function listNotesForClient(professionalId: string, userId: string) {
  await assertAnyRelationshipEverExisted(professionalId, userId);

  const rows = (await prisma.coachNote.findMany({
    where: { professionalId, userId },
    orderBy: { createdAt: "desc" },
  })) as CoachNoteRow[];

  return { notes: rows.map(toNoteDTO) };
}

/**
 * Shared "does this note exist, is it about a client this coach has ever
 * had a relationship with, and does it belong to THIS coach" gate for
 * update/delete. Returns the real row once every check passes.
 *
 * A note that exists but belongs to a DIFFERENT professional 404s (never
 * 403) — same "don't confirm existence to someone with no business seeing
 * it" precedent as `assertActiveRelationship` — a coach probing another
 * coach's note id learns nothing.
 */
async function loadOwnNoteOrThrow(professionalId: string, userId: string, noteId: string): Promise<CoachNoteRow> {
  await assertAnyRelationshipEverExisted(professionalId, userId);

  const note = (await prisma.coachNote.findUnique({ where: { id: noteId } })) as CoachNoteRow | null;
  if (!note || note.userId !== userId || note.professionalId !== professionalId) {
    throw new ApiHttpError(404, "note_not_found", "This note could not be found");
  }
  return note;
}

/** PATCH /professionals/me/clients/:userId/notes/:noteId — only the note's own author can edit it. */
export async function updateNote(
  professionalId: string,
  userId: string,
  noteId: string,
  input: UpdateCoachNoteInput,
) {
  await loadOwnNoteOrThrow(professionalId, userId, noteId);

  const note = (await prisma.coachNote.update({
    where: { id: noteId },
    data: { body: input.body },
  })) as CoachNoteRow;

  await recordAudit({
    actorProfessionalId: professionalId,
    action: "coach_note.updated",
    entityType: "CoachNote",
    entityId: note.id,
    metadata: { userId },
  });

  return toNoteDTO(note);
}

/** DELETE /professionals/me/clients/:userId/notes/:noteId — only the note's own author can delete it. */
export async function deleteNote(professionalId: string, userId: string, noteId: string): Promise<void> {
  await loadOwnNoteOrThrow(professionalId, userId, noteId);

  await prisma.coachNote.delete({ where: { id: noteId } });

  await recordAudit({
    actorProfessionalId: professionalId,
    action: "coach_note.deleted",
    entityType: "CoachNote",
    entityId: noteId,
    metadata: { userId },
  });
}
