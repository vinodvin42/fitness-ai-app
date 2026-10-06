import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NavigationProp } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Button } from "../../components/Button";
import { BackButton } from "../../components/BackButton";
import { Icon, type IconName } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { RazorpayCheckoutModal } from "../../components/RazorpayCheckoutModal";
import { fetchProgramDetail } from "../../api/programs";
import { validateCoupon } from "../../api/payments";
import { extractErrorMessage } from "../../lib/apiError";
import { useRazorpayPurchase, usePaymentsConfigured } from "../../lib/useRazorpayPurchase";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MainTabsParamList } from "../../navigation/MainTabs";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "ProgramCheckout">;
type Option = "personalized" | "coach";
type Method = "upi" | "card" | "netbanking";

const METHODS: Array<{ key: Method; label: string; icon: IconName }> = [
  { key: "upi", label: "UPI (GPay, PhonePe, BHIM)", icon: "smartphone" },
  { key: "card", label: "Credit or Debit Cards", icon: "lock" },
  { key: "netbanking", label: "Net Banking", icon: "globe" },
];

function rupees(cents: number): string {
  return `₹${Math.round(cents / 100).toLocaleString("en-IN")}`;
}

function Radio({ selected }: { selected: boolean }) {
  return (
    <View
      style={{
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: selected ? colors.accent : colors.textMuted,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} /> : null}
    </View>
  );
}

/**
 * Program Checkout (Figma Programs 01). Reached from Program Detail's Buy
 * button. Prices come from the program; the partner-code discount comes from
 * POST /coupons/validate (the order recomputes it server-side, so what is
 * charged is always the server's number). "Request coach support" leaves
 * checkout for the real coach discovery -> quote-request flow. The payment
 * method rows pick which tab Razorpay's secure checkout opens on
 * (`prefill.method`); the user can still switch inside checkout.
 */
