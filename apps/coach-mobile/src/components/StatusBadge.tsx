import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../theme/tokens";

const LABELS: Record<string, string> = {
  not_verified: "Not Verified",
  pending: "Pending",
  verified: "Verified",
  rejected: "Rejected",
  // `PayoutStatus` (schema.prisma) — shared by CoachSettlement and
  // InfluencerPayout, a simple pending -> paid lifecycle. "pending" above
  // already fits; "paid" added here for coach-mobile's earnings screen
  // (10 Sep 2026, Wave 3 earnings-view polish).
  paid: "Paid",
};

const TONES: Record<string, { bg: string; fg: string }> = {
  not_verified: { bg: "#2A2A33", fg: colors.textSecondary },
  pending: { bg: "rgba(245,158,11,0.15)", fg: colors.warning },
  verified: { bg: "rgba(34,197,94,0.15)", fg: colors.success },
  rejected: { bg: "rgba(239,68,68,0.15)", fg: colors.danger },
  paid: { bg: "rgba(34,197,94,0.15)", fg: colors.success },
};

/**
 * "Verification status badge (Verified ✓ / Not Verified / Pending,
 * color-coded green/amber)" — docs/coach/04-design-system.md §2, flagged
 * there as a good shared-component candidate across all three apps (none
 * exists yet — this is the coach app's own local copy for this slice).
 */
export function StatusBadge({ status }: { status: string }) {
  const tone = TONES[status] ?? TONES.not_verified;
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.label, { color: tone.fg }]}>
        {LABELS[status] ?? status}
        {status === "verified" || status === "paid" ? " ✓" : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
  },
});
