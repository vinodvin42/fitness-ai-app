import React from "react";
import { Pressable, ScrollView, Switch, Text, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon, IconName } from "../../components/Icon";
import { colors, fonts, layout, radius, spacing, typography } from "../../theme/tokens";

/**
 * Shared pieces for the Recover section frames (Figma 05 - Recover).
 */

/** Circular icon button used in the centered Recover headers. */
export function CircleButton({
  icon,
  onPress,
  label,
  tint = colors.textPrimary,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  tint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.surfaceRaised,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name={icon} size={18} color={tint} />
    </Pressable>
  );
}

interface ShellProps {
  title: string;
  subtitle?: string;
  /** Centered title with circular back (frames 02-05) vs left title with back chevron (06-10). */
  centered?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
  /** Pinned content under the scroll area (e.g. a primary CTA). */
  footer?: React.ReactNode;
  contentStyle?: ViewStyle;
}

/** Safe-area + header + scroll column for Recover sub-screens. */
export function RecoverShell({ title, subtitle, centered, onBack, right, children, footer, contentStyle }: ShellProps) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <View
        style={{
          width: "100%",
          maxWidth: layout.maxContentWidth,
          alignSelf: "center",
          paddingHorizontal: layout.screenPadding,
          paddingTop: spacing.sm,
          paddingBottom: spacing.md,
          flexDirection: "row",
          alignItems: centered ? "center" : "flex-start",
          gap: spacing.sm,
        }}
      >
        {onBack ? (
          centered ? (
            <CircleButton icon="chevron-left" onPress={onBack} label="Back" />
          ) : (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={10}
              style={{ paddingTop: 6, paddingRight: 4 }}
            >
              <Icon name="chevron-left" size={22} color={colors.textPrimary} />
            </Pressable>
          )
        ) : centered ? (
          <View style={{ width: 40 }} />
        ) : null}
        <View style={{ flex: 1, alignItems: centered ? "center" : "flex-start" }}>
          <Text style={{ color: colors.textPrimary, ...typography.h1, fontSize: centered ? 18 : 24 }}>{title}</Text>
          {subtitle ? <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>{subtitle}</Text> : null}
        </View>
        {centered ? right ?? <View style={{ width: 40 }} /> : right}
      </View>
      <ScrollView
        contentContainerStyle={[
          {
            width: "100%",
            maxWidth: layout.maxContentWidth,
            alignSelf: "center",
            paddingHorizontal: layout.screenPadding,
            paddingBottom: spacing.xl,
            gap: spacing.md,
          },
          contentStyle,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={{
            width: "100%",
            maxWidth: layout.maxContentWidth,
            alignSelf: "center",
            paddingHorizontal: layout.screenPadding,
            paddingVertical: spacing.sm,
            gap: spacing.sm,
          }}
        >
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export function SectionLabel({ children, small }: { children: string; small?: boolean }) {
  return (
    <Text
      style={{
        color: small ? colors.textSecondary : colors.textPrimary,
        fontFamily: fonts.displaySemi,
        fontSize: small ? 12 : 16,
        letterSpacing: small ? 0.4 : -0.1,
      }}
    >
      {children}
    </Text>
  );
}

/**
 * Token-colored placeholder art standing in for the Figma photos (no real
 * photography exists in the repo): layered soft circles on a tinted ground.
 */
export function PracticeArt({
  height = 140,
  tint = colors.accent,
  icon = "flower",
  style,
}: {
  height?: number;
  tint?: string;
  icon?: IconName;
  style?: ViewStyle;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          height,
          borderRadius: radius.md,
          backgroundColor: colors.infoSurface,
          borderWidth: 1,
          borderColor: colors.infoBorder,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <View
        style={{
          position: "absolute",
          width: height * 1.5,
          height: height * 1.5,
          borderRadius: height * 0.75,
          backgroundColor: tint,
          opacity: 0.1,
          left: -height * 0.3,
          top: -height * 0.5,
        }}
      />
      <View
        style={{
          position: "absolute",
          width: height * 1.1,
          height: height * 1.1,
          borderRadius: height * 0.55,
          backgroundColor: colors.aiAccent,
          opacity: 0.1,
          right: -height * 0.25,
          bottom: -height * 0.5,
        }}
      />
      <View
        style={{
          width: height * 0.42,
          height: height * 0.42,
          borderRadius: height * 0.21,
          backgroundColor: "rgba(255,255,255,0.06)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={Math.max(20, height * 0.2)} color={tint} />
      </View>
    </View>
  );
}

/** Amber safety card (Figma "Listen to your body" / "Stop if you feel pain"). */
export function SafetyCard({ title, body }: { title: string; body: string }) {
  return (
    <View
      style={{
        backgroundColor: colors.warningSoft,
        borderColor: "rgba(251,191,36,0.5)",
        borderWidth: 1,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: 6,
      }}
    >
      <Text style={{ color: colors.warning, ...typography.h3 }}>{title}</Text>
      <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 18 }}>{body}</Text>
    </View>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      accessibilityLabel={label}
      trackColor={{ false: colors.surfaceHigh, true: colors.success }}
      thumbColor="#ffffff"
    />
  );
}

export function ProgressBar({ progress, height = 4 }: { progress: number; height?: number }) {
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: colors.surfaceHigh, overflow: "hidden" }}>
      <View style={{ height, width: `${p * 100}%`, backgroundColor: colors.accent }} />
    </View>
  );
}

/** Primary / outlined action button sized like the frames (filled blue vs dark outline). */
export function ActionButton({
  label,
  onPress,
  variant = "primary",
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "dark" | "outline";
  icon?: IconName;
  style?: ViewStyle;
}) {
  const bg = variant === "primary" ? colors.accent : variant === "dark" ? colors.background : "transparent";
  const border = variant === "primary" ? colors.accent : variant === "outline" ? colors.accent : colors.border;
  const fg = variant === "outline" ? colors.accent : colors.textPrimary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        {
          height: 46,
          borderRadius: radius.sm,
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: border,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.sm,
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={16} color={fg} /> : null}
      <Text style={{ color: fg, fontFamily: fonts.bodySemi, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}
