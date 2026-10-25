import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./src/context/AuthContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { queryClient } from "./src/lib/queryClient";
// Imported for its side effect: initialises i18next before any screen
// renders. Same placement as apps/user-mobile/App.tsx.
import "./src/i18n";

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
