import type { ArticleTopic, LearnArticle, LearnArticleListResponse } from "@fitness-ai-app/types";
import { apiClient } from "./client";

// 05.04 Educational Content (Oct 2026) — the Learn library (GET /learn/*).
// Published, expert-reviewed articles only.

export function fetchLearnArticles(topic?: ArticleTopic) {
  return apiClient.get<LearnArticleListResponse>("/learn/articles", { params: { topic } }).then((r) => r.data);
}

/** Opening an article counts one view. */
export function fetchLearnArticle(slug: string) {
  return apiClient.get<LearnArticle>(`/learn/articles/${slug}`).then((r) => r.data);
}
