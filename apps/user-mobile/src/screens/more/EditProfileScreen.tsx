import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { COMMON_COUNTRIES } from "@fitness-ai-app/types";
import { MyAvatar } from "../../components/MyAvatar";
import { ProfilePhotoButtons, ProfilePhotoSheet } from "../../components/ProfilePhotoSheet";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { toDobString, validateDobParts } from "../../components/AboutYouParts";
import { Icon } from "../../components/Icon";
import { useAuth } from "../../context/AuthContext";
import { editOnboardingProfile, fetchOnboardingProfile } from "../../api/users";
import { extractErrorMessage } from "../../lib/apiError";
import { isoToDmy, maskDmy, splitDmy } from "../../lib/dobFormat";
import { HEIGHT_RANGE_CM, WEIGHT_RANGE_KG, cmToIn, inToCm, kgToLb, lbToKg, useMeasureUnits } from "../../lib/measureUnits";
import { useProfilePhoto, useProfilePhotoActions } from "../../lib/profilePhoto";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import { RecoverShell } from "../recover/parts";

type Props = NativeStackScreenProps<MoreStackParamList, "EditProfile">;

const GENDERS = ["male", "female", "other"] as const;
const round1 = (n: number) => Math.round(n * 10) / 10;

function Field({ label, children, onPress, chevron }: { label: string; children: React.ReactNode; onPress?: () => void; chevron?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 14,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 13 }}>{label}</Text>
        {children}
      </View>
      {chevron ? <Icon name="chevron-right" size={16} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

/**
 * View Profile (Figma Profile & Settings 02): Full Name, Date of Birth, Mobile
 * Number, Gender, Height and Weight as tappable rows, plus Country (kept from
 * the previous Edit Profile). Name/mobile live on User; DOB/gender/height/
 * weight on OnboardingProfile (storage is always cm/kg; the inputs follow the
 * user's Measurement Units). Mobile is optional free text with no OTP check.
 * Date of birth is shown and typed as DD/MM/YYYY (lib/dobFormat.ts) and still
 * saved as YYYY-MM-DD.
 * The avatar shows the member's profile photo, or initials without one; tap
 * it (or Add / Change photo) to take a photo, choose one from the gallery or
 * remove it (lib/profilePhoto.ts, 20 Oct 2026).
 */
export function EditProfileScreen({ navigation }: Props) {
  const { user, updateProfile } = useAuth();
  const { colors: theme } = useTheme();
  const queryClient = useQueryClient();
  const units = useMeasureUnits();
  const photo = useProfilePhoto();
  const photoActions = useProfilePhotoActions();
  const [photoSheet, setPhotoSheet] = useState(false);
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: profile, isLoading, isError, refetch } = useQuery({
    queryKey: ["onboardingProfile"],
    queryFn: fetchOnboardingProfile,
  });

  const [loaded, setLoaded] = useState(false);
  const [gender, setGender] = useState<string | undefined>();
  const [genderOpen, setGenderOpen] = useState(false);
  const [dob, setDob] = useState("");
  const [heightText, setHeightText] = useState("");
  const [heightInText, setHeightInText] = useState("");
  const [weightText, setWeightText] = useState("");
  // Values as first shown: untouched height/weight are not re-sent, so unit rounding (5'9" vs 175 cm) never rewrites stored data.
  const initial = useRef({ height: "", heightIn: "", weight: "" });
  const ft = units.heightUnit === "ft";
  const lb = units.weightUnit === "lb";

  useEffect(() => {
    if (!profile || loaded) return;
    setGender(profile.gender ?? undefined);
    setDob(isoToDmy(profile.dateOfBirth));
    if (profile.heightCm != null) {
      if (ft) {
        const totalIn = Math.round(cmToIn(profile.heightCm));
        initial.current.height = String(Math.floor(totalIn / 12));
        initial.current.heightIn = String(totalIn % 12);
      } else {
        initial.current.height = String(round1(profile.heightCm));
      }
      setHeightText(initial.current.height);
      setHeightInText(initial.current.heightIn);
    }
    if (profile.weightKg != null) {
      initial.current.weight = String(round1(lb ? kgToLb(profile.weightKg) : profile.weightKg));
      setWeightText(initial.current.weight);
    }
    setLoaded(true);
  }, [profile, loaded, ft, lb]);

  const onSave = async () => {
    setError(null);
    const name = fullName.trim();
    if (!name) return setError("Enter your full name.");
    let dateOfBirth: string | undefined;
    if (dob.trim()) {
      const parts = splitDmy(dob);
      if (!parts) return setError("Enter your date of birth as DD/MM/YYYY.");
      const dobError = validateDobParts(parts.day, parts.month, parts.year);
      if (dobError) return setError(`${dobError}.`);
      dateOfBirth = toDobString(parts.day, parts.month, parts.year);
    }

    let heightCm: number | undefined;
    if (heightText.trim() && (heightText !== initial.current.height || heightInText !== initial.current.heightIn)) {
      const first = parseFloat(heightText.replace(",", "."));
      heightCm = ft ? inToCm(first * 12 + (parseFloat(heightInText) || 0)) : first;
      if (!Number.isFinite(heightCm) || heightCm < HEIGHT_RANGE_CM.min || heightCm > HEIGHT_RANGE_CM.max)
        return setError(`Enter a height between ${HEIGHT_RANGE_CM.min} and ${HEIGHT_RANGE_CM.max} cm.`);
    }
    let weightKg: number | undefined;
    if (weightText.trim() && weightText !== initial.current.weight) {
      const w = parseFloat(weightText.replace(",", "."));
      weightKg = lb ? lbToKg(w) : w;
      if (!Number.isFinite(weightKg) || weightKg < WEIGHT_RANGE_KG.min || weightKg > WEIGHT_RANGE_KG.max)
        return setError(`Enter a weight between ${WEIGHT_RANGE_KG.min} and ${WEIGHT_RANGE_KG.max} kg.`);
    }

    setIsSubmitting(true);
    try {
      await updateProfile({ fullName: name, phone: phone.trim() || undefined });
      // Only writes the onboarding fields if they loaded: a failed GET must not block saving the name/phone.
      if (loaded) {
        await editOnboardingProfile({
          gender,
          dateOfBirth,
          heightCm: heightCm != null ? Math.round(heightCm * 10) / 10 : undefined,
          weightKg: weightKg != null ? Math.round(weightKg * 10) / 10 : undefined,
        });
        await queryClient.invalidateQueries({ queryKey: ["onboardingProfile"] });
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert("Couldn't save profile", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const input = {
    color: colors.textPrimary,
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    paddingVertical: 6,
    minHeight: 36,
  } as const;

  return (
    <RecoverShell centered title="View Profile" onBack={() => navigation.goBack()}>
      <View style={{ alignItems: "center", gap: 6 }}>
        <Pressable
          onPress={() => setPhotoSheet(true)}
          disabled={photoActions.busy}
          accessibilityRole="button"
          accessibilityLabel={photo.data ? "Change profile photo" : "Add profile photo"}
        >
          <MyAvatar name={fullName || user?.fullName} size={84} busy={photoActions.busy} />
        </Pressable>
        <ProfilePhotoButtons
          hasPhoto={!!photo.data}
          busy={photoActions.busy}
          onChoose={photoActions.choose}
          onRemove={photoActions.remove}
        />
      </View>
      <ProfilePhotoSheet
        visible={photoSheet}
        hasPhoto={!!photo.data}
        onClose={() => setPhotoSheet(false)}
        onChoose={photoActions.choose}
        onRemove={photoActions.remove}
      />

      {isLoading ? <ActivityIndicator color={colors.accent} /> : null}
      {isError ? <ErrorState message="Couldn't load your date of birth, gender, height and weight." onRetry={() => refetch()} /> : null}

      <Field label="Full Name">
        <TextInput
          style={input}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Full name"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Full name"
        />
      </Field>

      <Field label="Date of Birth">
        <TextInput
          style={input}
          value={dob}
          onChangeText={(t) => setDob(maskDmy(t))}
          editable={loaded}
          placeholder="DD/MM/YYYY"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          maxLength={10}
          accessibilityLabel="Date of birth, day, month and year"
        />
      </Field>

      <Field label="Mobile Number">
        <TextInput
          style={input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="Optional"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Mobile number"
        />
      </Field>

      <Field label="Gender" onPress={loaded ? () => setGenderOpen((o) => !o) : undefined} chevron>
        <Text style={{ ...input, color: gender ? colors.textPrimary : colors.textMuted, textTransform: "capitalize" }}>
          {gender ?? "Not set"}
        </Text>
      </Field>
      {genderOpen ? (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {GENDERS.map((g) => {
            const on = gender === g;
            return (
              <Pressable
                key={g}
                onPress={() => {
                  setGender(g);
                  setGenderOpen(false);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 10,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: on ? theme.accent : colors.border,
                  backgroundColor: on ? theme.accentSoft : colors.surface,
                }}
              >
                <Text style={{ color: on ? theme.accent : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13, textTransform: "capitalize" }}>{g}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Field label={`Height (${ft ? "ft / in" : "cm"})`}>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TextInput
            style={[input, { flex: 1 }]}
            value={heightText}
            onChangeText={setHeightText}
            editable={loaded}
            keyboardType={ft ? "number-pad" : "decimal-pad"}
            placeholder={ft ? "ft" : "cm"}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={ft ? "Height feet" : "Height centimetres"}
          />
          {ft ? (
            <TextInput
              style={[input, { flex: 1 }]}
              value={heightInText}
              onChangeText={setHeightInText}
              editable={loaded}
              keyboardType="number-pad"
              placeholder="in"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Height inches"
            />
          ) : null}
        </View>
      </Field>

      <Field label={`Weight (${lb ? "lb" : "kg"})`}>
        <TextInput
          style={input}
          value={weightText}
          onChangeText={setWeightText}
          editable={loaded}
          keyboardType="decimal-pad"
          placeholder={lb ? "lb" : "kg"}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Weight"
        />
      </Field>

      <Field label="Country" onPress={() => navigation.navigate("CountrySelection")} chevron>
        <Text style={{ ...input, color: user?.countryCode ? colors.textPrimary : colors.textMuted }}>
          {user?.countryCode ? COMMON_COUNTRIES.find((c) => c.code === user.countryCode)?.name ?? user.countryCode : "Not set"}
        </Text>
      </Field>

      {error ? <Text style={{ color: colors.dangerText, ...typography.meta }}>{error}</Text> : null}

      <Button label="Save Changes" onPress={onSave} loading={isSubmitting} disabled={!fullName.trim()} />
    </RecoverShell>
  );
}
