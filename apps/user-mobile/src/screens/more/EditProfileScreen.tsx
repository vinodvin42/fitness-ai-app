import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { COMMON_COUNTRIES } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { SelectCard } from "../../components/SelectCard";
import { Stepper } from "../../components/Stepper";
import { ErrorState } from "../../components/ErrorState";
import { useAuth } from "../../context/AuthContext";
import { editOnboardingProfile, fetchOnboardingProfile } from "../../api/users";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "EditProfile">;

const GENDERS = ["male", "female", "other"] as const;

/**
 * View/Edit Profile (docs/mobile/03-screen-inventory.md §N). Phase 1
 * shipped the User-backed fields only (full name/mobile, via
 * `PATCH /users/me`) since gender/height/weight live on OnboardingProfile
 * and had no GET endpoint yet. 19 Aug 2026: that gap closed — a new
 * `GET`/`PATCH /users/me/onboarding` (distinct from the onboarding
 * wizard's own upsert, which always stamps `completedAt`; this edit
 * doesn't) backs a real "About You" section here, reusing the exact same
 * `SelectCard`/`Stepper` components and gender options/ranges the
 * onboarding wizard's AboutYouScreen already uses, so editing here feels
 * identical to how these values were first entered. **There's still no
 * real "date of birth" field** — the design's form asks for one, but
 * onboarding only ever collected `age`, so this edits age, not a DOB —
 * see gap §31. **26 Aug 2026:** added a Country row — navigates to
 * CountrySelectionScreen.tsx, its own searchable picker/save flow (same
 * pattern as Preferences -> Language), rather than an inline field here,
 * since the list is long enough to need search.
 */
export function EditProfileScreen({ navigation }: Props) {
  const { user, updateProfile } = useAuth();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    data: onboardingProfile,
    isLoading: isLoadingAboutYou,
    isError: isAboutYouError,
    refetch: refetchAboutYou,
  } = useQuery({
    queryKey: ["onboardingProfile"],
    queryFn: fetchOnboardingProfile,
  });

  const [gender, setGender] = useState<string | undefined>(undefined);
  const [age, setAge] = useState<number | undefined>(undefined);
  const [weightKg, setWeightKg] = useState<number | undefined>(undefined);
  const [heightCm, setHeightCm] = useState<number | undefined>(undefined);
  // Optional goal weight (Today's "Weight Goal" row). undefined = no target.
  const [targetWeightKg, setTargetWeightKg] = useState<number | undefined>(undefined);
  const [aboutYouLoaded, setAboutYouLoaded] = useState(false);

  useEffect(() => {
    if (onboardingProfile && !aboutYouLoaded) {
      setGender(onboardingProfile.gender ?? undefined);
      setAge(onboardingProfile.age ?? undefined);
      setWeightKg(onboardingProfile.weightKg ?? undefined);
      setHeightCm(onboardingProfile.heightCm ?? undefined);
      setTargetWeightKg(onboardingProfile.targetWeightKg ?? undefined);
      setAboutYouLoaded(true);
    }
  }, [onboardingProfile, aboutYouLoaded]);

  const canSubmit = fullName.trim().length > 0;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await updateProfile({ fullName: fullName.trim(), phone: phone.trim() || undefined });
      // Only writes the About You fields if they actually loaded — a failed
      // GET here shouldn't block saving the name/phone fields above, which
      // don't depend on it.
      if (aboutYouLoaded) {
        await editOnboardingProfile({ gender, age, weightKg, heightCm, targetWeightKg: targetWeightKg ?? null });
        await queryClient.invalidateQueries({ queryKey: ["onboardingProfile"] });
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert("Couldn't save profile", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenContainer title="Edit Profile">
      <Card>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>Full name</Text>
        <TextInput
          style={styles.input}
          placeholder="Full name"
          placeholderTextColor={colors.textMuted}
          value={fullName}
          onChangeText={setFullName}
        />

        <Text style={{ color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs }}>
          Mobile number
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Mobile number"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />

        <Text style={{ color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs }}>Country</Text>
        <Pressable
          style={[styles.input, { justifyContent: "center" }]}
          onPress={() => navigation.navigate("CountrySelection")}
        >
          <Text style={{ color: user?.countryCode ? colors.textPrimary : colors.textMuted }}>
            {user?.countryCode ? COMMON_COUNTRIES.find((c) => c.code === user.countryCode)?.name ?? user.countryCode : "Not set"}
          </Text>
        </Pressable>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>About You</Text>
        {isAboutYouError ? (
          <ErrorState message="Couldn't load gender/age/height/weight." onRetry={() => refetchAboutYou()} />
        ) : isLoadingAboutYou || !aboutYouLoaded ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <>
            <View style={{ gap: spacing.sm }}>
              {GENDERS.map((g) => (
                <SelectCard
                  key={g}
                  title={g.charAt(0).toUpperCase() + g.slice(1)}
                  selected={gender === g}
                  onPress={() => setGender(g)}
                />
              ))}
            </View>
            <View style={{ marginTop: spacing.sm }}>
              <Stepper label="Age" value={age} unit="yrs" step={1} min={13} max={100} onChange={setAge} />
              <Stepper label="Weight" value={weightKg} unit="kg" step={0.5} min={30} max={250} onChange={setWeightKg} />
              <Stepper label="Height" value={heightCm} unit="cm" step={1} min={100} max={230} onChange={setHeightCm} />
              {targetWeightKg != null ? (
                <>
                  <Stepper label="Goal weight" value={targetWeightKg} unit="kg" step={0.5} min={30} max={250} onChange={setTargetWeightKg} />
                  <Pressable onPress={() => setTargetWeightKg(undefined)} accessibilityRole="button" accessibilityLabel="Clear goal weight" hitSlop={8}>
                    <Text style={{ color: colors.textSecondary, ...typography.label, marginTop: spacing.xs }}>Clear goal weight</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  onPress={() => setTargetWeightKg(weightKg ?? 70)}
                  accessibilityRole="button"
                  accessibilityLabel="Set a goal weight"
                  hitSlop={8}
                >
                  <Text style={{ color: colors.accent, ...typography.label, marginTop: spacing.sm }}>+ Set a goal weight (optional)</Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </Card>

      <Button label="Save" onPress={onSubmit} loading={isSubmitting} disabled={!canSubmit} style={{ marginTop: spacing.lg }} />
    </ScreenContainer>
  );
}

const styles = {
  input: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
  },
} as const;
