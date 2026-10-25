import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Image, Platform, Pressable, Text, View } from "react-native";
import { SPOKEN_LANGUAGES } from "@fitness-ai-app/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { SelectCard } from "../../components/SelectCard";
import { fetchMe, setMyGender, setMyLanguages } from "../../api/professionalAuth";
import { deleteMyPhoto, fetchMyPhoto, saveMyPhoto } from "../../api/professionalPhoto";
import { extractErrorMessage } from "../../lib/apiError";
import { confirmAction, showAlert } from "../../lib/dialogs";
import { pickProfilePhoto } from "../../lib/profilePhoto";
import { colors, radius, spacing, typography } from "../../theme/tokens";

type Choice = "female" | "male" | "none";

const OPTIONS: Array<{ value: Choice; key: "profile.female" | "profile.male" | "profile.preferNot" }> = [
  { value: "female", key: "profile.female" },
  { value: "male", key: "profile.male" },
  { value: "none", key: "profile.preferNot" },
];

/**
 * My profile (owner, 20 Oct 2026: "give male and female coaches option").
 * The coach states their gender so members who ask for a male or female
 * coach can be matched with them (apps/api lib/coachGender.ts). "Prefer not
 * to say" leaves it unset; such a coach only gets requests with no preference.
 *
 * Profile photo (owner, 25 Oct 2026): members see it on your profile and in Find a professional.
 * Languages (owner, 25 Oct 2026): the languages you coach in, shown on your profile; members can
 * filter Find a professional by one.
 */
