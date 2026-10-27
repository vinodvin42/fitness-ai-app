import type { PayoutAccountResponse, SavePayoutAccountInput } from "@fitness-ai-app/types";
import { apiClient } from "./client";

/**
 * Coach payout details (27 Oct 2026): the bank account or UPI ID Fynrox pays
 * this coach to. Always masked on the way back; Fynrox verifies before paying,
 * and any change goes back to pending. See apps/api's professionalPayoutAccount module.
 */
export function fetchPayoutAccount() {
  return apiClient.get<PayoutAccountResponse>("/professionals/me/payout-account").then((r) => r.data);
}

export function savePayoutAccount(input: SavePayoutAccountInput) {
  return apiClient.put<PayoutAccountResponse>("/professionals/me/payout-account", input).then((r) => r.data);
}
