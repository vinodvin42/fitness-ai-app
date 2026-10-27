import type { CoachFormReview, CoachFormReviewListResponse, ReviewFormAnalysisInput } from "@fitness-ai-app/types";
import { apiClient } from "./client";

/** Coach-side form-analysis review. The server only exposes clips from this professional's ACTIVE clients. */
export function fetchFormReviews() {
  return apiClient.get<CoachFormReviewListResponse>("/professionals/me/form-analysis").then((r) => r.data.items);
}

export function fetchFormReview(id: string) {
  return apiClient.get<CoachFormReview>(`/professionals/me/form-analysis/${id}`).then((r) => r.data);
}

export function submitFormReview(id: string, input: ReviewFormAnalysisInput) {
  return apiClient.post<CoachFormReview>(`/professionals/me/form-analysis/${id}/review`, input).then((r) => r.data);
}
