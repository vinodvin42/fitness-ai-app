import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Camera, Check, FileText, Loader2, LogOut, Upload } from "lucide-react";
import type { ProfessionalServiceType } from "@fitness-ai-app/types";
import { BrandMark } from "@/components/BrandMark";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Page, PageHeader } from "@/components/page";
import { ThemeMenu } from "@/components/shell/ThemeMenu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * Shared frame for the onboarding wizard and the Verification screens.
 * The same screens serve /onboarding/* (no shell: this centred layout with
 * the brand, theme and a step bar) and /verification/* inside the app shell
 * (a normal Page with a back link), like apps/coach-mobile registered them
 * in both OnboardingStack and MoreStack.
 */

/** True on /onboarding/*, false on /verification/* (the old app's `!onboardingCompleted`). */
export function useIsOnboarding() {
  return useLocation().pathname.startsWith("/onboarding");
}

/** Where the credential, KYC and status screens live for the current mode. */
export function wizardPaths(isOnboarding: boolean) {
  const base = isOnboarding ? "/onboarding" : "/verification";
  return {
    services: "/onboarding",
    credentials: (services: ProfessionalServiceType[], index: number) =>
      `${base}/credentials?services=${services.join(",")}&index=${index}`,
    kyc: (services: ProfessionalServiceType[]) => `${base}/kyc?services=${services.join(",")}`,
    status: isOnboarding ? "/onboarding/status" : "/verification",
  };
}

const SERVICE_TYPES: readonly ProfessionalServiceType[] = ["fitness", "nutrition"];

/** `?services=fitness,nutrition` → the valid, de-duplicated list. */
export function parseServices(raw: string | null): ProfessionalServiceType[] {
  const list = (raw ?? "").split(",").map((s) => s.trim()) as ProfessionalServiceType[];
  return SERVICE_TYPES.filter((s) => list.includes(s));
}

/** Browser back when there is in-app history, otherwise `fallback` (the screen was opened from a link). */
export function useGoBack(fallback: string) {
  const navigate = useNavigate();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback);
  };
}

/** No-shell frame for /onboarding/*: brand and theme on top, one centred column. */
export function OnboardingLayout({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background/85 px-4 backdrop-blur md:px-6">
        <BrandMark />
        <div className="flex items-center gap-1">
          <ThemeMenu />
          <Button variant="ghost" size="icon" aria-label={t("web.settings.onboarding.signOut")} onClick={() => setConfirmOpen(true)}>
            <LogOut />
          </Button>
        </div>
      </header>
      <div className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-xl flex-1 px-4 pt-6 pb-10 md:pt-10">{children}</div>
        {footer ? (
          <div className="sticky bottom-0 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
            <div className="mx-auto flex w-full max-w-xl gap-2 px-4 py-3">{footer}</div>
          </div>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("more.signOut.confirmTitle")}
        description={t("more.signOut.confirmMessage")}
        confirmLabel={t("more.signOut.confirm")}
        destructive
        pending={signingOut}
        onConfirm={() => {
          setSigningOut(true);
          void logout();
        }}
      />
    </div>
  );
}

/** "Step X of 3 — label", the old StepProgressBar. */
export function StepProgress({ step, total, label }: { step: number; total: number; label: string }) {
  const { t } = useTranslation();
  const text = t("web.settings.onboarding.stepOf", { step, total, label });
  return (
    <div className="space-y-2">
      <Progress value={(step / total) * 100} aria-label={text} />
      <p className="text-xs font-medium text-muted-foreground">{text}</p>
    </div>
  );
}

/**
 * The old WizardLayout: step bar, title, body and a Back / Continue footer.
 * In onboarding it sits in OnboardingLayout; under /verification it is a
 * normal Page with a back link to the status screen.
 */
export function WizardFrame({
  step,
  total,
  label,
  title,
  subtitle,
  children,
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  nextLoading,
  backLink,
}: {
  step: number;
  total: number;
  label: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
  /** Shell mode only: the PageHeader back link. */
  backLink?: { to: string; label: string };
}) {
  const { t } = useTranslation();
  const isOnboarding = useIsOnboarding();
  const formId = "wizard-form";
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!nextDisabled && !nextLoading) onNext();
  };
  const buttons = (
    <>
      {onBack ? (
        <Button type="button" variant="outline" size="lg" className="h-10 flex-1 sm:flex-none sm:px-5" onClick={onBack} disabled={nextLoading}>
          {t("common.back")}
        </Button>
      ) : null}
      <Button type="submit" form={formId} size="lg" className="h-10 flex-[2] sm:flex-none sm:px-5" disabled={nextDisabled || nextLoading}>
        {nextLoading ? <Loader2 className="animate-spin" /> : null}
        {nextLabel ?? t("web.settings.onboarding.continue")}
      </Button>
    </>
  );
  const form = (
    <form id={formId} onSubmit={onSubmit} className="space-y-4" noValidate>
      {children}
    </form>
  );

  if (isOnboarding) {
    return (
      <OnboardingLayout footer={<div className="flex w-full gap-2 sm:justify-end">{buttons}</div>}>
        <div className="space-y-6">
          <StepProgress step={step} total={total} label={label} />
          <div className="space-y-1.5">
            <h1 className="font-heading text-2xl font-bold tracking-tight md:text-[28px]">{title}</h1>
            {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          {form}
        </div>
      </OnboardingLayout>
    );
  }

  return (
    <Page width="narrow">
      <PageHeader title={title} description={subtitle} back={backLink} />
      <p className="-mt-3 text-xs font-medium text-muted-foreground">{label}</p>
      {form}
      <div className="flex gap-2 sm:justify-end">{buttons}</div>
    </Page>
  );
}

