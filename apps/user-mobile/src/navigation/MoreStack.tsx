import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { BookingConfirmation, ProfessionalServiceType, Reminder, TimelineEvent } from "@fitness-ai-app/types";
import { MoreScreen } from "../screens/more/MoreScreen";
import { ProfileScreen } from "../screens/more/ProfileScreen";
import { EditProfileScreen } from "../screens/more/EditProfileScreen";
import { CountrySelectionScreen } from "../screens/more/CountrySelectionScreen";
import { PreferencesScreen } from "../screens/more/PreferencesScreen";
import { ProgressOverviewScreen } from "../screens/more/ProgressOverviewScreen";
import { LogMeasurementScreen } from "../screens/more/LogMeasurementScreen";
import { MeasurementHistoryScreen } from "../screens/more/MeasurementHistoryScreen";
import { StreakTrackerScreen } from "../screens/more/StreakTrackerScreen";
import { ProgressPhotosScreen } from "../screens/more/ProgressPhotosScreen";
import { SubscriptionScreen } from "../screens/more/SubscriptionScreen";
import { SubscriptionHistoryScreen } from "../screens/more/SubscriptionHistoryScreen";
import { PaymentResultScreen } from "../screens/more/PaymentResultScreen";
import { TimelineOverviewScreen } from "../screens/timeline/TimelineOverviewScreen";
import { TimelineMonthScreen } from "../screens/timeline/TimelineMonthScreen";
import { TimelineEventScreen } from "../screens/timeline/TimelineEventScreen";
import { TimelineReportScreen } from "../screens/timeline/TimelineReportScreen";
import { RemindersScreen } from "../screens/more/RemindersScreen";
import { ReminderFormScreen } from "../screens/more/ReminderFormScreen";
import { SettingsHubScreen } from "../screens/more/SettingsHubScreen";
import { LanguageSelectionScreen } from "../screens/more/LanguageSelectionScreen";
import { NotificationSettingsScreen } from "../screens/more/NotificationSettingsScreen";
import { SecurityScreen } from "../screens/more/SecurityScreen";
import { SupportScreen } from "../screens/more/SupportScreen";
import { SupportTicketFormScreen } from "../screens/more/SupportTicketFormScreen";
import { ReferralScreen } from "../screens/more/ReferralScreen";
import { CoachDiscoveryScreen } from "../screens/coaching/CoachDiscoveryScreen";
import { CoachProfileDetailScreen } from "../screens/coaching/CoachProfileDetailScreen";
import { BookingServiceSelectionScreen } from "../screens/coaching/BookingServiceSelectionScreen";
import { BookingConfirmationScreen } from "../screens/coaching/BookingConfirmationScreen";
import { MyProfessionalTeamScreen } from "../screens/coaching/MyProfessionalTeamScreen";
import { ChangeProfessionalScreen } from "../screens/coaching/ChangeProfessionalScreen";
import { ConversationsScreen } from "../screens/coaching/ConversationsScreen";
import { MessageThreadScreen } from "../screens/coaching/MessageThreadScreen";

