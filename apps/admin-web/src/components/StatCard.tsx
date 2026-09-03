/**
 * KPI card (docs/admin/04-design-system.md §5) — value, label, optional
 * trend. Trend % wasn't computed anywhere until 25 Aug 2026 (would need a
 * prior-period comparison query most of this build's slices don't build)
 * — omitted rather than fabricated, same discipline as
 * adminDashboard.service.ts's `notAvailable` list.
 *
 * **25 Aug 2026:** Module 09.01 User Analytics is the first screen to
 * actually compute one (current period vs. the immediately preceding
 * period of equal length, see adminAnalytics.service.ts's `trend()`) —
 * `trendPct` renders as a colored badge here. `null` (not `0`) means "no
 * previous-period baseline to compare against", rendered as a plain dash
 * rather than a fabricated "+0%".
 *
 * **27 Aug 2026:** `invert` — every metric here so far has been "more is
 * good" (revenue, users, referrals…), so a rising trend has always been
 * the accent color and a falling one danger. 09.06 Unit Economics' CAC is
 * the first metric where that's backwards (a rising CAC is bad news) —
 * `invert` swaps which direction gets which color rather than mislabeling
 * a cost increase as good, or dropping the badge and losing the trend
 * entirely.
 */
export function StatCard({
  label,
  value,
  hint,
  trendPct,
  invert = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  trendPct?: number | null;
  invert?: boolean;
}) {
  const rising = trendPct !== undefined && trendPct !== null && trendPct > 0;
  const falling = trendPct !== undefined && trendPct !== null && trendPct < 0;
  const goodDirection = invert ? falling : rising;
  const badDirection = invert ? rising : falling;

  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-text-dim">{label}</div>
        {trendPct !== undefined && (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              trendPct === null
                ? "text-text-dim"
                : goodDirection
                  ? "bg-accent/15 text-accent"
                  : badDirection
                    ? "bg-danger/15 text-danger"
                    : "text-text-dim"
            }`}
          >
            {trendPct === null ? "—" : `${trendPct > 0 ? "+" : ""}${trendPct}%`}
          </span>
        )}
      </div>
      <div className="mt-2 text-2xl font-semibold text-text-primary">{value}</div>
      {hint && <div className="mt-1 text-xs text-text-secondary">{hint}</div>}
    </div>
  );
}
