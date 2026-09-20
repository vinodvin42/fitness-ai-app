import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { TodayScreen } from "../screens/today/TodayScreen";
import { CalendarScreen } from "../screens/calendar/CalendarScreen";
import { ClientsStack } from "./ClientsStack";
import { MessagesStack } from "./MessagesStack";
import { MoreStack } from "./MoreStack";
import { colors } from "../theme/tokens";

/**
 * The coach-side 5-tab bottom bar (docs/coach/02-information-architecture.md
 * §2), this app's OWN tab set — deliberately not reconciled with the
 * consumer app's Today/Train/Fuel/Progress/More or the stray Home/Explore/
 * Sessions/Messages/Profile set found on one Figma frame (docs/coach/
 * 07-open-questions-gaps.md §2's "20 Aug 2026" entry: that reconciliation
 * is scoped to the consumer app only). Only Dashboard (now Today) was
 * actually designed and built this slice — Clients, Calendar, Messages, and
 * More render as real, honest "Coming soon" screens (docs/coach/
 * 02-information-architecture.md §2: "Calendar, Messages, and More have no
 * frames in this file") rather than being omitted or faked. **26 Aug 2026:
 * Calendar is real now too** — scoped as a real Booking list, not an
 * invented month-grid widget (no design source exists to match one
 * against) — see CalendarScreen.tsx and apps/api's coaching.service.ts
 * `listMySchedule` doc comment. **31 Aug 2026: Clients is real now too** —
 * a real Client Profile List → Detail flow (docs/coach/03-screen-
 * inventory.md §D) backed by real Relationship/Booking/OnboardingProfile
 * data, see ClientsStack.tsx and apps/api's professionalClients.service.ts.
 * **31 Aug 2026: Messages is real now too** — a real Conversations → Thread
 * flow backed by the new CoachMessage model (see MessagesStack.tsx and
 * apps/api's coachMessages.service.ts), scoped honestly as poll-based (not
 * real-time — no websocket/push infra exists) with no attachments.
 * **20 Sep 2026: More has one real destination now too** — Availability &
 * Capacity (see MoreStack.tsx and AvailabilityScreen.tsx) — though More
 * itself still has zero Figma frames, so its own menu layout is this
 * build's own judgment call, not a Figma-matched design.
 *
 * **20 Sep 2026 (Wave 3 nav pass, R1 work package's required
 * TODAY|CLIENTS|PROGRAMS|MESSAGES|MORE set):**
 * - `Dashboard` -> `Today`: rename only, not a rebuild — TodayScreen.tsx's
 *   real content (service badges, Active Clients, Sessions/Wk, and
 *   specifically "Today's Schedule", a genuine same-day preview of real
 *   Bookings) already matched "Today" semantically; only the stale label
 *   was wrong.
 * - `Clients` stays `Clients` — already matches the required set.
 * - The third slot is deliberately still `Calendar`, NOT a `Programs` tab,
 *   and that's a documented gap, not an oversight: investigated whether a
 *   real coach-facing "Programs" concept exists anywhere in this build
 *   before deciding — it doesn't. `Program` (schema.prisma) is exclusively
 *   admin-authored content (`createdByAdminId`/`AdminUser`, no
 *   `professionalId`/`coachId` field anywhere on the model or its
 *   relations) that a USER purchases/gets recommended via the Plan-
 *   Generation engine; nothing in this codebase lets a coach author, own,
 *   or even just view "their" programs. Building a real Programs tab would
 *   mean inventing that entire feature (data model, write paths, a whole
 *   screen) from scratch in one wave — the same "too large, don't fake a
 *   tab with fabricated content" call this file already made for Calendar/
 *   Messages/Clients before each of THOSE became real. Calendar (a fuller
 *   upcoming/past Booking list, genuinely distinct from Today's own
 *   same-day slice — see CalendarScreen.tsx) fills the slot honestly
 *   instead. Flagged as a real, open gap in docs/coach/
 *   07-open-questions-gaps.md rather than silently left as "just how it
 *   is" — a future wave that's told what a coach-facing Program actually
 *   means (their own authored templates? their clients' active programs?)
 *   can revisit this.
 * - `Messages`/`More` stay `Messages`/`More` — both already real, already
 *   match the required set.
 * - A global Notifications affordance now lives in ScreenContainer's header
 *   (reachable from every screen that renders one, i.e. every tab) — see
 *   ScreenContainer.tsx and NotificationsScreen.tsx's own doc comments for
 *   why that's Notifications only, not also an AI assistant entry point.
 */
export type MainTabsParamList = {
  Today: undefined;
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
      <Tab.Screen name="Today" component={TodayScreen} />
      <Tab.Screen name="Clients" component={ClientsStack} />
      <Tab.Screen name="Calendar" component={CalendarScreen} />
      <Tab.Screen name="Messages" component={MessagesStack} />
      <Tab.Screen name="More" component={MoreStack} />
    </Tab.Navigator>
  );
}
