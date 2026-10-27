import { cn } from "@/lib/utils";

/** Same labels as apps/coach-mobile's StatusBadge, so a status reads the same in both apps and in admin. */
const LABELS: Record<string, string> = {
  not_verified: "Not verified",
  pending: "Pending",
  verified: "Verified",
  rejected: "Rejected",
  paid: "Paid",
  eligible: "Earned",
  approved: "Approved",
  payout_failed: "Payout failed",
  needs_action: "Action needed",
  restricted: "Restricted",
  suspended: "Suspended",
  offered: "Offered",
  declined: "Declined",
  expired: "Expired",
  completed: "Completed",
  queued: "To review",
  reviewed: "Reviewed",
  active: "Active",
  requested: "Requested",
};

type Tone = "neutral" | "warning" | "success" | "danger";

const TONES: Record<string, Tone> = {
  pending: "warning",
  verified: "success",
  rejected: "danger",
  paid: "success",
  approved: "warning",
  payout_failed: "danger",
  needs_action: "warning",
  restricted: "warning",
  suspended: "danger",
  offered: "warning",
  completed: "success",
  queued: "warning",
  reviewed: "success",
  active: "success",
  requested: "warning",
};

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  warning: "bg-warning/15 text-warning",
  success: "bg-success/15 text-success",
  danger: "bg-destructive/12 text-destructive",
};

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  const tone = TONES[status] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-semibold whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label ?? LABELS[status] ?? status}
    </span>
  );
}
