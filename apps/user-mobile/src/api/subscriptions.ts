import type { SubscribeInput, SubscriptionDetail, SubscriptionPlan } from "@fitness-ai-app/types";
import { apiClient } from "./client";
import { freePlanNeverEnds } from "../lib/planLineup";

export function fetchPlans() {
  return apiClient.get<{ items: SubscriptionPlan[] }>("/subscription-plans").then((r) => r.data.items);
}

export function fetchCurrentSubscription() {
  return apiClient
    .get<{ subscription: SubscriptionDetail | null }>("/subscriptions/me")
    .then((r) => (r.data.subscription ? freePlanNeverEnds(r.data.subscription) : null));
}

export function fetchSubscriptionHistory() {
  return apiClient.get<{ items: SubscriptionDetail[] }>("/subscriptions/history").then((r) => r.data.items);
}

export function subscribe(input: SubscribeInput) {
  return apiClient.post<SubscriptionDetail>("/subscriptions", input).then((r) => r.data);
}

/** Figma payments/07 "Why are you leaving?" (24 Oct 2026); same values as the API's CANCEL_REASONS. */
export type CancelReason = "too_expensive" | "not_using" | "no_value" | "technical" | "break" | "other";

export function cancelSubscription(input: { reason?: CancelReason; comment?: string } = {}) {
  return apiClient.post<SubscriptionDetail>("/subscriptions/cancel", input).then((r) => r.data);
}
