import React from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "./Icon";
import { colors, radius, spacing, typography } from "../theme/tokens";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Show a close "x" icon (Figma AI 04) instead of the "Close" text link. */
  closeIcon?: boolean;
}

/** Modal bottom sheet with a tap-to-dismiss backdrop (no drag gesture). */
export function BottomSheet({ visible, onClose, title, children, closeIcon }: BottomSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close sheet" />
        <SafeAreaView
          edges={["bottom"]}
          accessibilityViewIsModal
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            borderTopWidth: 1,
            borderColor: colors.border,
            maxHeight: "80%",
          }}
        >
          <View
            style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginTop: spacing.sm }}
          />
          <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.md }}>
            <Text accessibilityRole="header" style={{ flex: 1, color: colors.textPrimary, ...typography.h2 }}>
              {title}
            </Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
              {closeIcon ? (
                <Icon name="x" size={22} color={colors.textSecondary} />
              ) : (
                <Text style={{ color: colors.textSecondary, ...typography.label }}>Close</Text>
              )}
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm }}>
            {children}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
