import React from "react";
import { Image, Text, View } from "react-native";
import { BRAND_NAME } from "../lib/brand";
import { colors, fonts } from "../theme/tokens";

// Generated from the supplied logo artwork; see packages/config/src/brand.ts.
// eslint-disable-next-line @typescript-eslint/no-var-requires -- Metro bundles images only through require()
const LOGO_MARK = require("../../assets/logo-mark.png");

/**
 * The Fynrox logo mark: a running figure that forms an "F" (mint on a
 * transparent background, the same on light and dark screens).
 * `withName` adds the brand text beside it.
 */
export function BrandMark({ size = 44, withName = false }: { size?: number; withName?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }} accessibilityLabel={BRAND_NAME}>
      <Image source={LOGO_MARK} style={{ width: size, height: size }} resizeMode="contain" accessible={false} />
      {withName ? <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 13 }}>{BRAND_NAME}</Text> : null}
    </View>
  );
}
