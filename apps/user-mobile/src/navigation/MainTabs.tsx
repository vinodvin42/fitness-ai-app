import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { NavigatorScreenParams } from "@react-navigation/native";
import { TodayScreen } from "../screens/today/TodayScreen";
import { TrainStack } from "./TrainStack";
import type { TrainStackParamList } from "./TrainStack";
import { FuelStack } from "./FuelStack";
import { RecoverStack } from "./RecoverStack";
import { MoreStack } from "./MoreStack";
import { Icon, IconName } from "../components/Icon";
import { colors, typography } from "../theme/tokens";

// The persistent 5-tab bottom bar — docs/mobile/02-information-architecture.md §2.
// Note: three different bottom-nav label sets were found across the reviewed
// Figma files (docs/coach/07-open-questions-gaps.md §2) — this uses the
// canonical v1-user set (Today/Train/Fuel/Recover/More), which is the one
// this app owns.
//
// `Train` is typed as `NavigatorScreenParams<TrainStackParamList>` (not
// `undefined`) so Today's "Continue Workout" card (added 19 Aug 2026) can
// deep-link straight into TrainStack's ActiveWorkout screen —
// `navigation.navigate("Train", { screen: "ActiveWorkout", params: {...} })`
// — rather than just switching to the Train tab and leaving the user to
// find their in-progress session themselves. This is the first cross-tab
// deep-link in this app; the other four tabs stay `undefined` since
// nothing else needs one yet.
export type MainTabsParamList = {
  Today: undefined;
  Train: NavigatorScreenParams<TrainStackParamList> | undefined;
  Fuel: undefined;
  Recover: undefined;
  More: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

const TAB_ICONS: Record<keyof MainTabsParamList, IconName> = {
  Today: "home",
  Train: "dumbbell",
  Fuel: "utensils",
  Recover: "heart-pulse",
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
      <Tab.Screen name="Recover" component={RecoverStack} />
      <Tab.Screen name="More" component={MoreStack} />
    </Tab.Navigator>
  );
}

// AI Coach floating action button (docs/mobile/04-design-system.md §4/§5)
// — the design has this float above the tab bar on nearly every screen.
// 25 Aug 2026: AI Coach itself is real now (RecoverStack's AiCoach
// screen), reachable from an "Open Chat" card on the Recover tab rather
// than a true global FAB — see AiCoachScreen.tsx's own doc comment for
// why (a cross-navigator floating overlay is real added risk with no
// device here to test it against). Promoting this to a genuine global
// FAB is a reasonable, self-contained follow-up, not a sign AI Coach
// itself is unfinished.
