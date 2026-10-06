import React, { useState } from "react";
import { Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ConnectedDeviceKind, HealthProvider } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Button } from "../../components/Button";
import { SelectCard } from "../../components/SelectCard";
import { TextField } from "../../components/TextField";
import { PROVIDER_LABEL } from "../../lib/format";
import { colors, spacing, typography } from "../../theme/tokens";
import type { RecoverStackParamList } from "../../navigation/RecoverStack";

type Props = NativeStackScreenProps<RecoverStackParamList, "AddDevice">;

const PROVIDERS: Array<{ value: HealthProvider; hint: string }> = [
  { value: "apple_health", hint: "iPhone / Apple Watch" },
  { value: "health_connect", hint: "Android / Wear OS" },
  { value: "garmin", hint: "Garmin watches & bands" },
  { value: "fitbit", hint: "Fitbit trackers" },
  { value: "whoop", hint: "Whoop strap" },
  { value: "oura", hint: "Oura ring" },
];

const KINDS: Array<{ value: ConnectedDeviceKind; label: string }> = [
  { value: "watch", label: "Watch" },
  { value: "band", label: "Band" },
  { value: "ring", label: "Ring" },
  { value: "scale", label: "Scale" },
  { value: "other", label: "Other" },
];

/** Recover 03 - Add Device (provider + kind picker). */
export function AddDeviceScreen({ navigation }: Props) {
  const [provider, setProvider] = useState<HealthProvider | null>(null);
  const [kind, setKind] = useState<ConnectedDeviceKind>("watch");
  const [name, setName] = useState("");

  const canContinue = provider != null && name.trim().length > 0;

  return (
    <ScreenContainer title="Add device">
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={{ color: colors.textMuted, ...typography.label }}>PLATFORM / BRAND</Text>
      <View style={{ gap: spacing.sm }}>
        {PROVIDERS.map((p) => (
          <SelectCard
            key={p.value}
            title={PROVIDER_LABEL[p.value]}
            subtitle={p.hint}
            icon="watch"
            selected={provider === p.value}
            onPress={() => {
              setProvider(p.value);
              if (!name.trim()) setName(PROVIDER_LABEL[p.value]);
            }}
          />
        ))}
      </View>

      <Card style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textMuted, ...typography.label }}>DEVICE TYPE</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          {KINDS.map((k) => (
            <Chip key={k.value} label={k.label} selected={kind === k.value} onPress={() => setKind(k.value)} />
          ))}
        </View>
        <TextField label="Device name" value={name} onChangeText={setName} placeholder="e.g. My watch" maxLength={80} />
      </Card>

      <Button
        label="Continue"
        disabled={!canContinue}
        onPress={() => provider && navigation.navigate("DevicePairing", { provider, kind, name: name.trim() })}
      />
    </ScreenContainer>
  );
}
