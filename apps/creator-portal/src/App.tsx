import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { LoginScreen } from "./screens/LoginScreen";
import { DashboardScreen } from "./screens/DashboardScreen";
import { CampaignsScreen } from "./screens/CampaignsScreen";
import { ReferralToolsScreen } from "./screens/ReferralToolsScreen";
import { CommissionScreen } from "./screens/CommissionScreen";
import { AgreementScreen } from "./screens/AgreementScreen";
import { AccountScreen } from "./screens/AccountScreen";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { influencer, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-text-secondary">
        Loading…
      </div>
    );
  }

  if (!influencer) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

// Inverse of RequireAuth — same fix apps/admin-web/src/App.tsx's own
// RedirectIfAuthed applies: without this, a successful sign-in just left
// the login form sitting there instead of navigating to the dashboard.
function RedirectIfAuthed({ children }: { children: React.ReactElement }) {
  const { influencer, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-text-secondary">
        Loading…
      </div>
    );
  }

  if (influencer) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <LoginScreen />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <DashboardScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/campaigns"
        element={
          <RequireAuth>
            <CampaignsScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/referral-tools"
        element={
          <RequireAuth>
            <ReferralToolsScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/commission"
        element={
          <RequireAuth>
            <CommissionScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/agreement"
        element={
          <RequireAuth>
            <AgreementScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/account"
        element={
          <RequireAuth>
            <AccountScreen />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </QueryClientProvider>
  );
}
