import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { NavigatorScreenParams } from "@react-navigation/native";
import type { BookingConfirmation, ProfessionalServiceType, Reminder, TimelineEvent } from "@fitness-ai-app/types";
import { MoreScreen } from "../screens/more/MoreScreen";
import { ProfileScreen } from "../screens/more/ProfileScreen";
import { EditProfileScreen } from "../screens/more/EditProfileScreen";
import { CountrySelectionScreen } from "../screens/more/CountrySelectionScreen";
import { PreferencesScreen } from "../screens/more/PreferencesScreen";
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
import { PrivacySettingsScreen } from "../screens/more/PrivacySettingsScreen";
import { SupportScreen } from "../screens/more/SupportScreen";
import { SupportTicketFormScreen } from "../screens/more/SupportTicketFormScreen";
import { SupportTicketDetailScreen } from "../screens/more/SupportTicketDetailScreen";
import { ReferralScreen } from "../screens/more/ReferralScreen";
import { ProfessionalRelationshipScreen } from "../screens/coaching/ProfessionalRelationshipScreen";
import { RequestGuidanceScreen } from "../screens/coaching/RequestGuidanceScreen";
import { CoachDiscoveryScreen } from "../screens/coaching/CoachDiscoveryScreen";
import { CoachProfileDetailScreen } from "../screens/coaching/CoachProfileDetailScreen";
import { BookingServiceSelectionScreen } from "../screens/coaching/BookingServiceSelectionScreen";
import { BookingConfirmationScreen } from "../screens/coaching/BookingConfirmationScreen";
import { MyProfessionalTeamScreen } from "../screens/coaching/MyProfessionalTeamScreen";
import { ChangeProfessionalScreen } from "../screens/coaching/ChangeProfessionalScreen";
import { ConversationsScreen } from "../screens/coaching/ConversationsScreen";
import { MessageThreadScreen } from "../screens/coaching/MessageThreadScreen";
import { ProgressStack } from "./ProgressStack";
import type { ProgressStackParamList } from "./ProgressStack";

// docs/mobile/03-screen-inventory.md §N: More Menu -> Profile -> View/Edit
// Profile, and Preferences. **R1 Developer 1 U1 (14 Sep 2026):** §F's
// Progress cluster (Log Measurement/Measurement History/Streak Tracker/
// Progress Photos) moved OUT of this stack into its own top-level
// ProgressStack — see that file's own comment for why (BR-USR-001 names
// Progress as a primary tab, not a More sub-screen). §E+§H (Recover: AI
// Coach + Recovery & Devices) moved INTO this stack in the same pass,
// replacing Recover's own former tab — BR-USR-002 requires Recovery be
// contextual, not a primary tab; RecoverHub/AiCoach/Recovery below are
// the same real screens, just relocated, reachable from More's "Recover"
// row and from contextual entry points on Today (see TodayScreen.tsx).
// §M (Phase 3, pulled forward): More Menu -> Subscription -> Purchase
// History. §G (Phase 2, continued): More Menu -> Timeline Overview ->
// Timeline Month / Timeline Event / Timeline Report. §K (Phase 4, started
// 19 Aug 2026): More Menu -> Reminders -> Add/Edit Reminder — the design
// doc only names "Add Reminder", so "Reminders" (the list) is this build's
// addition to make Add/Edit/Delete reachable at all. §L (Phase 4,
// continued 19 Aug 2026): More Menu -> Settings -> Language /
// Notifications / Security (Security folds in "Data & Privacy"'s
// overlapping GDPR actions — see SecurityScreen.tsx) / Support -> New
// Ticket -> (3 Sep 2026) tapping a ticket opens Support Ticket Detail, its
// full reply thread against the new `SupportTicketMessage` model. §O
// (Phase 4, continued 19 Aug 2026): More Menu -> Referral
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
// **R1 Developer 1 U6 (15 Sep 2026):** the Coaching row now routes to
// ProfessionalRelationship first (the real "request / status / active
// relationship entry" hub, see that screen's own doc comment) instead of
// straight to CoachDiscovery — Discovery, Profile Detail, Booking, and My
// Professional Team are all unchanged and still reachable from it.
// §N (26 Aug 2026): Edit Profile -> Country — the region-capture-method
// decision behind Module 09.05 Geographic (admin console), same
// searchable single-select pattern as §L's Language Selection, saving to
// the new `User.countryCode` field — see CountrySelectionScreen.tsx.
export type MoreStackParamList = {
  ProgressTab: NavigatorScreenParams<ProgressStackParamList> | undefined;
  /** U-M5 / U-M7 — the controlled-assignment request flow. */
  RequestGuidance: undefined;
  MoreHub: undefined;
  Profile: undefined;
  EditProfile: undefined;
  CountrySelection: undefined;
  Preferences: undefined;
  // R1 Developer 1 U1 (14 Sep 2026) — relocated from the former RecoverStack;
  // see this file's top comment.
  Subscription: undefined;
  SubscriptionHistory: undefined;
  // U6 Premium entitlement (15 Sep 2026, §9 / BR-COM-011) — "activation_failed"
  // is a genuinely distinct, recoverable state: the payment WAS captured,
  // only the entitlement grant failed, so it gets its own honest copy and a
  // Retry action instead of collapsing into "failed" (a lie in that case).
  // See PaymentResultScreen.tsx and payments.service.ts's activatePayment.
  PaymentResult: { status: "success" | "failed" | "activation_failed"; message?: string; paymentId?: string };
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
  // §4 Privacy/Consent settings (R1 Developer 1, 18 Sep 2026) — see
  // PrivacySettingsScreen.tsx's own doc comment.
  PrivacySettings: undefined;
  Support: undefined;
  SupportTicketForm: undefined;
  SupportTicketDetail: { ticketId: string };
  Referral: undefined;
  ProfessionalRelationship: undefined;
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
      {/* Handoff §2 decision #1 — Progress lives in More. Mounted as
          a whole stack rather than screen-by-screen so every Progress
          screen keeps its own ProgressStackParamList typing and every
          existing deep link into it still resolves. */}
      <Stack.Screen name="ProgressTab" component={ProgressStack} />
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
      <Stack.Screen name="PrivacySettings" component={PrivacySettingsScreen} />
      <Stack.Screen name="Support" component={SupportScreen} />
      <Stack.Screen name="SupportTicketForm" component={SupportTicketFormScreen} />
      <Stack.Screen name="SupportTicketDetail" component={SupportTicketDetailScreen} />
      <Stack.Screen name="Referral" component={ReferralScreen} />
      <Stack.Screen name="ProfessionalRelationship" component={ProfessionalRelationshipScreen} />
      <Stack.Screen name="RequestGuidance" component={RequestGuidanceScreen} />
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
