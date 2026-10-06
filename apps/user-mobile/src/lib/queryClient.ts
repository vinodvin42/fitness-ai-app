import { QueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";

/**
 * Shared QueryClient + on-device cache persistence (Figma Today 08 "Offline
 * with cached workout"). Only the reads Today/Train need to render offline
 * are persisted — never payments, coach messages, support, security or
 * photos — and the whole cache is wiped on sign-out so one user's data can
 * never surface for the next.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  // gcTime must be >= the persister's maxAge or restored entries are dropped.
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, gcTime: DAY_MS } },
});

const PERSISTED_ROOTS = new Set([
  "plans",
  "workoutHistory",
  "waterLogs",
  "mealLogs",
  "programs",
  "program",
  "workout",
  "exercises",
  "recipes",
  "reminders",
]);

export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: "primefit-query-cache" });

export const persistOptions = {
  persister,
  maxAge: DAY_MS,
  // Bump to invalidate every installed client's cache after a shape change.
  buster: "v1",
  dehydrateOptions: {
    shouldDehydrateQuery: (q: { state: { status: string }; queryKey: readonly unknown[] }) =>
      q.state.status === "success" && PERSISTED_ROOTS.has(String(q.queryKey[0])),
  },
};

/** Wipes in-memory and persisted query data. Call on every sign-out. */
export async function clearPersistedCache(): Promise<void> {
  queryClient.clear();
  await persister.removeClient();
}
