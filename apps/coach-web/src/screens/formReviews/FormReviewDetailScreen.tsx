import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, VideoOff } from "lucide-react";
import { fetchFormReview, submitFormReview } from "@/api/formReviews";
import { ErrorState, Page, PageHeader } from "@/components/page";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { extractErrorMessage } from "@/lib/apiError";
import { dateTimeLabel } from "@/lib/format";

const MAX_NOTE = 2000;

/**
 * Review one clip, ported from apps/coach-mobile's FormReviewDetailScreen.
 * The old app had no video player, so it only showed the metadata; the
 * browser can play the clip (an http(s) or data:video URL), so it does.
 * Laptop: the clip and feedback beside the details.
 */
export function FormReviewDetailScreen() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["coach-form-review", id], queryFn: () => fetchFormReview(id), enabled: !!id });
  const [note, setNote] = useState("");
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    if (query.data?.coachNote) setNote(query.data.coachNote);
  }, [query.data?.coachNote]);

  const mutation = useMutation({
    mutationFn: () => submitFormReview(id, { coachNote: note.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-form-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["coach-form-review", id] });
      toast.success(t("web.business.formReviews.sent"), { description: t("web.business.formReviews.sentBody") });
      navigate("/form-reviews");
    },
    onError: (err) =>
      toast.error(t("web.business.formReviews.submitFailed"), {
        description: extractErrorMessage(err, t("web.business.formReviews.tryAgain")),
      }),
  });

  const item = query.data;
  const canSubmit = note.trim().length > 0 && note.length <= MAX_NOTE;
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (canSubmit && !mutation.isPending) mutation.mutate();
  };
  const exercise = item?.exerciseName ?? t("web.business.formReviews.exerciseUnknown");

  return (
    <Page width="wide">
      <PageHeader
        title={item ? `${item.userFirstName} · ${exercise}` : t("web.business.formReviews.detailTitle")}
        description={item ? t("web.business.formReviews.detailTitle") : undefined}
        back={{ to: "/form-reviews", label: t("web.business.formReviews.title") }}
      />

      {query.isLoading ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Skeleton className="aspect-video rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : null}
      {query.isError ? <ErrorState onRetry={() => query.refetch()} /> : null}

      {item ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <Card className="py-0">
              {item.hasVideo && item.videoUrl && !videoFailed ? (
                <video
                  key={item.id}
                  controls
                  playsInline
                  preload="metadata"
                  src={item.videoUrl}
                  onError={() => setVideoFailed(true)}
                  className="aspect-video w-full bg-black object-contain"
                  aria-label={`${t("web.business.formReviews.clipTitle")}: ${exercise}`}
                />
              ) : (
                <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-muted/50 px-6 text-center text-sm text-muted-foreground">
                  <VideoOff className="size-6" />
                  {item.hasVideo ? t("web.business.formReviews.videoUnavailable") : t("web.business.formReviews.noVideo")}
                </div>
              )}
            </Card>

            <form onSubmit={onSubmit} className="space-y-3" noValidate>
              <div className="flex items-end justify-between gap-3">
                <Label htmlFor="coach-note" className="text-base font-semibold">
                  {t("web.business.formReviews.noteLabel")}
                </Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {t("web.business.formReviews.noteCount", { count: note.length, max: MAX_NOTE })}
                </span>
              </div>
              <Textarea
                id="coach-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={MAX_NOTE}
                placeholder={t("web.business.formReviews.notePlaceholder")}
                className="min-h-36"
                disabled={mutation.isPending}
              />
              <div className="flex justify-end">
                <Button type="submit" size="lg" className="h-10 w-full sm:w-auto sm:px-5" disabled={!canSubmit || mutation.isPending}>
                  {mutation.isPending ? <Loader2 className="animate-spin" /> : null}
                  {item.status === "reviewed" ? t("web.business.formReviews.update") : t("web.business.formReviews.submit")}
                </Button>
              </div>
            </form>
          </div>

          <Card className="self-start">
            <CardHeader>
              <CardTitle className="font-semibold">{t("web.business.formReviews.detailsTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y text-sm">
                <Detail label={t("web.business.formReviews.status")}>
                  <StatusBadge
                    status={item.status}
                    label={item.status === "queued" ? t("web.business.formReviews.needsReview") : t("web.business.formReviews.reviewed")}
                  />
                </Detail>
                <Detail label={t("web.business.formReviews.client")}>{item.userFirstName}</Detail>
                <Detail label={t("web.business.formReviews.exercise")}>{exercise}</Detail>
                <Detail label={t("web.business.formReviews.submittedLabel")}>{dateTimeLabel(item.createdAt)}</Detail>
                {item.reviewedAt ? (
                  <Detail label={t("web.business.formReviews.reviewedLabel")}>{dateTimeLabel(item.reviewedAt)}</Detail>
                ) : null}
              </dl>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </Page>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}
