import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Check, ImageUp, Loader2, Plus, Trash2, X } from "lucide-react";
import { SPOKEN_LANGUAGES, type Professional } from "@fitness-ai-app/types";
import { fetchMe, setMyGender, setMyLanguages, setMyProfile, type MyProfileInput } from "@/api/professionalAuth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { deleteMyPhoto, saveMyPhoto } from "@/api/professionalPhoto";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorState, Page, PageHeader } from "@/components/page";
import { CoachIdCard } from "@/components/CoachIdCard";
import { LevelFeesCard } from "@/components/LevelFeesCard";
import { fetchMyLevel } from "@/api/professionalDashboard";
import { initials, useMyPhoto } from "@/components/shell/AccountMenu";
import { ThemeSegmented } from "@/components/shell/ThemeMenu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { extractErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";
import { canCapture, SelectCard } from "@/screens/onboarding/OnboardingLayout";

type Choice = "female" | "male" | "none";

const OPTIONS: Array<{ value: Choice; key: "profile.female" | "profile.male" | "profile.preferNot" }> = [
  { value: "female", key: "profile.female" },
  { value: "male", key: "profile.male" },
  { value: "none", key: "profile.preferNot" },
];

/** The API accepts up to 1,400,000 characters (about 1 MB of image); a 512 px JPEG is far below it. */
const PHOTO_SIZE = 512;

/** apps/coach-mobile/src/lib/profilePhoto.ts squareJpegOnWeb: centre square, 512 px, JPEG 0.85. */
function squareJpegOnWeb(uri: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = PHOTO_SIZE;
      canvas.height = PHOTO_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx || side === 0) return resolve(null);
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve(null);
    img.src = uri;
  });
}

/**
 * My profile, ported from apps/coach-mobile's more/ProfileScreen: profile
 * photo (25 Oct 2026), About you (years of experience, specialties and bio,
 * 27 Oct 2026), the languages you coach in (25 Oct 2026) and your gender for
 * members who ask for a male or female coach (20 Oct 2026). Plus the web
 * app's Appearance choice.
 */
