import React from "react";
import { Image, Platform, Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { SvgXml } from "react-native-svg";
import { IconButton } from "./IconButton";
import { MEASURE_SVGS, themedSvg, type FigmaSvg, type SvgPalette } from "../assets/figmaMeasureSvgs";
import { useTheme } from "../theme/ThemeProvider";
import { colors, fonts, radius } from "../theme/tokens";

/**
 * Shared pieces of the Body Measurements screens (Figma "06b — Progress · Body
 * measurements"): the compact header, the small segmented toggle, the pill
 * chip and the Figma artwork drawn in the app's theme colours.
 */

/** Figma's neutral body colours on dark; a light equivalent for light mode. */
export function useSvgPalette(): SvgPalette {
  const { colors: theme, scheme } = useTheme();
  return scheme === "light"
    ? { figure: "#cfd8de", outline: "#98a6ae", accent: theme.accent, card: colors.surface }
    : { figure: "#383840", outline: "#595966", accent: theme.accent, card: colors.surface };
}

/** A Figma SVG at its exported size (or `width`/`height`), in theme colours. */
export function FigmaArt({
  svg,
  width,
  height,
  style,
}: {
  svg: FigmaSvg;
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = useSvgPalette();
  const xml = themedSvg(svg, palette);
  const w = width ?? svg.width;
  const h = height ?? svg.height;
  return (
    <View style={style} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* react-native-svg has no SvgXml on web; the browser draws the same SVG as an image. */}
      {Platform.OS === "web" ? (
        <Image source={{ uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}` }} style={{ width: w, height: h }} />
      ) : (
        <SvgXml xml={xml} width={w} height={h} />
      )}
    </View>
  );
}

export const measureSvg = (key: keyof typeof MEASURE_SVGS): FigmaSvg => MEASURE_SVGS[key];

/** Figma header: back button, 20 px title, optional right action, 13 px subtitle. */
export function MeasureHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string | null;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={{ gap: 4, paddingTop: 4, paddingBottom: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 1 }}>
          <IconButton icon="chevron-left" accessibilityLabel="Back" onPress={onBack} size={32} iconSize={16} />
          <Text accessibilityRole="header" numberOfLines={1} style={{ flexShrink: 1, color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 20 }}>
            {title}
          </Text>
        </View>
        {right}
      </View>
      {subtitle ? <Text style={{ color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13 }}>{subtitle}</Text> : null}
    </View>
  );
}

/** Figma's small segmented control (Front/Back, cm/in). */
export function MiniSegment<T extends string>({
  options,
  value,
  onChange,
  paddingVertical = 6,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  paddingVertical?: number;
}) {
  const { colors: theme } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: "row", padding: 3, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            hitSlop={4}
            style={{ paddingHorizontal: 14, paddingVertical, borderRadius: radius.sm, backgroundColor: selected ? theme.accentSoft : "transparent" }}
          >
            <Text style={{ color: selected ? theme.accentText : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Figma pill chip ("Sat 24 Oct vs Thu 24 Sep", "Change dates", "Same as last time"). */
export function PillChip({
  label,
  onPress,
  accessibilityLabel,
  raised,
}: {
  label: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Raised fill (Same as last time) instead of the card fill. */
  raised?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={6}
      style={{
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: raised ? colors.surfaceRaised : colors.surface,
        paddingHorizontal: raised ? 10 : 12,
        paddingVertical: raised ? 6 : 7,
      }}
    >
      <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}
