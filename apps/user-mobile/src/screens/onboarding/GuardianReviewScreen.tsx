import React, { useEffect, useState } from "react";
import { Alert, Text } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StateLayout, InfoCard } from "../../components/StatePanels";
import { TextField } from "../../components/TextField";
import { fetchGuardianReview, submitGuardianReview } from "../../api/users";
import { useOnboardingWizard } from "../../context/OnboardingWizardContext";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, spacing } from "../../theme/tokens";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";

type Props = NativeStackScreenProps<OnboardingStackParamList, "GuardianReview">;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POLL_MS = 5000;

/**
 * Figma "01 Onboarding / 11 Guardian review is required" — a real gate, shown
 * after About You when the date of birth says under 18. The only data
 * collected is the guardian's email. Submitting makes the API email the
 * guardian a single-use, expiring approval link; until they approve, the
 * wizard does NOT proceed (no health questions, profiling or plan
 * generation — also enforced server-side with 403 guardian_authorization_
 * pending). This screen then waits, polling GET /users/me/guardian-review,
 * and continues automatically once approved. Resend / Change email are
 * available while waiting.
 */
export function GuardianReviewScreen({ navigation }: Props) {
  const { markScreenReached } = useOnboardingWizard();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [editing, setEditing] = useState(false);

  const { data: review, isLoading } = useQuery({
    queryKey: ["users", "guardian-review"],
    queryFn: fetchGuardianReview,
    refetchInterval: (query) => (query.state.data?.status === "pending" ? POLL_MS : false),
  });

  const submit = useMutation({
    mutationFn: (guardianEmail: string) => submitGuardianReview({ guardianEmail }),
    onSuccess: (saved) => {
      queryClient.setQueryData(["users", "guardian-review"], saved);
      setEditing(false);
    },
    onError: (err) => Alert.alert("Couldn't contact your guardian", extractErrorMessage(err, "Check your connection and try again.")),
  });

  // Approved (here, or earlier in a previous session): the gate is cleared, carry on.
  useEffect(() => {
    if (review?.status === "approved") {
      markScreenReached("Schedule");
      navigation.replace("Schedule");
    }
  }, [review?.status, markScreenReached, navigation]);

  useEffect(() => {
    if (review?.guardianEmail && !email) setEmail(review.guardianEmail);
  }, [review?.guardianEmail]);

  const emailError = touched && !EMAIL_RE.test(email.trim()) ? "Enter a valid email address" : null;

  const onSubmit = () => {
    setTouched(true);
    if (!EMAIL_RE.test(email.trim())) return;
    submit.mutate(email.trim());
  };

  const waiting = review?.status === "pending" && !editing;
  const declined = review?.status === "declined" && !editing;

  if (isLoading) {
    return (
      <StateLayout
        showBrand
        flowLabel="Consent / Age check"
        flowIcon="users"
        title="Guardian review is required"
        description="Checking your guardian review status..."
        onBack={() => navigation.goBack()}
        actions={[]}
      />
    );
  }

  if (waiting && review) {
    return (
      <StateLayout
        showBrand
        flowLabel="Consent / Age check"
        flowIcon="users"
        title="Waiting for your guardian"
        description={`We emailed ${review.guardianEmail}. Setup continues automatically as soon as they approve. The link works once and expires in 7 days.`}
        onBack={() => navigation.goBack()}
        footnote="Contact details alone do not count as authorization."
        actions={[
          { label: "Resend email", onPress: () => submit.mutate(review.guardianEmail), loading: submit.isPending },
          { label: "Change email", variant: "secondary", onPress: () => setEditing(true) },
        ]}
      >
        <InfoCard
          tone="accent"
          title="Setup paused · Authorization not verified"
          body="No health questions, fitness profiling, personalized plans or analysis will run while authorization is pending. Please don't send medical details."
        />
        <InfoCard
          title="What happens next"
          body="Your guardian will be asked to review the request and complete the authorization process. You can resume eligible setup only after that authorization is verified. This screen does not verify identity or establish legal compliance."
        />
      </StateLayout>
    );
  }

  return (
    <StateLayout
      showBrand
      flowLabel="Consent / Age check"
      flowIcon="users"
      title="Guardian review is required"
      description="Your age check indicates you're under 18. We need verified guardian authorization before any fitness or health-data processing begins."
      onBack={() => navigation.goBack()}
      footnote="Contact details alone do not count as authorization."
      actions={[
        { label: "Continue to guardian review", onPress: onSubmit, loading: submit.isPending },
        { label: "Go back to age check", variant: "secondary", onPress: () => navigation.goBack() },
      ]}
    >
      {declined ? (
        <InfoCard
          tone="danger"
          title="Your guardian declined"
          body="Health questions and personalized plans stay off. If this was a mistake, enter an email and send a new request."
        />
      ) : (
        <InfoCard
          tone="accent"
          title="Setup paused · Authorization not verified"
          body="No health questions, fitness profiling, personalized plans or analysis will run while authorization is pending. Please don't send medical details."
        />
      )}
      <TextField
        label="Guardian email address"
        value={email}
        onChangeText={setEmail}
        error={emailError}
        placeholder="Enter guardian's email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="emailAddress"
      />
      <Text style={{ color: colors.textSecondary, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, marginTop: -spacing.xs }}>
        Only one contact address is requested at this step so we can arrange guardian review. Ask your guardian before entering their email.
      </Text>
      <InfoCard
        title="What happens next"
        body="Your guardian will be asked to review the request and complete the authorization process. You can resume eligible setup only after that authorization is verified. This screen does not verify identity or establish legal compliance."
      />
    </StateLayout>
  );
}
