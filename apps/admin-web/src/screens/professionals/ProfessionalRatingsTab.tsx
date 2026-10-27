import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { AdminProfessionalRatingsResponse } from "@fitness-ai-app/types";
import { Badge } from "../../components/ui/badge";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";

// SESSION_RATING_TAGS in apps/api (coachSummaries.schema.ts); unknown tags show as-is.
const TAG_LABELS: Record<string, string> = {
  clear_guidance: "Clear guidance",
  on_time: "On time",
  useful_plan_changes: "Useful plan changes",
  good_listener: "Good listener",
};

/**
 * Professional Profile → Reviews (27 Oct 2026): the members' private session
 * ratings for this coach, read-only, from GET /admin/professionals/:id/ratings
 * (professionals: view). Newest first, at most 200.
 */
export function ProfessionalRatingsTab({ professionalId }: { professionalId: string }) {
  const { t } = useTranslation();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-professional-ratings", professionalId],
    queryFn: async () => (await apiClient.get<AdminProfessionalRatingsResponse>(`/admin/professionals/${professionalId}/ratings`)).data,
  });

  if (isLoading) return <p className="text-sm text-text-secondary">{t("professionalProfile.loading")}</p>;
  if (isError || !data) {
    return (
      <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        {extractErrorMessage(error, t("professionalProfile.ratingsLoadError"))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border-subtle bg-surface shadow-xs p-4 text-sm">
        <p className="text-text-secondary">{t("professionalProfile.ratingsIntro")}</p>
        {data.summary.count > 0 && data.summary.average != null && (
          <p className="mt-2 text-base font-semibold text-text-primary">
            {t("professionalProfile.ratingsSummary", { average: data.summary.average.toFixed(1), count: data.summary.count })}
          </p>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface shadow-xs">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
              <th className="px-4 py-3 font-normal">{t("professionalProfile.reviewsStars")}</th>
              <th className="px-4 py-3 font-normal">{t("professionalProfile.reviewsMember")}</th>
              <th className="px-4 py-3 font-normal">{t("professionalProfile.reviewsSession")}</th>
              <th className="px-4 py-3 font-normal">{t("professionalProfile.reviewsComment")}</th>
              <th className="px-4 py-3 font-normal">{t("professionalProfile.reviewsWhen")}</th>
            </tr>
          </thead>
          <tbody>
            {data.ratings.map((r) => (
              <tr key={r.id} className="border-b border-border-subtle align-top last:border-0">
                <td className="px-4 py-3 whitespace-nowrap font-medium text-text-primary" aria-label={`${r.stars} / 5`}>
                  {"★".repeat(r.stars)}
                  <span className="text-text-dim">{"★".repeat(Math.max(0, 5 - r.stars))}</span>
                </td>
                <td className="px-4 py-3">
                  <Link to={`/users/${r.userId}`} className="text-text-primary hover:text-accent hover:underline">
                    {r.userFullName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {new Date(r.sessionAt).toLocaleString()}
                  <div className="text-xs text-text-dim">{r.offeringLabel}</div>
                </td>
                <td className="px-4 py-3">
                  {r.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {r.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {TAG_LABELS[tag] ?? tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {r.comment && <p className="mt-1 text-text-secondary">{r.comment}</p>}
                  {r.tags.length === 0 && !r.comment && <span className="text-text-dim">—</span>}
                </td>
                <td className="px-4 py-3 text-text-dim">{new Date(r.updatedAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {data.ratings.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-dim">
                  {t("professionalProfile.noRatingsYet")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
