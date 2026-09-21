import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { LoginScreen } from "./screens/LoginScreen";
import { DashboardScreen } from "./screens/DashboardScreen";
import { ProfessionalDirectoryScreen } from "./screens/professionals/ProfessionalDirectoryScreen";
import { ProfessionalProfileScreen } from "./screens/professionals/ProfessionalProfileScreen";
import { CredentialVerificationScreen } from "./screens/professionals/CredentialVerificationScreen";
import { RelationshipDirectoryScreen } from "./screens/relationships/RelationshipDirectoryScreen";
import { RelationshipDetailScreen } from "./screens/relationships/RelationshipDetailScreen";
import { ChangeRequestQueueScreen } from "./screens/relationships/ChangeRequestQueueScreen";
import { UserDirectoryScreen } from "./screens/users/UserDirectoryScreen";
import { UserProfileScreen } from "./screens/users/UserProfileScreen";
import { AdminUsersScreen } from "./screens/adminSystem/AdminUsersScreen";
import { AuditLogsScreen } from "./screens/adminSystem/AuditLogsScreen";
import { IntegrationsScreen } from "./screens/adminSystem/IntegrationsScreen";
import { SecurityScreen } from "./screens/adminSystem/SecurityScreen";
import { RolesPermissionsScreen } from "./screens/adminSystem/RolesPermissionsScreen";
import { PrivacyScreen } from "./screens/adminSystem/PrivacyScreen";
import { ConsentManagementScreen } from "./screens/adminSystem/ConsentManagementScreen";
import { ProgramsDirectoryScreen } from "./screens/programs/ProgramsDirectoryScreen";
import { ExercisesDirectoryScreen } from "./screens/programs/ExercisesDirectoryScreen";
import { RecipesDirectoryScreen } from "./screens/programs/RecipesDirectoryScreen";
import { ReviewQueueScreen } from "./screens/programs/ReviewQueueScreen";
import { PaymentsDirectoryScreen } from "./screens/commerce/PaymentsDirectoryScreen";
import { TransactionDetailScreen } from "./screens/commerce/TransactionDetailScreen";
import { PricingScreen } from "./screens/commerce/PricingScreen";
import { CouponsScreen } from "./screens/commerce/CouponsScreen";
import { RefundsScreen } from "./screens/commerce/RefundsScreen";
import { SupportTicketsScreen } from "./screens/support/SupportTicketsScreen";
import { EscalationsScreen } from "./screens/support/EscalationsScreen";
import { SafetyEscalationsScreen } from "./screens/support/SafetyEscalationsScreen";
import { ReferralsScreen } from "./screens/growth/ReferralsScreen";
import { InfluencersScreen } from "./screens/growth/InfluencersScreen";
import { UserAnalyticsScreen } from "./screens/analytics/UserAnalyticsScreen";
import { EngagementScreen } from "./screens/analytics/EngagementScreen";
import { FitnessNutritionScreen } from "./screens/analytics/FitnessNutritionScreen";
import { UnitEconomicsScreen } from "./screens/analytics/UnitEconomicsScreen";
import { BusinessAnalyticsScreen } from "./screens/analytics/BusinessAnalyticsScreen";
import { FinanceDashboardScreen } from "./screens/finance/FinanceDashboardScreen";
import { RevenueScreen } from "./screens/finance/RevenueScreen";
import { RevenueWaterfallScreen } from "./screens/finance/RevenueWaterfallScreen";
import { ExpensesScreen } from "./screens/finance/ExpensesScreen";
import { SettlementsScreen } from "./screens/finance/SettlementsScreen";
import { InvoicesScreen } from "./screens/finance/InvoicesScreen";
import { ReceivablesPayablesScreen } from "./screens/finance/ReceivablesPayablesScreen";
import { TaxesScreen } from "./screens/finance/TaxesScreen";
import { FinancialReportsScreen } from "./screens/finance/FinancialReportsScreen";
import { AiCoachSettingsScreen } from "./screens/aiOps/AiCoachSettingsScreen";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { adminUser, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-text-secondary">
        Loading…
      </div>
    );
  }

  if (!adminUser) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

