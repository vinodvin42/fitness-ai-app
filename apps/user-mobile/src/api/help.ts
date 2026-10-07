import type { HelpArticle, HelpArticleCategory, HelpArticleSummary, HelpCategorySummary } from "@fitness-ai-app/types";
import { apiClient } from "./client";

// Profile & Settings 13 - Help & Support content (GET /help/*).

export function fetchHelpCategories() {
  return apiClient.get<{ categories: HelpCategorySummary[] }>("/help/categories").then((r) => r.data.categories);
}

export function fetchHelpArticles(params: { category?: HelpArticleCategory; search?: string } = {}) {
  return apiClient.get<{ items: HelpArticleSummary[] }>("/help/articles", { params }).then((r) => r.data.items);
}

export function fetchHelpArticle(slug: string) {
  return apiClient.get<HelpArticle>(`/help/articles/${slug}`).then((r) => r.data);
}
