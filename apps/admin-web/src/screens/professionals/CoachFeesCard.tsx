import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { CoachMyLevelResponse } from "@fitness-ai-app/types";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";

const inr = (cents: number) =>
  `₹${(cents / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/**
 * Level & fees on the coach's admin profile (27 Oct 2026, owner: "there is no
 * fee structure of coach in admin"): the coach's level, each service's fee,
 * what the client pays with GST, what the coach gets after commission, and
 * any scheduled change. Read-only here; Commerce > Coach levels changes them.
 */
export function CoachFeesCard({ professionalId }: { professionalId: string }) {
  const { t } = useTranslation();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-coach-fees", professionalId],
    queryFn: () => apiClient.get<CoachMyLevelResponse>(`/admin/professionals/${professionalId}/fees`).then((r) => r.data),
  });

  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-text-dim">{t("coachFees.title")}</div>
          {data ? (
            <div className="mt-1 text-sm font-semibold text-text-primary">
              {data.level ? t("coachFees.level", { name: data.level.name }) : t("coachFees.noLevel")}
            </div>
          ) : null}
        </div>
        <Link to="/commerce/coach-levels" className="text-xs font-medium text-accent hover:underline">
          {t("coachFees.change")}
        </Link>
      </div>

      {isLoading ? <p className="mt-3 text-xs text-text-dim">{t("coachFees.loading")}</p> : null}
      {isError ? <p className="mt-3 text-xs text-danger">{extractErrorMessage(error, t("coachFees.loadFailed"))}</p> : null}

      {data ? (
        <>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-secondary">
            <span>{t("coachFees.commission", { pct: data.commissionPct })}</span>
            <span>{t("coachFees.gst", { pct: data.gstPercent })}</span>
          </div>
          {data.fees.length === 0 ? (
            <p className="mt-3 text-sm text-text-secondary">{t("coachFees.noFees")}</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-lg border border-border-subtle">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-text-dim">
                    <th className="px-3 py-2 font-normal">{t("coachFees.service")}</th>
                    <th className="px-3 py-2 text-right font-normal">{t("coachFees.fee")}</th>
                    <th className="px-3 py-2 text-right font-normal">{t("coachFees.clientPays")}</th>
                    <th className="px-3 py-2 text-right font-normal">{t("coachFees.coachGets")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.fees.map((f) => (
                    <tr key={f.label} className="border-b border-border-subtle last:border-0">
                      <td className="px-3 py-2">
                        <div className="text-text-primary">{f.label}</div>
                        <div className="text-xs text-text-dim">
                          {t("coachFees.minutes", { count: f.durationMinutes })}
                          {f.upcoming
                            ? ` · ${t("coachFees.upcoming", {
                                price: inr(f.upcoming.priceCents),
                                date: new Date(f.upcoming.effectiveFrom).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }),
                              })}`
                            : ""}
                        </div>
                      </td>
                      {f.priceCents === null ? (
                        <td colSpan={3} className="px-3 py-2 text-right text-xs text-text-dim">
                          {t("coachFees.notSet")}
                        </td>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-right tabular-nums">{inr(f.priceCents)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                            {inr(Math.round(f.priceCents * (1 + data.gstPercent / 100)))}
                          </td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">
                            {inr(Math.round(f.priceCents * (1 - data.commissionPct / 100)))}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
