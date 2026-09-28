const LABELS: Record<string, string> = {
  application: "Application Pending",
  approved: "Approved Partner",
  suspended: "Suspended",
  // G-M2 — the §10 partner lifecycle's remaining end states, which had
  // no label because the enum values did not exist until R1.
  more_info: "More Information Needed",
  rejected: "Application Declined",
  ended: "Partnership Ended",
  // Equipment profile (§10) — CURRENT / STALE.
  current: "Up to date",
  stale: "Needs confirming",
  // Help request lifecycle.
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
};

const TONE_CLASSES: Record<string, string> = {
  application: "bg-warning/15 text-warning",
  approved: "bg-accent/15 text-accent",
  suspended: "bg-danger/15 text-danger",
  more_info: "bg-warning/15 text-warning",
  rejected: "bg-danger/15 text-danger",
  ended: "bg-surface-raised text-text-dim",
  current: "bg-accent/15 text-accent",
  stale: "bg-warning/15 text-warning",
  open: "bg-warning/15 text-warning",
  in_progress: "bg-accent/15 text-accent",
  resolved: "bg-surface-raised text-text-dim",
};

/**
 * Scoped-down copy of apps/admin-web's StatusBadge — this portal only ever
 * renders a Gym's own `GymStatus` (never any of admin-web's other dozen
 * status enums), so the full shared label/tone map wasn't worth pulling in
 * whole.
 */
export function StatusBadge({ status }: { status: string }) {
  const toneClass = TONE_CLASSES[status] ?? "bg-surface-raised text-text-dim";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${toneClass}`}>
      {LABELS[status] ?? status}
    </span>
  );
}
