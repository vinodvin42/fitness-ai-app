import React from "react";
import { Linking, Text, View } from "react-native";
import type { CreditLine } from "../lib/exerciseVideo";
import { colors, typography } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

/**
 * The credit a licensed video needs, shown right under it (e.g. wger clips,
 * CC BY-SA 4.0): "Video: Goulart · CC BY-SA 4.0 · Source", where the licence
 * and Source open in the browser, plus what we changed. Built from
 * lib/exerciseVideo.ts creditLine().
 */
export function VideoCredit({ credit }: { credit: CreditLine }) {
  const { colors: theme } = useTheme();
  const open = (url: string) => {
    Linking.openURL(url).catch(() => undefined);
  };
  const link = { color: theme.accentText, textDecorationLine: "underline" as const };

  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: colors.textMuted, ...typography.meta }}>
        Video: {credit.author} ·{" "}
        <Text style={link} onPress={() => open(credit.licenceUrl)} accessibilityRole="link" accessibilityLabel={`Licence: ${credit.licence}`}>
          {credit.licence}
        </Text>{" "}
        ·{" "}
        <Text style={link} onPress={() => open(credit.sourceUrl)} accessibilityRole="link" accessibilityLabel="Video source">
          Source
        </Text>
      </Text>
      {credit.changes ? <Text style={{ color: colors.textMuted, ...typography.meta }}>{credit.changes}</Text> : null}
    </View>
  );
}
