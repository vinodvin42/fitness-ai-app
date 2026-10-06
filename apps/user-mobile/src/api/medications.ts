import type {
  CreateMedicationInput,
  LogMedicationDoseInput,
  Medication,
  MedicationAdherence,
  MedicationDose,
  MedicationDueResponse,
  MedicationsResponse,
  UpdateMedicationInput,
} from "@fitness-ai-app/types";
import { apiClient } from "./client";

export function fetchMedications() {
  return apiClient.get<MedicationsResponse>("/medications").then((r) => r.data.items);
}

export function createMedication(input: CreateMedicationInput) {
  return apiClient.post<Medication>("/medications", input).then((r) => r.data);
}

export function updateMedication(id: string, input: UpdateMedicationInput) {
  return apiClient.patch<Medication>(`/medications/${id}`, input).then((r) => r.data);
}

export function deleteMedication(id: string) {
  return apiClient.delete(`/medications/${id}`).then(() => undefined);
}

/** `date` is the user's local YYYY-MM-DD; the offset is JS getTimezoneOffset() (minutes, positive west of UTC). */
export function fetchDueMedications(date: string) {
  return apiClient
    .get<MedicationDueResponse>("/medications/due", { params: { date, tzOffsetMinutes: new Date().getTimezoneOffset() } })
    .then((r) => r.data);
}

export function logMedicationDose(medicationId: string, input: LogMedicationDoseInput) {
  return apiClient.post<MedicationDose>(`/medications/${medicationId}/doses`, input).then((r) => r.data);
}

/** Clears a logged entry (mistaken Taken/Skipped, or Undo snooze) so the occurrence reverts to due. */
export function clearMedicationDose(medicationId: string, scheduledFor: string) {
  return apiClient.delete(`/medications/${medicationId}/doses`, { params: { scheduledFor } }).then(() => undefined);
}

export function fetchMedicationAdherence(medicationId: string) {
  return apiClient
    .get<MedicationAdherence>(`/medications/${medicationId}/adherence`, {
      params: { tzOffsetMinutes: new Date().getTimezoneOffset() },
    })
    .then((r) => r.data);
}

/** Local YYYY-MM-DD (not UTC — the due endpoint is day-in-user's-timezone). */
export function localDateString(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
