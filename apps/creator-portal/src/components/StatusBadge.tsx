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
};

const TONE_CLASSES: Record<string, string> = {
  active: "bg-accent/15 text-accent",
  inactive: "bg-surface-raised text-text-dim",
  pending: "bg-warning/15 text-warning",
  paid: "bg-accent/15 text-accent",
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
