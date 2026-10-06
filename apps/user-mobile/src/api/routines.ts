import type {
  CreateRoutineInput,
  DeleteResult,
  Routine,
  RoutineListResponse,
  StartRoutineResponse,
  UpdateRoutineInput,
} from "@fitness-ai-app/types";
import { apiClient } from "./client";

export const ROUTINES_KEY = ["routines"] as const;

export function fetchRoutines() {
  return apiClient.get<RoutineListResponse>("/routines").then((r) => r.data.items);
}

export function fetchRoutine(id: string) {
  return apiClient.get<Routine>(`/routines/${id}`).then((r) => r.data);
}

export function createRoutine(input: CreateRoutineInput) {
  return apiClient.post<Routine>("/routines", input).then((r) => r.data);
}

export function updateRoutine(id: string, input: UpdateRoutineInput) {
  return apiClient.patch<Routine>(`/routines/${id}`, input).then((r) => r.data);
}

export function deleteRoutine(id: string) {
  return apiClient.delete<DeleteResult>(`/routines/${id}`).then((r) => r.data);
}

export function startRoutine(id: string) {
  return apiClient.post<StartRoutineResponse>(`/routines/${id}/start`).then((r) => r.data);
}
