import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquare, PenLine } from "lucide-react";
import type { CoachClientProfile, CoachScheduleItem } from "@fitness-ai-app/types";
import { fetchClientProfile } from "@/api/professionalClients";
import { ErrorState, Page, PageHeader } from "@/components/page";
import { initials } from "@/components/shell/AccountMenu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { extractErrorMessage } from "@/lib/apiError";
import { dateLabel, SERVICE_SHORT } from "@/lib/format";
import { ActivityTab } from "./profile/ActivityTab";
import { NotesTab } from "./profile/NotesTab";
import { OverviewTab } from "./profile/OverviewTab";
import { RelationshipActions } from "./profile/RelationshipActions";
import { SafetyCard } from "./profile/SafetyCard";
import { SessionSummaryDialog, canWriteSummary, useHasSummary } from "./profile/SessionSummaryDialog";
import { SessionsTab } from "./profile/SessionsTab";

const TABS = ["overview", "sessions", "activity", "notes"] as const;
type Tab = (typeof TABS)[number];

const longDate = (iso: string) => dateLabel(iso, { month: "short", day: "numeric", year: "numeric" });

/**
 * Client Profile (docs/coach/03-screen-inventory.md §D), ported from
 * coach-mobile. Coaching-relevant onboarding fields and session history from
 * GET /professionals/me/clients/:userId; Client 360 activity (consent-gated)
 * from …/summary; private notes; session feedback; session summaries; the
 * recommendations review; a safety flag, report and block; and complete /
 * end / handover for each relationship. Sensitive health fields stay
 * withheld behind an honest "not available" note.
 *
 * Laptop: tabs in the main column, an aside with the client card, quick
 * actions and the relationship and safety actions. Phone: one column, the
 * client card first, then the tabs, then the actions.
 */
export function ClientProfileScreen() {
  const { t } = useTranslation();
  const { userId = "" } = useParams<{ userId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const stateName = (location.state as { fullName?: string } | null)?.fullName;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["coach-client", userId],
    queryFn: () => fetchClientProfile(userId),
    enabled: userId.length > 0,
  });

  // Session summary (25 Oct 2026): written from a recent session that went ahead.
  const [summarySession, setSummarySession] = useState<CoachScheduleItem | null>(null);

  const fullName = data?.fullName ?? stateName ?? t("web.clientProfile.clientFallback");
  const tabParam = searchParams.get("tab");
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "overview";

  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams);
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  // Once a relationship-ending action succeeds this client may no longer be
  // this coach's active client at all (the profile's own gate), so rather than
  // show stale data or a confusing 404, go back to the Clients list.
  const onRelationshipEnded = (message: string) => {
    void queryClient.invalidateQueries({ queryKey: ["coach-clients"] });
    toast.success(t("web.clientProfile.done"), { description: message });
    navigate("/clients");
  };

  return (
    <Page width="wide">
      <PageHeader
        back={{ to: "/clients", label: t("web.clientProfile.backToClients") }}
        title={fullName}
        description={data ? t("web.clientProfile.clientSince", { date: longDate(data.activeSince) }) : undefined}
      />

      {isError ? <ErrorState message={extractErrorMessage(error, t("common.checkConnection"))} onRetry={() => refetch()} /> : null}

      {isLoading ? <ProfileSkeleton /> : null}

      {data ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_1fr] lg:items-start">
          <ClientHeaderCard profile={data} onWriteSummary={setSummarySession} className="lg:col-start-2 lg:row-start-1" />

          <div className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
              <TabsList
                aria-label={t("web.clientProfile.tabsLabel")}
                className="w-full group-data-[orientation=horizontal]/tabs:h-10 sm:w-fit md:group-data-[orientation=horizontal]/tabs:h-8"
              >
                <TabsTrigger value="overview" className="px-3">
                  {t("web.clientProfile.tabOverview")}
                </TabsTrigger>
                <TabsTrigger value="sessions" className="px-3">
                  {t("web.clientProfile.tabSessions")}
                </TabsTrigger>
                <TabsTrigger value="activity" className="px-3">
                  {t("web.clientProfile.tabActivity")}
                </TabsTrigger>
                <TabsTrigger value="notes" className="px-3">
                  {t("web.clientProfile.tabNotes")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="pt-3">
                <OverviewTab profile={data} />
              </TabsContent>
              <TabsContent value="sessions" className="pt-3">
                <SessionsTab profile={data} onWriteSummary={setSummarySession} />
              </TabsContent>
              <TabsContent value="activity" className="pt-3">
                <ActivityTab userId={userId} />
              </TabsContent>
              <TabsContent value="notes" className="pt-3">
                <NotesTab userId={userId} />
              </TabsContent>
            </Tabs>
          </div>

          <aside className="space-y-4 lg:col-start-2 lg:row-start-2">
            <RelationshipActions relationships={data.relationships} clientName={data.fullName} onComplete={onRelationshipEnded} />
            {/* P-M12: a flag is for the safety team, a note is for the coach. */}
            <SafetyCard userId={userId} fullName={data.fullName} />
          </aside>
        </div>
      ) : null}

      <SessionSummaryDialog session={summarySession} clientName={data?.fullName ?? fullName} onClose={() => setSummarySession(null)} />
    </Page>
  );
}

/** Avatar, services and since, plus Message and (when a session that went ahead has none yet) Write summary. */
function ClientHeaderCard({
  profile,
  onWriteSummary,
  className,
}: {
  profile: CoachClientProfile;
  onWriteSummary: (item: CoachScheduleItem) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  // The most recent past session a summary can be written for.
  const latestWritable = useMemo(
    () =>
      [...profile.sessions.past]
        .filter((s) => canWriteSummary(s))
        .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())[0] ?? null,
    [profile.sessions.past],
  );
  const hasSummary = useHasSummary(latestWritable);

  return (
    <Card size="sm" className={className}>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-12 rounded-xl">
            <AvatarFallback className="rounded-[inherit] bg-primary/15 text-sm font-semibold text-primary-ink">
              {initials(profile.fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1">
            <p className="truncate font-heading text-base font-semibold">{profile.fullName}</p>
            <div className="flex flex-wrap gap-1.5">
              {profile.serviceTypes.map((s) => (
                <span key={s} className="inline-flex h-5 items-center rounded-full bg-primary/10 px-2 text-[11px] font-semibold text-primary-ink">
                  {SERVICE_SHORT[s] ?? s}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <Button
            className="h-10 w-full md:h-8"
            render={<Link to={`/messages/${profile.userId}`} state={{ fullName: profile.fullName }} />}
          >
            <MessageSquare />
            {t("web.clientProfile.message")}
          </Button>
          {latestWritable && !hasSummary ? (
            <Button variant="outline" className="h-10 w-full md:h-8" onClick={() => onWriteSummary(latestWritable)}>
              <PenLine />
              {t("sessionSummary.write")}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" aria-busy="true">
      <div className="space-y-4">
        <Skeleton className="h-8 w-72 max-w-full" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-[92px] rounded-xl" />
          <Skeleton className="h-[92px] rounded-xl" />
        </div>
        <Skeleton className="h-40 rounded-xl" />
      </div>
      <div className="hidden space-y-4 lg:block">
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    </div>
  );
}
