import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DashboardScreen } from "../screens/dashboard/DashboardScreen";
import { CalendarScreen } from "../screens/calendar/CalendarScreen";
import { ClientsStack } from "./ClientsStack";
import { MessagesStack } from "./MessagesStack";
import { ComingSoonScreen } from "../screens/placeholder/ComingSoonScreen";
import { colors } from "../theme/tokens";

/**
 * The coach-side 5-tab bottom bar — Dashboard/Clients/Calendar/Messages/More
 * (docs/coach/02-information-architecture.md §2), this app's OWN tab set —
 * deliberately not reconciled with the consumer app's Today/Train/Fuel/
 * Recover/More or the stray Home/Explore/Sessions/Messages/Profile set
 * found on one Figma frame (docs/coach/07-open-questions-gaps.md §2's "20
 * Aug 2026" entry: that reconciliation is scoped to the consumer app only).
 * Only Dashboard was actually designed and built this slice — Clients,
 * Calendar, Messages, and More render as real, honest "Coming soon"
 * screens (docs/coach/02-information-architecture.md §2: "Calendar,
 * Messages, and More have no frames in this file") rather than being
 * omitted or faked. **26 Aug 2026: Calendar is real now too** — scoped as
 * a real Booking list, not an invented month-grid widget (no design
 * source exists to match one against) — see CalendarScreen.tsx and
 * apps/api's coaching.service.ts `listMySchedule` doc comment. **31 Aug
 * 2026: Clients is real now too** — a real Client Profile List → Detail
 * flow (docs/coach/03-screen-inventory.md §D) backed by real Relationship/
 * Booking/OnboardingProfile data, see ClientsStack.tsx and apps/api's
 * professionalClients.service.ts. **31 Aug 2026: Messages is real now
 * too** — a real Conversations → Thread flow backed by the new CoachMessage
 * model (see MessagesStack.tsx and apps/api's coachMessages.service.ts),
 * scoped honestly as poll-based (not real-time — no websocket/push infra
 * exists) with no attachments. Only More remains unbuilt: it has zero
 * frames anywhere in the reviewed Figma file.
 */
export type MainTabsParamList = {
  Dashboard: undefined;
  Clients: undefined;
  Calendar: undefined;
  Messages: undefined;
  More: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Clients" component={ClientsStack} />
      <Tab.Screen name="Calendar" component={CalendarScreen} />
      <Tab.Screen name="Messages" component={MessagesStack} />
      <Tab.Screen name="More">
        {() => <ComingSoonScreen title="More" subtitle="Not designed in the reviewed Figma file." />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
