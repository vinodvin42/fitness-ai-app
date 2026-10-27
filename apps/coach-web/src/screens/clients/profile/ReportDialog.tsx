import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import type { SafetyReportReason } from "@fitness-ai-app/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Same reasons as the client app, minus "unsafe health advice", which is about coaches. */
const REASONS: { key: SafetyReportReason; label: string }[] = [
  { key: "harassment", label: "web.clientProfile.reasonHarassment" },
  { key: "sexual_content", label: "web.clientProfile.reasonSexualContent" },
  { key: "threats_or_hate", label: "web.clientProfile.reasonThreatsOrHate" },
  { key: "spam_or_scam", label: "web.clientProfile.reasonSpamOrScam" },
  { key: "impersonation", label: "web.clientProfile.reasonImpersonation" },
  { key: "other", label: "web.clientProfile.reasonOther" },
];

/**
 * Report a client to Fynrox's safety team (admin 08.04). The old app's
 * ReportSheet as a dialog: pick one reason, add optional details, send. The
 * client isn't told who reported them.
 */
export function ReportDialog({
  open,
  subject,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** The client's first name, for the heading. */
  subject: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (reason: SafetyReportReason, details: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<SafetyReportReason | null>(null);
  const [details, setDetails] = useState("");

  useEffect(() => {
    if (open) {
      setReason(null);
      setDetails("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => (next || submitting ? null : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("web.clientProfile.reportTitle", { subject })}</DialogTitle>
          <DialogDescription>{t("web.clientProfile.reportIntro")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason && !submitting) onSubmit(reason, details.trim());
          }}
        >
          <div role="radiogroup" aria-label={t("web.clientProfile.reportReasonsLabel")} className="grid gap-2">
            {REASONS.map((r) => {
              const selected = reason === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setReason(r.key)}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-lg border px-3 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    selected ? "border-primary bg-primary/10 font-medium" : "border-border",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-full border",
                      selected ? "border-primary" : "border-input",
                    )}
                  >
                    {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
                  </span>
                  {t(r.label)}
                </button>
              );
            })}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-details" className="sr-only">
              {t("web.clientProfile.reportDetailsLabel")}
            </Label>
            <Textarea
              id="report-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={t("web.clientProfile.reportDetailsPlaceholder")}
              maxLength={1000}
              className="min-h-20"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10 sm:h-8" onClick={onClose} disabled={submitting}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" className="h-10 sm:h-8" disabled={!reason || submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : null}
              {t("web.clientProfile.sendReport")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
