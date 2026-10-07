import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";

export const HELP_CATEGORIES = ["getting_started", "workouts", "nutrition", "billing", "professionals"] as const;
export type HelpCategoryValue = (typeof HELP_CATEGORIES)[number];

const CATEGORY_LABELS: Record<HelpCategoryValue, string> = {
  getting_started: "Getting Started",
  workouts: "Workouts",
  nutrition: "Nutrition",
  billing: "Billing",
  professionals: "Professionals & refunds",
};

type ArticleRow = { slug: string; category: HelpCategoryValue; title: string; body: string; order: number; updatedAt: Date };

function toSummary(a: ArticleRow) {
  const snippet = a.body.length > 140 ? `${a.body.slice(0, 137).trimEnd()}...` : a.body;
  return { slug: a.slug, category: a.category, title: a.title, snippet };
}

export async function listCategories() {
  const grouped = await prisma.helpArticle.groupBy({ by: ["category"], _count: { _all: true } });
  const counts = new Map(grouped.map((g) => [g.category as HelpCategoryValue, g._count._all]));
  return {
    categories: HELP_CATEGORIES.map((key) => ({ key, label: CATEGORY_LABELS[key], articleCount: counts.get(key) ?? 0 })),
  };
}

export async function listArticles(query: { category?: HelpCategoryValue; search?: string }) {
  const search = query.search?.trim();
  const rows = (await prisma.helpArticle.findMany({
    where: {
      ...(query.category ? { category: query.category } : {}),
      ...(search
        ? { OR: [{ title: { contains: search, mode: "insensitive" } }, { body: { contains: search, mode: "insensitive" } }] }
        : {}),
    },
    orderBy: [{ category: "asc" }, { order: "asc" }],
    take: 100,
  })) as ArticleRow[];
  return { items: rows.map(toSummary) };
}

export async function getArticle(slug: string) {
  const row = (await prisma.helpArticle.findUnique({ where: { slug } })) as ArticleRow | null;
  if (!row) throw new ApiHttpError(404, "help_article_not_found", "Help article not found");
  return { ...toSummary(row), body: row.body, categoryLabel: CATEGORY_LABELS[row.category], updatedAt: row.updatedAt };
}
