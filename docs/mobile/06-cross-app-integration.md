# Cross-App Integration — How the Mobile App and Admin Console Fit Together

The two Figma files reviewed for this project are two faces of one product: **v1-user** (this app) is what end users experience; **vi-admin** (documented in [../](../)) is how PrimeFit staff operate the business behind it. This document maps the two together so backend/data-model work isn't duplicated or built as two disconnected systems.

## 1. Direct module correspondences

| Mobile app area | Admin console module | Relationship |
|---|---|---|
| Training (Programs, Exercises) | **05 Programs** (Content) | Programs/exercises/recipes are almost certainly authored and moderated in Admin (05.01–05.05, including the Review/Approval queue) and *published for consumption* here. |
| Nutrition (Recipes, Meal Plan) | **05 Programs** (Content) | Same as above — Recipes (05.03) and Educational Content (05.04) are admin-managed content types surfaced here. |
| AI Coach, AI-recommended workouts, AI meal plan, AI Insights, AI exercise swap | **11 AI Operations** | Every AI touchpoint in the app (see [01-product-requirements.md](01-product-requirements.md) §3) corresponds to a named, versioned feature flag in the admin's AI Feature Management Console (11.01), which controls rollout %, target countries, and on/off status — i.e. **admin controls which AI features are live for which users**, and this app is where those flags take effect. |
| Find a Coach, Coach Booking, Coach Messaging | **03 Professionals** + **04 Relationships** | Coaches shown here are the same records as Admin's Professional Directory (03.01); a booking/ongoing coaching relationship corresponds to Admin's Relationship Directory (04.01) and its detail/change-request flows (04.02/04.03). |
| Subscription Plans, Payment Checkout, Purchase History, Program Purchase | **06 Commerce** + **10 Finance** | Plans/pricing correspond to Commerce's Pricing/Coupons (06.05); checkout/payment events correspond to Payments (06.03) and feed Finance's Revenue (10.02) and P&L (10.01); refunds initiated from Subscription Management correspond to Commerce's Refunds (06.04). |
| Refer & Invite | **07 Growth** | This screen is the user-facing initiation point for referrals that Admin's Referrals (07.03) and Campaigns & Attribution (07.04) track and attribute in aggregate. |
| Support (in Settings) | **08 Support & Safety** | Tickets raised here land in Admin's Support Tickets queue (08.01); a "report a bug" or safety-relevant complaint should route toward Escalations/Complaints/Safety (08.02–08.04) depending on severity. |
| Connected Devices, Recovery Dashboard, Training/Nutrition/Recovery data broadly | **09 Analytics** | The raw data this app collects (workouts, meals, recovery scores, body measurements) is what feeds Admin's User/Engagement/Fitness & Nutrition analytics (09.01–09.03) in aggregate. |
| Onboarding health/safety data, Data & Privacy settings | **12 Admin & System** — Privacy & Data Governance (12.04) | A user's data-export/delete request (seen in both Security and Data & Privacy settings screens) corresponds to Admin's DSAR handling in 12.04. |

## 2. Entities that must be the *same* record, not duplicated

Per [05-data-model.md](05-data-model.md) §3 and [../06-data-model.md](../admin/06-data-model.md) §3, the following should be single shared tables/services behind both apps, not independently modeled per app:

- `Program`, `Exercise`, `Recipe` (content, admin-authored / user-consumed)
- `Subscription`, `SubscriptionPlan`/`Plan` (commerce)
- `Transaction`/`Payment` (commerce/finance)
- `Coach`/`Professional` and the underlying pairing (`CoachBooking` ↔ `Relationship`)
- `Referral`
- `SupportTicket`

Building these twice (once per app team) is the most likely source of data-consistency bugs in this project — worth an explicit architecture decision (a shared API/service layer both apps call, per the monorepo structure in [../07-project-structure.md](../platform/project-structure.md)) before either app's backend work starts.

## 3. A validated signal: AI feature names line up

The admin's AI Feature Management Console (11.01, from the earlier review) lists exactly the AI capabilities this app exposes to users:

- "FitGPT Workout Plan Generator" → the AI-recommended workouts on Today/Train dashboards and the AI program marketplace tagging.
- "PrimeVision Photo Diet Log" → the "take photo" meal-logging option on Log Meal.
- "AI Health Score Forecaster" → the Readiness Score and AI Insights' predictive/forecast content.
- "Acoustic Sleep Coach Voice" → not directly observed in the 82 mobile screens reviewed (no dedicated sleep-coaching screen was found) — worth confirming whether this feature has a UI yet or is still pre-launch.

This is a strong cross-file consistency signal that both files describe the same real product, and it's worth keeping the two Figma files' AI feature names in sync going forward — a mismatch here would indicate the designs have drifted apart.

## 4. A third file exists — and it changes §1's Growth/Coaching row

A third Figma file, `v1-coach` (the coach/professional app, documented in [../coach/](../coach/)), independently designs the same "find and book a coach" journey covered by this app's Find a Coach / Coach Booking screens (§1 table, "Find a Coach, Coach Booking..." row) — but differently, with a different coach-category taxonomy and a different flow shape. **Read [../coach/06-cross-app-integration.md](../coach/06-cross-app-integration.md) §2 before treating this app's coaching screens as final** — they may need to be redesigned to match the coach app's more detailed, more internally-consistent version rather than the other way around.

**20 Aug 2026:** the backend data model side of this is now decided — `apps/api` models `Professional`/`ProfessionalCredential`/`Relationship` per `v1-coach`'s taxonomy and structure (see [../coach/07-open-questions-gaps.md](../coach/07-open-questions-gaps.md)'s "Phase 5 started" entry). This app's own Find a Coach / Coach Booking screens have **not** been touched — they're still whatever was originally in Phase 5's plan (unbuilt, inert placeholder in `MoreScreen`), and still need the actual redesign-or-confirm decision this paragraph describes before either gets built for real.

**25 Aug 2026:** the redesign-or-confirm decision is made — **confirm, not redesign**. `v1-coach`'s discovery/booking/relationship-management screens were built as this app's real coaching flow (Coach Discovery, Coach Profile Detail, Booking: Service Selection, Booking Confirmation, My Professional Team, Change Professional — 6 screens under `MoreStack`, reached from the More tab's now-active "Coaching" row). This app's originally-planned 4-screen Find a Coach / Coach Booking design (§1's table row, `docs/mobile/03-screen-inventory.md` §J) was not built as such — it's superseded by the coach app's fuller version, per this section's own steer. See [../coach/07-open-questions-gaps.md](../coach/07-open-questions-gaps.md)'s "25 Aug 2026 — Gap §1 resolved" entry for the full build notes.

## 5. Recommended next planning step

Before backend work starts on either app, reconcile [../06-data-model.md](../admin/06-data-model.md) (admin-derived) and [05-data-model.md](05-data-model.md) (mobile-derived) into **one canonical data model** for `packages/types` (per [../07-project-structure.md](../platform/project-structure.md)), using this document's correspondence table as the starting map. Treat any entity that appears differently-shaped in the two apps (e.g. `Coach`/`CoachBooking` vs. `Relationship`) as an open design question to resolve with product, not something to silently pick a winner on.
