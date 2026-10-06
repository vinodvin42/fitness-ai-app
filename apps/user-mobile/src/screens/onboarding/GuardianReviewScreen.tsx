import React, { useState } from "react";
import { Alert, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { GuardianRelationship } from "@fitness-ai-app/types";
import { WizardLayout } from "../../components/WizardLayout";
import { TextField } from "../../components/TextField";
import { Chip } from "../../components/Chip";
import { InfoCard } from "../../components/StatePanels";
import { submitGuardianReview } from "../../api/users";
import { useOnboardingWizard } from "../../context/OnboardingWizardContext";
import { extractErrorMessage } from "../../lib/apiError";
import { spacing } from "../../theme/tokens";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";

type Props = NativeStackScreenProps<OnboardingStackParamList, "GuardianReview">;

const RELATIONSHIPS: Array<{ value: GuardianRelationship; label: string }> = [
  { value: "parent", label: "Parent" },
  { value: "legal_guardian", label: "Legal guardian" },
  { value: "other", label: "Other" },
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Onboarding 11 "Under-18 guardian review" — shown after About You when
 * age < 18 (built from the task description; Figma MCP unavailable).
 * Submits POST /users/me/guardian-review then lets the user continue
 * (restrict, don't dead-end). Not implemented: guardian verification or an
 * approval link — the review stays "pending"; see apps/api users.service.ts.
 */
export function GuardianReviewScreen({ navigation }: Props) {
  const { markScreenReached } = useOnboardingWizard();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState<GuardianRelationship>("parent");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const emailError = touched && !EMAIL_RE.test(email.trim()) ? "Enter a valid email address" : null;
  const nameError = touched && !name.trim() ? "Enter your guardian's name" : null;

  const onNext = async () => {
    setTouched(true);
    if (!name.trim() || !EMAIL_RE.test(email.trim())) return;
    setBusy(true);
    try {
      await submitGuardianReview({ guardianName: name.trim(), guardianEmail: email.trim(), relationship });
      markScreenReached("Schedule");
      navigation.navigate("Schedule");
    } catch (err) {
      Alert.alert("Couldn't save guardian details", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <WizardLayout
      step={1}
      total={8}
      label="Guardian review"
      title="A parent or guardian needs to review"
      subtitle="Because you're under 18, your account needs a parent or guardian review."
      onBack={() => navigation.goBack()}
      onNext={onNext}
      nextLabel="Send & continue"
      nextLoading={busy}
    >
      <View style={{ gap: spacing.md }}>
        <InfoCard
          tone="accent"
          title="You can keep going"
          body="While the review is pending you can finish setup. Your plan will use a more conservative, age-appropriate approach, and a reminder will show on Today."
        />
        <TextField label="Guardian's full name" value={name} onChangeText={setName} error={nameError} autoCapitalize="words" />
        <TextField
          label="Guardian's email"
          value={email}
          onChangeText={setEmail}
          error={emailError}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          helper="We'll send them a short notice. It contains no links."
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          {RELATIONSHIPS.map((r) => (
            <Chip key={r.value} label={r.label} selected={relationship === r.value} onPress={() => setRelationship(r.value)} />
          ))}
        </View>
      </View>
    </WizardLayout>
  );
}
