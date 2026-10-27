import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MessageSquare } from "lucide-react";
import type { CoachConversationSummary } from "@fitness-ai-app/types";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/page";
import { initials } from "@/components/shell/AccountMenu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { dateLabel, timeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Today's messages show their time, older ones their date (the old app showed the date only). */
function whenLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay ? timeLabel(iso) : dateLabel(iso, { month: "short", day: "numeric" });
}

/** One row per active client, most recent activity first (the API's order), with the real unread count. */
export function ConversationList({
  conversations,
  isLoading,
  isError,
  onRetry,
  activeId,
}: {
  conversations: CoachConversationSummary[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  activeId: string | undefined;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex h-14 shrink-0 items-center border-b px-4">
        <h1 className="font-heading text-lg font-bold tracking-tight">{t("messages.title")}</h1>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? <ListSkeleton rows={5} className="p-3" /> : null}
        {isError ? (
          <div className="p-3">
            <ErrorState onRetry={onRetry} />
          </div>
        ) : null}
        {conversations && conversations.length === 0 ? (
          <div className="p-3">
            <EmptyState icon={MessageSquare} title={t("messages.emptyTitle")} description={t("messages.emptySubtitle")} />
          </div>
        ) : null}
        {conversations && conversations.length > 0 ? (
          <ul className="divide-y">
            {conversations.map((c) => {
              const active = c.partnerId === activeId;
              const unread = c.unreadCount > 0;
              return (
                <li key={c.partnerId}>
                  <Link
                    to={`/messages/${c.partnerId}`}
                    state={{ fullName: c.partnerName }}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                      active && "bg-muted hover:bg-muted",
                    )}
                  >
                    <Avatar size="lg">
                      <AvatarFallback className="font-medium">{initials(c.partnerName)}</AvatarFallback>
                    </Avatar>
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate", unread ? "font-semibold" : "font-medium")}>{c.partnerName}</span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{whenLabel(c.lastMessageAt)}</span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn("truncate text-sm", unread ? "text-foreground" : "text-muted-foreground")}>
                          {c.lastMessage ?? t("web.comms.noMessagesYet")}
                        </span>
                        {unread ? (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground tabular-nums">
                            <span aria-hidden>{c.unreadCount}</span>
                            <span className="sr-only">{t("web.comms.unreadBadge", { count: c.unreadCount })}</span>
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </>
  );
}
