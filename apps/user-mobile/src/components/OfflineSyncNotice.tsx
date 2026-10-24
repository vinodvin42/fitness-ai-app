import React from "react";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Icon } from "./Icon";
import { dismissRejected, syncNow, useOfflineSets } from "../lib/offlineSets";
import type { RejectedSet } from "../lib/offlineSetQueue";
import { useTheme } from "../theme/ThemeProvider";
import { colors, fonts, radius, spacing } from "../theme/tokens";

const sets = (n: number) => (n === 1 ? "1 set" : `${n} sets`);

function rejectedLine(rejected: RejectedSet[]): string {
  const n = rejected.length;
  const why = rejected.every((r) => r.reason === "closed")
    ? "this workout was already finished or discarded"
    : rejected.every((r) => r.reason === "not_found")
      ? "this workout no longer exists"
      : "the server didn't accept them";
  return `${n === 1 ? "1 set" : `${n} sets`} from this phone couldn't be saved: ${why}.`;
}

/**
 * Offline set logging (Figma today/08, 24 Oct 2026): what this phone is holding for one workout. Offline: "Saved on
 * this phone · syncs when you're back online" and how many sets are waiting. Back online with sets still waiting:
 * syncing, or a "Sync now" when the last try failed. Sets the server refused are listed until dismissed. Nothing
 * when online with nothing waiting.
 */
export function OfflineSyncNotice({ sessionId, style }: { sessionId: string; style?: StyleProp<ViewStyle> }) {
  const { colors: theme } = useTheme();
  const { online, syncing, waiting, rejected } = useOfflineSets(sessionId);
  if (online && waiting === 0 && rejected.length === 0) return null;

  return (
    <View style={[{ gap: spacing.xs }, style]}>
      {!online || waiting > 0 ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.warning,
            backgroundColor: colors.warningSoft,
            paddingHorizontal: spacing.sm + 2,
            paddingVertical: spacing.sm,
          }}
        >
          <Icon name={online ? "refresh-cw" : "cloud-off"} size={17} color={colors.warningText} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>
              {online
                ? syncing
                  ? `Syncing ${sets(waiting)}…`
                  : `${sets(waiting)} waiting to sync`
                : waiting > 0
                  ? "Saved on this phone · syncs when you're back online"
                  : "You're offline"}
            </Text>
            <Text style={{ color: colors.warningText, fontSize: 13, marginTop: 1 }}>
              {online
                ? syncing
                  ? "Saved on this phone until the server has them."
                  : "Saved on this phone. Couldn't reach the server, trying again soon."
                : waiting > 0
                  ? `${sets(waiting)} waiting to sync`
                  : "Keep logging: sets are saved on this phone and sync when you're back online."}
            </Text>
          </View>
          {online && !syncing ? (
            <Pressable
              onPress={() => void syncNow()}
              accessibilityRole="button"
              accessibilityLabel="Sync now"
              hitSlop={8}
              style={{ borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>Sync now</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {rejected.length > 0 ? (
        <View
          accessibilityRole="alert"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.danger,
            backgroundColor: colors.dangerSoft,
            paddingHorizontal: spacing.sm + 2,
            paddingVertical: spacing.sm,
          }}
        >
          <Icon name="circle-alert" size={17} color={colors.danger} />
          <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 13, lineHeight: 18 }}>{rejectedLine(rejected)}</Text>
          <Pressable
            onPress={() => dismissRejected(sessionId)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            hitSlop={8}
            style={{ paddingHorizontal: 6, paddingVertical: 4 }}
          >
            <Icon name="x" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