// docs/mobile/03-screen-inventory.md §N: More Menu -> Profile -> View/Edit
// Profile, and Preferences. §F (Phase 2, pulled forward alongside N):
// More Menu -> Progress -> Log Measurement / Measurement History. §M
// (Phase 3, pulled forward): More Menu -> Subscription -> Purchase
// History. §G (Phase 2, continued): More Menu -> Timeline Overview ->
// Timeline Month / Timeline Event / Timeline Report. §K (Phase 4, started
// 19 Aug 2026): More Menu -> Reminders -> Add/Edit Reminder — the design
// doc only names "Add Reminder", so "Reminders" (the list) is this build's
// addition to make Add/Edit/Delete reachable at all. §L (Phase 4,
// continued 19 Aug 2026): More Menu -> Settings -> Language /
// Notifications / Security (Security folds in "Data & Privacy"'s
// overlapping GDPR actions — see SecurityScreen.tsx) / Support -> New
// Ticket. §O (Phase 4, continued 19 Aug 2026): More Menu -> Referral
// (real code + real signup count, no reward grid — see
// ReferralScreen.tsx). The other More-hub rows (Programs, Coaching) stay
// inert placeholders in MoreScreen — later roadmap phases. §F (continued 19
// Aug 2026): Progress -> Streak Tracker — training/nutrition/hydration
// streaks computed from real logs; "mindfulness" (the design's fourth
// category) is deliberately omitted, see gap §29. Progress -> Progress
// Photos (also 19 Aug 2026) — real capture/upload via expo-image-picker,
// stored as base64 in Postgres since no object storage exists, see gap
// §34. Coach Discovery & Booking (§E, added 25 Aug 2026, closes gap §1):
// More Menu -> Coaching -> Discovery (search + filter chips + list,
// combining the design's separate Discovery Filters/Discovery List
// screens into one — same "combine near-duplicate design screens"
// precedent as Security/Subscription) -> Coach Profile Detail -> Booking:
// Service Selection -> Booking Confirmation, plus My Professional Team
// (also reachable directly from the Coaching row) -> Change Professional.
// §N (26 Aug 2026): Edit Profile -> Country — the region-capture-method
// decision behind Module 09.05 Geographic (admin console), same
// searchable single-select pattern as §L's Language Selection, saving to
// the new `User.countryCode` field — see CountrySelectionScreen.tsx.
export type MoreStackParamList = {
  MoreHub: undefined;
  Profile: undefined;
  EditProfile: undefined;
  CountrySelection: undefined;
  Preferences: undefined;
  Progress: undefined;
  LogMeasurement: undefined;
  MeasurementHistory: undefined;
  StreakTracker: undefined;
  ProgressPhotos: undefined;
  Subscription: undefined;
  SubscriptionHistory: undefined;
  PaymentResult: { status: "success" | "failed"; message?: string };
  TimelineOverview: undefined;
  TimelineMonth: { year?: number; month?: number };
  TimelineEvent: { event: TimelineEvent };
  TimelineReport: { year: number };
  Reminders: undefined;
  ReminderForm: { reminder?: Reminder };
  SettingsHub: undefined;
  LanguageSelection: undefined;
  NotificationSettings: undefined;
  Security: undefined;
  Support: undefined;
  SupportTicketForm: undefined;
  Referral: undefined;
  CoachDiscovery: { serviceType?: ProfessionalServiceType | "combined" } | undefined;
  CoachProfileDetail: { professionalId: string };
  BookingServiceSelection: { professionalId: string };
  BookingConfirmation: { booking: BookingConfirmation };
  MyProfessionalTeam: undefined;
  ChangeProfessional: { relationshipId: string; professionalFullName: string; serviceType: ProfessionalServiceType };
  Conversations: undefined;
  MessageThread: { professionalId: string; fullName: string };
};

const Stack = createNativeStackNavigator<MoreStackParamList>();

export function MoreStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MoreHub" component={MoreScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="CountrySelection" component={CountrySelectionScreen} />
      <Stack.Screen name="Preferences" component={PreferencesScreen} />
      <Stack.Screen name="Progress" component={ProgressOverviewScreen} />
      <Stack.Screen name="LogMeasurement" component={LogMeasurementScreen} />
      <Stack.Screen name="MeasurementHistory" component={MeasurementHistoryScreen} />
      <Stack.Screen name="StreakTracker" component={StreakTrackerScreen} />
      <Stack.Screen name="ProgressPhotos" component={ProgressPhotosScreen} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} />
      <Stack.Screen name="SubscriptionHistory" component={SubscriptionHistoryScreen} />
      <Stack.Screen name="PaymentResult" component={PaymentResultScreen} />
      <Stack.Screen name="TimelineOverview" component={TimelineOverviewScreen} />
      <Stack.Screen name="TimelineMonth" component={TimelineMonthScreen} />
      <Stack.Screen name="TimelineEvent" component={TimelineEventScreen} />
      <Stack.Screen name="TimelineReport" component={TimelineReportScreen} />
      <Stack.Screen name="Reminders" component={RemindersScreen} />
      <Stack.Screen name="ReminderForm" component={ReminderFormScreen} />
      <Stack.Screen name="SettingsHub" component={SettingsHubScreen} />
      <Stack.Screen name="LanguageSelection" component={LanguageSelectionScreen} />
      <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
      <Stack.Screen name="Security" component={SecurityScreen} />
      <Stack.Screen name="Support" component={SupportScreen} />
      <Stack.Screen name="SupportTicketForm" component={SupportTicketFormScreen} />
      <Stack.Screen name="Referral" component={ReferralScreen} />
      <Stack.Screen name="CoachDiscovery" component={CoachDiscoveryScreen} />
      <Stack.Screen name="CoachProfileDetail" component={CoachProfileDetailScreen} />
      <Stack.Screen name="BookingServiceSelection" component={BookingServiceSelectionScreen} />
      <Stack.Screen name="BookingConfirmation" component={BookingConfirmationScreen} />
      <Stack.Screen name="MyProfessionalTeam" component={MyProfessionalTeamScreen} />
      <Stack.Screen name="ChangeProfessional" component={ChangeProfessionalScreen} />
      <Stack.Screen name="Conversations" component={ConversationsScreen} />
      <Stack.Screen name="MessageThread" component={MessageThreadScreen} />
    </Stack.Navigator>
  );
}
