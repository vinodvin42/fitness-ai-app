import { useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";
import { fetchConversations } from "@/api/coachMessages";
import { cn } from "@/lib/utils";
import { ConversationList } from "./ConversationList";
import { ThreadPane } from "./ThreadPane";

/**
 * Messages, ported from apps/coach-mobile's ConversationsListScreen and
 * ThreadScreen. One component serves /messages and /messages/:userId.
 * Tablet and laptop: the conversation list on the left and the open thread on
 * the right, filling the height under the 56px top bar. Phone: the list at
 * /messages, the thread full-screen at /messages/:userId with a back link,
 * above the 64px bottom tab bar (the shell pads for it).
 *
 * Not real-time: the list polls every 15s and the open thread every 8s, as in
 * the old app. Reading a thread marks the client's messages read server-side.
 */
export function MessagesScreen() {
  const { userId } = useParams<{ userId: string }>();
  const location = useLocation();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coach-conversations"],
    queryFn: fetchConversations,
    // Not real-time — refetch every 15s so unread counts stay roughly live.
    refetchInterval: 15_000,
  });

  const stateName = (location.state as { fullName?: string } | null)?.fullName;
  const listName = data?.conversations.find((c) => c.partnerId === userId)?.partnerName;

  return (
    <div className="flex h-[calc(100dvh-7.5rem-env(safe-area-inset-bottom))] min-h-0 md:h-[calc(100dvh-3.5rem)]">
      <aside
        className={cn(
          "min-h-0 w-full flex-col md:flex md:w-80 md:shrink-0 md:border-r",
          userId ? "hidden" : "flex",
        )}
      >
        <ConversationList
          conversations={data?.conversations}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          activeId={userId}
        />
      </aside>

      <section className={cn("min-h-0 min-w-0 flex-1 flex-col md:flex", userId ? "flex" : "hidden")}>
        {userId ? <ThreadPane key={userId} userId={userId} fallbackName={listName ?? stateName ?? ""} /> : <NoThreadSelected />}
      </section>
    </div>
  );
}

function NoThreadSelected() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <MessagesSquare className="size-6" />
      </span>
      <p className="font-medium">{t("web.comms.pickConversation")}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{t("web.comms.pickConversationHint")}</p>
    </div>
  );
}
