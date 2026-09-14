import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { NavigatorScreenParams } from "@react-navigation/native";
import { TodayScreen } from "../screens/today/TodayScreen";
import { TrainStack } from "./TrainStack";
import type { TrainStackParamList } from "./TrainStack";
import { FuelStack } from "./FuelStack";
import { ProgressStack } from "./ProgressStack";
import type { ProgressStackParamList } from "./ProgressStack";
import { MoreStack } from "./MoreStack";
import type { MoreStackParamList } from "./MoreStack";
import { Icon, IconName } from "../components/Icon";
import { colors, typography } from "../theme/tokens";

// The persistent 5-tab bottom bar — docs/mobile/02-information-architecture.md §2.
// **R1 Developer 1 U1 (14 Sep 2026):** this tab set used to be
// Today/Train/Fuel/Recover/More (a prior, documented decision — see git
// history). The R1 work package's BR-USR-001/BR-USR-002 name a different
// required set — Today | Train | Fuel | Progress | More, with Recovery
// contextual rather than a primary tab — so this pass swaps Recover for
// Progress: the real Progress screens (Log Measurement/Measurement
// History/Streak Tracker/Progress Photos, all previously nested three
// levels deep inside MoreStack) are promoted to their own top-level
// ProgressStack, and Recover's own two real screens (AI Coach, Recovery &
// Devices) move into MoreStack, reachable from More's "Recover" row and
// from contextual entry points on Today (see TodayScreen.tsx and
// ProgressStack.tsx/MoreStack.tsx's own comments).
//
// `Train`/`Progress`/`More` are typed as `NavigatorScreenParams<...>`
// (not `undefined`) so other screens can deep-link straight into a
// specific nested screen rather than just switching tabs and leaving the
// user to find it themselves — `Train` for Today's "Continue Workout"
// card (19 Aug 2026, the first such cross-tab deep-link in this app);
// `More` newly for Today's AI Coach banner / Recover quick-link (14 Sep
// 2026), now that AiCoach/RecoverHub live under More instead of their
// own tab. `Fuel` stays `undefined` since nothing needs one yet.
export type MainTabsParamList = {
  Today: undefined;
  Train: NavigatorScreenParams<TrainStackParamList> | undefined;
  Fuel: undefined;
  Progress: NavigatorScreenParams<ProgressStackParamList> | undefined;
  More: NavigatorScreenParams<MoreStackParamList> | undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

const TAB_ICONS: Record<keyof MainTabsParamList, IconName> = {
  Today: "home",
  Train: "dumbbell",
  Fuel: "utensils",
  Progress: "trending-up",
  More: "menu",
};

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { ...typography.caption, marginTop: -2 },
        tabBarItemStyle: { paddingTop: 8 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 66,
          paddingBottom: 10,
        },
        tabBarIcon: ({ color, focused }) => (
          <Icon name={TAB_ICONS[route.name]} color={color} size={22} strokeWidth={focused ? 2.4 : 2} />
        ),
      })}
    >
      <Tab.Screen name="Today" component={TodayScreen} />
      <Tab.Screen name="Train" component={TrainStack} />
      <Tab.Screen name="Fuel" component={FuelStack} />
      <Tab.Screen name="Progress" component={ProgressStack} />
      <Tab.Screen name="More" component={MoreStack} />
    </Tab.Navigator>
  );
}

// AI Coach floating action button (docs/mobile/04-design-system.md §4/§5)
// — the design has this float above the tab bar on nearly every screen.
// 25 Aug 2026: AI Coach itself is real (now MoreStack's AiCoach screen,
// relocated 14 Sep 2026 — see this file's top comment), reachable from a
// real "Open chat" banner on Today (global, per BR "AI is global") rather
// than a true floating overlay — see AiCoachScreen.tsx's own doc comment
// for why (a cross-navigator floating overlay is real added risk with no
// device here to test it against). Promoting this to a genuine global
// FAB is a reasonable, self-contained follow-up, not a sign AI Coach
// itself is unfinished.
