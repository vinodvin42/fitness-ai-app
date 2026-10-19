import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";
// Imported for its side effect: initialises i18next before any screen
// renders, so no component can mount against an uninitialised instance.
import "./src/i18n";
import { AuthProvider } from "./src/context/AuthContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { OfflineBanner } from "./src/components/OfflineBanner";
import { ToastProvider } from "./src/components/Toast";
import { ThemeProvider, useTheme } from "./src/theme/ThemeProvider";
import { queryClient, persistOptions } from "./src/lib/queryClient";
import { captureAcquisitionContext } from "./src/lib/acquisitionContext";
import { captureResetPasswordToken } from "./src/lib/resetPasswordLink";
import { initTextScale } from "./src/lib/localSettings";

// Applies the saved "Larger text" choice (Settings) before the first render.
void initTextScale();

/** Light icons on the dark theme, dark icons on the light theme. */
function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
}

export default function App() {
  // Inter, the typeface in the approved Figma type styles (16 Oct 2026;
  // replaced Sora/Manrope/JetBrains Mono). Render on load OR error so a font
  // fetch failure degrades to the system font rather than blanking the app.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
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
  // Reset Password deep link (18 Sep 2026, gap §53) — captured the same
  // way, right alongside acquisition-context capture above; see
  // src/lib/resetPasswordLink.ts's own doc comment for why this is a
  // second capture-then-consume pair rather than a shared one (the two
  // URL shapes and storage lifetimes are genuinely different).
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) {
        captureAcquisitionContext(url);
        captureResetPasswordToken(url);
      }
    });
    const subscription = Linking.addEventListener("url", ({ url }) => {
      captureAcquisitionContext(url);
      captureResetPasswordToken(url);
    });
    return () => subscription.remove();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <AuthProvider>
          <ThemeProvider>
            <ToastProvider>
              <ThemedStatusBar />
              <RootNavigator />
              <OfflineBanner />
            </ToastProvider>
          </ThemeProvider>
        </AuthProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
