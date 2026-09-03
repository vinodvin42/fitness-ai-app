import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./src/context/AuthContext";
import { RootNavigator } from "./src/navigation/RootNavigator";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

// No OfflineBanner / biometric-lock here — deliberately a simpler first
// slice than apps/user-mobile (see docs/coach/07-open-questions-gaps.md's
// "Phase 5 started" entry). Structurally identical otherwise: SafeAreaProvider
// -> QueryClientProvider -> AuthProvider -> StatusBar + RootNavigator.
export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
