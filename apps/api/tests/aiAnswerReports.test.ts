import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { HIDDEN_ANSWER_TEXT } from "../src/modules/aiCoach/aiCoach.service";

// The provider is faked (no network); everything else is the real app + Postgres.
const generate = vi.fn<(prompt: string) => Promise<string>>();
vi.mock("../src/lib/aiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/aiClient")>();
  return { ...actual, isAiConfigured: () => true, generateCompletion: (p: string) => generate(p) };
});

/**
 * AI Safety / Overrides (admin 11.03, Oct 2026): people report an AI Coach
 * answer in the app (Google Play's generative-AI rule), staff with
 * `sensitiveData` review it, and a hidden answer leaves the chat and the AI's
 * history. Real Postgres, no mocked Prisma.
 */
describe("AI answer reports", () => {
  const app = buildApp();
  const password = "AiSafetyAdmin9!";
  const userIds: string[] = [];
  const adminIds: string[] = [];
  let userId = "";
  let userAuth = "";
  let otherAuth = "";
  let safetyAuth = "";
  let supportAuth = "";
  let coFounderAuth = "";
  let safetyAdminId = "";

  async function adminLogin(role: string): Promise<{ auth: string; id: string }> {
    const email = uniqueEmail(`ais-${role}`);
    const admin = await prisma.adminUser.create({
      data: { email, passwordHash: await hashPassword(password), fullName: `AIS ${role}`, role, status: "active" } as never,
    });
    adminIds.push(admin.id);
    const login = await request(app).post("/admin/auth/login").send({ email, password });
    return { auth: `Bearer ${login.body.token}`, id: admin.id };
  }

  async function signup(prefix: string) {
    const res = await request(app).post("/auth/signup").send({ email: uniqueEmail(prefix), password: "SomePassword1!", fullName: "AIS Tester" });
    userIds.push(res.body.user.id);
    return { auth: `Bearer ${res.body.tokens.accessToken}`, id: res.body.user.id as string };
  }

  /** Sends a question and returns the assistant reply's id. */
  async function ask(auth: string, content: string, reply: string): Promise<string> {
    generate.mockResolvedValueOnce(reply);
    const res = await request(app).post("/ai-coach/messages").set("Authorization", auth).send({ content });
    expect(res.status).toBe(201);
    return res.body.assistantMessage.id;
  }

  beforeAll(async () => {
    const u = await signup("ais-user");
    userId = u.id;
    userAuth = u.auth;
    otherAuth = (await signup("ais-other")).auth;
    const safety = await adminLogin("safety_privacy");
    safetyAuth = safety.auth;
    safetyAdminId = safety.id;
    supportAuth = (await adminLogin("support")).auth;
    coFounderAuth = (await adminLogin("co_founder")).auth;
  });

  beforeEach(() => {
    generate.mockReset();
    generate.mockResolvedValue("Fine.");
  });

  afterAll(async () => {
    await prisma.aiAnswerReport.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
    await prisma.$disconnect();
  });

  describe("reporting from the app", () => {
    it("copies the question and answer; reporting again returns the same report", async () => {
      const answerId = await ask(userAuth, "Can I fast for 4 days?", "Yes, skip all food for 4 days.");
      const first = await request(app)
        .post(`/ai-coach/messages/${answerId}/report`)
        .set("Authorization", userAuth)
        .send({ reason: "unsafe_or_harmful", note: "That sounds dangerous" });
      expect(first.status).toBe(201);
      expect(first.body.status).toBe("open");
      const again = await request(app).post(`/ai-coach/messages/${answerId}/report`).set("Authorization", userAuth).send({ reason: "other" });
      expect(again.body.id).toBe(first.body.id);

      const row = await prisma.aiAnswerReport.findUniqueOrThrow({ where: { id: first.body.id } });
      expect(row).toMatchObject({
        userId,
        messageId: answerId,
        questionText: "Can I fast for 4 days?",
        answerText: "Yes, skip all food for 4 days.",
        reason: "unsafe_or_harmful",
        note: "That sounds dangerous",
      });
      expect(await prisma.auditLog.count({ where: { action: "ai_answer_report.created", entityId: first.body.id } })).toBe(1);
    });

    it("only your own AI answers can be reported, with a known reason", async () => {
      const answerId = await ask(userAuth, "Protein ideas?", "Eggs.");
      expect((await request(app).post(`/ai-coach/messages/${answerId}/report`).set("Authorization", otherAuth).send({ reason: "offensive" })).status).toBe(404);
      const question = await prisma.aiCoachMessage.findFirstOrThrow({ where: { userId, role: "user", content: "Protein ideas?" } });
      expect((await request(app).post(`/ai-coach/messages/${question.id}/report`).set("Authorization", userAuth).send({ reason: "offensive" })).status).toBe(404);
      expect((await request(app).post(`/ai-coach/messages/${answerId}/report`).set("Authorization", userAuth).send({ reason: "rude" })).status).toBe(400);
      expect((await request(app).post(`/ai-coach/messages/${answerId}/report`).send({ reason: "offensive" })).status).toBe(401);
    });
  });

  describe("admin queue (11.03)", () => {
    it("needs sensitiveData: support and co-founder get 403; safety/privacy sees stats with no message text", async () => {
      expect((await request(app).get("/admin/ai-ops/reports").set("Authorization", supportAuth)).status).toBe(403);
      expect((await request(app).get("/admin/ai-ops/reports").set("Authorization", coFounderAuth)).status).toBe(403);

      const res = await request(app).get("/admin/ai-ops/reports?status=open").set("Authorization", safetyAuth);
      expect(res.status).toBe(200);
      expect(res.body.stats.open).toBeGreaterThanOrEqual(1);
      expect(res.body.stats.answersThisWeek).toBeGreaterThanOrEqual(2);
      expect(res.body.notAvailable).toEqual(["aiAutoFlagging"]);
      const mine = res.body.reports.find((r: { hasNote: boolean; reason: string }) => r.reason === "unsafe_or_harmful" && r.hasNote);
      expect(mine).toBeTruthy();
      expect(mine.answerStillInChat).toBe(true);
      expect(JSON.stringify(res.body.reports)).not.toContain("skip all food");
    });

    it("opening a report shows the conversation text and is audit-logged; support can't open it", async () => {
      const report = await prisma.aiAnswerReport.findFirstOrThrow({ where: { userId, reason: "unsafe_or_harmful" } });
      expect((await request(app).get(`/admin/ai-ops/reports/${report.id}`).set("Authorization", supportAuth)).status).toBe(403);
      const res = await request(app).get(`/admin/ai-ops/reports/${report.id}`).set("Authorization", safetyAuth);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ question: "Can I fast for 4 days?", answer: "Yes, skip all food for 4 days.", answerHidden: false });
      expect(await prisma.auditLog.count({ where: { action: "ai_answer_report.viewed", entityId: report.id, actorAdminId: safetyAdminId } })).toBe(1);
      expect((await request(app).get("/admin/ai-ops/reports/00000000-0000-0000-0000-000000000000").set("Authorization", safetyAuth)).status).toBe(404);
    });

    it("hiding an answer replaces it in the chat, drops it from the AI's history, logs the override and tells the user", async () => {
      const report = await prisma.aiAnswerReport.findFirstOrThrow({ where: { userId, reason: "unsafe_or_harmful" } });
      expect(
        (await request(app).post(`/admin/ai-ops/reports/${report.id}/resolve`).set("Authorization", safetyAuth).send({ action: "hide_answer", reason: "short" }))
          .status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .post(`/admin/ai-ops/reports/${report.id}/resolve`)
            .set("Authorization", supportAuth)
            .send({ action: "hide_answer", reason: "Unsafe fasting advice" })
        ).status,
      ).toBe(403);

      const res = await request(app)
        .post(`/admin/ai-ops/reports/${report.id}/resolve`)
        .set("Authorization", safetyAuth)
        .send({ action: "hide_answer", reason: "Unsafe fasting advice" });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("answer_hidden");

      const thread = await request(app).get("/ai-coach/messages").set("Authorization", userAuth);
      const hidden = thread.body.messages.find((m: { id: string }) => m.id === report.messageId);
      expect(hidden).toMatchObject({ role: "assistant", content: HIDDEN_ANSWER_TEXT, hidden: true });
      expect(hidden.sources).toBeUndefined();

      await ask(userAuth, "And now?", "Eat regular meals.");
      const prompt = generate.mock.calls.at(-1)![0];
      expect(prompt).toContain("Can I fast for 4 days?");
      expect(prompt).not.toContain("skip all food");

      const list = await request(app).get("/admin/ai-ops/reports").set("Authorization", safetyAuth);
      const override = list.body.overrides.find((o: { note: string | null }) => o.note === "Unsafe fasting advice");
      expect(override).toMatchObject({ action: "ai_answer.hidden", note: "Unsafe fasting advice", byName: "AIS safety_privacy" });
      const notice = await prisma.notification.findFirst({ where: { userId, title: "About the AI Coach answer you reported" } });
      expect(notice?.body).toContain("removed it from your chat");

      const twice = await request(app)
        .post(`/admin/ai-ops/reports/${report.id}/resolve`)
        .set("Authorization", safetyAuth)
        .send({ action: "reviewed", reason: "Changed my mind on this" });
      expect(twice.status).toBe(409);
    });

    it("marking reviewed leaves the answer in place; a report survives Clear conversation", async () => {
      const answerId = await ask(userAuth, "Is creatine ok?", "Creatine is well studied.");
      const created = await request(app).post(`/ai-coach/messages/${answerId}/report`).set("Authorization", userAuth).send({ reason: "medically_wrong" });
      const res = await request(app)
        .post(`/admin/ai-ops/reports/${created.body.id}/resolve`)
        .set("Authorization", safetyAuth)
        .send({ action: "reviewed", reason: "Answer is accurate and general" });
      expect(res.body.status).toBe("reviewed");
      const msg = await prisma.aiCoachMessage.findUniqueOrThrow({ where: { id: answerId } });
      expect(msg.hiddenAt).toBeNull();
      expect(await prisma.auditLog.count({ where: { action: "ai_answer_report.reviewed", entityId: created.body.id } })).toBe(1);

      expect((await request(app).delete("/ai-coach/messages").set("Authorization", userAuth)).status).toBe(200);
      const kept = await prisma.aiAnswerReport.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(kept.messageId).toBeNull();
      expect(kept.answerText).toBe("Creatine is well studied.");
      const detail = await request(app).get(`/admin/ai-ops/reports/${created.body.id}`).set("Authorization", safetyAuth);
      expect(detail.body).toMatchObject({ answerStillInChat: false, answer: "Creatine is well studied.", reviewNote: "Answer is accurate and general" });
    });
  });
});