export function ProfileScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["professionalMe"], queryFn: fetchMe });
  const [choice, setChoice] = useState<Choice | null>(null);
  const current: Choice = me.data?.professional.gender ?? "none";

  useEffect(() => {
    if (me.data && choice === null) setChoice(me.data.professional.gender ?? "none");
  }, [me.data, choice]);

  const savedLanguages = me.data?.professional.languages ?? [];
  const [languages, setLanguages] = useState<string[] | null>(null);
  useEffect(() => {
    if (me.data && languages === null) setLanguages(me.data.professional.languages ?? []);
  }, [me.data, languages]);
  const pickedLanguages = languages ?? savedLanguages;
  const languagesChanged = [...pickedLanguages].sort().join(",") !== [...savedLanguages].sort().join(",");
  const toggleLanguage = (code: string) =>
    setLanguages(pickedLanguages.includes(code) ? pickedLanguages.filter((c) => c !== code) : [...pickedLanguages, code]);
  const saveLanguages = useMutation({
    mutationFn: () => setMyLanguages(pickedLanguages),
    onSuccess: (res) => {
      setLanguages(res.languages);
      queryClient.invalidateQueries({ queryKey: ["professionalMe"] });
      showAlert(t("profile.saved"));
    },
    onError: (err) => showAlert(t("profile.saveFailed"), extractErrorMessage(err, t("common.checkConnection"))),
  });

  const photo = useQuery({ queryKey: ["professionalPhoto"], queryFn: fetchMyPhoto });
  const [photoBusy, setPhotoBusy] = useState(false);
  const name = me.data?.professional.fullName ?? "";
  const initials = name.trim().split(/\s+/).filter(Boolean).map((w, i, all) => (i === 0 || i === all.length - 1 ? w[0] : "")).join("").toUpperCase();

  const changePhoto = async (fromCamera: boolean) => {
    const imageData = await pickProfilePhoto(fromCamera);
    if (!imageData) return;
    setPhotoBusy(true);
    try {
      await saveMyPhoto(imageData);
      await queryClient.invalidateQueries({ queryKey: ["professionalPhoto"] });
      showAlert(t("profile.photoSaved"));
    } catch (err) {
      showAlert(t("profile.photoFailed"), extractErrorMessage(err, t("common.checkConnection")));
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = () =>
    confirmAction(t("profile.removePhotoTitle"), t("profile.removePhotoBody"), t("profile.removePhoto"), async () => {
      setPhotoBusy(true);
      try {
        await deleteMyPhoto();
        await queryClient.invalidateQueries({ queryKey: ["professionalPhoto"] });
      } catch (err) {
        showAlert(t("profile.photoFailed"), extractErrorMessage(err, t("common.checkConnection")));
      } finally {
        setPhotoBusy(false);
      }
    });

  const save = useMutation({
    mutationFn: (c: Choice) => setMyGender(c === "none" ? null : c),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["professionalMe"] });
      showAlert(t("profile.saved"));
    },
    onError: (err) => showAlert(t("profile.saveFailed"), extractErrorMessage(err, t("common.checkConnection"))),
  });

  return (
    <ScreenContainer title={t("profile.title")}>
      <Text onPress={() => navigation.goBack()} style={{ color: colors.accent, fontWeight: "600" }}>
        {t("profile.back")}
      </Text>

      {me.isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : me.isError ? (
        <ErrorState onRetry={() => me.refetch()} />
      ) : (
        <>
        <Card>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{t("profile.photoTitle")}</Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 4 }}>{t("profile.photoHelp")}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md }}>
            <View
              style={{ width: 88, height: 88, borderRadius: radius.pill, overflow: "hidden", backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}
            >
              {photo.data ? (
                <Image source={{ uri: photo.data.imageData }} style={{ width: 88, height: 88 }} accessibilityLabel={t("profile.photoTitle")} />
              ) : (
                <Text style={{ color: colors.accent, fontSize: 30, fontWeight: "700" }}>{initials || "?"}</Text>
              )}
            </View>
            <View style={{ flex: 1, gap: spacing.sm }}>
              <Button label={photo.data ? t("profile.changePhoto") : t("profile.choosePhoto")} onPress={() => void changePhoto(false)} loading={photoBusy} disabled={photo.isLoading} />
              {Platform.OS !== "web" ? <Button label={t("profile.takePhoto")} variant="secondary" onPress={() => void changePhoto(true)} disabled={photoBusy} /> : null}
              {photo.data ? <Button label={t("profile.removePhoto")} variant="secondary" onPress={removePhoto} disabled={photoBusy} /> : null}
            </View>
          </View>
        </Card>
        <Card>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{t("profile.languagesTitle")}</Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 4 }}>{t("profile.languagesHelp")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md }}>
            {SPOKEN_LANGUAGES.map((l) => {
              const on = pickedLanguages.includes(l.code);
              return (
                <Pressable
                  key={l.code}
                  onPress={() => toggleLanguage(l.code)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={l.english}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    minHeight: 40,
                    paddingHorizontal: 14,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: on ? colors.accent : colors.border,
                    backgroundColor: on ? colors.accent : colors.surfaceRaised,
                  }}
                >
                  <Text style={{ color: on ? colors.background : colors.textPrimary, fontWeight: "600", fontSize: 14 }}>{on ? `✓ ${l.english}` : l.english}</Text>
                  {l.native !== l.english ? (
                    <Text style={{ color: on ? colors.background : colors.textSecondary, fontSize: 13 }}>{l.native}</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          <Button
            label={t("common.save")}
            onPress={() => saveLanguages.mutate()}
            loading={saveLanguages.isPending}
            disabled={!languagesChanged}
            style={{ marginTop: spacing.md }}
          />
        </Card>
        <Card>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{t("profile.genderTitle")}</Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 4 }}>{t("profile.genderHelp")}</Text>
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            {OPTIONS.map((o) => (
              <SelectCard key={o.value} title={t(o.key)} selected={choice === o.value} onPress={() => setChoice(o.value)} />
            ))}
          </View>
          <Button
            label={t("common.save")}
            onPress={() => choice && save.mutate(choice)}
            loading={save.isPending}
            disabled={!choice || choice === current}
            style={{ marginTop: spacing.md }}
          />
        </Card>
        </>
      )}
    </ScreenContainer>
  );
}
