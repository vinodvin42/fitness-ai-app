import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";

/**
 * 05.04 Educational Content — the member side of the Learn library (Oct
 * 2026). Only published articles are ever returned; every published article
 * went through an approved review that named the expert who checked it
 * (see schema.prisma's Article and adminPrograms.service.ts). The app shows
 * the Learn entry only once this list has something in it.
 */

export const ARTICLE_TOPICS = ["training", "nutrition", "recovery", "sleep", "mindset"] as const;
export type ArticleTopicName = (typeof ARTICLE_TOPICS)[number];

type ArticleRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body?: string;
  topic: string;
  audience: string;
  readMinutes: number;
  coverImageUrl: string | null;
  publishedAt: Date | null;
  expertReviewerName: string | null;
  expertReviewerCredentials: string | null;
  expertReviewedAt: Date | null;
};

function toSummary(a: ArticleRow) {
  return {
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    topic: a.topic,
    audience: a.audience,
    readMinutes: a.readMinutes,
    coverImageUrl: a.coverImageUrl,
    publishedAt: a.publishedAt,
    reviewedBy:
      a.expertReviewerName && a.expertReviewedAt
        ? { name: a.expertReviewerName, credentials: a.expertReviewerCredentials, reviewedAt: a.expertReviewedAt }
        : null,
  };
}

export async function listArticles(query: { topic?: ArticleTopicName }) {
  const [rows, byTopic] = await Promise.all([
    prisma.article.findMany({
      where: { status: "published", ...(query.topic ? { topic: query.topic } : {}) },
      orderBy: { publishedAt: "desc" },
      take: 200,
    }),
    prisma.article.groupBy({ by: ["topic"], where: { status: "published" }, _count: { _all: true } }),
  ]);
  return {
    articles: (rows as ArticleRow[]).map(toSummary),
    // Topics that have at least one published article, in a fixed order.
    topics: ARTICLE_TOPICS.map((topic) => ({
      topic,
      count: (byTopic as Array<{ topic: string; _count: { _all: number } }>).find((t) => t.topic === topic)?._count._all ?? 0,
    })).filter((t) => t.count > 0),
  };
}

/** Opening an article counts one view (05.04's "Views" column). */
export async function getArticle(slug: string) {
  const existing = await prisma.article.findUnique({ where: { slug }, select: { id: true, status: true } });
  if (!existing || existing.status !== "published") {
    throw new ApiHttpError(404, "article_not_found", "Article not found");
  }
  const a = (await prisma.article.update({ where: { id: existing.id }, data: { viewCount: { increment: 1 } } })) as ArticleRow;
  return { ...toSummary(a), body: a.body ?? "" };
}
