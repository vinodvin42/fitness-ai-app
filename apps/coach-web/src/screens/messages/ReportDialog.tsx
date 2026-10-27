import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import type { SafetyReportReason } from "@fitness-ai-app/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Same reasons as the client app, minus "unsafe health advice", which is about coaches. */
const REASONS: { key: SafetyReportReason; labelKey: string }[] = [
  { key: "harassment", labelKey: "web.comms.reasonHarassment" },
  { key: "sexual_content", labelKey: "web.comms.reasonSexualContent" },
  { key: "threats_or_hate", labelKey: "web.comms.reasonThreatsOrHate" },
  { key: "spam_or_scam", labelKey: "web.comms.reasonSpamOrScam" },
  { key: "impersonation", labelKey: "web.comms.reasonImpersonation" },
  { key: "other", labelKey: "web.comms.reasonOther" },
];

/**
 * Report a client or one of their messages, ported from apps/coach-mobile's
 * ReportSheet. The report goes to Fynrox's safety team (admin 08.04); the
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
  /** The client's first name or "this message", for the heading. */
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
    <Dialog open={open} onOpenChange={(next) => (next || submitting ? undefined : onClose())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("web.comms.reportTitle", { subject })}</DialogTitle>
          <DialogDescription>{t("web.comms.reportIntro")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason && !submitting) onSubmit(reason, details.trim());
          }}
        >
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t("web.comms.reportReason")}</legend>
            {REASONS.map((r) => {
              const selected = reason === r.key;
              return (
                <label
                  key={r.key}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm transition-colors hover:bg-muted/60 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                    selected && "border-primary bg-primary/10 font-medium",
                  )}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={r.key}
                    checked={selected}
                    onChange={() => setReason(r.key)}
                    className="size-4 accent-primary"
                  />
                  {t(r.labelKey)}
                </label>
              );
            })}
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="report-details">{t("web.comms.reportDetails")}</Label>
            <Textarea
              id="report-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={t("web.comms.reportDetailsPlaceholder")}
              maxLength={1000}
              className="min-h-20"
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!reason || submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : null}
              {t("web.comms.sendReport")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
