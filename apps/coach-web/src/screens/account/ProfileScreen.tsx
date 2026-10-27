import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Check, ImageUp, Loader2, Trash2 } from "lucide-react";
import { SPOKEN_LANGUAGES } from "@fitness-ai-app/types";
import { fetchMe, setMyGender, setMyLanguages } from "@/api/professionalAuth";
import { deleteMyPhoto, saveMyPhoto } from "@/api/professionalPhoto";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorState, Page, PageHeader } from "@/components/page";
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
 * photo (25 Oct 2026), the languages you coach in (25 Oct 2026) and your
 * gender for members who ask for a male or female coach (20 Oct 2026). Plus
 * the web app's Appearance choice.
 */
export function ProfileScreen() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
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
          <PhotoCard name={me.data?.professional.fullName ?? ""} />

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
