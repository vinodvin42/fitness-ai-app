import React from "react";
import { Text, View } from "react-native";
import { Icon } from "./Icon";
import { BRAND_NAME } from "../lib/brand";
import { colors, fonts } from "../theme/tokens";

/** Circular logo disc (Figma onboarding header / splash). `withName` adds the brand text beside it. */
export function BrandMark({ size = 44, withName = false }: { size?: number; withName?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }} accessibilityLabel={BRAND_NAME}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "#F4F4F5",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="rotate-cw" size={size * 0.56} color="#0B1F4A" strokeWidth={2.75} />
      </View>
      {withName ? <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 13 }}>{BRAND_NAME}</Text> : null}
    </View>
  );
}
