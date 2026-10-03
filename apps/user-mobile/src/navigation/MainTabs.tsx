import React from "react";
import { useTranslation } from "react-i18next";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { NavigatorScreenParams } from "@react-navigation/native";
import { TodayScreen } from "../screens/today/TodayScreen";
import { TrainStack } from "./TrainStack";
import type { TrainStackParamList } from "./TrainStack";
import { FuelStack } from "./FuelStack";
import { RecoverStack } from "./RecoverStack";
import type { RecoverStackParamList } from "./RecoverStack";
import { MoreStack } from "./MoreStack";
import type { MoreStackParamList } from "./MoreStack";
import { Icon, IconName } from "../components/Icon";
import { colors, typography } from "../theme/tokens";

// The persistent 5-tab bottom bar — docs/mobile/02-information-architecture.md §2.
//
// **Fynrox R1 (28 Sep 2026):** Today | Train | Fuel | Recover | More, per
// the handoff's §2 decision #1 ("Progress lives in More, plus a Progress
// card on Today").
//
// This is the second swap of these two tabs, so the history is worth
// stating plainly. The original nav had Recover as a tab. On 14 Sep 2026
// it was swapped for Progress, correctly, because the R1 work package's
// BR-USR-001/BR-USR-002 named that set. The design handoff then
// explicitly changed those two rules — its §2 records "BR-USR-001 and
// BR-USR-002 change (Recover becomes a tab, Progress moves to More)" —
// and the handoff outranks the work package in the stated source-of-truth
// order, so it goes back. Anyone tempted to swap it a third time should
// check which document is on top of that order first.
//
// Progress was not dismantled to do this: `ProgressStack` is mounted
// whole inside `MoreStack`, so its screens keep their own param list and
// every existing deep link into Progress still resolves.
//
// `Train`/`Recover`/`More` are typed as `NavigatorScreenParams<...>` (not
// `undefined`) so other screens can deep-link straight into a specific
// nested screen rather than just switching tabs and leaving the user to
// find it themselves — `Train` for Today's "Continue Workout" card,
// `More` for Today's Progress card, and `Recover` for Today's AI Coach
// banner. `Fuel` stays `undefined` since nothing needs one yet.
export type MainTabsParamList = {
  Today: undefined;
  Train: NavigatorScreenParams<TrainStackParamList> | undefined;
  Fuel: undefined;
  Recover: NavigatorScreenParams<RecoverStackParamList> | undefined;
  More: NavigatorScreenParams<MoreStackParamList> | undefined;
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
  const { t } = useTranslation();
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
      {/*
        `name` is the route id and must stay in English — it is what every
        `navigation.navigate("Today")` in the app refers to. `title` is
        what the tab bar actually renders, and that is the translated one.
        Collapsing the two would make changing a language a navigation
        bug.
      */}
      <Tab.Screen name="Today" component={TodayScreen} options={{ title: t("nav.today") }} />
      <Tab.Screen name="Train" component={TrainStack} options={{ title: t("nav.train") }} />
      <Tab.Screen name="Fuel" component={FuelStack} options={{ title: t("nav.fuel") }} />
      <Tab.Screen name="Recover" component={RecoverStack} options={{ title: t("nav.recover") }} />
      <Tab.Screen name="More" component={MoreStack} options={{ title: t("nav.more") }} />
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