export function ProfileScreen() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["professionalMe"], queryFn: fetchMe });
  // The coach's level and fee structure (27 Oct 2026), same query as Earnings.
  const myLevel = useQuery({ queryKey: ["professionalMyLevel"], queryFn: fetchMyLevel });

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
      toast.success(t("profile.saved"));
    },
    onError: (err) => toast.error(t("profile.saveFailed"), { description: extractErrorMessage(err, t("common.checkConnection")) }),
  });

  const save = useMutation({
    mutationFn: (c: Choice) => setMyGender(c === "none" ? null : c),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["professionalMe"] });
      toast.success(t("profile.saved"));
    },
    onError: (err) => toast.error(t("profile.saveFailed"), { description: extractErrorMessage(err, t("common.checkConnection")) }),
  });

  return (
    <Page width="narrow">
      <PageHeader
        title={t("profile.title")}
        description={t("web.settings.profile.description")}
        back={isMobile ? { to: "/more", label: t("web.nav.more") } : undefined}
      />

      {me.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      ) : me.isError ? (
        <ErrorState onRetry={() => me.refetch()} />
      ) : (
        <>
          <CoachIdCard />
          <PhotoCard name={me.data?.professional.fullName ?? ""} />
          {me.data ? <AboutCard professional={me.data.professional} /> : null}
          {myLevel.data ? <LevelFeesCard level={myLevel.data} /> : null}

          <Card>
            <CardHeader>
              <CardTitle className="font-semibold">{t("profile.languagesTitle")}</CardTitle>
              <CardDescription>{t("profile.languagesHelp")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {SPOKEN_LANGUAGES.map((l) => {
                  const on = pickedLanguages.includes(l.code);
                  return (
                    <button
                      key={l.code}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      aria-label={l.english}
                      onClick={() => toggleLanguage(l.code)}
                      disabled={saveLanguages.isPending}
                      className={cn(
                        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50",
                        on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                      )}
                    >
                      {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
                      {l.english}
                      {l.native !== l.english ? (
                        <span className={cn("font-normal", on ? "text-primary-foreground/80" : "text-muted-foreground")}>{l.native}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end">
                <Button
                  size="lg"
                  className="h-10 w-full sm:w-auto sm:px-5"
                  onClick={() => saveLanguages.mutate()}
                  disabled={!languagesChanged || saveLanguages.isPending}
                >
                  {saveLanguages.isPending ? <Loader2 className="animate-spin" /> : null}
                  {t("common.save")}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-semibold">{t("profile.genderTitle")}</CardTitle>
              <CardDescription>{t("profile.genderHelp")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div role="radiogroup" aria-label={t("profile.genderTitle")} className="grid gap-2 sm:grid-cols-3">
                {OPTIONS.map((o) => (
                  <SelectCard key={o.value} title={t(o.key)} selected={choice === o.value} onSelect={() => setChoice(o.value)} disabled={save.isPending} />
                ))}
              </div>
              <div className="flex justify-end">
                <Button
                  size="lg"
                  className="h-10 w-full sm:w-auto sm:px-5"
                  onClick={() => choice && save.mutate(choice)}
                  disabled={!choice || choice === current || save.isPending}
                >
                  {save.isPending ? <Loader2 className="animate-spin" /> : null}
                  {t("common.save")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-semibold">{t("web.settings.profile.appearanceTitle")}</CardTitle>
          <CardDescription>{t("web.settings.profile.appearanceHelp")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSegmented />
        </CardContent>
      </Card>
    </Page>
  );
}

/** The limits PATCH /professionals/me/profile enforces (apps/api/src/lib/coachProfile.ts). */
const YEARS_MAX = 60;
const BIO_MAX = 1000;
const SPECIALTIES_MAX = 12;
const SPECIALTY_MAX_LENGTH = 40;

/** The specialties already on coach profiles (apps/api seed data); any other wording is fine too. */
const SPECIALTY_SUGGESTIONS = [
  "Strength Training",
  "HIIT",
  "Weight Management",
  "Sports Nutrition",
  "Nutrition Coaching",
  "Injury Recovery",
];

const sameTags = (a: string[], b: string[]) => a.length === b.length && a.every((tag, i) => tag === b[i]);

/**
 * About you (27 Oct 2026): years of experience, specialties and bio. Members see them on the coach's
 * profile as soon as they're saved (no approval). Only the fields that changed are sent.
 */
function AboutCard({ professional }: { professional: Professional }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { refreshProfessional } = useAuth();
  const yearsId = useId();
  const tagsId = useId();
  const bioId = useId();

  const [years, setYears] = useState(professional.yearsExperience == null ? "" : String(professional.yearsExperience));
  const [tags, setTags] = useState<string[]>(professional.specializationTags);
  const [tagDraft, setTagDraft] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  const [bio, setBio] = useState(professional.bio ?? "");

  const yearsText = years.trim();
  const parsedYears = yearsText === "" ? null : Number(yearsText);
  const yearsValid = parsedYears === null || (Number.isInteger(parsedYears) && parsedYears >= 0 && parsedYears <= YEARS_MAX);
  const bioValue = bio.trim() === "" ? null : bio.trim();

  const changes: MyProfileInput = {};
  if (yearsValid && parsedYears !== professional.yearsExperience) changes.yearsExperience = parsedYears;
  if (!sameTags(tags, professional.specializationTags)) changes.specializationTags = tags;
  if (bioValue !== (professional.bio ?? null)) changes.bio = bioValue;
  const changed = Object.keys(changes).length > 0;

  /** Adds one or more comma-separated specialties, skipping blanks and ones already added (any case). */
  const addTags = (raw: string) => {
    let next = tags;
    let error: string | null = null;
    for (const part of raw.split(",")) {
      const tag = part.trim();
      if (!tag) continue;
      if (tag.length > SPECIALTY_MAX_LENGTH) {
        error = t("web.settings.profile.specialtyTooLong", { max: SPECIALTY_MAX_LENGTH });
        continue;
      }
      if (next.some((x) => x.toLocaleLowerCase() === tag.toLocaleLowerCase())) continue;
      if (next.length >= SPECIALTIES_MAX) {
        error = t("web.settings.profile.specialtiesFull", { max: SPECIALTIES_MAX });
        break;
      }
      next = [...next, tag];
    }
    setTags(next);
    setTagError(error);
    setTagDraft("");
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((x) => x !== tag));
    setTagError(null);
  };

  const save = useMutation({
    mutationFn: () => setMyProfile(changes),
    onSuccess: async ({ professional: saved }) => {
      setYears(saved.yearsExperience == null ? "" : String(saved.yearsExperience));
      setTags(saved.specializationTags);
      setBio(saved.bio ?? "");
      toast.success(t("profile.saved"));
      queryClient.invalidateQueries({ queryKey: ["professionalMe"] });
      await refreshProfessional().catch(() => undefined);
    },
    onError: (err) => toast.error(t("profile.saveFailed"), { description: extractErrorMessage(err, t("common.checkConnection")) }),
  });

  const suggestions = SPECIALTY_SUGGESTIONS.filter((s) => !tags.some((x) => x.toLocaleLowerCase() === s.toLocaleLowerCase()));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-semibold">{t("web.settings.profile.aboutTitle")}</CardTitle>
        <CardDescription>{t("web.settings.profile.aboutHelp")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor={yearsId}>{t("web.settings.profile.yearsLabel")}</Label>
          <Input
            id={yearsId}
            type="number"
            inputMode="numeric"
            min={0}
            max={YEARS_MAX}
            step={1}
            value={years}
            onChange={(e) => setYears(e.target.value)}
            disabled={save.isPending}
            aria-invalid={!yearsValid || undefined}
            aria-describedby={`${yearsId}-hint`}
            className="h-10 w-28"
          />
          <p id={`${yearsId}-hint`} className={cn("text-xs", yearsValid ? "text-muted-foreground" : "text-destructive")}>
            {yearsValid ? t("web.settings.profile.yearsHint", { max: YEARS_MAX }) : t("web.settings.profile.yearsInvalid", { max: YEARS_MAX })}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={tagsId}>{t("web.settings.profile.specialtiesLabel")}</Label>
          <div
            className={cn(
              "flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-input px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
              save.isPending && "opacity-50",
            )}
          >
            {tags.map((tag) => (
              <span key={tag} className="inline-flex h-7 items-center gap-1 rounded-full bg-primary/15 pr-1 pl-2.5 text-sm font-medium text-primary-ink">
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  disabled={save.isPending}
                  aria-label={t("web.settings.profile.removeSpecialty", { tag })}
                  className="inline-flex size-5 items-center justify-center rounded-full hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
            <input
              id={tagsId}
              value={tagDraft}
              onChange={(e) => {
                const value = e.target.value;
                if (value.includes(",")) addTags(value);
                else setTagDraft(value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTags(tagDraft);
                } else if (e.key === "Backspace" && tagDraft === "" && tags.length > 0) {
                  removeTag(tags[tags.length - 1]);
                }
              }}
              onBlur={() => tagDraft.trim() && addTags(tagDraft)}
              disabled={save.isPending || tags.length >= SPECIALTIES_MAX}
              maxLength={SPECIALTY_MAX_LENGTH + 1}
              placeholder={tags.length >= SPECIALTIES_MAX ? "" : t("web.settings.profile.specialtiesPlaceholder")}
              aria-describedby={`${tagsId}-hint`}
              className="h-7 min-w-32 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground md:text-sm"
            />
          </div>
          <p id={`${tagsId}-hint`} className={cn("text-xs", tagError ? "text-destructive" : "text-muted-foreground")}>
            {tagError ?? t("web.settings.profile.specialtiesHint", { max: SPECIALTIES_MAX })}
          </p>
          {suggestions.length > 0 && tags.length < SPECIALTIES_MAX ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs text-muted-foreground">{t("web.settings.profile.suggestions")}</span>
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => addTags(s)}
                  disabled={save.isPending}
                  className="inline-flex h-7 items-center gap-1 rounded-full border bg-card px-2.5 text-xs font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                >
                  <Plus className="size-3" />
                  {s}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={bioId}>{t("web.settings.profile.bioLabel")}</Label>
          <Textarea
            id={bioId}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={BIO_MAX}
            disabled={save.isPending}
            placeholder={t("web.settings.profile.bioPlaceholder")}
            aria-describedby={`${bioId}-count`}
            className="min-h-28"
          />
          <p id={`${bioId}-count`} className="text-right text-xs text-muted-foreground tabular-nums">
            {t("web.settings.profile.bioCount", { used: bio.length, max: BIO_MAX })}
          </p>
        </div>

        <div className="flex justify-end">
          <Button size="lg" className="h-10 w-full sm:w-auto sm:px-5" onClick={() => save.mutate()} disabled={!changed || !yearsValid || save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : null}
            {t("common.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PhotoCard({ name }: { name: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // The shell's avatar reads the same query, so a change shows there at once.
  const photo = useMyPhoto();
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const camera = canCapture();

  const refreshPhoto = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["professional-photo"] }),
      // The old app's key, kept so both caches stay in step.
      queryClient.invalidateQueries({ queryKey: ["professionalPhoto"] }),
    ]);

  const onFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("profile.photoFailed"), { description: t("web.settings.profile.photoNotImage") });
      return;
    }
    const url = URL.createObjectURL(file);
    const imageData = await squareJpegOnWeb(url);
    URL.revokeObjectURL(url);
    if (!imageData) {
      toast.error(t("profile.photoFailed"), { description: t("web.settings.profile.photoNotImage") });
      return;
    }
    setBusy(true);
    try {
      await saveMyPhoto(imageData);
      await refreshPhoto();
      toast.success(t("profile.photoSaved"));
    } catch (err) {
      toast.error(t("profile.photoFailed"), { description: extractErrorMessage(err, t("common.checkConnection")) });
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async () => {
    setBusy(true);
    try {
      await deleteMyPhoto();
      await refreshPhoto();
    } catch (err) {
      toast.error(t("profile.photoFailed"), { description: extractErrorMessage(err, t("common.checkConnection")) });
    } finally {
      setBusy(false);
      setConfirmRemove(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-semibold">{t("profile.photoTitle")}</CardTitle>
        <CardDescription>{t("profile.photoHelp")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex size-24 shrink-0 items-center justify-center self-center overflow-hidden rounded-full bg-primary/15 ring-1 ring-foreground/10 sm:self-auto">
          {photo.data ? (
            <img src={photo.data.imageData} alt={t("web.settings.profile.photoAlt")} className="size-full object-cover" />
          ) : (
            <span className="font-heading text-3xl font-bold text-primary-ink">{initials(name)}</span>
          )}
          {busy ? (
            <span className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Loader2 className="size-6 animate-spin" />
            </span>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button size="lg" className="h-10 sm:px-4" onClick={() => fileRef.current?.click()} disabled={busy || photo.isLoading}>
            <ImageUp />
            {photo.data ? t("profile.changePhoto") : t("profile.choosePhoto")}
          </Button>
          {camera ? (
            <Button variant="outline" size="lg" className="h-10 sm:px-4" onClick={() => cameraRef.current?.click()} disabled={busy}>
              <Camera />
              {t("profile.takePhoto")}
            </Button>
          ) : null}
          {photo.data ? (
            <Button variant="ghost" size="lg" className="h-10 text-destructive hover:text-destructive sm:px-4" onClick={() => setConfirmRemove(true)} disabled={busy}>
              <Trash2 />
              {t("profile.removePhoto")}
            </Button>
          ) : null}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" tabIndex={-1} aria-hidden onChange={(e) => void onFile(e.currentTarget)} />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void onFile(e.currentTarget)}
        />
      </CardContent>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t("profile.removePhotoTitle")}
        description={t("profile.removePhotoBody")}
        confirmLabel={t("profile.removePhoto")}
        destructive
        pending={busy}
        onConfirm={() => void removePhoto()}
      />
    </Card>
  );
}