/**
 * Inverse of RequireAuth. Bug fix (25 Aug 2026, found while building a
 * mock-data demo build of this app): LoginScreen calls `login()` and
 * AuthProvider's `adminUser` state updates, but nothing was navigating
 * away from "/login" afterward — the route rendered LoginScreen
 * unconditionally, so a successful sign-in just left the form sitting
 * there instead of reaching the Dashboard. Mirrors RequireAuth's
 * isLoading/adminUser check in the opposite direction.
 */
function RedirectIfAuthed({ children }: { children: React.ReactElement }) {
  const { adminUser, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-text-secondary">
        Loading…
      </div>
    );
  }

  if (adminUser) {
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
      {/* Module 03 — Professionals (added 21 Aug 2026). "/professionals/verification"
          is declared before the ":id" route for readability, though React
          Router v6 would resolve the static segment first regardless of
          declaration order (specificity-based matching, not first-match). */}
      <Route
        path="/professionals"
        element={
          <RequireAuth>
            <ProfessionalDirectoryScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/professionals/verification"
        element={
          <RequireAuth>
            <CredentialVerificationScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/professionals/:id"
        element={
          <RequireAuth>
            <ProfessionalProfileScreen />
          </RequireAuth>
        }
      />
      {/* Module 04 — Relationships (Directory + Detail added 21 Aug 2026;
          Change/Intervention Queue added 25 Aug 2026, closing the gap the
          old comment here used to flag — see adminRelationships.service.ts's
          own doc comment for what "Approve" actually does). Same
          "static segment before :id" ordering precedent as
          "/professionals/verification" and "/commerce/plans". */}
      <Route
        path="/relationships"
        element={
          <RequireAuth>
            <RelationshipDirectoryScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/relationships/change-queue"
        element={
          <RequireAuth>
            <ChangeRequestQueueScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/relationships/:id"
        element={
          <RequireAuth>
            <RelationshipDetailScreen />
          </RequireAuth>
        }
      />
      {/* Module 02 — Users (added 21 Aug 2026). Same Directory + Detail
          shape as Relationships — read-only, no state-changing action
          this module ships, see adminUsers.service.ts's own doc comment. */}
      <Route
        path="/users"
        element={
          <RequireAuth>
            <UserDirectoryScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/users/:id"
        element={
          <RequireAuth>
            <UserProfileScreen />
          </RequireAuth>
        }
      />
      {/* Module 12 — Admin & System: 12.01 Admin Users (added 22 Aug 2026)
          + 12.03 Audit Logs (same day) + 12.06 Integrations + 12.05
          Security (25 Aug 2026) + 12.02 Roles & Permissions (read-only)
          and 12.04 Privacy & Data Governance (26 Aug 2026) — six real
          screens now, sharing ADMIN_SYSTEM_SUB_NAV. Only 12.07
          Notifications and 12.08 Platform Settings aren't built — see
          adminRoles.service.ts / adminPrivacy.service.ts's own doc
          comments and docs/platform/roadmap.md for why. */}
      <Route
        path="/admin-system"
        element={
          <RequireAuth>
            <AdminUsersScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/admin-system/roles"
        element={
          <RequireAuth>
            <RolesPermissionsScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/admin-system/audit-logs"
        element={
          <RequireAuth>
            <AuditLogsScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/admin-system/privacy"
        element={
          <RequireAuth>
            <PrivacyScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/admin-system/consents"
        element={
          <RequireAuth>
            <ConsentManagementScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/admin-system/integrations"
        element={
          <RequireAuth>
            <IntegrationsScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/admin-system/security"
        element={
          <RequireAuth>
            <SecurityScreen />
          </RequireAuth>
        }
      />
      {/* Module 05 — Programs (Content CMS), 05.01/05.02/05.03 added 22 Aug
          2026; 05.05 Review/Approval joined 25 Aug 2026, closing the gap
          the old comment here used to flag (see adminPrograms.service.ts's
          own doc comment for what changed). 05.04 Educational Content is
          still not built — no entity exists for it anywhere. All four
          share PROGRAMS_SUB_NAV, same pattern as Professionals' three
          screens. */}
      <Route
        path="/programs"
        element={
          <RequireAuth>
            <ProgramsDirectoryScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/programs/exercises"
        element={
          <RequireAuth>
            <ExercisesDirectoryScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/programs/recipes"
        element={
          <RequireAuth>
            <RecipesDirectoryScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/programs/review-queue"
        element={
          <RequireAuth>
            <ReviewQueueScreen />
          </RequireAuth>
        }
      />
      {/* Module 06 — Commerce, 06.02 Transactions + 06.03 Payments (added 22
          Aug 2026), 06.05 Pricing's Plans half joined 25 Aug 2026 — now
          shares COMMERCE_SUB_NAV. "/commerce/plans" is declared before the
          ":id" route for readability, same precedent as Professionals'
          "/professionals/verification" — React Router v6 resolves the
          static segment first regardless of declaration order.
          "/commerce/:id" is a Payment row drill-down (Transaction detail),
          not a second top-level screen — see adminPayments.service.ts's
          own doc comment for why 06.01/06.04 aren't built this pass, and
          adminPlans.service.ts's for why Coupons isn't built. */}
      <Route
        path="/commerce"
        element={
          <RequireAuth>
            <PaymentsDirectoryScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/commerce/plans"
        element={
          <RequireAuth>
            <PricingScreen />
          </RequireAuth>
        }
      />
      {/* 06.05 Coupons + 06.04 Refunds (31 Aug 2026) — static segments,
          declared before "/commerce/:id" for readability. */}
      <Route
        path="/commerce/coupons"
        element={
          <RequireAuth>
            <CouponsScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/commerce/refunds"
        element={
          <RequireAuth>
            <RefundsScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/commerce/:id"
        element={
          <RequireAuth>
            <TransactionDetailScreen />
          </RequireAuth>
        }
      />
      {/* Module 08 — Support & Safety, 08.01 Support Tickets (added 22 Aug
          2026, a split-panel screen, no separate detail route — selection
          is local state, not a URL param) + 08.02 Escalations (added
          25 Aug 2026, Module 08's second nav-level screen, gaining
          SUPPORT_SUB_NAV) — see adminSupport.service.ts's own doc comment
          for why 08.02 turned out resolvable while 08.03/08.04 remain
          genuine gaps, and why 08.01 was picked over Module 07 — Growth
          for the 22 Aug 2026 cycle. */}
      <Route
        path="/support"
        element={
          <RequireAuth>
            <SupportTicketsScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/support/escalations"
        element={
          <RequireAuth>
            <EscalationsScreen />
          </RequireAuth>
        }
      />
      {/* BR-SAF-004 Safety Escalations (added 18 Sep 2026) — Module 08's
          real second queue, alongside 08.02 Escalations above. See
          adminSafety.service.ts's own doc comment. */}
      <Route
        path="/support/safety-escalations"
        element={
          <RequireAuth>
            <SafetyEscalationsScreen />
          </RequireAuth>
        }
      />
      {/* Module 07 — Growth. 07.03 Referrals (added 25 Aug 2026) was the
          first real slice here — see adminReferrals.service.ts's own doc
          comment. 07.01/07.02 Influencers joined 31 Aug 2026 (routed below,
          under Growth's own subNav — see growth/subNav.ts); 07.04 Campaigns
          & Attribution still needs a new Campaign entity + attribution
          pipeline. */}
      <Route
        path="/growth"
        element={
          <RequireAuth>
            <ReferralsScreen />
          </RequireAuth>
        }
      />
      {/* 07.01/07.02 Influencers + 10.07 Payouts (31 Aug 2026) — Growth's
          second real screen, gaining GROWTH_SUB_NAV. */}
      <Route
        path="/growth/influencers"
        element={
          <RequireAuth>
            <InfluencersScreen />
          </RequireAuth>
        }
      />
      {/* Module 09 — Analytics: 09.01 User Analytics (added 25 Aug 2026,
          gained a real AI tab + compare toggle 26 Aug) + 09.02 Engagement
          + 09.03 Fitness & Nutrition (both added 26 Aug 2026) + 09.06 Unit
          Economics (added 27 Aug 2026) — four real screens now, sharing
          ANALYTICS_SUB_NAV. 09.05 Geographic is real too (26 Aug 2026) but
          folded into 09.01's own tab strip rather than a separate route —
          see UserAnalyticsScreen.tsx's doc comment. Recovery and Business
          remain honestly not built — no backing data exists for either.
          See adminAnalytics.service.ts's own doc comment for why none of
          this needed a new Prisma entity. */}
      <Route
        path="/analytics"
        element={
          <RequireAuth>
            <UserAnalyticsScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/analytics/engagement"
        element={
          <RequireAuth>
            <EngagementScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/analytics/fitness-nutrition"
        element={
          <RequireAuth>
            <FitnessNutritionScreen />
          </RequireAuth>
        }
      />
      {/* 09.06 Unit Economics / Cohorts (added 27 Aug 2026) — see
          UnitEconomicsScreen.tsx's own doc comment for why this turned
          out not to need a new product decision. */}
      <Route
        path="/analytics/unit-economics"
        element={
          <RequireAuth>
            <UnitEconomicsScreen />
          </RequireAuth>
        }
      />
      {/* 09.04 Business Analytics (31 Aug 2026) — unblocked once per-coach
          commission + Coach Settlements shipped. */}
      <Route
        path="/analytics/business"
        element={
          <RequireAuth>
            <BusinessAnalyticsScreen />
          </RequireAuth>
        }
      />
      {/* Module 10 — Finance (added 26 Aug 2026), built directly from the
          "one ledger" architecture decision. 8 of the Figma's 10 screens
          are real now (10.06 Coach Settlements joined 31 Aug 2026, routed
          below at /finance/settlements; the Revenue Waterfall at
          /finance/waterfall shipped 5 Sep 2026, sharing FINANCE_SUB_NAV
          too). 10.07 Influencer Payouts lives under Growth instead (see
          the Growth route block above), and 10.09 Bank/Payment Accounts
          still has no route at all — same "no dead links, omit rather
          than stub" convention SUPPORT_SUB_NAV set for 08.03/08.04. See
          adminFinance.service.ts's own doc comment for the full
          real-vs-not breakdown. */}
      <Route
        path="/finance"
        element={
          <RequireAuth>
            <FinanceDashboardScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/finance/revenue"
        element={
          <RequireAuth>
            <RevenueScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/finance/waterfall"
        element={
          <RequireAuth>
            <RevenueWaterfallScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/finance/expenses"
        element={
          <RequireAuth>
            <ExpensesScreen />
          </RequireAuth>
        }
      />
      {/* 10.06 Coach Settlements (31 Aug 2026) — unblocked by the per-coach
          commission decision. */}
      <Route
        path="/finance/settlements"
        element={
          <RequireAuth>
            <SettlementsScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/finance/invoices"
        element={
          <RequireAuth>
            <InvoicesScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/finance/receivables-payables"
        element={
          <RequireAuth>
            <ReceivablesPayablesScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/finance/taxes"
        element={
          <RequireAuth>
            <TaxesScreen />
          </RequireAuth>
        }
      />
      <Route
        path="/finance/reports"
        element={
          <RequireAuth>
            <FinancialReportsScreen />
          </RequireAuth>
        }
      />
      {/* Module 11 — AI Operations (added 27 Aug 2026) — a single real
          screen (the AI Coach on/off switch), no subNav — see
          AiCoachSettingsScreen.tsx's own doc comment. */}
      <Route
        path="/ai-operations"
        element={
          <RequireAuth>
            <AiCoachSettingsScreen />
          </RequireAuth>
        }
      />
      {/* Every other module is still an inert sidebar row for now, not a
          routed screen — see AppShell.tsx's NAV_ITEMS. Any unknown path
          falls back to the dashboard rather than a 404, since this
          console has no public/anonymous surface at all. */}
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
