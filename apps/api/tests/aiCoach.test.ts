import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";

// The provider is faked (no network); everything else is the real app + Postgres.
const generate = vi.fn<(prompt: string) => Promise<string>>();
vi.mock("../src/lib/aiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/aiClient")>();
  return { ...actual, isAiConfigured: () => true, generateCompletion: (p: string) => generate(p) };
});

/** AI Coach (Figma AI 01-04): persisted "Why this?" sources, idempotent retry, quota, clear conversation. */
describe("AI Coach", () => {
  const app = buildApp();
  const ids: string[] = [];
  let token: string;
  let userId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function signup(prefix: string) {
    const res = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail(prefix), password: "SomePassword1!", fullName: "Coach Tester" });
    ids.push(res.body.user.id);
    return { token: res.body.tokens.accessToken as string, id: res.body.user.id as string };
  }

  beforeAll(async () => {
    const u = await signup("aicoach");
    token = u.token;
    userId = u.id;
  });

  beforeEach(async () => {
    generate.mockReset();
    generate.mockResolvedValue("Try Greek yogurt.");
    await prisma.aiCoachMessage.deleteMany({ where: { userId } });
    await prisma.mealLog.deleteMany({ where: { userId } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it("stores only the context actually injected as sources on the reply, and none when there was none", async () => {
    const bare = await request(app).post("/ai-coach/messages").set(auth()).send({ content: "hello" });
    expect(bare.status).toBe(201);
    expect(bare.body.assistantMessage.sources).toBeUndefined();

    await prisma.mealLog.create({ data: { userId, mealType: "lunch", name: "Chicken", calories: 400, proteinG: 42 } });
    const res = await request(app).post("/ai-coach/messages").set(auth()).send({ content: "what to eat?" });
    expect(res.status).toBe(201);
    expect(res.body.assistantMessage.sources).toEqual([
      { kind: "protein_today", label: "Protein logged today", value: "42 g across 1 food log" },
    ]);
    // ...and the same fact really was in the prompt.
    expect(generate.mock.calls.at(-1)![0]).toContain("Protein logged today: 42 g");

    const list = await request(app).get("/ai-coach/messages").set(auth());
    const assistant = list.body.messages.filter((m: { role: string }) => m.role === "assistant");
    expect(assistant[0].sources).toBeUndefined();
    expect(assistant[1].sources).toHaveLength(1);
    expect(list.body.messages.find((m: { role: string }) => m.role === "user").sources).toBeUndefined();
  });

  it("retry with the same clientId after a failed reply does not duplicate the user message or double-count quota", async () => {
    generate.mockRejectedValueOnce(new Error("provider down"));
    const failed = await request(app).post("/ai-coach/messages").set(auth()).send({ content: "draft", clientId: "c-1" });
    expect(failed.status).toBe(503);
    expect(failed.body.error.code).toBe("ai_unavailable");

    // Failed attempt: hidden from the thread and free against the quota.
    expect((await request(app).get("/ai-coach/messages").set(auth())).body.messages).toHaveLength(0);
    expect((await request(app).get("/ai-coach/usage").set(auth())).body.used).toBe(0);

    const retry = await request(app).post("/ai-coach/messages").set(auth()).send({ content: "draft", clientId: "c-1" });
    expect(retry.status).toBe(201);
    expect(await prisma.aiCoachMessage.count({ where: { userId, role: "user" } })).toBe(1);
    expect((await request(app).get("/ai-coach/usage").set(auth())).body.used).toBe(1);

    // A repeat of an already-answered send returns the stored pair; no new generation, no extra quota.
    const callsBefore = generate.mock.calls.length;
    const again = await request(app).post("/ai-coach/messages").set(auth()).send({ content: "draft", clientId: "c-1" });
    expect(again.status).toBe(201);
    expect(again.body.assistantMessage.id).toBe(retry.body.assistantMessage.id);
    expect(generate.mock.calls.length).toBe(callsBefore);
    expect(await prisma.aiCoachMessage.count({ where: { userId } })).toBe(2);
    expect((await request(app).get("/ai-coach/usage").set(auth())).body.used).toBe(1);
  });

  it("enforces the daily limit with 429 ai_limit_reached details", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await request(app).post("/ai-coach/messages").set(auth()).send({ content: `m${i}`, clientId: `q-${i}` })).status).toBe(201);
    }
    const over = await request(app).post("/ai-coach/messages").set(auth()).send({ content: "one more", clientId: "q-5" });
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe("ai_limit_reached");
    expect(over.body.error.details.limit).toBe(5);
    expect(await prisma.aiCoachMessage.count({ where: { userId, content: "one more" } })).toBe(0);
  });

  it("DELETE /ai-coach/messages clears only the caller's conversation", async () => {
    const other = await signup("aicoach-other");
    await request(app).post("/ai-coach/messages").set(auth()).send({ content: "mine" });
    await request(app)
      .post("/ai-coach/messages")
      .set({ Authorization: `Bearer ${other.token}` })
      .send({ content: "theirs" });

    expect((await request(app).delete("/ai-coach/messages")).status).toBe(401);
    const res = await request(app).delete("/ai-coach/messages").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(2);
    expect((await request(app).get("/ai-coach/messages").set(auth())).body.messages).toHaveLength(0);
    expect(await prisma.aiCoachMessage.count({ where: { userId: other.id } })).toBe(2);
  });
});
