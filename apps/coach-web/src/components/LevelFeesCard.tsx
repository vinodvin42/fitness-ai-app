import { Award } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CoachMyLevelResponse } from "@fitness-ai-app/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { money } from "@/lib/format";

/**
 * The coach's level and fee structure (Package 4), read-only: Fynrox sets
 * the level, each service's fee and the commission. Shown on Earnings and on
 * My profile (27 Oct 2026, owner: "there is no fee structure of coach").
 * Per fee: what the client pays (fee + GST) and what the coach gets (fee
 * less Fynrox's commission).
 */
export function LevelFeesCard({ level }: { level: CoachMyLevelResponse }) {
  const { t } = useTranslation();
  const youGet = (cents: number) => Math.round(cents * (1 - level.commissionPct / 100));
  const clientPays = (cents: number) => Math.round(cents * (1 + level.gstPercent / 100));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-semibold">
          <Award className="size-4 text-primary-ink" />
          {level.level ? t("web.business.earnings.levelTitle", { name: level.level.name }) : t("web.business.earnings.levelNotSet")}
        </CardTitle>
        <CardDescription>
          {level.level
            ? t("web.business.earnings.levelSetBody", { gst: level.gstPercent })
            : t("web.business.earnings.levelUnsetBody")}
        </CardDescription>
      </CardHeader>
      {level.fees.length > 0 ? (
        <CardContent className="space-y-2">
          <ul className="divide-y rounded-lg border">
            {level.fees.map((f) => (
              <li key={f.label} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <span className="min-w-0 text-sm">
                  {t("web.business.earnings.feeLine", { label: f.label, minutes: f.durationMinutes })}
                  {f.priceCents !== null ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {t("web.business.fees.clientPaysYouGet", {
                        pays: money(clientPays(f.priceCents)),
                        get: money(youGet(f.priceCents)),
                      })}
                    </span>
                  ) : null}
                  {f.upcoming ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {t("web.business.earnings.feeUpcoming", {
                        price: money(f.upcoming.priceCents),
                        date: new Date(f.upcoming.effectiveFrom).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }),
                      })}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {f.priceCents === null ? (
                    <span className="font-normal text-muted-foreground">{t("web.business.earnings.feeNotSet")}</span>
                  ) : (
                    money(f.priceCents)
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{t("web.business.fees.commissionNote", { pct: level.commissionPct })}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}
