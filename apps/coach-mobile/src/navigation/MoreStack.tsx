import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MoreScreen } from "../screens/more/MoreScreen";
import { AvailabilityScreen } from "../screens/more/AvailabilityScreen";
import { ProfileScreen } from "../screens/more/ProfileScreen";
import { EarningsScreen } from "../screens/earnings/EarningsScreen";
import { OffersScreen } from "../screens/clients/OffersScreen";
import { FormReviewsListScreen } from "../screens/formReviews/FormReviewsListScreen";
import { FormReviewDetailScreen } from "../screens/formReviews/FormReviewDetailScreen";
import { VerificationStatusScreen } from "../screens/onboarding/VerificationStatusScreen";
import { CredentialUploadScreen } from "../screens/onboarding/CredentialUploadScreen";
import { KycUploadScreen } from "../screens/onboarding/KycUploadScreen";
import type { ProfessionalServiceType } from "@fitness-ai-app/types";

/**
 * More tab (R2 Wave 2, 20 Sep 2026) — replaces the inline `ComingSoonScreen`
 * MainTabs.tsx used to render directly for this tab. Same shape as
 * ClientsStack/MessagesStack: header hidden here, each screen renders its
 * own ScreenContainer title and back affordance.
 */
export type MoreStackParamList = {
  MoreMenu: undefined;
  AvailabilityCapacity: undefined;
  MyProfile: undefined;
  /** P6 — the earnings surface, absent from this app until R1. */
  Earnings: undefined;
  /** P-M7 — offers list, with decline reasons and expiry. */
  Offers: undefined;
  FormReviews: undefined;
  FormReviewDetail: { id: string };
  /**
   * The onboarding screens again (26 Oct 2026, coach app audit): onboarding
   * counts as done once services are chosen, so a coach who skipped the
   * documents, or had one rejected, had no way back to them. Same route names
   * and params as OnboardingStack, so the screens navigate the same way here.
   */
  VerificationStatus: undefined;
  CredentialUpload: { services: ProfessionalServiceType[]; index: number };
  KycUpload: { services: ProfessionalServiceType[] };
};

const Stack = createNativeStackNavigator<MoreStackParamList>();

export function MoreStack() {
  return (
    <Stack.Navigator initialRouteName="MoreMenu" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MoreMenu" component={MoreScreen} />
      <Stack.Screen name="AvailabilityCapacity" component={AvailabilityScreen} />
      <Stack.Screen name="MyProfile" component={ProfileScreen} />
      <Stack.Screen name="Earnings" component={EarningsScreen} />
      <Stack.Screen name="Offers" component={OffersScreen} />
      <Stack.Screen name="FormReviews" component={FormReviewsListScreen} />
      <Stack.Screen name="FormReviewDetail" component={FormReviewDetailScreen} />
      <Stack.Screen name="VerificationStatus" component={VerificationStatusScreen} />
      <Stack.Screen name="CredentialUpload" component={CredentialUploadScreen} />
      <Stack.Screen name="KycUpload" component={KycUploadScreen} />
    </Stack.Navigator>
  );
}
