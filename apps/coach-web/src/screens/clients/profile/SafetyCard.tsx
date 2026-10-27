import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Flag, Loader2, ShieldAlert } from "lucide-react";
import type { SafetyReportReason } from "@fitness-ai-app/types";
import { fetchThread, reportClient, setClientBlocked } from "@/api/coachMessages";
import { flagClientSafety } from "@/api/professionalClients";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { extractErrorMessage } from "@/lib/apiError";
import { ReportDialog } from "./ReportDialog";

/**
 * Safety (P-M12) plus report and block. A flag goes to the safety team, not
 * the client, and is deliberately separate from private notes and from chat
 * (chat isn't monitored). The urgent toggle raises queue severity; it does
 * NOT page anyone, and the dialog says so. Report and block are the same
 * calls as the chat thread's menu (POST …/report, POST/DELETE …/block).
 */
export function SafetyCard({ userId, fullName }: { userId: string; fullName: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const firstName = fullName.split(" ")[0] || fullName;

  const [flagOpen, setFlagOpen] = useState(false);
  const [concern, setConcern] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  // Block state lives on the thread (GET conversation), same query the chat screen reads.
  const thread = useQuery({ queryKey: ["coach-thread", userId], queryFn: () => fetchThread(userId) });
  const blocked = thread.data?.blocked;

  const raise = useMutation({
    mutationFn: () => flagClientSafety(userId, { concern: concern.trim(), urgent }),
    onSuccess: () => {
      setFlagOpen(false);
      setConcern("");
      setUrgent(false);
      toast.success(t("web.clientProfile.flagRaisedTitle"), { description: t("web.clientProfile.flagRaised") });
    },
    onError: (err) =>
      toast.error(t("web.clientProfile.flagFailed"), { description: extractErrorMessage(err, t("web.clientProfile.tryAgain")) }),
  });

  const reportMutation = useMutation({
    mutationFn: (input: { reason: SafetyReportReason; details: string }) =>
      reportClient(userId, { reason: input.reason, details: input.details || undefined }),
    onSuccess: () => {
      setReporting(false);
      toast.success(t("web.clientProfile.reportSent"), { description: t("web.clientProfile.reportSentBody") });
    },
    onError: (err) =>
      toast.error(t("web.clientProfile.reportFailed"), { description: extractErrorMessage(err, t("web.clientProfile.tryAgain")) }),
  });

  const blockMutation = useMutation({
    mutationFn: (block: boolean) => setClientBlocked(userId, block),
    onSuccess: () => {
      setConfirmBlock(false);
      void queryClient.invalidateQueries({ queryKey: ["coach-thread", userId] });
    },
    onError: (err) =>
      toast.error(t("web.clientProfile.blockFailed"), { description: extractErrorMessage(err, t("web.clientProfile.tryAgain")) }),
  });

  const onBlock = () => {
    // Unblocking needs no confirmation, same as the chat thread.
    if (blocked?.byMe) blockMutation.mutate(false);
    else setConfirmBlock(true);
  };

  const closeFlag = () => {
    setFlagOpen(false);
    setConcern("");
  };

  const concernTooShort = concern.trim().length < 10;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="size-4 text-warning" />
          {t("web.clientProfile.safetyTitle")}
        </CardTitle>
        <CardDescription>{t("web.clientProfile.safetyIntro", { name: firstName })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" className="h-10 w-full justify-start md:h-8" onClick={() => setFlagOpen(true)}>
          <ShieldAlert />
          {t("clients.profile.raiseSafety")}
        </Button>
        <Separator />
        {blocked?.byMe || blocked?.byThem ? (
          <p className="text-xs text-muted-foreground">
            {blocked.byMe ? t("web.clientProfile.blockedByMe", { name: firstName }) : t("web.clientProfile.blockedByThem")}
          </p>
        ) : null}
        <div className="grid gap-2">
          <Button variant="ghost" className="h-10 w-full justify-start md:h-8" onClick={() => setReporting(true)}>
            <Flag />
            {t("web.clientProfile.reportClient", { name: firstName })}
          </Button>
          <Button
            variant="ghost"
            className={blocked?.byMe ? "h-10 w-full justify-start md:h-8" : "h-10 w-full justify-start text-destructive hover:text-destructive md:h-8"}
            onClick={onBlock}
            disabled={blockMutation.isPending || !thread.data}
          >
            {blockMutation.isPending ? <Loader2 className="animate-spin" /> : <Ban />}
            {blocked?.byMe ? t("web.clientProfile.unblock", { name: firstName }) : t("web.clientProfile.block", { name: firstName })}
          </Button>
        </div>
      </CardContent>

      <Dialog open={flagOpen} onOpenChange={(open) => (open ? setFlagOpen(true) : raise.isPending ? null : closeFlag())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("clients.profile.raiseSafety")}</DialogTitle>
            <DialogDescription>{t("clients.profile.safetyPrompt")}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!concernTooShort && !raise.isPending) raise.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="safety-concern">{t("web.clientProfile.safetyConcernLabel")}</Label>
              <Textarea
                id="safety-concern"
                value={concern}
                onChange={(e) => setConcern(e.target.value)}
                maxLength={2000}
                placeholder={t("clients.profile.safetyPlaceholder")}
                className="min-h-28"
                aria-describedby="safety-concern-hint"
              />
              <p id="safety-concern-hint" className="text-xs text-muted-foreground">
                {t("web.clientProfile.safetyMinLength")}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="min-h-10 cursor-pointer font-normal md:min-h-0">
                <Checkbox checked={urgent} onCheckedChange={(v) => setUrgent(v === true)} />
                <span className={urgent ? "font-medium text-warning" : undefined}>{t("web.clientProfile.safetyUrgent")}</span>
              </Label>
              {/* Stated plainly. A coach who thinks they have summoned help when
                  they have queued a ticket is worse off than one who knows to
                  call emergency services. */}
              <p className="text-xs text-muted-foreground">{t("web.clientProfile.safetyUrgentNote")}</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" className="h-10 sm:h-8" onClick={closeFlag} disabled={raise.isPending}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" className="h-10 sm:h-8" disabled={concernTooShort || raise.isPending}>
                {raise.isPending ? <Loader2 className="animate-spin" /> : null}
                {t("clients.profile.raiseFlag")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ReportDialog
        open={reporting}
        subject={firstName}
        submitting={reportMutation.isPending}
        onClose={() => setReporting(false)}
        onSubmit={(reason, details) => reportMutation.mutate({ reason, details })}
      />

      <ConfirmDialog
        open={confirmBlock}
        onOpenChange={(open) => (blockMutation.isPending ? null : setConfirmBlock(open))}
        title={t("web.clientProfile.blockTitle", { name: firstName })}
        description={t("web.clientProfile.blockBody")}
        confirmLabel={t("web.clientProfile.blockConfirm")}
        onConfirm={() => blockMutation.mutate(true)}
        destructive
        pending={blockMutation.isPending}
      />
    </Card>
  );
}
