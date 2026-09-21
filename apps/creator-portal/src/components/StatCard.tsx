/**
 * KPI card — copied from apps/admin-web/src/components/StatCard.tsx,
 * trimmed to the fields this portal's dashboard actually uses (no trend
 * badge — this portal has no prior-period comparison query, same "omit
 * rather than fabricate" discipline as every other real slice in this
 * codebase).
 */
export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-text-dim">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-text-primary">{value}</div>
      {hint && <div className="mt-1 text-xs text-text-secondary">{hint}</div>}
    </div>
  );
}
