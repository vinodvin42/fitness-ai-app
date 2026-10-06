import type {
  CreateFormAnalysisInput,
  FormAnalysisListResponse,
  FormAnalysisSubmission,
} from "@fitness-ai-app/types";
import { apiClient } from "./client";

export function fetchFormSubmissions() {
  return apiClient.get<FormAnalysisListResponse>("/form-analysis").then((r) => r.data.items);
}

export function fetchFormSubmission(id: string) {
  return apiClient.get<FormAnalysisSubmission>(`/form-analysis/${id}`).then((r) => r.data);
}

export function createFormSubmission(input: CreateFormAnalysisInput) {
  return apiClient.post<FormAnalysisSubmission>("/form-analysis", input).then((r) => r.data);
}
