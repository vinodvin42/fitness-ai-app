import type {
  ProfessionalCredential,
  ProfessionalOnboardingStatus,
  SelectServicesInput,
  SubmitCredentialInput,
  SubmitKycInput,
} from "@fitness-ai-app/types";
import { apiClient } from "./client";

export function fetchOnboardingStatus() {
  return apiClient.get<ProfessionalOnboardingStatus>("/professionals/me/onboarding").then((r) => r.data);
}

export function selectServices(input: SelectServicesInput) {
  return apiClient.put<ProfessionalOnboardingStatus>("/professionals/me/services", input).then((r) => r.data);
}

export function submitCredential(input: SubmitCredentialInput) {
  return apiClient
    .post<{ credential: ProfessionalCredential }>("/professionals/me/credentials", input)
    .then((r) => r.data.credential);
}

export function submitKyc(input: SubmitKycInput) {
  return apiClient.post<{ kycStatus: string }>("/professionals/me/kyc", input).then((r) => r.data);
}
