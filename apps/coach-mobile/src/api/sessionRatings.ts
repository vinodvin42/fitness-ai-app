import { apiClient } from "./client";

/**
 * Session feedback (24 Oct 2026, Figma coach/11 on the member side): the
 * member's private rating of a session they had with you. Only you see it;
 * it is never shown publicly or used to rank coaches.
 */
export interface SessionRatingItem {
  bookingId: string;
  clientFullName: string;
  scheduledAt: string;
  stars: number;
  tags: string[];
  comment: string | null;
  updatedAt: string;
}

export interface SessionRatingList {
  count: number;
  average: number | null;
  items: SessionRatingItem[];
}

export function fetchMyRatings(clientId?: string) {
  return apiClient
    .get<SessionRatingList>("/professionals/me/ratings", { params: clientId ? { clientId } : undefined })
    .then((r) => r.data);
}

export const RATING_TAG_LABEL: Record<string, string> = {
  clear_guidance: "Clear guidance",
  on_time: "On time",
  useful_plan_changes: "Useful plan changes",
  good_listener: "Good listener",
};
