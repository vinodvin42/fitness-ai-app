/**
 * Same status-pill convention as apps/admin-web/src/components/
 * StatusBadge.tsx, trimmed to the statuses this portal's dashboard
 * actually renders (Campaign active/inactive, InfluencerPayout
 * pending/paid).
 */
const LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  pending: "Pending",
  paid: "Paid",
  // §10's creator-commission lifecycle, which had no labels because the
  // per-conversion ledger did not exist before R1.
  pending_calculation: "Calculating",
  eligible: "Eligible",
  approved: "Approved",
  disputed: "Under review",
  reversed: "Reversed",
  // C-M3 — the partner end states the enum gained in R1.
  draft: "Draft",
  pending_review: "Under review",
  more_info: "More info needed",
  rejected: "Declined",
  suspended: "Suspended",
  ended: "Partnership ended",
};

const TONE_CLASSES: Record<string, string> = {
  active: "bg-accent/15 text-accent",
  inactive: "bg-surface-raised text-text-dim",
  pending: "bg-warning/15 text-warning",
  paid: "bg-accent/15 text-accent",

  pending_calculation: "bg-surface-raised text-text-dim",
  eligible: "bg-warning/15 text-warning",
  approved: "bg-warning/15 text-warning",
  disputed: "bg-warning/15 text-warning",
  reversed: "bg-danger/15 text-danger",
  draft: "bg-surface-raised text-text-dim",
  pending_review: "bg-warning/15 text-warning",
  more_info: "bg-warning/15 text-warning",
  rejected: "bg-danger/15 text-danger",
  suspended: "bg-danger/15 text-danger",
  ended: "bg-surface-raised text-text-dim",
};

const CHECKMARK_STATUSES = new Set(["active", "paid"]);

export function StatusBadge({ status }: { status: string }) {
  const toneClass = TONE_CLASSES[status] ?? "bg-surface-raised text-text-dim";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${toneClass}`}>
      {LABELS[status] ?? status}
      {CHECKMARK_STATUSES.has(status) ? " ✓" : ""}
    </span>
  );
}
