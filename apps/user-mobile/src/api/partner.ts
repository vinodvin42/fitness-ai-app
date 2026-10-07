import type { PartnerLink, PartnerResponse } from "@fitness-ai-app/types";
import { apiClient } from "./client";

export const PARTNER_KEY = ["partner"] as const;

/** Null when no partner code is linked. */
export function fetchPartner() {
  return apiClient.get<PartnerResponse>("/users/me/partner").then((r) => r.data.partner);
}

/** `replace` swaps an existing link, but only once the new code validates. */
export function linkPartnerCode(code: string, replace = false) {
  return apiClient
    .post<{ partner: PartnerLink }>("/users/me/partner-code", { code, ...(replace ? { replace: true } : {}) })
    .then((r) => r.data.partner);
}

export function removePartnerCode() {
  return apiClient.delete<{ removed: true }>("/users/me/partner-code").then(() => undefined);
}
