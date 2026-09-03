import React, { useState } from "react";
import { Alert, Image, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WizardLayout } from "../../components/WizardLayout";
import { Button } from "../../components/Button";
import { submitKyc } from "../../api/professionalOnboarding";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";

type Props = NativeStackScreenProps<OnboardingStackParamList, "KycUpload">;

async function pickImage(fromCamera: boolean): Promise<string | null> {
  const perm = fromCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== "granted") {
    Alert.alert(
      fromCamera ? "Camera access needed" : "Photo library access needed",
      "Enable access in your device Settings to upload your ID.",
    );
    return null;
  }
  const result = fromCamera
    ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6, allowsEditing: true })
    : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6, allowsEditing: true });
  if (result.canceled || !result.assets[0]?.base64) return null;
  return `data:image/jpeg;base64,${result.assets[0].base64}`;
}

/**
 * The shared KYC step — docs/coach/03-screen-inventory.md §B lists
 * "Aadhaar Card for KYC verification (front & back)" as one of three
 * upload slots on the same "Fitness/Credential Verification" frame, but
 * that doc's own note flags this is likely identity verification, not
 * service-specific — the backend models it that way too (one
 * `Professional.kycDocumentData` field, not per-`ProfessionalCredential`,
 * see prisma/schema.prisma). This screen is presented once, after every
 * selected service's credential upload, rather than repeated per service.
 *
 * **Flagged, not solved:** this uploads to the exact same unencrypted
 * base64-in-Postgres storage as every other document in this build, with
 * no redaction or scoped access control — a real privacy/security review
 * is needed before this should ever hold a real government ID (see
 * docs/coach/07-open-questions-gaps.md's "20 Aug 2026" entry, gap §7).
 */
export function KycUploadScreen({ navigation }: Props) {
  const [kycDocumentData, setKycDocumentData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onNext = async () => {
    if (!kycDocumentData) return;
    setError(null);
    setLoading(true);
    try {
      await submitKyc({ kycDocumentData });
      // Deliberately does NOT call markOnboardingCompleted() here — that
      // would flip RootNavigator's top-level switch straight to MainTabs
      // before this navigate() below ever gets a chance to render
      // VerificationStatus. It's called from that screen's own "Go to
      // Dashboard" button instead, matching the Figma's actual flow.
      navigation.navigate("VerificationStatus");
    } catch (err) {
      setError(extractErrorMessage(err, "Couldn't submit your ID. Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <WizardLayout
      step={3}
      total={3}
      label="Identity Verification (KYC)"
      title="Verify your identity"
      subtitle="Upload a government ID (e.g. Aadhaar Card) — required once, shared across every service you offer."
      onNext={onNext}
      nextDisabled={!kycDocumentData}
      nextLoading={loading}
    >
      {kycDocumentData ? (
        <Image
          source={{ uri: kycDocumentData }}
          style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: radius.sm, marginBottom: spacing.sm }}
        />
      ) : null}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button
          label={kycDocumentData ? "Retake Photo" : "Take Photo"}
          variant="secondary"
          onPress={async () => {
            const uri = await pickImage(true);
            if (uri) setKycDocumentData(uri);
          }}
          style={{ flex: 1 }}
        />
        <Button
          label={kycDocumentData ? "Replace" : "Upload File"}
          variant="secondary"
          onPress={async () => {
            const uri = await pickImage(false);
            if (uri) setKycDocumentData(uri);
          }}
          style={{ flex: 1 }}
        />
      </View>

      {error ? <Text style={{ color: colors.danger, ...typography.meta, marginTop: spacing.sm }}>{error}</Text> : null}
    </WizardLayout>
  );
}
