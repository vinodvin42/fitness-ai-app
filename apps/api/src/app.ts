import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { authRouter } from "./modules/auth/auth.routes";
import { usersRouter } from "./modules/users/users.routes";
import { programPurchasesRouter } from "./modules/programPurchases/programPurchases.routes";
import { programsRouter } from "./modules/programs/programs.routes";
import { workoutSessionsRouter } from "./modules/workoutSessions/workoutSessions.routes";
import { nutritionRouter } from "./modules/nutrition/nutrition.routes";
import { progressRouter } from "./modules/progress/progress.routes";
import { recoveryRouter } from "./modules/recovery/recovery.routes";
import { subscriptionsRouter } from "./modules/subscriptions/subscriptions.routes";
import { timelineRouter } from "./modules/timeline/timeline.routes";
import { remindersRouter } from "./modules/reminders/reminders.routes";
import { supportRouter } from "./modules/support/support.routes";
import { referralsRouter } from "./modules/referrals/referrals.routes";
import { paymentsRouter, razorpayWebhookHandler } from "./modules/payments/payments.routes";
import { checkoutRouter } from "./modules/checkout/checkout.routes";
import { couponsRouter } from "./modules/coupons/coupons.routes";
import { aiRouter } from "./modules/ai/ai.routes";
import { aiCoachRouter } from "./modules/aiCoach/aiCoach.routes";
import { plansRouter } from "./modules/plans/plans.routes";
import { mealPlansRouter } from "./modules/mealPlans/mealPlans.routes";
import { analyticsEventsRouter } from "./modules/analyticsEvents/analyticsEvents.routes";
import { adminAuthRouter } from "./modules/adminAuth/adminAuth.routes";
import { adminDashboardRouter } from "./modules/adminDashboard/adminDashboard.routes";
import { adminUsersRouter } from "./modules/adminUsers/adminUsers.routes";
import { adminProfessionalsRouter } from "./modules/adminProfessionals/adminProfessionals.routes";
import { adminRelationshipsRouter } from "./modules/adminRelationships/adminRelationships.routes";
import { adminAccountsRouter } from "./modules/adminAccounts/adminAccounts.routes";
import { adminProgramsRouter } from "./modules/adminPrograms/adminPrograms.routes";
import { adminPaymentsRouter } from "./modules/adminPayments/adminPayments.routes";
import { adminSubscriptionsRouter } from "./modules/adminSubscriptions/adminSubscriptions.routes";
import { adminPlansRouter } from "./modules/adminPlans/adminPlans.routes";
import { adminSupportRouter } from "./modules/adminSupport/adminSupport.routes";
import { adminSafetyRouter } from "./modules/adminSafety/adminSafety.routes";
import { adminAuditLogsRouter } from "./modules/adminAuditLogs/adminAuditLogs.routes";
import { adminAnalyticsEventsRouter } from "./modules/adminAnalyticsEvents/adminAnalyticsEvents.routes";
import { adminReferralsRouter } from "./modules/adminReferrals/adminReferrals.routes";
import { adminAnalyticsRouter } from "./modules/adminAnalytics/adminAnalytics.routes";
import { adminIntegrationsRouter } from "./modules/adminIntegrations/adminIntegrations.routes";
import { adminFinanceRouter } from "./modules/adminFinance/adminFinance.routes";
import { adminSettlementsRouter } from "./modules/adminSettlements/adminSettlements.routes";
import { payoutRunsRouter } from "./modules/payoutRuns/payoutRuns.routes";
import { adminInfluencersRouter } from "./modules/adminInfluencers/adminInfluencers.routes";
import { adminAcquisitionRouter } from "./modules/adminAcquisition/adminAcquisition.routes";
import { gymsRouter } from "./modules/gyms/gyms.routes";
import { gymAuthRouter } from "./modules/gymAuth/gymAuth.routes";
import { adminCouponsRouter } from "./modules/adminCoupons/adminCoupons.routes";
import { adminRefundsRouter } from "./modules/adminRefunds/adminRefunds.routes";
import { adminRolesRouter } from "./modules/adminRoles/adminRoles.routes";
import { adminPrivacyRouter } from "./modules/adminPrivacy/adminPrivacy.routes";
import { privacyRequestsRouter } from "./modules/privacyRequests/privacyRequests.routes";
import { adminAiOpsRouter } from "./modules/adminAiOps/adminAiOps.routes";
import { adminActionQueueRouter } from "./modules/adminActionQueue/adminActionQueue.routes";
import { professionalAuthRouter } from "./modules/professionalAuth/professionalAuth.routes";
import { influencerAuthRouter } from "./modules/influencerAuth/influencerAuth.routes";
import { influencerPortalRouter } from "./modules/influencerPortal/influencerPortal.routes";
import { professionalOnboardingRouter } from "./modules/professionalOnboarding/professionalOnboarding.routes";
import { professionalLifecycleRouter } from "./modules/professionalLifecycle/professionalLifecycle.routes";
import { professionalDashboardRouter } from "./modules/professionalDashboard/professionalDashboard.routes";
import { professionalClientsRouter } from "./modules/professionalClients/professionalClients.routes";
import { coachNotesRouter } from "./modules/coachNotes/coachNotes.routes";
import { coachingRouter } from "./modules/coaching/coaching.routes";
import { coachMessagesRouter } from "./modules/coachMessages/coachMessages.routes";
import { professionalOffersRouter } from "./modules/professionalOffers/professionalOffers.routes";
import { guidanceRequestsRouter } from "./modules/guidanceRequests/guidanceRequests.routes";
import { deepLinksRouter } from "./modules/deepLinks/deepLinks.routes";
import { adminSearchRouter } from "./modules/adminSearch/adminSearch.routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  // Go-live hardening (25 Aug 2026) — Render (and any PaaS fronted by a
  // load balancer that terminates TLS) sits one hop in front of this
  // process, so without this, req.ip is always the load balancer's own
  // address, never the real client's. That silently breaks two things
  // added in this same hardening pass: express-rate-limit would bucket
  // every user in the app together under one shared "IP" (one abusive
  // client could lock out everyone else's login attempts), and morgan's
  // "combined" access log below would record the load balancer's address
  // for every request instead of the real client's. "1" trusts exactly one
  // proxy hop — matching Render's architecture — rather than trusting the
  // whole X-Forwarded-For chain, which would let a client spoof its own
  // IP by sending that header directly. Harmless locally: with no proxy
  // in front of a dev server, there's no X-Forwarded-For header to trust
  // in the first place.
  app.set("trust proxy", 1);

  app.use(helmet());
  // The `true` (allow-any-origin) fallback below only applies when
  // CORS_ORIGINS is unset — env.ts now refuses to boot at all in
  // production with an empty CORS_ORIGINS (go-live hardening, 25 Aug
  // 2026), so by the time this line runs in production, CORS_ORIGINS is
  // guaranteed non-empty. The permissive fallback stays for
  // development/test, where it's genuinely convenient.
  app.use(
    cors({
      origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : true,
      credentials: true,
    }),
  );
  // Razorpay's webhook signature (20 Aug 2026, gap §14) is computed over
  // the exact raw request bytes, not the reserialized JSON object
  // express.json() below would produce — so this one route needs its own
  // raw-body parser, and it has to be registered BEFORE the global
  // express.json() middleware so Express matches it first and the body
  // arrives as an untouched Buffer. See payments.service.ts's
  // handleWebhook() for the actual verification.
  app.post("/payments/razorpay/webhook", express.raw({ type: "application/json" }), razorpayWebhookHandler);

  // Default express.json() limit is 100kb — too small for Progress Photos'
  // base64-data-URI request bodies (see progress.schema.ts's
  // createProgressPhotoSchema, capped at ~6MB of image data). 10mb gives
  // that a safety margin without opening every other route up to
  // unreasonably large payloads.
  app.use(express.json({ limit: "10mb" }));
  app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));

  app.get("/health", (_req, res) => res.json({ status: "ok", env: env.NODE_ENV }));

  app.use("/auth", authRouter);
  app.use("/users", usersRouter);
  // programPurchasesRouter must be mounted before programsRouter: its
  // GET /programs/mine would otherwise be swallowed by programsRouter's
  // GET /programs/:id (Express matches "mine" as the :id param).
  app.use("/", programPurchasesRouter);
  app.use("/", programsRouter);
  app.use("/", workoutSessionsRouter);
  app.use("/", nutritionRouter);
  app.use("/", progressRouter);
  // Recovery & Devices — manual-entry stopgap (31 Aug 2026). See recovery.service.ts.
  app.use("/", recoveryRouter);
  app.use("/", subscriptionsRouter);
  app.use("/", timelineRouter);
  app.use("/", remindersRouter);
  app.use("/", supportRouter);
  app.use("/", referralsRouter);
  app.use("/", paymentsRouter);
  // U-M1 / U-M22 — the checkout quote (price, GST, "Have a code?")
  // and purchase history with refund status.
  app.use("/", checkoutRouter);
  // Coupons — consumer validate endpoint (31 Aug 2026). See coupons.service.ts.
  app.use("/", couponsRouter);
  app.use("/", aiRouter);
  // AI Coach (Phase 2 §H, added 25 Aug 2026) — the feature half of gap
  // §13, now that aiRouter above (20 Aug 2026) has real provider config
  // to call. See aiCoach.service.ts's own doc comment for the full
  // real-vs-deferred breakdown (streaming responses is the one piece
  // still not built).
  app.use("/", aiCoachRouter);
  // Plan-Generation / Recommendation Engine (14 Sep 2026) — see
  // plans.service.ts's own doc comment for why this exists and who it's
  // for (shared platform logic, not any one R1 work package's own scope).
  app.use("/", plansRouter);
  app.use("/", mealPlansRouter);
  // Product-analytics events (U7, 15 Sep 2026) — the client-facing half of
  // apps/api/src/lib/analytics.ts's trackEvent() pipeline, for the handful
  // of §8 events that only exist client-side. See analyticsEventsRouter's
  // own doc comment.
  app.use("/", analyticsEventsRouter);
  // Admin console (Phase 6) — mounted at "/" like the rest since each
  // router already scopes its own full paths (e.g. "/admin/auth/login"),
  // matching the mounting convention every other router above uses.
  app.use("/", adminAuthRouter);
  app.use("/", adminDashboardRouter);
  // Module 02 — Users (added 21 Aug 2026) — read-only Directory + Profile
  // against the existing User/Subscription/Payment/Relationship/
  // SupportTicket/AuditLog models — see adminUsers.service.ts's own doc
  // comment for what's real vs. honestly not modeled, and why the spec's
  // "Sensitive Health Metrics" panel is deliberately never populated at
  // all rather than just listed as missing.
  app.use("/", adminUsersRouter);
  // Module 03 — Professionals (added 21 Aug 2026) — see
  // adminProfessionals.service.ts's own doc comment for what's real vs.
  // honestly not modeled against the Figma's fuller spec.
  app.use("/", adminProfessionalsRouter);
  // Module 04 — Relationships (added 21 Aug 2026) — Directory/Detail are
  // real against the existing Relationship model; Change/Intervention
  // Queue (04.03) is NOT built this pass — see adminRelationships.service.ts's
  // own doc comment for why.
  app.use("/", adminRelationshipsRouter);
  // Module 12.01 — Admin Users (added 22 Aug 2026) — the admin console's
  // own staff-account management screen, closing the gap adminAuth.service.ts's
  // own doc comment flagged (AdminUser accounts were seed-script-only
  // until now). See adminAccounts.service.ts's own doc comment for what's
  // real vs. honestly not modeled, including why "Invite" is relabeled
  // "Create Admin User".
  app.use("/", adminAccountsRouter);
  // Module 05 — Programs (Content CMS), 05.01/05.02/05.03 added 22 Aug 2026;
  // 05.05 Review/Approval joined 25 Aug 2026 — see adminPrograms.service.ts's
  // own doc comment for what changed and why 05.04 Educational Content is
  // still the one piece of this module not built.
  app.use("/", adminProgramsRouter);
  // Module 06 — Commerce, 06.02 Transactions + 06.03 Payments only (added
  // 22 Aug 2026) — a read-only Directory + Detail pair over the existing
  // `Payment` model; see adminPayments.service.ts's own doc comment for
  // why 06.01/06.04 aren't built this pass (06.05's plans half shipped
  // 25 Aug 2026 — see adminPlansRouter below).
  app.use("/", adminPaymentsRouter);
  // Gap §57 (18 Sep 2026) — real admin force-revoke for a Subscription
  // (fraud/chargeback/ToS), commerce-module `approve`-gated.
  app.use("/", adminSubscriptionsRouter);
  // Module 06.05 — Pricing (plans half only, added 25 Aug 2026) — the
  // first code anywhere in this build that can create/edit/archive a
  // `SubscriptionPlan` row; see adminPlans.service.ts's own doc comment
  // for why Coupons aren't built (no `Coupon` entity exists anywhere).
  app.use("/", adminPlansRouter);
  // Module 08 — Support & Safety, 08.01 Support Tickets only (added 22 Aug
  // 2026) — a filterable Directory + triage-edit pair over the existing
  // `SupportTicket` model; see adminSupport.service.ts's own doc comment
  // for why 08.02/08.03/08.04 aren't built this pass, and for the
  // reasoning behind picking this over Module 07 — Growth this cycle.
  app.use("/", adminSupportRouter);
  // BR-SAF-004 Safety Escalations (added 18 Sep 2026) — Module 08's real
  // second queue, alongside 08.02 Escalations just above. See
  // adminSafety.service.ts's own doc comment.
  app.use("/", adminSafetyRouter);
  // Module 12.03 — Audit Logs (added 22 Aug 2026) — the first genuinely
  // unscoped, cross-entity, filterable view of the existing `AuditLog`
  // table (every prior read was scoped to one entity or actor); see
  // adminAuditLogs.service.ts's own doc comment for the full real-vs-not
  // breakdown, including why this caps at the most-recent 200 rows with
  // a real `totalCount`/`truncated` rather than either faking full
  // pagination or silently under-reporting.
  app.use("/", adminAuditLogsRouter);
  // U7 (15 Sep 2026) — the admin-facing read path for `AnalyticsEvent`,
  // proving the product-analytics events trackEvent() writes are
  // genuinely inspectable rather than write-only. See
  // adminAnalyticsEvents.service.ts's own doc comment.
  app.use("/", adminAnalyticsEventsRouter);
  // Module 07 — Growth, 07.03 Referrals only (added 25 Aug 2026) — the
  // first admin surface over the existing `Referral` model; see
  // adminReferrals.service.ts's own doc comment for why this is the one
  // remaining genuinely unblocked slice in the console, and for the full
  // real-vs-not breakdown (no funnel-stage or reward data exists to build
  // 07.03's fuller spec against).
  app.use("/", adminReferralsRouter);
  // Module 09 — Analytics (09.01 added 25 Aug 2026; 09.02/09.03 and
  // 09.01's AI tab + compare toggle added 26 Aug 2026) — needs NO new
  // Prisma entity at all, just real aggregates over User/Payment/
  // Referral/WorkoutSession/MealLog/WaterLog/AiCoachMessage/
  // OnboardingProfile/Exercise/Program; see adminAnalytics.service.ts's
  // own doc comment for the full real-vs-not breakdown, and for why
  // 09.02/09.03 are genuinely distinct screens from 09.01's tabs, not
  // near-duplicates.
  app.use("/", adminAnalyticsRouter);
  // Module 12.06 — Integrations (added 25 Aug 2026) — reads two already-
  // real status helpers (`isRazorpayConfigured()`, `getAiProviderStatus()`)
  // through an admin surface for the first time; see
  // adminIntegrations.service.ts's own doc comment for why the API Keys
  // half isn't built (no third-party-facing API key concept exists).
  app.use("/", adminIntegrationsRouter);
  // Module 10 — Finance (added 26 Aug 2026), built directly from the
  // "one ledger" architecture decision — see
  // reports/finance-architecture-plan.html and adminFinance.service.ts's
  // own doc comment for the full real-vs-not breakdown across all 10
  // screens, and for why 10.06/10.07/10.09 have no routes here at all.
  app.use("/", adminFinanceRouter);
  // Module 10.06/10.07 Coach Settlements + Influencer Payouts, 06.04
  // Refunds, and 06.05 Coupons (31 Aug 2026) — the "money out" and
  // discount modules the roadmap left blocked on a take-rate decision (now
  // made: configurable per-coach/per-influencer commission) and a missing
  // Coupon/Refund entity (now built). See each module's own doc comment.
  app.use("/", adminSettlementsRouter);
  // A-M3 — the payout run the settlement rows were waiting on.
  app.use("/", payoutRunsRouter);
  app.use("/", adminInfluencersRouter);
  app.use("/", gymsRouter);
  // Gym Partner Lite portal (R2 Wave 5, 21 Sep 2026) — apps/gym-portal's own
  // login, a distinct identity from AdminUser. See gymAuth.service.ts's own
  // doc comment.
  app.use("/", gymAuthRouter);
  // Module 07.04 Campaigns & Attribution (20 Sep 2026, R2 Wave 4) — real
  // admin-web reporting over R2 Wave 1's Source/Campaign/Touchpoint schema.
  // See adminAcquisition.service.ts's own doc comment.
  app.use("/", adminAcquisitionRouter);
  app.use("/", adminCouponsRouter);
  app.use("/", adminRefundsRouter);
  // Admin Action Required queue (R2 Wave 1, 20 Sep 2026) — see
  // schema.prisma's AdminActionItem doc comment and lib/adminActionQueue
  // .ts's top comment for the full design.
  app.use("/", adminActionQueueRouter);
  // Module 12.02 — Roles & Permissions (read-only) and 12.04 — Privacy &
  // Data Governance (added 26 Aug 2026), same pass as Module 09.02/09.03
  // and Finance. Neither needed a new Prisma entity: 12.02 reads the
  // already-enforced PERMISSION_MATRIX (adminPermissions.ts) plus real
  // AdminUser counts; 12.04 reads SensitiveDataAccessRequest console-wide
  // for the first time — see adminRoles.service.ts / adminPrivacy.
  // service.ts's own doc comments, including 12.04's honest distinction
  // between this real access log and a genuine self-service DSAR flow,
  // which is NOT built.
  app.use("/", adminRolesRouter);
  app.use("/", adminPrivacyRouter);
  // Journey F8 — the tracked subject-rights lifecycle (U-M17 / A-M5).
  // Sits alongside the existing 12.04 Privacy dashboard rather than
  // replacing it: that surfaces the historical AuditLog trail, this is
  // the live queue.
  app.use("/", privacyRequestsRouter);
  // Module 11 — AI Operations (added 27 Aug 2026) — the scoped-down slice
  // reports/build-plan.html's own 11.01–11.03 entry named as smaller and
  // genuinely buildable: one real, audit-logged on/off switch for AI
  // Coach chat, not the full Feature Console/Usage/Safety-Overrides
  // module. See adminAiOps.service.ts's own doc comment for what's still
  // honestly not built.
  app.use("/", adminAiOpsRouter);
  // Coach marketplace (Phase 5) — see docs/coach/07-open-questions-gaps.md's
  // "Phase 5 started" entry.
  app.use("/", professionalAuthRouter);
  // Creator Portal (R2 Wave 5, 21 Sep 2026) — an Influencer's own
  // self-service login + dashboard backend (apps/creator-portal). See
  // influencerAuth.service.ts / influencerPortal.service.ts's own doc
  // comments.
  app.use("/", influencerAuthRouter);
  app.use("/", influencerPortalRouter);
  app.use("/", professionalOnboardingRouter);
  // R2 Wave 1 (20 Sep 2026) — Professional R1 lifecycle (application ->
  // verification -> approved -> available), additive alongside the
  // onboarding wizard above. See professionalLifecycle.service.ts.
  app.use("/", professionalLifecycleRouter);
  app.use("/", professionalDashboardRouter);
  // Coach Client Profile (31 Aug 2026) — professional-authed (the coach's
  // own clients). See professionalClients.service.ts's doc comment.
  app.use("/", professionalClientsRouter);
  // Coach Private Notes (R2 Wave 3, 20 Sep 2026) — professional-authed only,
  // deliberately never mounted under any User-authed path. See
  // coachNotes.service.ts's doc comment for the full design and the
  // active-vs-any-relationship read/write gate.
  app.use("/", coachNotesRouter);
  // Coach Discovery & Booking (25 Aug 2026) — consumer-facing (User Bearer),
  // not Professional Bearer, since it's the user-mobile side of the
  // journey — see coaching.service.ts's doc comment (closes gap §1).
  app.use("/", coachingRouter);
  // Coach ↔ Client Messaging (31 Aug 2026) — mixed auth per route (User
  // Bearer for /coaching/conversations*, Professional Bearer for
  // /professionals/me/conversations*). See coachMessages.service.ts.
  app.use("/", coachMessagesRouter);
  // Professional Offers (R2 Wave 2, 20 Sep 2026) — the admin/system-proposes
  // -a-specific-pro stage the existing user-initiated Relationship flow
  // above doesn't model. Mixed auth per route (Admin Bearer for
  // /admin/professional-offers*, Professional Bearer for
  // /professionals/me/offers*) — see professionalOffers.service.ts's own
  // doc comment.
  app.use("/", professionalOffersRouter);
  // Decision #4 / journey F5 — "Request professional guidance" and
  // the A-M1 assignment queue that turns a request into an offer.
  app.use("/", guidanceRequestsRouter);
  // W-M2 — the invite/referral link resolver the website landings call.
  // Public by design: these are links handed to people who do not have
  // an account yet.
  app.use("/", deepLinksRouter);

  // Global cross-entity admin search (R1 Wave 6, 22 Sep 2026) — see
  // adminSearch.service.ts's own doc comment for the full scope.
  app.use("/", adminSearchRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
