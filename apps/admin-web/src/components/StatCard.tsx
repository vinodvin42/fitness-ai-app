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

  // Atlas metric card (27 Oct 2026): quiet label, a large figure, and the
  // trend as a pill under it beside the hint.
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface p-4 shadow-xs">
      <div className="text-sm font-medium text-text-secondary">{label}</div>
      <div className="text-[28px] leading-none font-semibold tracking-tight text-text-primary tabular-nums">{value}</div>
      {trendPct !== undefined || hint ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-dim">
          {trendPct !== undefined && (
            <span
              className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                trendPct === null
                  ? "bg-surface-raised text-text-dim"
                  : goodDirection
                    ? "bg-accent/12 text-accent"
                    : badDirection
                      ? "bg-danger/12 text-danger"
                      : "bg-surface-raised text-text-dim"
              }`}
            >
              {trendPct === null ? "—" : `${trendPct > 0 ? "↑" : trendPct < 0 ? "↓" : ""}${Math.abs(trendPct)}%`}
            </span>
          )}
          {hint && <span>{hint}</span>}
        </div>
      ) : null}
    </div>
  );
}
