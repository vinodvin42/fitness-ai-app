const LABELS: Record<string, string> = {
  application: "Application Pending",
  approved: "Approved Partner",
  suspended: "Suspended",
};

const TONE_CLASSES: Record<string, string> = {
  application: "bg-warning/15 text-warning",
  approved: "bg-accent/15 text-accent",
  suspended: "bg-danger/15 text-danger",
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
