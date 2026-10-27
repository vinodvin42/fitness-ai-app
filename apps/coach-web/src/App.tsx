import { lazy, Suspense, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { LoginScreen } from "@/screens/auth/LoginScreen";
import { SignupScreen } from "@/screens/auth/SignupScreen";
import { TodayScreen } from "@/screens/today/TodayScreen";
import { NotFoundScreen } from "@/screens/NotFoundScreen";

/** Each screen is its own chunk, so the first load is the shell and Today only. */
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));

const InboxScreen = named(() => import("@/screens/inbox/InboxScreen"), "InboxScreen");
const ClientsScreen = named(() => import("@/screens/clients/ClientsScreen"), "ClientsScreen");
const RequestsScreen = named(() => import("@/screens/clients/RequestsScreen"), "RequestsScreen");
const OffersScreen = named(() => import("@/screens/clients/OffersScreen"), "OffersScreen");
const ClientProfileScreen = named(() => import("@/screens/clients/ClientProfileScreen"), "ClientProfileScreen");
const ClientRecommendationsScreen = named(() => import("@/screens/clients/ClientRecommendationsScreen"), "ClientRecommendationsScreen");
const CalendarScreen = named(() => import("@/screens/calendar/CalendarScreen"), "CalendarScreen");
const MessagesScreen = named(() => import("@/screens/messages/MessagesScreen"), "MessagesScreen");
const FormReviewsScreen = named(() => import("@/screens/formReviews/FormReviewsScreen"), "FormReviewsScreen");
const FormReviewDetailScreen = named(() => import("@/screens/formReviews/FormReviewDetailScreen"), "FormReviewDetailScreen");
const EarningsScreen = named(() => import("@/screens/earnings/EarningsScreen"), "EarningsScreen");
const AvailabilityScreen = named(() => import("@/screens/availability/AvailabilityScreen"), "AvailabilityScreen");
const ProfileScreen = named(() => import("@/screens/account/ProfileScreen"), "ProfileScreen");
const HelpScreen = named(() => import("@/screens/account/HelpScreen"), "HelpScreen");
const MoreScreen = named(() => import("@/screens/account/MoreScreen"), "MoreScreen");
const ServiceSelectionScreen = named(() => import("@/screens/onboarding/ServiceSelectionScreen"), "ServiceSelectionScreen");
const CredentialUploadScreen = named(() => import("@/screens/onboarding/CredentialUploadScreen"), "CredentialUploadScreen");
const KycUploadScreen = named(() => import("@/screens/onboarding/KycUploadScreen"), "KycUploadScreen");
const VerificationStatusScreen = named(() => import("@/screens/onboarding/VerificationStatusScreen"), "VerificationStatusScreen");

function Splash() {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center">
      <Loader2 className="size-6 animate-spin text-primary" />
    </div>
  );
}

const lazyPage = (node: ReactNode) => <Suspense fallback={<Splash />}>{node}</Suspense>;

/** Signed in and onboarded: the app. Otherwise off to login or onboarding. */
function RequireCoach() {
  const { isLoading, isAuthenticated, onboardingCompleted } = useAuth();
  const location = useLocation();
  if (isLoading) return <Splash />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!onboardingCompleted) return <Navigate to="/onboarding" replace />;
  return <AppShell />;
}

/** Signed in but services not chosen yet. */
function RequireOnboarding() {
  const { isLoading, isAuthenticated, onboardingCompleted } = useAuth();
  if (isLoading) return <Splash />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (onboardingCompleted) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Login and sign-up: a signed-in coach goes back where they were heading. */
function PublicOnly() {
  const { isLoading, isAuthenticated } = useAuth();
  const location = useLocation();
  if (isLoading) return <Splash />;
  if (isAuthenticated) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== "/login" ? from : "/"} replace />;
  }
  return <Outlet />;
}

const router = createBrowserRouter([
  {
    element: <PublicOnly />,
    children: [
      { path: "/login", element: <LoginScreen /> },
      { path: "/signup", element: <SignupScreen /> },
    ],
  },
  {
    path: "/onboarding",
    element: <RequireOnboarding />,
    children: [
      { index: true, element: lazyPage(<ServiceSelectionScreen />) },
      { path: "credentials", element: lazyPage(<CredentialUploadScreen />) },
      { path: "kyc", element: lazyPage(<KycUploadScreen />) },
      { path: "status", element: lazyPage(<VerificationStatusScreen />) },
    ],
  },
  {
    element: <RequireCoach />,
    children: [
      { path: "/", element: <TodayScreen /> },
      { path: "/inbox", element: lazyPage(<InboxScreen />) },
      { path: "/clients", element: lazyPage(<ClientsScreen />) },
      { path: "/clients/requests", element: lazyPage(<RequestsScreen />) },
      { path: "/clients/offers", element: lazyPage(<OffersScreen />) },
      { path: "/clients/:userId", element: lazyPage(<ClientProfileScreen />) },
      { path: "/clients/:userId/recommendations", element: lazyPage(<ClientRecommendationsScreen />) },
      { path: "/calendar", element: lazyPage(<CalendarScreen />) },
      { path: "/messages", element: lazyPage(<MessagesScreen />) },
      { path: "/messages/:userId", element: lazyPage(<MessagesScreen />) },
      { path: "/form-reviews", element: lazyPage(<FormReviewsScreen />) },
      { path: "/form-reviews/:id", element: lazyPage(<FormReviewDetailScreen />) },
      { path: "/earnings", element: lazyPage(<EarningsScreen />) },
      { path: "/availability", element: lazyPage(<AvailabilityScreen />) },
      { path: "/profile", element: lazyPage(<ProfileScreen />) },
      { path: "/verification", element: lazyPage(<VerificationStatusScreen />) },
      { path: "/verification/credentials", element: lazyPage(<CredentialUploadScreen />) },
      { path: "/verification/kyc", element: lazyPage(<KycUploadScreen />) },
      { path: "/help", element: lazyPage(<HelpScreen />) },
      { path: "/more", element: lazyPage(<MoreScreen />) },
      // The old Expo coach app's paths (/Main/Calendar, …), from bookmarks made before the switch.
      { path: "/Main/*", element: <Navigate to="/" replace /> },
      { path: "*", element: <NotFoundScreen /> },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider delay={300}>
          <RouterProvider router={router} />
          <Toaster position="top-center" richColors closeButton />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
