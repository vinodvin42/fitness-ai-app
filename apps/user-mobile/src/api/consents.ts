import type { Consent, UpdateConsentInput } from "@fitness-ai-app/types";
import { apiClient } from "./client";

// §4 Privacy/Consent settings (R1 Developer 1, 18 Sep 2026) — see
// apps/api's users.service.ts (listConsents/updateConsent) and
// PrivacySettingsScreen.tsx for the full design.

export function fetchConsents() {
  return apiClient.get<{ items: Consent[] }>("/users/me/consents").then((r) => r.data.items);
}

export function updateConsent(input: UpdateConsentInput) {
  return apiClient.patch<{ consent: Consent }>("/users/me/consents", input).then((r) => r.data.consent);
}
