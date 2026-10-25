import { QueryClient } from "@tanstack/react-query";

/**
 * The app's one QueryClient, kept here (not in App.tsx) so sign-out can wipe
 * it. Nothing is persisted to disk in this app, so clearing memory is enough.
 * Same idea as apps/user-mobile/src/lib/queryClient.ts: one coach's clients
 * and messages must never show for the next coach on a shared device (coach
 * audit M9, 25 Oct 2026).
 */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

/** Drops every cached query. Call on every sign-out. */
export function clearQueryCache(): void {
  queryClient.clear();
}
