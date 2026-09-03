import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { ProfessionalServiceType } from "@fitness-ai-app/types";
import { ServiceSelectionScreen } from "../screens/onboarding/ServiceSelectionScreen";
import { CredentialUploadScreen } from "../screens/onboarding/CredentialUploadScreen";
import { KycUploadScreen } from "../screens/onboarding/KycUploadScreen";
import { VerificationStatusScreen } from "../screens/onboarding/VerificationStatusScreen";

/**
 * docs/coach/03-screen-inventory.md §B / docs/coach/02-information-architecture.md
 * §3: Service Selection -> Credential Verification (per-service upload,
 * incl. Aadhaar/KYC) -> Verification Status. This build splits the Figma's
 * single "Fitness/Credential Verification" frame into a per-service
 * CredentialUpload loop (`services`/`index` params drive which service is
 * currently being submitted) plus one separate, shared KycUpload step —
 * see professionalOnboarding.schema.ts's own comment for why KYC is
 * modeled as one-per-professional, not one-per-service.
 *
 * **Known gap, documented rather than silently accepted:** onboarding is
 * server-side "completed" (see professionalOnboarding.service.ts's
 * hasSelectedServices) the moment Service Selection succeeds — so a coach
 * who backgrounds/reinstalls the app between Service Selection and
 * finishing Credential/KYC upload will land on MainTabs on their next
 * login, with no screen yet that lets them resume the upload steps from
 * there (the Figma's Verification Status "Complete Verification" action
 * isn't wired to anything in this slice). Flagged in
 * docs/coach/07-open-questions-gaps.md, not solved here.
 */
export type OnboardingStackParamList = {
  ServiceSelection: undefined;
  CredentialUpload: { services: ProfessionalServiceType[]; index: number };
  KycUpload: { services: ProfessionalServiceType[] };
  VerificationStatus: undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export function OnboardingStack() {
  return (
    <Stack.Navigator initialRouteName="ServiceSelection" screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="ServiceSelection" component={ServiceSelectionScreen} />
      <Stack.Screen name="CredentialUpload" component={CredentialUploadScreen} />
      <Stack.Screen name="KycUpload" component={KycUploadScreen} />
      <Stack.Screen name="VerificationStatus" component={VerificationStatusScreen} />
    </Stack.Navigator>
  );
}
