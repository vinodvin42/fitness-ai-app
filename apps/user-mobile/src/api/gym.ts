import type { GymHelpRequestItem, GymHelpTopic, GymMe, GymTodayWorkout } from "@fitness-ai-app/types";
import { apiClient } from "./client";

export const GYM_ME_KEY = ["gym", "me"] as const;
export const GYM_TODAY_KEY = ["gym", "workout", "today"] as const;
export const GYM_HELP_KEY = ["gym", "help-requests"] as const;

/** 404 gym_not_linked when no partner gym is linked. */
export function fetchGymMe() {
  return apiClient.get<GymMe>("/gym/me").then((r) => r.data);
}

export function fetchGymTodayWorkout() {
  return apiClient.get<GymTodayWorkout>("/gym/workout/today").then((r) => r.data);
}

export interface CreateGymHelpInput {
  topic: GymHelpTopic;
  exerciseName?: string;
  workoutName?: string;
  note?: string;
}
export function createGymHelpRequest(input: CreateGymHelpInput) {
  return apiClient.post<{ request: GymHelpRequestItem }>("/gym/help-requests", input).then((r) => r.data.request);
}

export function fetchGymHelpRequests() {
  return apiClient.get<{ items: GymHelpRequestItem[] }>("/gym/help-requests").then((r) => r.data.items);
}
