/**
 * Renders a screen's spec'd fields the backend explicitly reported it
 * cannot compute yet (each service's own `notAvailable` list) as an honest
 * "not available" panel, rather than a table just silently missing
 * columns/rows a reviewer might assume were forgotten. Originally built
 * for the Executive Dashboard, generalized 21 Aug 2026 (Module 03) to
 * carry its own subtitle per screen, since "depends on the coach
 * marketplace" stopped being true the moment Module 03 itself IS the
 * coach marketplace's admin surface.
 *
 * **20 Aug 2026:** the Dashboard's own list shrunk from 7 keys to 3 once
 * Phase 5 made `activeProfessionals`/`pendingProfessionalApplications`/
 * `activeCoachingRelationships`/`unassignedUsersPool` real — those render
 * in DashboardScreen's own "Marketplace" card instead. See
 * adminDashboard.service.ts's doc comment for the 3 that remain.
 */
const LABELS: Record<string, string> = {
  pendingCoachingRequests: "Pending Coaching Requests",
  expiringCredentials: "Expiring Credentials",
  openRefundRequests: "Open Refund Requests",
  region: "Region",
  languages: "Languages",
  rating: "Rating",
  earningsMtd: "Earnings (MTD)",
  sessions: "Sessions",
  earnings: "Earnings",
  reviews: "Reviews",
  pricing: "Pricing",
  payments: "Payments",
  country: "Country",
  status: "Status",
  lastSync: "Last Sync",
  city: "City",
  timezone: "Timezone",
  acquisitionSource: "Acquisition Source",
  autoRenew: "Auto-Renew Toggle",
  activity: "Activity",
  sensitiveHealthMetrics: "Sensitive Health Metrics",
  // Module 05 (Programs CMS) addition, 22 Aug 2026 — Recipes Directory
  // (05.03); "rating" above is reused as-is.
  dietType: "Diet Type Filter",
  cuisine: "Cuisine Filter",
  // Module 06 (Commerce — Payments/Transactions) addition, 22 Aug 2026.
  gatewayHealth: "Gateway Health Indicator",
  ledgerLineItems: "Ledger Line Items (fees / discounts / tax)",
  // Module 08 (Support Tickets) addition, 22 Aug 2026.
  conversationThread: "Conversation Thread / Reply Composer",
  assignee: "Assignee",
  // Module 07.03 (Referrals) addition, 25 Aug 2026.
  referralFunnel: "Referral Funnel Visualization",
  referralRewards: "Referral Rewards / Economics",
  // Module 09.01 (User Analytics) addition, 25 Aug 2026.
  recoveryAnalytics: "Recovery Analytics",
  aiAnalytics: "AI Analytics",
  businessAnalytics: "Business Analytics",
  geographicAnalytics: "Geographic Analytics",
  compareToggle: "Compare Toggle",
  // Module 06.05 (Pricing) addition, 25 Aug 2026 — no Coupon entity exists
  // anywhere in this build.
  coupons: "Coupons",
  // Module 12.06 (Integrations) addition, 25 Aug 2026 — no admin-issued,
  // third-party-facing API key concept exists anywhere in this build.
  apiKeys: "API Keys",
  // Module 12.05 (Security) addition, 25 Aug 2026 — see SecurityScreen.tsx's
  // own doc comment for why only password-change is real.
  twoFactorAuth: "Two-Factor Authentication",
  passwordPolicy: "Password Policy",
  sessionSettings: "Session Settings",
  securityEventsTable: "Security Events Table",
  // Module 04.03 (Change/Intervention Queue) addition, 25 Aug 2026 — no
  // code path anywhere captures which replacement professional a user
  // had in mind when submitting a change request.
  requestedProfessional: "Requested (New Professional)",
  // Module 05.05 (Review/Approval) addition, 25 Aug 2026 — no due-date or
  // urgency concept exists anywhere in this build for content review.
  priority: "Priority",
  sla: "SLA",
  // Module 10 (Finance) addition, 26 Aug 2026 — see adminFinance.service.ts's
  // own doc comment for why Coach Settlements/Influencer Payouts aren't
  // modeled at all yet, and why the region slice of Revenue shares 09.05
  // Geographic's still-open gap.
  pendingSettlements: "Pending Coach Settlements",
  pendingPayouts: "Pending Influencer Payouts",
  coachSettlements: "Coach Settlements",
  influencerPayouts: "Influencer Payouts",
  regionalBreakdown: "Regional Breakdown",
  // Module 09.02 (Engagement) addition, 26 Aug 2026 — the per-day funnel
  // breakdown is only computed for date ranges of 31 days or fewer.
  funnelByDay: "Day-by-Day Funnel Breakdown",
  // Module 12.02 (Roles & Permissions) addition, 26 Aug 2026 — this
  // build's RBAC is a fixed enum + matrix, not admin-editable data.
  createRole: "Create New Role",
  editRoleSchemas: "Edit Role Schemas",
  // Module 12.04 (Privacy & Data Governance) addition, 26 Aug 2026 — see
  // adminPrivacy.service.ts's own doc comment for the honest distinction
  // between the real Sensitive Data Access Log and each of these.
  dsarSelfService: "Self-Service Data Access Request",
  consentManagement: "Consent Management",
  dataRetention: "Data Retention",
  // Module 11 (AI Operations) addition, 27 Aug 2026 — see
  // adminAiOps.service.ts's own doc comment for why only the AI Coach
  // on/off switch is real.
  aiFeatureConsole: "Feature Console (multi-capability rows, rollout %)",
  aiUsageMetrics: "Usage Metrics (latency, cost/call, error rate)",
  aiSafetyOverridesLog: "Safety / Overrides Log",
  // Module 09.06 (Unit Economics / Cohorts) addition, 27 Aug 2026 — see
  // adminAnalytics.service.ts's `getUnitEconomics` doc comment.
  acquisitionChannelSplit: "Acquisition Channel Split (donut + leaderboard)",
  unitEconomicsWaterfall: "Unit Economics Waterfall Chart",
};

const DEFAULT_SUBTITLE =
  "These Executive Dashboard metrics depend on the coach marketplace (Phase 5), which isn't built — see docs/coach/06-cross-app-integration.md §2.";

export function NotAvailablePanel({ keys, subtitle = DEFAULT_SUBTITLE }: { keys: string[]; subtitle?: string }) {
  if (keys.length === 0) return null;

  return (
    <div className="rounded-lg border border-dashed border-border-subtle bg-surface/50 p-4">
      <div className="text-xs uppercase tracking-wide text-text-dim">Not available yet</div>
      <p className="mt-1 text-xs text-text-secondary">{subtitle}</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {keys.map((key) => (
          <li key={key} className="rounded-full border border-border-subtle px-3 py-1 text-xs text-text-dim">
            {LABELS[key] ?? key}
          </li>
        ))}
      </ul>
    </div>
  );
}
