import { useState } from "react";
import { Check, Copy, IdCard } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * The coach's own Fynrox ID (27 Oct 2026), e.g. FXP-7K3M-9Q2D: the same
 * permanent code members see on the coach's profile, for quoting to members
 * or support. Hidden until the API returns it.
 */
export function CoachIdCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { professional } = useAuth();
  const [copied, setCopied] = useState(false);
  const id = professional?.publicId;
  if (!id) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the ID is on screen to copy by hand.
    }
  };

  return (
    <div className={cn("flex items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10", className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary-ink">
        <IdCard className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-muted-foreground">{t("web.account.idLabel")}</div>
        <div className="font-mono text-base font-semibold tracking-wide">{id}</div>
        <div className="text-xs text-muted-foreground">{t("web.account.idHint")}</div>
      </div>
      <Button variant="outline" size="sm" onClick={() => void copy()} aria-label={t("web.account.copyId")}>
        {copied ? <Check /> : <Copy />}
        {copied ? t("web.account.copied") : t("web.account.copy")}
      </Button>
    </div>
  );
}
