import React, { useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { InfoCard } from "../../components/StatePanels";
import { useToast } from "../../components/Toast";
import { pairDevice } from "../../api/devices";
import { extractErrorMessage } from "../../lib/apiError";
import { PROVIDER_LABEL } from "../../lib/format";
import { colors, spacing, typography } from "../../theme/tokens";
import type { RecoverStackParamList } from "../../navigation/RecoverStack";

type Props = NativeStackScreenProps<RecoverStackParamList, "DevicePairing">;

type StepState = "done" | "current" | "todo";

function StepRow({ n, title, body, state }: { n: number; title: string; body: string; state: StepState }) {
  const done = state === "done";
  return (
    <View style={{ flexDirection: "row", gap: spacing.md, opacity: state === "todo" ? 0.55 : 1 }}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: done ? colors.success : state === "current" ? colors.accentSoft : colors.surfaceHigh,
          borderWidth: state === "current" ? 1 : 0,
          borderColor: colors.accent,
        }}
      >
        {done ? (
          <Icon name="check" size={14} color="#04120E" strokeWidth={3} />
        ) : (
          <Text style={{ color: colors.textPrimary, ...typography.label }}>{n}</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{title}</Text>
        <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>{body}</Text>
      </View>
    </View>
  );
}

/**
 * Recover 04 - Device Pairing. Real BLE scanning/pairing isn't available in
 * this build, so "pairing" is the user confirming the details and the API
 * creating the device record (POST /devices).
 */
export function DevicePairingScreen({ navigation, route }: Props) {
  const { provider, kind, name } = route.params;
  const queryClient = useQueryClient();
  const toast = useToast();
  const [paired, setPaired] = useState(false);

  const mutation = useMutation({
    mutationFn: () => pairDevice({ provider, kind, name }),
    onSuccess: () => {
      setPaired(true);
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast.show("Device added", "success");
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't add this device. Try again."), "error"),
  });

  return (
    <ScreenContainer title="Pair device">
      <BackButton onPress={() => navigation.goBack()} />
      <Card style={{ gap: spacing.xs }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{name}</Text>
        <Text style={{ color: colors.textSecondary, ...typography.meta }}>
          {PROVIDER_LABEL[provider] ?? provider} · {kind}
        </Text>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <StepRow n={1} title="Choose device" body="You picked the platform and device type." state="done" />
        <StepRow
          n={2}
          title="Confirm details"
          body="Check the name above. You can remove and re-add the device later if something's wrong."
          state={paired ? "done" : "current"}
        />
        <StepRow
          n={3}
          title="Add to your account"
          body="Creates a device record so syncs and battery level are tracked."
          state={paired ? "done" : "todo"}
        />
        <StepRow
          n={4}
          title="Import values"
          body="Open the Sync dashboard and import your latest readings."
          state={paired ? "current" : "todo"}
        />
      </Card>

      <InfoCard
        tone="accent"
        title="Bluetooth pairing isn't available yet"
        body="This build can't scan for or connect to the device itself. Adding it records it on your account; readings are entered by hand until a native sync is added."
      />

      {paired ? (
        <View style={{ gap: spacing.sm }}>
          <Button label="Open sync dashboard" onPress={() => navigation.replace("SyncDashboard")} />
          <Button label="Back to devices" variant="secondary" onPress={() => navigation.replace("ConnectedDevices")} />
        </View>
      ) : (
        <Button label="Confirm & add device" loading={mutation.isPending} onPress={() => mutation.mutate()} />
      )}
    </ScreenContainer>
  );
}
