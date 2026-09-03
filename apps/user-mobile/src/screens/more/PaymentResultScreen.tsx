import React from "react";
import { Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "PaymentResult">;

/**
 * Payment Success / Failed (docs/mobile/03-screen-inventory.md §M), added 31
 * Aug 2026 — dedicated result screens replacing the checkout flow's inline
 * Alert, reached from SubscriptionScreen via useRazorpayPurchase's
 * onSuccess/onError. Program/Workout purchases keep the lighter Alert path
 * (they don't pass those callbacks).
 */
export function PaymentResultScreen({ route, navigation }: Props) {
  const { status, message } = route.params;
  const success = status === "success";

  return (
    <ScreenContainer title={success ? "Payment Successful" : "Payment Failed"}>
      <Card style={{ alignItems: "center", paddingVertical: spacing.xl }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: success ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
          }}
        >
          <Text style={{ fontSize: 32, color: success ? colors.success : colors.danger }}>
            {success ? "✓" : "!"}
          </Text>
        </View>
        <Text style={{ color: colors.textPrimary, ...typography.h1, marginTop: spacing.md, textAlign: "center" }}>
          {success ? "You're all set" : "Something went wrong"}
        </Text>
        <Text style={{ color: colors.textSecondary, marginTop: spacing.xs, textAlign: "center" }}>
          {success
            ? "Your subscription is now active. Enjoy 23PrimeFit."
            : message ?? "Your payment didn't go through. You haven't been charged."}
        </Text>
      </Card>

      <Button
        label={success ? "Done" : "Back to Plans"}
        onPress={() => navigation.navigate("Subscription")}
        style={{ marginTop: spacing.lg }}
      />
    </ScreenContainer>
  );
}
