import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronRight, Search, UserPlus, Users, X } from "lucide-react";
import type { CoachClientListItem } from "@fitness-ai-app/types";
import { fetchClients } from "@/api/professionalClients";
import { fetchPendingRelationships } from "@/api/relationshipRequests";
import { EmptyState, ErrorState, Page, PageHeader } from "@/components/page";
import { initials } from "@/components/shell/AccountMenu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useShellCounts } from "@/lib/coachAlerts";
import { dateLabel, SERVICE_SHORT } from "@/lib/format";

/**
 * Clients, ported from apps/coach-mobile's ClientsListScreen: the coach's
 * active clients (GET /professionals/me/clients), each opening their profile.
 * The web version adds a name search and lays the clients out as a grid of
 * cards on wider screens. The banner to Requests & offers shows whenever
 * anything waits (the shell's count, plus the same pending-requests query the
 * old screen used, so the two never disagree).
 */
export function ClientsScreen() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coach-clients"],
    queryFn: fetchClients,
  });
  const { data: pending } = useQuery({
    queryKey: ["coach-pending-requests"],
    queryFn: fetchPendingRelationships,
  });
  const { waiting } = useShellCounts();
  const waitingCount = Math.max(waiting, pending?.requests.length ?? 0);

  const clients = useMemo(() => data?.clients ?? [], [data]);
  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (needle ? clients.filter((c) => c.fullName.toLowerCase().includes(needle)) : clients),
    [clients, needle],
  );

  return (
    <Page width="wide">
      <PageHeader
        title={t("clients.title")}
        description={clients.length > 0 ? t("web.clients.clientCount", { count: clients.length }) : t("web.clients.description")}
        actions={
          waitingCount > 0 ? (
            <Button variant="outline" className="hidden sm:inline-flex" render={<Link to="/clients/requests" />}>
              <UserPlus />
              {t("web.nav.requests")}
            </Button>
          ) : null
        }
      />

      {waitingCount > 0 ? (
        <Link
          to="/clients/requests"
          className="group flex items-center gap-3 rounded-xl bg-primary/10 p-3.5 ring-1 ring-primary/25 transition-colors hover:bg-primary/15"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <UserPlus className="size-4" />
          </span>
          <span className="grid flex-1 gap-0.5">
            <span className="text-sm font-semibold">{t("web.clients.waiting", { count: waitingCount })}</span>
            <span className="text-sm text-muted-foreground">{t("clients.reviewAndRespond")}</span>
          </span>
          <span className="hidden text-sm font-medium text-primary-ink sm:inline">{t("web.clients.review")}</span>
          <ArrowRight className="size-4 text-primary-ink transition-transform group-hover:translate-x-0.5" />
        </Link>
      ) : null}

      {isError ? <ErrorState onRetry={() => refetch()} /> : null}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label={t("web.loading")}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[132px] rounded-xl" />
          ))}
        </div>
      ) : null}

      {data && clients.length === 0 ? (
        <EmptyState icon={Users} title={t("clients.emptyTitle")} description={t("clients.emptySubtitle")} />
      ) : null}

      {data && clients.length > 0 ? (
        <div className="space-y-4">
          <div className="relative sm:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("web.clients.searchPlaceholder")}
              aria-label={t("web.clients.searchLabel")}
              className="h-10 pr-10 pl-9 [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-1/2 right-1 -translate-y-1/2"
                onClick={() => setQuery("")}
                aria-label={t("web.clients.clearSearch")}
              >
                <X />
              </Button>
            ) : null}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={Search}
              title={t("web.clients.noMatchTitle", { query: query.trim() })}
              description={t("web.clients.noMatchBody")}
              action={
                <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                  {t("web.clients.clearSearch")}
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((client) => (
                <li key={client.userId}>
                  <ClientCard client={client} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </Page>
  );
}

function shortDay(iso: string | null, none: string): string {
  return iso ? dateLabel(iso, { day: "numeric", month: "short" }) : none;
}

function ClientCard({ client }: { client: CoachClientListItem }) {
  const { t } = useTranslation();
  const none = t("web.clients.none");
  return (
    <Link
      to={`/clients/${client.userId}`}
      state={{ fullName: client.fullName }}
      className="group flex h-full flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="flex items-center gap-3">
        <Avatar size="lg">
          <AvatarFallback className="font-medium">{initials(client.fullName)}</AvatarFallback>
        </Avatar>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate font-medium">{client.fullName}</span>
          <span className="truncate text-sm text-muted-foreground">
            {client.serviceTypes.map((s) => SERVICE_SHORT[s] ?? s).join(" · ")}
          </span>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      <dl className="grid grid-cols-3 gap-2 border-t pt-3">
        <Stat label={t("web.clients.sessions")} value={String(client.sessionsCompleted)} />
        <Stat label={t("web.clients.next")} value={shortDay(client.nextSessionAt, none)} />
        <Stat label={t("web.clients.last")} value={shortDay(client.lastSessionAt, none)} />
      </dl>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="truncate text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
