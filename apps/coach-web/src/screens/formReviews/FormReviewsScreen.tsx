import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Clapperboard } from "lucide-react";
import type { CoachFormReview } from "@fitness-ai-app/types";
import { fetchFormReviews } from "@/api/formReviews";
import { EmptyState, ErrorState, ListCard, ListSkeleton, Page, PageHeader, RowLink, Section } from "@/components/page";
import { StatusBadge } from "@/components/StatusBadge";
import { useIsMobile } from "@/hooks/use-mobile";
import { dateTimeLabel } from "@/lib/format";

/**
 * Form reviews, ported from apps/coach-mobile's FormReviewsListScreen:
 * clips submitted by this coach's active clients. The server sends them
 * queued first; here they're split into "To review" and "Reviewed".
 */
export function FormReviewsScreen() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const query = useQuery({ queryKey: ["coach-form-reviews"], queryFn: fetchFormReviews });
  const items = query.data ?? [];
  const queued = items.filter((i) => i.status === "queued");
  const reviewed = items.filter((i) => i.status !== "queued");

  return (
    <Page>
      <PageHeader
        title={t("web.business.formReviews.title")}
        description={t("more.formReviews.subtitle")}
        back={isMobile ? { to: "/more", label: t("web.nav.more") } : undefined}
      />

      {query.isLoading ? <ListSkeleton rows={4} /> : null}
      {query.isError ? <ErrorState onRetry={() => query.refetch()} /> : null}
      {query.data && items.length === 0 ? (
        <EmptyState icon={Clapperboard} title={t("web.business.formReviews.emptyTitle")} description={t("web.business.formReviews.emptyBody")} />
      ) : null}

      {queued.length > 0 ? (
        <Section title={`${t("web.business.formReviews.toReviewSection")} · ${queued.length}`}>
          <ReviewList items={queued} />
        </Section>
      ) : null}
      {reviewed.length > 0 ? (
        <Section title={t("web.business.formReviews.reviewedSection")}>
          <ReviewList items={reviewed} />
        </Section>
      ) : null}
    </Page>
  );
}

function ReviewList({ items }: { items: CoachFormReview[] }) {
  const { t } = useTranslation();
  return (
    <ListCard>
      {items.map((item) => (
        <RowLink
          key={item.id}
          to={`/form-reviews/${item.id}`}
          leading={
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Clapperboard className="size-4" />
            </span>
          }
          title={`${item.userFirstName} · ${item.exerciseName ?? t("web.business.formReviews.exerciseUnknown")}`}
          subtitle={dateTimeLabel(item.createdAt)}
          trailing={
            <span className="flex items-center gap-2">
              <StatusBadge
                status={item.status}
                label={item.status === "queued" ? t("web.business.formReviews.needsReview") : t("web.business.formReviews.reviewed")}
              />
              <ChevronRight className="size-4 text-muted-foreground" />
            </span>
          }
        />
      ))}
    </ListCard>
  );
}
