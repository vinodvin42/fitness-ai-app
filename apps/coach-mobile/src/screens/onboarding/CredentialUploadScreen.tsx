import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Image, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ProfessionalServiceType } from "@fitness-ai-app/types";
import { WizardLayout } from "../../components/WizardLayout";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { submitCredential } from "../../api/professionalOnboarding";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";

type Props = NativeStackScreenProps<OnboardingStackParamList, "CredentialUpload">;

const SERVICE_LABELS: Record<ProfessionalServiceType, string> = {
  fitness: "Fitness Coaching",
  nutrition: "Nutrition Coaching",
};

async function pickImage(fromCamera: boolean): Promise<string | null> {
  const perm = fromCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== "granted") {
    Alert.alert(
      fromCamera ? "Camera access needed" : "Photo library access needed",
      "Enable access in your device Settings to upload a document.",
    );
    return null;
  }
  const result = fromCamera
    ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6, allowsEditing: true })
    : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6, allowsEditing: true });
  if (result.canceled || !result.assets[0]?.base64) return null;
  return `data:image/jpeg;base64,${result.assets[0].base64}`;
}

function UploadSlot({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string | null;
  onChange: (dataUri: string) => void;
}) {
  return (
    <Card>
      <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{label}</Text>
      <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2, marginBottom: spacing.sm }}>
        {hint}
      </Text>
      {value ? (
        <Image source={{ uri: value }} style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: radius.sm, marginBottom: spacing.sm }} />
      ) : null}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button
          label={value ? "Retake Photo" : "Take Photo"}
          variant="secondary"
          onPress={async () => {
            const uri = await pickImage(true);
            if (uri) onChange(uri);
          }}
          style={{ flex: 1, height: 44 }}
        />
        <Button
          label={value ? "Replace" : "Upload File"}
          variant="secondary"
          onPress={async () => {
            const uri = await pickImage(false);
            if (uri) onChange(uri);
          }}
          style={{ flex: 1, height: 44 }}
        />
      </View>
    </Card>
  );
}

/**
 * docs/coach/03-screen-inventory.md §B "Fitness/Credential Verification"
 * (step 2) — two upload slots (Certification Document, Qualification
 * Certificate — Aadhaar/KYC is its own separate KycUploadScreen, see
 * OnboardingStack's doc comment) plus Certification Name / Certifying Body
 * / Year Obtained text fields, looped once per service selected on the
 * previous screen (`services`/`index` route params). Uploads are images
 * only (camera or library, JPEG-compressed) via `expo-image-picker` — the
 * backend's `documentDataSchema` also accepts PDFs, but this first slice
 * doesn't add a document-picker dependency for that; same documented
 * simplification apps/user-mobile's Progress Photos made for its own
 * camera/library-only uploads.
 */
export function CredentialUploadScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { services, index } = route.params;
  const serviceType = services[index];

  const [certificationName, setCertificationName] = useState("");
  const [certifyingBody, setCertifyingBody] = useState("");
  const [yearObtained, setYearObtained] = useState("");
  const [certificationDocData, setCertificationDocData] = useState<string | null>(null);
  const [qualificationDocData, setQualificationDocData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onNext = async () => {
    setError(null);
    setLoading(true);
    try {
      await submitCredential({
        serviceType,
        certificationName: certificationName.trim() || undefined,
        certifyingBody: certifyingBody.trim() || undefined,
        yearObtained: yearObtained.trim() ? Number(yearObtained.trim()) : undefined,
        certificationDocData: certificationDocData ?? undefined,
        qualificationDocData: qualificationDocData ?? undefined,
      });

      const nextIndex = index + 1;
      if (nextIndex < services.length) {
        navigation.replace("CredentialUpload", { services, index: nextIndex });
      } else {
        navigation.navigate("KycUpload", { services });
      }
    } catch (err) {
      setError(extractErrorMessage(err, "Couldn't submit your credentials. Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <WizardLayout
      step={2}
      total={3}
      label={`Credential Verification — ${index + 1} of ${services.length}`}
      title={`${SERVICE_LABELS[serviceType]} credentials`}
      subtitle={t("onboarding.credentials.subtitle")}
      onNext={onNext}
      nextLoading={loading}
      nextLabel={index + 1 < services.length ? "Next Service" : "Continue"}
    >
      <TextInput
        style={inputStyle}
        placeholder={t("onboarding.credentials.name")}
        placeholderTextColor={colors.textMuted}
        value={certificationName}
        onChangeText={setCertificationName}
      />
      <TextInput
        style={inputStyle}
        placeholder={t("onboarding.credentials.body")}
        placeholderTextColor={colors.textMuted}
        value={certifyingBody}
        onChangeText={setCertifyingBody}
      />
      <TextInput
        style={inputStyle}
        placeholder={t("onboarding.credentials.year")}
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        value={yearObtained}
        onChangeText={setYearObtained}
      />

      <UploadSlot
        label={t("onboarding.credentials.document")}
        hint="A photo or scan of your certification."
        value={certificationDocData}
        onChange={setCertificationDocData}
      />
      <UploadSlot
        label={t("onboarding.credentials.certificate")}
        hint="A photo or scan of your qualification certificate."
        value={qualificationDocData}
        onChange={setQualificationDocData}
      />

      {error ? <Text style={{ color: colors.danger, ...typography.meta }}>{error}</Text> : null}
    </WizardLayout>
  );
}

const inputStyle = {
  height: 52,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.surface,
  paddingHorizontal: spacing.md,
  color: colors.textPrimary,
} as const;
