/**
 * Global "no internet connection" banner, gap §23 (2/3 — see
 * docs/mobile/07-open-questions-gaps.md §23 for the toast/snackbar system,
 * which is still deliberately out of scope).
 *
 * Mounted once in App.tsx, above/around RootNavigator, so it's visible
 * regardless of auth/onboarding/lock state. Deliberately absolutely
 * positioned (not an in-flow sibling): every screen already reserves its
 * own top safe-area inset via ScreenContainer's `SafeAreaView edges={["top"]}`
 * (see src/components/ScreenContainer.tsx). That reserved strip is normally
 * just blank background. An absolutely-positioned overlay with its own
 * `insets.top` padding paints over exactly that blank strip when offline,
 * instead of pushing every screen's content down by an extra inset's worth
 * of empty space (which an in-flow banner with its own top padding would
 * do — a real double-padding bug, not just a cosmetic nit).
 * `pointerEvents="none"` so the banner never blocks taps on whatever
 * (rare) interactive element might sit under its small footprint.
 */
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import NetInfo from "@react-native-community/netinfo";
import { colors, fonts, spacing } from "../theme/tokens";

export function OfflineBanner() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // isConnected, not isInternetReachable: isInternetReachable starts out
    // `null` until NetInfo's periodic reachability probe resolves, so
    // treating "not yet known" as offline would flash this banner on every
    // cold start even on a perfectly good connection.
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(state.isConnected === false);
    });
    return () => unsubscribe();
  }, []);

  if (!isOffline) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.container, { paddingTop: insets.top + spacing.xs }]}
    >
      <Text style={styles.text}>{t("offline.banner")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    elevation: 999,
    backgroundColor: colors.warning,
    paddingBottom: spacing.xs,
    alignItems: "center",
  },
  text: {
    color: colors.background,
    fontSize: 12,
    fontFamily: fonts.bodySemi,
  },
});
