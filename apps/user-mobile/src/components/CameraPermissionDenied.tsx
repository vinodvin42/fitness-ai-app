import React from "react";
import { Linking, Text, View } from "react-native";
import { Icon } from "./Icon";
import { InfoCard, StateLayout } from "./StatePanels";
import { colors, radius, spacing, typography } from "../theme/tokens";

interface CameraPermissionDeniedProps {
  /** "barcode" = Fuel 10 (scanner), "snap" = Fuel 09 (photo meal capture). */
  variant: "barcode" | "snap";
  /** Only offered while the OS will still show the permission prompt. */
  onRequestPermission?: () => void;
  onManual: () => void;
  onBack?: () => void;
}

/** Camera-not-granted state (Figma Fuel 09 / Fuel 10) with an Open Settings action. */
export function CameraPermissionDenied({ variant, onRequestPermission, onManual, onBack }: CameraPermissionDeniedProps) {
  const isBarcode = variant === "barcode";
  const openSettings = () => {
    Linking.openSettings().catch(() => undefined);
  };
  return (
    <StateLayout
      flowLabel={isBarcode ? "Permissions / Barcode scanner" : "Permissions / Snap a meal"}
      flowIcon={isBarcode ? "scan-barcode" : "camera-off"}
      title={isBarcode ? "Scan later. Log now." : "Camera access is off"}
      description={
        isBarcode
          ? "The barcode scanner can't open because camera permission hasn't been granted. No camera capture is active."
          : "Snap a meal needs camera access to take a food photo. You can still log your meal without a camera."
      }
      footnote={isBarcode ? "You can enable camera access whenever you choose." : "Settings → 23PrimeFit → Camera. You're in control."}
      onBack={onBack}
      actions={[
        { label: isBarcode ? "Search or enter food manually" : "Log meal manually", onPress: onManual },
        ...(onRequestPermission ? [{ label: "Allow camera", onPress: onRequestPermission, variant: "secondary" as const }] : []),
        { label: "Open settings", onPress: openSettings, variant: "secondary" as const },
      ]}
    >
      <View
        style={{
          height: 174,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.card,
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.md,
        }}
      >
        <Icon name={isBarcode ? "scan-barcode" : "camera-off"} size={isBarcode ? 52 : 30} color={colors.textSecondary} strokeWidth={1.5} />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: colors.surfaceRaised,
            borderRadius: radius.pill,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
        >
          <Icon name="lock" size={13} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, ...typography.meta }}>
            {isBarcode ? "Camera access off" : "Camera permission not granted"}
          </Text>
        </View>
      </View>
      <InfoCard
        title={isBarcode ? "Use the package label instead" : "Manual logging works as usual"}
        body={
          isBarcode
            ? "Enter the food and nutrition values manually. Check the serving size and your portion against the label before you save."
            : "Choose a portion and review its nutrition before saving. Your meal tracking does not depend on photo access."
        }
      />
      <InfoCard
        tone="accent"
        title={isBarcode ? "Enable scanning in settings" : "If you want to use photos later"}
        body={
          isBarcode
            ? "Open device settings, allow Camera for 23PrimeFit, then return here to scan. Manual entry remains available."
            : "Enable camera access in your device settings, then return to Snap a meal. A photo estimate still needs your review of the food and portion."
        }
      />
    </StateLayout>
  );
}
