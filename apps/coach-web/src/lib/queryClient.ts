import { QueryClient } from "@tanstack/react-query";

/**
 * One QueryClient for the app. Data counts as fresh for 30 seconds and
 * refetches when the coach comes back to the tab, like the old app's
 * focus refresh. Sign-out clears it (lib/auth.tsx).
 */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: true } },
});
