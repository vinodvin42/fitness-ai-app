import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts, Sora_600SemiBold, Sora_700Bold, Sora_800ExtraBold } from "@expo-google-fonts/sora";
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from "@expo-google-fonts/manrope";
import { JetBrainsMono_600SemiBold, JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono";
import { AuthProvider } from "./src/context/AuthContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { OfflineBanner } from "./src/components/OfflineBanner";
import { captureAcquisitionContext } from "./src/lib/acquisitionContext";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function App() {
  // Design System v2 typefaces (31 Aug 2026): Sora (display/headers),
  // Manrope (body/labels), JetBrains Mono (tabular metrics). Render on load
  // OR error so a font fetch failure degrades to the system font rather than
  // blanking the app.
  const [fontsLoaded, fontError] = useFonts({
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
  });

  // Acquisition-context capture (R1 Developer 1 U1, 14 Sep 2026) — see
  // src/lib/acquisitionContext.ts's own doc comment for why this is a
  // direct expo-linking capture rather than a NavigationContainer
  // `linking` config (RootNavigator's conditional Auth/Onboarding/Lock/
  // Main swap isn't one navigator a static linking config can cleanly
  // target). Handles both a cold start (app opened BY the link) and a
  // warm start (link received while already running); either way the
  // context is only ever captured, never routes anywhere itself — the
  // user still lands wherever the app's normal auth-state logic puts
  // them and taps through to Sign Up themselves.
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) captureAcquisitionContext(url);
    });
    const subscription = Linking.addEventListener("url", ({ url }) => {
      captureAcquisitionContext(url);
    });
    return () => subscription.remove();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="light" />
          <RootNavigator />
          <OfflineBanner />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
