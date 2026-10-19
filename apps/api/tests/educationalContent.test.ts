import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueEmail } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { articleSlug, readMinutesFor } from "../src/lib/articleText";

/**
 * 05.04 Educational Content — the Learn library (Oct 2026). Articles publish
 * only through an approved 05.05 review that names the expert reviewer; text
 * is locked while pending or published; editing a draft clears an earlier
 * sign-off. Real Postgres, no mocked Prisma.
 */
describe("Educational content (Learn)", () => {
  const app = buildApp();
  const password = "LearnAdmin9!";
  const adminIds: string[] = [];
  const userIds: string[] = [];
  const articleIds: string[] = [];
  let authorAuth = "";
  let reviewerAuth = "";
  let supportAuth = "";
  let memberAuth = "";
  let articleId = "";
  let slug = "";

  const BODY = [
    "Sleep is when your muscles repair and your energy comes back.",
    "## Why it matters",
    "- Aim for 7 to 9 hours\n- Keep a regular wake time",
    "Small, steady habits beat big one-off changes. ".repeat(10),
  ].join("\n\n");

  async function adminLogin(role: string, name: string): Promise<string> {
    const email = uniqueEmail(`learn-${role}`);
    const admin = await prisma.adminUser.create({
      data: { email, passwordHash: await hashPassword(password), fullName: name, role, status: "active" } as never,
    });
    adminIds.push(admin.id);
    const login = await request(app).post("/admin/auth/login").send({ email, password });
    return `Bearer ${login.body.token}`;
  }

  async function pendingReviewId(contentId: string): Promise<string> {
    const r = await prisma.contentReview.findFirstOrThrow({ where: { contentType: "article", contentId, status: "pending" } });
    return r.id;
  }

  beforeAll(async () => {
    authorAuth = await adminLogin("operations", "Learn Author");
    reviewerAuth = await adminLogin("operations", "Learn Reviewer");
    supportAuth = await adminLogin("support", "Learn Support");
    const m = await request(app).post("/auth/signup").send({ email: uniqueEmail("learn-member"), password: "SomePassword1!", fullName: "Learn Member" });
    userIds.push(m.body.user.id);
    memberAuth = `Bearer ${m.body.tokens.accessToken}`;
  });

  afterAll(async () => {
    await prisma.contentReview.deleteMany({ where: { contentType: "article", contentId: { in: articleIds } } });
    await prisma.article.deleteMany({ where: { id: { in: articleIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
    await prisma.$disconnect();
  });

  it("read time and slugs", () => {
    expect(readMinutesFor("word ".repeat(199))).toBe(1);
    expect(readMinutesFor("word ".repeat(401))).toBe(3);
    expect(articleSlug("Sleep & Recovery: 5 habits!", "1a2b3c4d-0000")).toBe("sleep-recovery-5-habits-1a2b3c");
  });

  it("creates a draft; support can't; bad input is refused; members don't see drafts", async () => {
    const input = { title: "Sleep and recovery basics", summary: "Why sleep matters for your training.", body: BODY, topic: "sleep" };
    expect((await request(app).post("/admin/articles").set("Authorization", supportAuth).send(input)).status).toBe(403);
    expect((await request(app).post("/admin/articles").set("Authorization", authorAuth).send({ ...input, body: "too short" })).status).toBe(400);
    expect((await request(app).post("/admin/articles").set("Authorization", authorAuth).send({ ...input, coverImageUrl: "http://example.com/a.jpg" })).status).toBe(400);

    const res = await request(app).post("/admin/articles").set("Authorization", authorAuth).send(input);
    expect(res.status).toBe(201);
    articleId = res.body.article.id;
    slug = res.body.article.slug;
    articleIds.push(articleId);
    expect(res.body.article).toMatchObject({ status: "draft", audience: "everyone", authorName: "Learn Author", readMinutes: readMinutesFor(BODY), expertReviewer: null });
    expect(slug).toMatch(/^sleep-and-recovery-basics-[0-9a-f]{6}$/);

    expect((await request(app).get(`/learn/articles/${slug}`).set("Authorization", memberAuth)).status).toBe(404);
    const list = await request(app).get("/learn/articles").set("Authorization", memberAuth);
    expect(list.body.articles.find((a: { slug: string }) => a.slug === slug)).toBeUndefined();
  });

  it("has no direct publish; review is required, the author can't approve, and approval needs the expert", async () => {
    expect((await request(app).post(`/admin/articles/${articleId}/publish`).set("Authorization", authorAuth)).status).toBe(404);

    expect((await request(app).post(`/admin/articles/${articleId}/submit-review`).set("Authorization", authorAuth)).status).toBe(201);
    const reviewId = await pendingReviewId(articleId);

    const locked = await request(app).patch(`/admin/articles/${articleId}`).set("Authorization", authorAuth).send({ summary: "A different summary entirely." });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe("review_pending");
    expect((await request(app).patch(`/admin/articles/${articleId}`).set("Authorization", authorAuth).send({ audience: "beginner" })).status).toBe(200);

    const own = await request(app)
      .post(`/admin/content-reviews/${reviewId}/approve`)
      .set("Authorization", authorAuth)
      .send({ expertReviewerName: "Dr A Rao", expertReviewerCredentials: "MBBS, Sleep Medicine" });
    expect(own.status).toBe(403);

    const noExpert = await request(app).post(`/admin/content-reviews/${reviewId}/approve`).set("Authorization", reviewerAuth).send({});
    expect(noExpert.status).toBe(400);
    expect(noExpert.body.error.code).toBe("expert_reviewer_required");
    expect((await prisma.article.findUniqueOrThrow({ where: { id: articleId } })).status).toBe("draft");

    const ok = await request(app)
      .post(`/admin/content-reviews/${reviewId}/approve`)
      .set("Authorization", reviewerAuth)
      .send({ expertReviewerName: "Dr A Rao", expertReviewerCredentials: "MBBS, Sleep Medicine" });
    expect(ok.status).toBe(200);
    const row = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
    expect(row).toMatchObject({ status: "published", expertReviewerName: "Dr A Rao", expertReviewerCredentials: "MBBS, Sleep Medicine" });
    expect(row.publishedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "article.publish", entityId: articleId } })).toBe(1);
  });

  it("members see it with the reviewer, by topic; opening it counts a view", async () => {
    const list = await request(app).get("/learn/articles").set("Authorization", memberAuth);
    const item = list.body.articles.find((a: { slug: string }) => a.slug === slug);
    expect(item).toMatchObject({ title: "Sleep and recovery basics", topic: "sleep", audience: "beginner", reviewedBy: { name: "Dr A Rao", credentials: "MBBS, Sleep Medicine" } });
    expect(item.body).toBeUndefined();
    expect(list.body.topics.find((t: { topic: string }) => t.topic === "sleep").count).toBeGreaterThanOrEqual(1);

    const bySleep = await request(app).get("/learn/articles?topic=sleep").set("Authorization", memberAuth);
    expect(bySleep.body.articles.some((a: { slug: string }) => a.slug === slug)).toBe(true);
    const byTraining = await request(app).get("/learn/articles?topic=training").set("Authorization", memberAuth);
    expect(byTraining.body.articles.some((a: { slug: string }) => a.slug === slug)).toBe(false);

    const one = await request(app).get(`/learn/articles/${slug}`).set("Authorization", memberAuth);
    expect(one.status).toBe(200);
    expect(one.body.body).toContain("## Why it matters");
    await request(app).get(`/learn/articles/${slug}`).set("Authorization", memberAuth);
    expect((await prisma.article.findUniqueOrThrow({ where: { id: articleId } })).viewCount).toBe(2);
    expect((await request(app).get("/learn/articles")).status).toBe(401);
  });

  it("a published article's text is locked; unpublishing hides it; editing clears the sign-off; it needs a fresh review", async () => {
    const locked = await request(app).patch(`/admin/articles/${articleId}`).set("Authorization", authorAuth).send({ body: `${BODY}\n\nOne more line.` });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe("unpublish_to_edit");
    expect((await request(app).patch(`/admin/articles/${articleId}`).set("Authorization", authorAuth).send({ coverImageUrl: "https://cdn.example.com/sleep.jpg" })).status).toBe(200);

    expect((await request(app).post(`/admin/articles/${articleId}/unpublish`).set("Authorization", authorAuth)).status).toBe(200);
    expect((await request(app).get(`/learn/articles/${slug}`).set("Authorization", memberAuth)).status).toBe(404);

    const edited = await request(app).patch(`/admin/articles/${articleId}`).set("Authorization", authorAuth).send({ body: `${BODY}\n\nOne more line.` });
    expect(edited.status).toBe(200);
    expect(edited.body.article.expertReviewer).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "article.update", entityId: articleId } })).toBeGreaterThanOrEqual(2);

    await request(app).post(`/admin/articles/${articleId}/submit-review`).set("Authorization", authorAuth);
    const reviewId = await pendingReviewId(articleId);
    const rejected = await request(app).post(`/admin/content-reviews/${reviewId}/reject`).set("Authorization", reviewerAuth).send({ reviewNotes: "Cite a source for the 7 to 9 hours." });
    expect(rejected.status).toBe(200);

    const admin = await request(app).get("/admin/articles?status=draft").set("Authorization", authorAuth);
    const row = admin.body.articles.find((a: { id: string }) => a.id === articleId);
    expect(row).toMatchObject({ status: "draft", reviewStatus: "rejected", reviewNotes: "Cite a source for the 7 to 9 hours." });
    expect(admin.body.stats.total).toBeGreaterThanOrEqual(1);

    const detail = await request(app).get(`/admin/articles/${articleId}`).set("Authorization", authorAuth);
    expect(detail.body.article.body).toContain("One more line.");
    expect(detail.body.reviews.map((r: { status: string }) => r.status)).toEqual(["rejected", "approved"]);
  });
});
