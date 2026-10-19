import React from "react";
import { Image } from "react-native";

// Generated from the supplied logo artwork; see packages/config/src/brand.ts.
// React Native bundles image assets through require().
// eslint-disable-next-line @typescript-eslint/no-var-requires
const LOGO_MARK = require("../../assets/logo-mark.png");

/**
 * The Fynrox logo mark: a running figure that forms an "F" (cyan-to-blue
 * gradient on a transparent background, the same on light and dark screens).
 */
export function BrandMark({ size = 72 }: { size?: number }) {
  return <Image source={LOGO_MARK} style={{ width: size, height: size }} resizeMode="contain" accessible={false} />;
}
