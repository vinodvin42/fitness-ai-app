import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { signProfessionalAccessToken } from "../src/lib/professionalJwt";

/**
 * Coach Private Notes (R2 Wave 3, 20 Sep 2026) — GET/POST/PATCH/DELETE
 * /professionals/me/clients/:userId/notes(/:noteId). See
 * coachNotes.service.ts's doc comment for the full design: an asymmetric
 * active-vs-any-relationship gate (create needs an active Relationship,
 * read doesn't) and cross-coach isolation on (professionalId, userId).
 *
 * The final describe block below is this feature's own load-bearing
 * guarantee: CoachNote content must never reach a User-authed (consumer)
 * endpoint. There's no endpoint anywhere in this codebase that joins
 * User-scoped reads against CoachNote (verified by inspection — see
 * coachNotes.service.ts's own doc comment) — this suite proves that
 * directly against the two real endpoints a client could plausibly reach
 * that already return data ABOUT this same coach/client pairing (the
 * consumer "My Professional Team" list and the real Coach Message thread),
 * asserting the note's own body text never appears in either response.
 */
describe("Coach Private Notes", () => {
  const app = buildApp();
  let userId: string;
  let userAccessToken: string;
  let professionalId: string;
  let professionalAccessToken: string;
  let otherProfessionalId: string;
  let otherProfessionalAccessToken: string;

  beforeAll(async () => {
    const userEmail = uniqueEmail("coachnotes-user");
    const signupRes = await request(app)
      .post("/auth/signup")
      .send({ email: userEmail, password: "SomePassword1!", fullName: "Notes Test Client" });
    userId = signupRes.body.user.id;
    userAccessToken = signupRes.body.tokens.accessToken;

    const suffix = uniqueSuffix();

    const professional = await prisma.professional.create({
      data: {
        email: `coach-notes-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Test Fixture Coach Notes",
        status: "active",
      },
    });
    professionalId = professional.id;
    professionalAccessToken = signProfessionalAccessToken({ sub: professionalId, email: professional.email }).token;

    // A second, unrelated professional — cross-coach isolation + 404-not-403.
    const otherProfessional = await prisma.professional.create({
      data: {
        email: `coach-notes-other-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Unrelated Fixture Coach",
        status: "active",
      },
    });
    otherProfessionalId = otherProfessional.id;
    otherProfessionalAccessToken = signProfessionalAccessToken({
      sub: otherProfessionalId,
      email: otherProfessional.email,
    }).token;
  });

  afterAll(async () => {
    await prisma.coachNote.deleteMany({ where: { userId } });
    await prisma.coachMessage.deleteMany({ where: { userId } });
    await prisma.relationship.deleteMany({ where: { userId, professionalId: { in: [professionalId, otherProfessionalId] } } });
    await prisma.professional.deleteMany({ where: { id: { in: [professionalId, otherProfessionalId] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("401s without professional auth", async () => {
    const res = await request(app).get(`/professionals/me/clients/${userId}/notes`);
    expect(res.status).toBe(401);
  });

  it("404s creating or listing notes with no Relationship at all", async () => {
    const create = await request(app)
      .post(`/professionals/me/clients/${userId}/notes`)
      .set("Authorization", `Bearer ${professionalAccessToken}`)
      .send({ body: "Struggles with morning sessions." });
    expect(create.status).toBe(404);
    expect(create.body.error.code).toBe("client_not_found");

    const list = await request(app)
      .get(`/professionals/me/clients/${userId}/notes`)
      .set("Authorization", `Bearer ${professionalAccessToken}`);
    expect(list.status).toBe(404);
    expect(list.body.error.code).toBe("client_not_found");
  });

  let noteId: string;

  describe("once a real active Relationship exists", () => {
    beforeAll(async () => {
      await prisma.relationship.create({
        data: { userId, professionalId, serviceType: "fitness", status: "active" },
      });
    });

    it("creates a note, persists it, and lists it back", async () => {
      const create = await request(app)
        .post(`/professionals/me/clients/${userId}/notes`)
        .set("Authorization", `Bearer ${professionalAccessToken}`)
        .send({ body: "Prefers low-impact cardio; had knee surgery in 2023." });
      expect(create.status).toBe(201);
      expect(create.body.body).toBe("Prefers low-impact cardio; had knee surgery in 2023.");
      noteId = create.body.id;

      // Cross-check directly against Postgres, not just the HTTP response.
      const dbNote = await prisma.coachNote.findUnique({ where: { id: noteId } });
      expect(dbNote).not.toBeNull();
      expect(dbNote?.professionalId).toBe(professionalId);
      expect(dbNote?.userId).toBe(userId);
      expect(dbNote?.body).toBe("Prefers low-impact cardio; had knee surgery in 2023.");

      const list = await request(app)
        .get(`/professionals/me/clients/${userId}/notes`)
        .set("Authorization", `Bearer ${professionalAccessToken}`);
      expect(list.status).toBe(200);
      expect(list.body.notes).toHaveLength(1);
      expect(list.body.notes[0].id).toBe(noteId);

      const audit = await prisma.auditLog.findFirst({
        where: { entityType: "CoachNote", entityId: noteId, action: "coach_note.created" },
      });
      expect(audit?.actorProfessionalId).toBe(professionalId);
    });

    it("rejects an empty note body", async () => {
      const res = await request(app)
        .post(`/professionals/me/clients/${userId}/notes`)
        .set("Authorization", `Bearer ${professionalAccessToken}`)
        .send({ body: "   " });
      expect(res.status).toBe(400);
    });

    it("a DIFFERENT professional with no relationship to this user gets 404, not this coach's notes", async () => {
      const res = await request(app)
        .get(`/professionals/me/clients/${userId}/notes`)
        .set("Authorization", `Bearer ${otherProfessionalAccessToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("client_not_found");
    });

    it("cross-coach isolation: a different professional (even with their OWN active relationship to this user) can't edit or delete this note", async () => {
      // Give the other professional their own real active relationship to
      // the same client, via a different real service type — proves the
      // block is about note ownership, not merely "no relationship at all".
      await prisma.relationship.create({
        data: { userId, professionalId: otherProfessionalId, serviceType: "nutrition", status: "active" },
      });

      const update = await request(app)
        .patch(`/professionals/me/clients/${userId}/notes/${noteId}`)
        .set("Authorization", `Bearer ${otherProfessionalAccessToken}`)
        .send({ body: "Overwritten by an unrelated coach." });
      expect(update.status).toBe(404);
      expect(update.body.error.code).toBe("note_not_found");

      const del = await request(app)
        .delete(`/professionals/me/clients/${userId}/notes/${noteId}`)
        .set("Authorization", `Bearer ${otherProfessionalAccessToken}`);
      expect(del.status).toBe(404);

      // The other professional's own notes list for this client is real but
      // empty — they don't see this coach's note either.
      const otherList = await request(app)
        .get(`/professionals/me/clients/${userId}/notes`)
        .set("Authorization", `Bearer ${otherProfessionalAccessToken}`);
      expect(otherList.status).toBe(200);
      expect(otherList.body.notes).toHaveLength(0);

      // Untouched in Postgres.
      const dbNote = await prisma.coachNote.findUnique({ where: { id: noteId } });
      expect(dbNote?.body).toBe("Prefers low-impact cardio; had knee surgery in 2023.");

      await prisma.relationship.deleteMany({ where: { userId, professionalId: otherProfessionalId } });
    });

    it("the note's own author can update it", async () => {
      const res = await request(app)
        .patch(`/professionals/me/clients/${userId}/notes/${noteId}`)
        .set("Authorization", `Bearer ${professionalAccessToken}`)
        .send({ body: "Updated: prefers low-impact cardio, cleared for light jogging as of this week." });
      expect(res.status).toBe(200);
      expect(res.body.body).toBe("Updated: prefers low-impact cardio, cleared for light jogging as of this week.");

      const dbNote = await prisma.coachNote.findUnique({ where: { id: noteId } });
      expect(dbNote?.body).toBe("Updated: prefers low-impact cardio, cleared for light jogging as of this week.");

      const audit = await prisma.auditLog.findFirst({
        where: { entityType: "CoachNote", entityId: noteId, action: "coach_note.updated" },
      });
      expect(audit).not.toBeNull();
    });

    it("ending the relationship does NOT hide the note from a read, but DOES block creating a new one", async () => {
      await prisma.relationship.updateMany({
        where: { userId, professionalId },
        data: { status: "ended", endedAt: new Date() },
      });

      // Read still works — a coach's own historical notes about a former
      // client stay readable (the active-vs-any-relationship distinction).
      const list = await request(app)
        .get(`/professionals/me/clients/${userId}/notes`)
        .set("Authorization", `Bearer ${professionalAccessToken}`);
      expect(list.status).toBe(200);
      expect(list.body.notes).toHaveLength(1);
      expect(list.body.notes[0].id).toBe(noteId);

      // But a brand-new note can't be started without an active relationship.
      const create = await request(app)
        .post(`/professionals/me/clients/${userId}/notes`)
        .set("Authorization", `Bearer ${professionalAccessToken}`)
        .send({ body: "A new note attempted after the relationship ended." });
      expect(create.status).toBe(404);
      expect(create.body.error.code).toBe("client_not_found");

      // Update/delete of the EXISTING note still work — same "own historical
      // record" reasoning as read; only NEW notes are gated on active.
      const update = await request(app)
        .patch(`/professionals/me/clients/${userId}/notes/${noteId}`)
        .set("Authorization", `Bearer ${professionalAccessToken}`)
        .send({ body: "Edited after the relationship ended — still my own record." });
      expect(update.status).toBe(200);

      const del = await request(app)
        .delete(`/professionals/me/clients/${userId}/notes/${noteId}`)
        .set("Authorization", `Bearer ${professionalAccessToken}`);
      expect(del.status).toBe(204);

      const dbNote = await prisma.coachNote.findUnique({ where: { id: noteId } });
      expect(dbNote).toBeNull();

      const audit = await prisma.auditLog.findFirst({
        where: { entityType: "CoachNote", entityId: noteId, action: "coach_note.deleted" },
      });
      expect(audit).not.toBeNull();

      // Re-activate the relationship for the exposure suite below.
      await prisma.relationship.updateMany({
        where: { userId, professionalId },
        data: { status: "active", endedAt: null },
      });
    });
  });

  describe("CoachNote content is never exposed to the client through any existing endpoint", () => {
    const secretNoteBody = "CONFIDENTIAL-COACH-OBSERVATION-never-shown-to-client-xyz123";
    let exposureNoteId: string;

    beforeAll(async () => {
      const create = await request(app)
        .post(`/professionals/me/clients/${userId}/notes`)
        .set("Authorization", `Bearer ${professionalAccessToken}`)
        .send({ body: secretNoteBody });
      expect(create.status).toBe(201);
      exposureNoteId = create.body.id;

      // Also exercise real 2-way CoachMessage on the SAME (user, professional)
      // pair, so the messaging thread response has real content to compare
      // against — proving the note body specifically never leaks into it,
      // not just that the thread happens to be empty.
      await request(app)
        .post(`/coaching/conversations/${professionalId}`)
        .set("Authorization", `Bearer ${userAccessToken}`)
        .send({ content: "Hi coach, real message content for comparison." });
    });

    afterAll(async () => {
      await prisma.coachNote.deleteMany({ where: { id: exposureNoteId } });
    });

    it("does not appear in the consumer 'My Professional Team' list", async () => {
      const res = await request(app).get("/coaching/team").set("Authorization", `Bearer ${userAccessToken}`);
      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(secretNoteBody);
      expect(body.toLowerCase()).not.toContain("coachnote");
    });

    it("does not appear in the consumer Coach Message thread with the same professional", async () => {
      const res = await request(app)
        .get(`/coaching/conversations/${professionalId}`)
        .set("Authorization", `Bearer ${userAccessToken}`);
      expect(res.status).toBe(200);
      // The real message sent above IS present (sanity check the response
      // isn't just empty) — but the private note's content is not.
      const body = JSON.stringify(res.body);
      expect(body).toContain("real message content for comparison");
      expect(body).not.toContain(secretNoteBody);
      expect(body.toLowerCase()).not.toContain("coachnote");
    });

    it("does not appear in the consumer professional detail endpoint", async () => {
      const res = await request(app)
        .get(`/coaching/professionals/${professionalId}`)
        .set("Authorization", `Bearer ${userAccessToken}`);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(secretNoteBody);
      expect(body.toLowerCase()).not.toContain("coachnote");
    });

    it("has no route reachable with a User (not Professional) Bearer token at all", async () => {
      const res = await request(app)
        .get(`/professionals/me/clients/${userId}/notes`)
        .set("Authorization", `Bearer ${userAccessToken}`);
      // requireProfessionalAuth rejects a User-issued JWT outright.
      expect(res.status).toBe(401);
    });
  });
});