export function ProgramCheckoutScreen({ route, navigation }: Props) {
  const { programId } = route.params;
  const queryClient = useQueryClient();
  const [option, setOption] = useState<Option>("personalized");
  const [method, setMethod] = useState<Method>("upi");
  const [codeInput, setCodeInput] = useState("");
  const [applied, setApplied] = useState<{ code: string; discountCents: number; finalCents: number } | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const { configured: paymentsConfigured } = usePaymentsConfigured();

  const { data: program, isLoading, isError, refetch } = useQuery({
    queryKey: ["program", programId],
    queryFn: () => fetchProgramDetail(programId),
  });

  const { order, purchase, isPurchasing, onCheckoutSuccess, onCheckoutDismiss } = useRazorpayPurchase({
    onVerified: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["program", programId] }),
        queryClient.invalidateQueries({ queryKey: ["programs", "mine"] }),
      ]),
    onSuccess: () => navigation.replace("ProgramDetail", { programId }),
  });

  const apply = useMutation({
    mutationFn: () => validateCoupon(codeInput.trim(), program!.priceCents),
    onSuccess: (res) => {
      if (res.valid) {
        setApplied({ code: res.code, discountCents: res.discountCents, finalCents: res.finalCents });
        setCodeError(null);
      } else {
        setApplied(null);
        setCodeError(res.reason);
      }
    },
    onError: (err) => {
      setApplied(null);
      setCodeError(extractErrorMessage(err, "Couldn't check that code. Try again."));
    },
  });

  if (isError) {
    return (
      <ScreenContainer title="Program Checkout">
        <BackButton onPress={() => navigation.goBack()} />
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }
  if (isLoading || !program) {
    return (
      <ScreenContainer title="Program Checkout">
        <BackButton onPress={() => navigation.goBack()} />
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  const subtotal = program.priceCents;
  const discount = applied?.discountCents ?? 0;
  const total = applied?.finalCents ?? subtotal;
  const parent = navigation.getParent<NavigationProp<MainTabsParamList>>();
  const card = { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border } as const;

  const onPay = () => {
    if (option === "coach") {
      parent?.navigate("More", { screen: "CoachDiscovery", params: { serviceType: "fitness" } });
      return;
    }
    purchase("program_purchase", programId, applied?.code);
  };

  return (
    <ScreenContainer title="Program Checkout">
      <BackButton onPress={() => navigation.goBack()} />

      <View style={{ ...card, padding: spacing.md, gap: 4 }}>
        <Text style={{ color: colors.accent, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.8 }}>SELECTED PROGRAM</Text>
        <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{program.name}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="clock" size={12} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, ...typography.meta }}>{program.durationWeeks} Weeks</Text>
        </View>
      </View>

      <Pressable
        onPress={() => setOption("personalized")}
        accessibilityRole="radio"
        accessibilityState={{ selected: option === "personalized" }}
        style={{ ...card, padding: spacing.md, gap: 8, borderColor: option === "personalized" ? colors.accent : colors.border }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Radio selected={option === "personalized"} />
          <Text style={{ color: colors.textPrimary, ...typography.h3, flex: 1 }}>Personalized Program</Text>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{rupees(subtotal)}</Text>
        </View>
        <Text style={{ color: colors.textMuted, ...typography.meta, lineHeight: 18 }}>
          Includes personalized training, responsive nutrition, and active recovery routines.
        </Text>
      </Pressable>

      <Pressable
        onPress={() => setOption("coach")}
        accessibilityRole="radio"
        accessibilityState={{ selected: option === "coach" }}
        style={{ ...card, padding: spacing.md, gap: 4, borderColor: option === "coach" ? colors.accent : colors.border }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Radio selected={option === "coach"} />
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Request coach support</Text>
        </View>
        <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodyBold, fontSize: 12 }}>Fee quoted after acceptance</Text>
        <Text style={{ color: colors.textMuted, ...typography.meta, lineHeight: 18 }}>
          A professional coach reviews your goals, then accepts and shares a custom quote before payment.
        </Text>
      </Pressable>

      {option === "personalized" ? (
        <>
          <View style={{ ...card, padding: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Icon name="star" size={16} color={colors.textMuted} />
            <TextInput
              value={codeInput}
              onChangeText={(v) => {
                setCodeInput(v.toUpperCase());
                if (applied) setApplied(null);
                setCodeError(null);
              }}
              placeholder="Partner Code / Creator Offer"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={40}
              style={{ flex: 1, color: colors.textPrimary, paddingVertical: 6, fontFamily: fonts.body }}
            />
            <Pressable
              onPress={() => apply.mutate()}
              disabled={!codeInput.trim() || apply.isPending}
              accessibilityRole="button"
              accessibilityLabel="Apply code"
              style={{
                backgroundColor: colors.surfaceHigh,
                borderRadius: radius.sm,
                paddingHorizontal: spacing.md,
                paddingVertical: 8,
                opacity: !codeInput.trim() || apply.isPending ? 0.5 : 1,
              }}
            >
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 12 }}>{apply.isPending ? "…" : "Apply"}</Text>
            </Pressable>
          </View>
          {codeError ? <Text style={{ color: colors.danger, ...typography.meta }}>{codeError}</Text> : null}
          {applied ? <Text style={{ color: colors.success, ...typography.meta }}>{applied.code} applied</Text> : null}

          <View style={{ ...card, padding: spacing.md, gap: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.textSecondary, ...typography.label }}>Program Subtotal</Text>
              <Text style={{ color: colors.textPrimary, ...typography.label }}>{rupees(subtotal)}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.textSecondary, ...typography.label }}>Discount</Text>
              <Text style={{ color: colors.success, ...typography.label }}>-{rupees(discount)}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Total Amount</Text>
              <Text style={{ color: colors.textPrimary, ...typography.h2 }}>
                {rupees(total)} <Text style={{ color: colors.textMuted, ...typography.meta }}>INR</Text>
              </Text>
            </View>
          </View>

          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Select Payment Method</Text>
          <View style={{ gap: spacing.sm }}>
            {METHODS.map((m) => {
              const selected = method === m.key;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => setMethod(m.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={{
                    ...card,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.sm,
                    padding: spacing.md,
                    borderColor: selected ? colors.accent : colors.border,
                  }}
                >
                  <Icon name={m.icon} size={16} color={selected ? colors.accent : colors.textMuted} />
                  <Text style={{ color: selected ? colors.textPrimary : colors.textSecondary, ...typography.label, flex: 1 }}>{m.label}</Text>
                  <Radio selected={selected} />
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {option === "personalized" && !paymentsConfigured ? (
        <Text style={{ color: colors.textMuted, ...typography.meta }}>Purchases aren't open yet during this pilot — check back soon.</Text>
      ) : null}
      <Button
        label={option === "coach" ? "Find a coach" : paymentsConfigured ? `Pay ${rupees(total)}` : "Coming soon"}
        onPress={onPay}
        loading={isPurchasing}
        disabled={option === "personalized" && !paymentsConfigured}
      />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Icon name="shield-check" size={13} color={colors.success} />
        <Text style={{ color: colors.textMuted, ...typography.meta }}>One-time purchase · Subscriptions separate</Text>
      </View>

      <RazorpayCheckoutModal order={order} preferredMethod={method} onSuccess={onCheckoutSuccess} onDismiss={onCheckoutDismiss} />
    </ScreenContainer>
  );
}
