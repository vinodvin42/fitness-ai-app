import React from "react";
import { Image, View } from "react-native";
import { Icon } from "./Icon";
import { colors } from "../theme/tokens";

// The same artwork as BrandMark (packages/config/src/brand.ts).
// eslint-disable-next-line @typescript-eslint/no-var-requires -- Metro bundles images only through require()
const LOGO_MARK = require("../../assets/logo-mark.png");

/**
 * Fynrox AI's mark (owner, 26 Oct 2026: "redesign ai icon using application logo"): the app's logo
 * (the running figure that forms an "F") with a small spark in its empty lower corner, so the AI coach reads as
 * Fynrox's own rather than a generic sparkle. Used wherever the AI coach opens or speaks: the AI
 * button on Workouts, AI banners, the Recovery insight and chat row, and the chat's assistant avatar.
 *
 * `color` recolours the logo (for a filled background); left out, it keeps the brand mint.
 * `sparkColor` defaults to the AI accent.
 */
export function AiMark({ size = 20, color, sparkColor = colors.aiAccent }: { size?: number; color?: string; sparkColor?: string }) {
  const spark = Math.max(8, Math.round(size * 0.45));
  return (
    <View style={{ width: size, height: size }} accessible={false} importantForAccessibility="no-hide-descendants">
      <Image source={LOGO_MARK} style={[{ width: size, height: size }, color ? { tintColor: color } : null]} resizeMode="contain" />
      {/* Bottom right: the logo's one empty corner, so the spark never sits on the "F". */}
      <View style={{ position: "absolute", bottom: -spark * 0.05, right: -spark * 0.25 }}>
        <Icon name="sparkles" size={spark} color={sparkColor} strokeWidth={2.4} />
      </View>
    </View>
  );
}