/** A tappable choice card: checkbox style for services, radio style for gender. */
export function SelectCard({
  title,
  subtitle,
  selected,
  onSelect,
  multiSelect = false,
  disabled = false,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  onSelect: () => void;
  multiSelect?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role={multiSelect ? "checkbox" : "radio"}
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 text-left ring-1 ring-foreground/10 transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50",
        selected && "bg-primary/10 ring-2 ring-primary hover:bg-primary/15",
      )}
    >
      <span className="min-w-0 space-y-0.5">
        <span className={cn("block font-semibold", selected && "text-primary-ink")}>{title}</span>
        {subtitle ? <span className="block text-sm text-muted-foreground">{subtitle}</span> : null}
      </span>
      <span
        aria-hidden
        className={cn(
          "flex size-5 shrink-0 items-center justify-center border-2 border-border",
          multiSelect ? "rounded-md" : "rounded-full",
          selected && "border-primary bg-primary text-primary-foreground",
        )}
      >
        {selected ? multiSelect ? <Check className="size-3.5" strokeWidth={3} /> : <span className="size-2 rounded-full bg-primary-foreground" /> : null}
      </span>
    </button>
  );
}

/** The API's documentDataSchema ceiling: a data URI of at most 6,000,000 characters. */
const MAX_DATA_URI = 6_000_000;
/** Photos are re-encoded like the old app's picker (JPEG, quality 0.6), capped so a phone photo stays well under the limit. */
const MAX_IMAGE_SIDE = 2000;

export type PickedDocument = { dataUri: string; name: string; isPdf: boolean };

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function imageToJpeg(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx || w === 0 || h === 0) return resolve(null);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.6));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * A document as the API wants it: a data: URI. Images become
 * `data:image/jpeg;base64,…` exactly as the old app sent them; PDFs (which
 * the API also accepts) go as `data:application/pdf;base64,…`.
 */
export async function readDocumentFile(file: File): Promise<PickedDocument | "too-large" | "unreadable"> {
  try {
    if (file.type === "application/pdf") {
      const dataUri = await readAsDataUrl(file);
      if (dataUri.length > MAX_DATA_URI) return "too-large";
      return { dataUri, name: file.name, isPdf: true };
    }
    if (!file.type.startsWith("image/")) return "unreadable";
    const dataUri = await imageToJpeg(file);
    if (!dataUri) return "unreadable";
    if (dataUri.length > MAX_DATA_URI) return "too-large";
    return { dataUri, name: file.name, isPdf: false };
  } catch {
    return "unreadable";
  }
}

/** Phones and tablets, where `capture` opens the camera. */
export function canCapture() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
}

/** One upload slot: preview, "Take photo" on touch devices, and "Upload file". */
export function DocumentPicker({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  value: PickedDocument | null;
  onChange: (doc: PickedDocument) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const camera = canCapture();

  const onFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setReading(true);
    const result = await readDocumentFile(file);
    setReading(false);
    if (result === "too-large") toast.error(t("web.settings.onboarding.fileTooLarge"));
    else if (result === "unreadable") toast.error(t("web.settings.onboarding.fileUnreadable"));
    else onChange(result);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-semibold">{label}</CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {value ? (
          value.isPdf ? (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-3 text-sm">
              <FileText className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate font-medium">{value.name}</span>
            </div>
          ) : (
            <img
              src={value.dataUri}
              alt={t("web.settings.onboarding.previewAlt", { name: label })}
              className="aspect-[4/3] w-full rounded-lg border bg-muted object-contain"
            />
          )
        ) : null}
        <div className="flex flex-wrap gap-2">
          {camera ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-10 flex-1"
              disabled={disabled || reading}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera />
              {value ? t("web.settings.onboarding.retakePhoto") : t("web.settings.onboarding.takePhoto")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="lg"
            className={cn("h-10", camera ? "flex-1" : "w-full sm:w-auto sm:px-4")}
            disabled={disabled || reading}
            onClick={() => fileRef.current?.click()}
          >
            {reading ? <Loader2 className="animate-spin" /> : <Upload />}
            {value ? t("web.settings.onboarding.replace") : t("web.settings.onboarding.uploadFile")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("web.settings.onboarding.formats")}</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void onFile(e.currentTarget)}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void onFile(e.currentTarget)}
        />
      </CardContent>
    </Card>
  );
}
