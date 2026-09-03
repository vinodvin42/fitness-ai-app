import type { SubscribeInput, SubscriptionDetail, SubscriptionPlan } from "@fitness-ai-app/types";
import { apiClient } from "./client";

export function fetchPlans() {
  return apiClient.get<{ items: SubscriptionPlan[] }>("/subscription-plans").then((r) => r.data.items);
}

export function fetchCurrentSubscription() {
  return apiClient
    .get<{ subscription: SubscriptionDetail | null }>("/subscriptions/me")
    .then((r) => r.data.subscription);
}

export function fetchSubscriptionHistory() {
  return apiClient.get<{ items: SubscriptionDetail[] }>("/subscriptions/history").then((r) => r.data.items);
}

export function subscribe(input: SubscribeInput) {
  return apiClient.post<SubscriptionDetail>("/subscriptions", input).then((r) => r.data);
}

export function cancelSubscription() {
  return apiClient.post<SubscriptionDetail>("/subscriptions/cancel").then((r) => r.data);
}
