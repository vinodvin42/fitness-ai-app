import React from "react";
import { Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Consent, ConsentType } from "@fitness-ai-app/types";
import { StateLayout, InfoCard } from "../../components/StatePanels";
import { updateConsent } from "../../api/consents";
import { extractErrorMessage } from "../../lib/apiError";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "ConsentWithdrawn">;

const COPY: Record<ConsentType, { name: string; stops: string; retained: string }> = {
  health_data_processing: {
    name: "Health data processing",
    stops: "We stop using your medical conditions, injuries and body data to tailor plans and safety checks. Plans may become more generic.",
    retained: "Data you already entered stays on your account until you delete it or the account. We keep a record of this withdrawal.",
  },
  data_analytics: {
    name: "Product analytics",
    stops: "We stop using your in-app activity to improve the product. The app works the same.",
    retained: "Analytics already collected isn't erased by this. We keep a record of this withdrawal.",
  },
  marketing_emails: {
    name: "Marketing emails",
    stops: "We stop sending promotional emails.",
    retained: "Account and security emails still go out. We keep a record of this withdrawal.",
  },
};

/** Onboarding 10 "Withdrawal confirmed" — shown after a consent is turned off in Privacy settings (built from the task description; Figma MCP unavailable). */
export function ConsentWithdrawnScreen({ navigation, route }: Props) {
  const { type } = route.params;
  const copy = COPY[type];
  const queryClient = useQueryClient();

  const undo = useMutation({
    mutationFn: () => updateConsent({ type, granted: true }),
    onSuccess: (consent) => {
      queryClient.setQueryData<Consent[] | undefined>(["users", "consents"], (prev) =>
        prev ? prev.map((c) => (c.type === consent.type ? consent : c)) : prev,
      );
      navigation.goBack();
    },
    onError: (err) => Alert.alert("Couldn't undo", extractErrorMessage(err, "Check your connection and try again.")),
  });

  return (
    <StateLayout
      flowLabel="Privacy / Consent"
      flowIcon="shield-check"
      title="Withdrawal confirmed"
      description={`You've withdrawn consent for ${copy.name}. Changes apply from now on.`}
      actions={[
        { label: "Back to settings", onPress: () => navigation.goBack() },
        { label: "Undo", variant: "secondary", onPress: () => undo.mutate(), loading: undo.isPending },
      ]}
    >
      <InfoCard tone="accent" title="What stops" body={copy.stops} />
      <InfoCard title="What we keep" body={copy.retained} />
    </StateLayout>
  );
}
