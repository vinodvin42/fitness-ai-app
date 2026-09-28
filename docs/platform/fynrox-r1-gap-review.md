# FynroX R1 — Spec vs. Codebase Review

**Reviewed:** 24 Sep 2026 · **Implementation pass:** 28 Sep 2026 · **Branch:** `claude/ecstatic-fermat-9wf1gj`

> **Status.** The review below is the original assessment against commit `3fd444d`,
> kept as written so the reasoning stays auditable. A four-commit implementation pass
> has since closed a large part of it — see **[What has been closed](#what-has-been-closed)**
> at the end for exactly what changed, what is still open, and the two corrections the
> implementation forced on this review's own findings.

## Source documents

1. **FynroX R1 — Developer Implementation Spec** ("Overview") — Sep 24 2026, @laxman.
2. **FynroX R1 — Final Design QA & Build Handoff** ("FYNROX") — Sep 24 2026, @laxman. Per its own
   §2, its locked decisions override the R1 work package.

Both documents are written as *greenfield* build instructions ("Start with Phase 0: propose the
Prisma schema…"). The repository is **not** greenfield: it is a mature FynroX/FynroX build
with 254 API source files, a 3,508-line Prisma schema, 281 backend tests and four clients. This
review therefore reads the documents as an **acceptance specification against existing code**
rather than a build order.

## Verdict

The backend is substantially further along than the handoff assumes — the hardest thing in the
spec (payment SUCCESS + entitlement ACTIVATION_FAILED, journey F6) is built, tested end-to-end
and correct. The risk is not missing volume; it is **divergence**. Four decisions locked by the
handoff are contradicted by shipped code, and those are the expensive ones to unwind.

| Area | State |
|---|---|
| Backend business rules, audit, action queue | Strong. Ahead of spec. |
| Payment / entitlement activation-failure recovery | Built and tested (F6). |
| Brand | **0% done.** Zero occurrences of "FynroX" in the repo. |
| Professional acquisition model | **Contradicts locked decision #4.** Open marketplace shipped. |
| Gamification | **Contradicts locked decision #13.** Streaks shipped. |
| Subscription tiers / trial | **Contradicts** single-Premium-tier + no-trial defaults. |
| Bottom navigation | Progress tab shipped where Recover belongs. |
| Partner portals (gym, creator) | Login + Dashboard only; ~10% of spec'd surface. |
| Public Website | 10 marketing pages; ~4 of the 11 R1 pages, no invite/referral landings. |
| Provider adapters, deep links, queues, object storage | Not built. |

Nothing in the two documents warrants a `SPEC_CONFLICT` stop — but four items below are
**product decisions the team must confirm before code is written**, because the fix is deletion of
working, tested features, not addition.

---

## A. Structural conflicts — decide before building anything else

These are places where working code does the opposite of a locked decision. Each needs an explicit
call: change the code, or amend §2 of the handoff.

### A1. Open professional marketplace vs. controlled assignment — highest impact

Locked decision #4 and the Overview's "Professionals" row both say: *controlled assignment only;
no browsing, ratings or per-session prices; user pays after the professional accepts.* "Open
marketplace" is explicitly out of scope for R1.

What is shipped:

- `apps/user-mobile/src/screens/coaching/CoachDiscoveryScreen.tsx` — search bar, service-type
  filter chips, **sort by price**, browsable coach list.
- `CoachProfileDetailScreen.tsx`, `BookingServiceSelectionScreen.tsx`,
  `BookingConfirmationScreen.tsx` — per-coach profile → pick a priced session → book a slot.
- `ProfessionalServiceOffering` (`apps/api/prisma/schema.prisma:2435`) carries `priceCents` and
  `durationMinutes` **per professional** — the per-session price the spec forbids.
- `Booking` (`schema.prisma:2472`) — scheduled slot with its own `priceCents`, paid up front.
- `apps/coach-mobile` bottom nav is Today / Clients / **Calendar** / Messages / More; the spec's
  nav is Today / Clients / **Programs** / Messages / More. Calendar exists to serve bookings.

The controlled path also exists and is the better-built of the two: `POST /admin/professional-offers`
(`professionalOffers.routes.ts:48`) lets an admin propose, the professional accepts/declines, and
`Relationship` carries `awaiting_payment → activating → active`. So the codebase currently has
**two competing acquisition models for the same relationship**. `docs/README.md` already names this
duplication as the repo's highest-priority open finding.

**Decision needed (D1-adjacent, blocks U-M5/6/7, A-M1, F5):** retire discovery + booking, or amend
the spec. Retiring means deleting 5 user-app screens, the `Booking` model, per-offering pricing, the
coach Calendar tab, and the booking-purpose payment path — the last of which the Wave 7 capstone
test depends on (`wave7EndToEndFailureScenario.test.ts`), so that test needs rewriting onto the
offer path, not deleting.

### A2. Gamification is shipped; R1 forbids it

Overview "Gamification: None in R1 (no streaks, badges, achievements)"; handoff decision #13
"No streaks, badges or 'Century Club'".

Shipped: `apps/user-mobile/src/screens/more/StreakTrackerScreen.tsx`, routed at
`ProgressStack.tsx:62`; `GET /progress/streaks`; per-category streaks (training/nutrition/
hydration/mindfulness); a training streak surfaced on Workout Complete
(`workoutSessions.service.ts:311-320`). The most recent commits *added* to it
(`0630d19 feat(progress): … Streak Tracker mindfulness category`).

**Decision needed:** remove/flag behind config, or amend decision #13.

### A3. Three subscription tiers + trial default vs. one Premium tier, no trial

- `SubscriptionTier` = `basic | pro | elite` (`schema.prisma:114`), seeded as three plans named
  Basic/Pro/Elite. Spec: one paid tier, **FynroX Premium**.
- `Subscription.status` defaults to `trialing` (`schema.prisma:1856`). D3's build-to default is
  **no trial**.
- `SubscriptionStatus` = `active | trialing | past_due | canceled | expired | revoked` — carries
  `trialing`/`past_due`/`canceled` that the spec's entitlement machine does not have, and is
  missing states it does (see C1).

### A4. Bottom navigation

`apps/user-mobile/src/navigation/MainTabs.tsx:76-80` — Today / Train / Fuel / **Progress** / More.
Spec (Overview "User App nav", handoff decision #1): Today / Train / Fuel / **Recover** / More,
with Progress inside More plus a Progress card on Today.

Recover screens exist (`screens/recover/RecoverScreen.tsx`) but are buried in `MoreStack.tsx:144`.
This is close to a swap of two stacks, not new work. The same defect is in the marketing site
(W-M1): `apps/landing/features.html` still describes progress-tracking as a pillar and the site has
no Recover copy at all.

---

## B. Brand (Q1, Q4, Q5) — not started

`grep -ri fynrox` over the repo returns **zero hits**. 100 files still carry FynroX / FynroX /
FYNROX, including `package.json`, `README.md`, `legal/privacy-policy.md`, `legal/terms-of-service.md`,
all 10 landing pages, `apps/*/index.html`, `apps/coach-mobile/app.json`, and API service files.

The spec requires a single `BRAND_NAME` constant in `packages/config` and one logo component.
`packages/config` contains only `tsconfig.base.json`, `.eslintrc.base.json`, a `package.json` and a
README — **no source at all**, and no `BRAND_NAME` exists anywhere.

Related, still open:

- **Q4 / link fix.** No `fynrox.app/gym/{code}` or `fynrox.app/r/{code}` scheme anywhere.
- **Q5.** Admin emails — no `@fynrox.com` addresses exist to be capitalised wrongly yet.
- **Q12.** `lib/referralCode.ts` generates a bare 8-char code from a 32-symbol alphabet. The spec
  requires **user codes prefixed `FX-`** with creator codes left plain so the API can tell them
  apart by type. Not implemented; `User.referralCode` and the influencer code are
  indistinguishable by shape.
- **Q7 / Q8 / Q9 (unprovable claims, US payment + HIPAA wording, auto-reduced volume).** Searched;
  **clean** in code. These were Figma-only defects. Worth a re-check when the new-file screens land.

Suggested order: create `packages/config/src/brand.ts`, wire every client to it, then do the
mechanical string sweep. Doing the sweep first just moves the hard-coding.

---

## C. Data model vs. §10 state machines

The five-ledger separation the spec demands (payment / entitlement / relationship / earning /
commission as independent records) is **partly real**: `Payment`, `Subscription`, `Relationship`,
`CoachSettlement` and `InfluencerPayout` are distinct tables, and `payments.service.ts` correctly
keeps a Payment at `paid` while entitlement activation fails. The state *vocabularies* diverge.

### C1. Entitlement

Spec: `PENDING → ACTIVE | ACTIVATION_FAILED`, `ACTIVATION_FAILED → PENDING` (retry),
`ACTIVE → EXPIRING → EXPIRED`, `ACTIVE ↔ SUSPENDED`, `ACTIVE → REVOKED`.

Code has no `Entitlement` record; `Subscription` stands in, with
`active|trialing|past_due|canceled|expired|revoked` (`schema.prisma:137`). **Missing: `PENDING`,
`ACTIVATION_FAILED`, `EXPIRING`, `SUSPENDED`.** The failure *behaviour* is nonetheless real —
`Payment.activationFailedAt` (`schema.prisma:1960`) plus the `entitlement_activation_failed`
AdminActionItem plus `POST /payments/:id/retry-activation` reproduce it. So this is a modelling
mismatch (the spec's "five separate records" principle), not a behavioural hole. Note `EXPIRING`
is a real gap: nothing drives a 7-day pre-expiry state, which U-M4 needs.

### C2. Professional relationship

Spec: `REQUESTED → OFFERED → ACCEPTED | DECLINED | EXPIRED`, re-match back to `REQUESTED`,
`ACCEPTED → AWAITING_PAYMENT → ACTIVATING → ACTIVE | ACTIVATION_FAILED`, `ACTIVE → CHANGING → ENDED`,
`ACTIVE → COMPLETED`.

Code (`schema.prisma:2200`): `requested | accepted | awaiting_payment | activating | active | ended`.
**Missing: `offered`, `declined`, `expired`, `activation_failed`, `changing`, `completed`.**

`offered`/`declined`/`expired` live on a *separate* `ProfessionalOffer` row (`schema.prisma:2585`),
which is a defensible design, but it means "relationship is currently offered" is not queryable from
the relationship. `completed` is a real gap — "Programme completed" (U-M8, P-M11) has no terminal
state distinct from `ended`, and §10 requires different handling (revoke access + `access.revoked`
on both, but different user-facing outcomes).

### C3. Earnings and commissions

Spec: earning `ELIGIBLE → APPROVED → PAYOUT_PENDING → PAID | PAYOUT_FAILED`; commission
`PENDING_CALCULATION → ELIGIBLE → APPROVED → PAID`, and `any → DISPUTED | REVERSED` on refund or
chargeback.

Code: `PayoutStatus = pending | paid` (`schema.prisma:2857`). **No `eligible`, no `approved`, no
`failed`, no `disputed`, no `reversed` anywhere in the schema or services.** Consequences:

- **A-M3 (payout run) cannot be built** on this model — there is no approval step to run, only
  `POST /admin/payouts/:id/mark-paid`, one row at a time, influencers only.
- **C-M2 (creator "payout failed" + reason) has no state to render.**
- **Acceptance test 15 fails by construction:** "a refund or chargeback moves the linked creator
  commission to DISPUTED / REVERSED" — neither state exists, and no refund code path touches
  commissions.

This is the single largest data-model gap in the review.

### C4. Records with no model at all

| §10 record | States required | In code |
|---|---|---|
| Privacy request | `RECEIVED → VERIFYING → IN_PROGRESS → COMPLETED / REJECTED` | **None.** Export and deletion execute immediately (`users.service.ts:335`) and are reconstructed for Admin by querying `AuditLog` for `user.data_exported` / `user.account_deleted` (`adminPrivacy.service.ts:70`). No request entity, so no user-facing status (U-M17), no admin detail with verify/fulfil/schedule (A-M5), and journey F8 stays broken. |
| Equipment profile | `CURRENT → STALE → CURRENT` | **None.** `GymLocation.equipment` is a nullable free-text string (`schema.prisma:3376`); `OnboardingProfile.equipmentContext` likewise. No staleness, no reconfirm (U-M11, G-M "stale equipment"). |
| Assessment | `NOT_STARTED → IN_PROGRESS → COMPLETED → UPDATED` | Partial. `OnboardingProfile.completedAt` is the only signal; no explicit status, no `UPDATED` (U-M13 resume/edit). |
| Professional account | `APPLICATION → SUBMITTED → IN_REVIEW → APPROVED / NEEDS_ACTION / REJECTED`; `APPROVED → RESTRICTED / SUSPENDED` | Close: `ProfessionalLifecycleStatus = application / verification / approved / available / suspended`. **Missing `needs_action`, `rejected`, `restricted`** — P-M3 has nothing to render. |
| Gym / creator partner | `DRAFT → PENDING_REVIEW → APPROVED / MORE_INFO / REJECTED → ACTIVE → SUSPENDED / ENDED` | `GymStatus = application / approved / suspended`; `InfluencerStatus = active / inactive`. **Missing `more_info`, `rejected`, `ended`** for gyms; creators have no application lifecycle at all — A-M2's "request info / reject + reason" has no state to write, and G-M2/C-M3 have nothing to render. |

Correctly built and worth noting: `FoodEstimateStatus` (estimated / insufficient_context /
confirmed / edited, with BR-DAT-003 documented inline), `RecommendationStatus` (active / accepted /
modified / declined / no_change / superseded) and `WorkoutSessionStatus` all match §10 exactly.

### C5. Onboarding baseline

`OnboardingProfile` has gender, **age**, weightKg, heightCm, goals, allergens, medicalConditions,
injuries. The spec's "About You" baseline is **DOB**, sex, height, weight. Age is a lossy store —
it silently goes stale and cannot be recomputed. Worth changing before more data accrues.

---

## D. Events and audit

The event system is real and well-shaped: `AnalyticsEvent` (`schema.prisma:1329`) carries `name`,
`entityIds`, **`ruleId`** and `metadata`, exactly as §11 requires, and 174 distinct event names are
emitted.

Of the spec's 60 named events, **27 match exactly**. Another ~15 exist under a different name:

| Spec | In code |
|---|---|
| `set.logged` | `workout.set.logged` |
| `payment.succeeded` | `payment.captured` |
| `plan.failed` | `plan.generation_failed` |
| `offer.created / accepted / declined / expired` | `professional_offer.*` |
| `message.sent` | `coach_message.sent` |
| `professional.approved / suspended / restricted` | `professional.lifecycle.*`, `admin.professional.*` |
| `relationship.changed` | `relationship.change_requested`, `relationship.handover` |
| `admin.action_required.created` | `admin_action_item.assigned` / `.resolved` (no "created") |

Genuinely absent, no equivalent:

`access.granted`, `access.revoked`, `earning.eligible`, `earning.approved`, `commission.eligible`,
`commission.disputed`, `commission.paid`, `payout.failed`, `privacy.request_created`,
`privacy.request_completed`, `review.started`, `review.completed`, `offer.viewed`,
`entitlement.retry_started`, `relationship.activation_started`, `relationship.completed`,
`professional.availability_changed`, `professional.application_submitted`.

`access.revoked` matters most: **acceptance test 12** ("after handover, the old professional's API
calls return 403 *and* `access.revoked` is logged") cannot pass. The 403 side is built
(`relationshipLifecycle.service.ts`); the event is not.

**Audit log.** `AuditLog` (`schema.prisma:2699`) is append-only in practice — no `auditLog.update`
or `auditLog.delete` call exists anywhere, which satisfies "immutable". But it has **no
`stateBefore` / `stateAfter` columns and no `ruleId`**, while §6 requires "audit log with state
before / after and rule ID". Everything is in free-form `metadata` JSON, so the Admin audit screen
cannot render before/after reliably.

**Recommendation:** rather than renaming 15 event emitters (churn, breaks existing analytics), add
an explicit alias/registry table in `packages/types` mapping spec name ⇄ emitted name, and treat
the registry as the contract. Add the genuinely-missing ones properly.

---

## E. The 17 acceptance tests (§11)

281 backend tests exist across 45 files; several map to spec acceptance tests directly and well.

| # | Acceptance test | State |
|---|---|---|
| 1 | Gym QR / creator link / direct each yield one user ID; attribution saved | Likely covered — `adminAcquisition.test.ts`, `gyms.test.ts`, `lib/acquisition.ts`. Verify the three-way case explicitly. |
| 2 | Existing user scans gym QR → links, no second account | Partially — `gyms.test.ts`. Confirm. |
| 3 | Expired invite/referral → continue with no attribution | Not found. |
| 4 | Plan-generation failure keeps answers; Retry works | `plans.test.ts` + `PlanStatus.failed`. Covered. |
| 5 | Serious condition → Safety Pause + `safety.escalated` | Partially. `users.service.ts:156` fires `safety.escalated` for **any** condition or injury. D14's default (heart condition → Pause, others → warning + consent) needs a severity classifier — not built. |
| 6 | Kill network mid-workout, no sets lost, `workout.sync_recovered` | Event exists; verify the client-side queue. |
| 7 | Photo estimate doesn't count until confirmed | Covered — `FoodEstimateStatus` + `nutrition.test.ts`. Strong. |
| 8 | Weak data → No Change / Insufficient Context, never invented | Covered — `RecommendationStatus`, `decideRecommendationRace.test.ts`. Strong. |
| 9 | Payment SUCCESS + ACTIVATION_FAILED end-to-end | **Fully covered** — `paymentsActivationFailureRecovery.test.ts`, `wave7EndToEndFailureScenario.test.ts`. Best-built area in the repo. |
| 10 | Accepted pro can't read full client data until ACTIVE | Covered — `relationshipAcceptanceGate.test.ts`. |
| 11 | Fitness-only pro gets an API permission error editing a nutrition plan | Not found as a test. `serviceType` is carried on `Relationship`/offerings but no write-path guard located. **Verify.** |
| 12 | After handover old pro 403s; `access.revoked` logged | 403 built; **event missing**. |
| 13 | AI can't save a change to a Professional Guided plan without a pro decision | Partially — `professionalClientsRecommendations.test.ts`. Confirm the AI write path specifically. |
| 14 | Gym/creator portal responses contain no health/nutrition/photo/AI-chat fields | **Clean** — grepped `gyms`, `gymAuth`, `influencerPortal` services: no health fields. No regression test guarding it. Add one. |
| 15 | Refund/chargeback → commission DISPUTED / REVERSED | **Cannot pass.** States don't exist (C3). |
| 16 | High-impact admin action refused without reason + typed confirmation; immutable audit | **Fails.** `adminRefunds.schema.ts:13` has `reason: z.string().trim().max(300).optional()` — optional. No typed-confirmation ("type RESOLVE") mechanism exists anywhere. BR-ADM-005 is not enforced. |
| 17 | Deletion request removes personal data, keeps only what law requires | Deletion works; no request lifecycle, no retention classification (C4). |

Also missing: a relationship-limit guard. §10 requires "a user has at most one active Fitness and
one active Nutrition professional". `Relationship`'s constraint is
`@@unique([userId, professionalId, serviceType])` — it prevents duplicate rows for the *same pair*,
not two different active fitness coaches. No service-layer check found.

---

## F. Missing screens, by surface

### User App (§4) — 22 IDs

Present in some form: U-M12 (`SignupScreen.tsx:25` takes a referral code — but no "Have a code?"
at checkout), U-M9 (`CheckInScreen` + `CheckInPeriod.weekly`), U-M14 partially
(`WhyThisChangedScreen`), body measurements, exercise library, swap/history, barcode, recipes,
recover screens, language, support tickets, Refer & Earn.

Confirmed absent:

- **U-M1/2/3 — checkout, processing, payment-failed.** There is no checkout screen. Payment is a
  `RazorpayCheckoutModal` invoked from `SubscriptionScreen` / `ProgramDetailScreen`. No plan →
  method (UPI/card/netbanking) → processing flow, no "you were not charged" state, no "Have a code?".
- **U-M4** — subscription pending/suspended/expiring/revoked states (see C1).
- **U-M5/6/7/8** — the four professional-request states. Blocked on A1.
- **U-M10** — re-entry after missed days/week.
- **U-M11** — gym equipment confirmation + stale state (no model, C4).
- **U-M17** — privacy request status (no model, C4).
- **U-M18** — health-data consent screen. The *consent type* exists
  (`ConsentType.health_data_processing`) and `PrivacySettingsScreen` toggles it, but it is a
  settings toggle, not the onboarding-time consent gate decision #3 requires.
- **U-M22** — refund status in purchase history.
- Notification **inbox** (settings addition) — only `NotificationSettingsScreen` exists.

**Health-data encryption.** §10 requires health data "stored encrypted, separate consent record".
The consent record exists; `medicalConditions` / `injuries` are plain `String[]` columns. No
application-level encryption found.

### Professional App (§5) — 16 IDs

`apps/coach-mobile` has 19 screens. Present: login/signup, credential + KYC upload, verification
status, service selection, clients list, client profile, recommendations, pending requests,
messages, availability, notifications, Today.

Absent: **P-M1** forgot-password + MFA (login/signup only), **P-M2** multi-step application form
(credential/KYC upload exists but not the identity/qualifications/services/experience/jurisdiction
flow), **P-M3** rejected/suspended states (no enum states, C4), **P-M6** Programs tab (nav has
Calendar instead — see A1), **P-M7** offers list + decline reason + expired confirmation,
**P-M8** capacity-full, **P-M9** review-changes confirmation, **P-M10** incoming handover,
**P-M11** programme completed, **P-M12** safety flag, **P6 earnings entirely** — no earnings,
payout or earnings-history screen exists in the app at all.

### Admin (§6) — 9 IDs

Admin is the strongest client: 51 screens, 52 routes, permission-gated.

- **A-M1** — API is **built** (`POST /admin/professional-offers`, `GET …/available-professionals`).
  **No admin-web screen** drives it. This is UI-only work, unusually cheap.
- **A-M2** — gym approve/suspend exists (`PATCH /admin/gyms/:id/status`). **No "request info", no
  reason capture, no creator application decision at all** (influencers are admin-created, no queue).
- **A-M3** — payout run: **not buildable** on the current model (C3).
- **A-M4** — safety case detail: `SafetyEscalationsScreen` + `adminSafety` exist; verify actions
  (contact / restrict / close) are present, not just the queue.
- **A-M5** — privacy request detail: **not buildable** (C4).
- **A-M6** — complaint case detail: `EscalationsScreen` exists; verify detail + actions.
- **A-M7** — six summary-card modules: Refunds (`RefundsScreen` exists), Roles
  (`RolesPermissionsScreen` exists), content (`ExercisesDirectoryScreen`, `RecipesDirectoryScreen`
  exist), Support (`SupportTicketsScreen` exists). **Promotions and Communication center are absent.**
- **A-M8** — referral reward rules config + ledger: `ReferralReward` model + `ReferralsScreen`
  exist; `ReferralRewardStatus = pending | granted` only, and no rules-config surface.
- **A-M9** — health conditions in User 360 behind permission: `SensitiveDataAccessRequest` +
  approval flow **exists and is good**. Verify medicalConditions/injuries are actually behind it.

### Gym and Creator portals (§7) — 9 IDs

The handoff calls both "complete apart from small items". The code does not support that reading:

- `apps/gym-portal/src`: **3 screens** — Login, Dashboard, Support. No equipment profile, no invite
  members/QR, no member engagement, no trainer help requests, no partnership status, no location
  switch, no apply/under-review/needs-action states.
- `apps/creator-portal/src`: **2 screens** — Login, Dashboard. No campaigns, no referral tools, no
  payout setup, no commission ledger, no agreement page, no account page.

So G-M1–5 and C-M1–4 are the *small* part of a much larger build. Estimate these two portals at
roughly 25 screens, not 9 fixes.

### Public Website (§8) — 8 IDs

`apps/landing` is 10 static HTML marketing pages: index, features, pricing, gyms, creators, about,
download, support, privacy, terms.

Of the 11 R1 pages, roughly four have a counterpart. **Absent:** How it works, Programs,
Professional Guidance, For Professionals + application form, Learn (+ article template), FAQ,
Safety & Privacy, Early Access (with success/error/already-registered/consent states), **gym invite
landing**, **creator referral landing**, **404**, **cookie consent banner** (W-M3 — no cookie page
at all), contact form states (W-M4), partner form error states (W-M6).

W-M1 (nav copy) and W-M7 (hide store buttons until URLs exist — `download.html` currently promises
TestFlight) both still apply. The spec's rule that *website partner forms and portal "Apply"
screens write the same application record* has no implementation on either side.

---

## G. Platform decisions (§11 stack, §12 D1–D14)

| Spec | Actual |
|---|---|
| NestJS | **Express** (`express ^4.21`, zero `@nestjs` deps). Modules are hand-rolled `routes/service/schema` triples — clean and consistent, but not NestJS. |
| PostgreSQL + Prisma | ✅ Matches. |
| Redis + BullMQ for activation retries, payouts, notifications | **Absent.** Retries are synchronous/on-read (`professionalDashboard.service.ts` detects stalled relationships inside a polled read path). Rate limiting is in-memory and documents the single-instance constraint (`middleware/rateLimit.ts:16`). **This caps the API at one instance.** |
| S3-compatible storage for evidence, meal photos, exports | **Absent.** No storage client anywhere. |
| Turborepo, `apps/{api,admin,partner,web,user,pro}`, `packages/{contracts,ui,config}` | npm workspaces (no Turborepo). Apps are `api, admin-web, user-mobile, coach-mobile, gym-portal, creator-portal, landing`. `packages/types` is the de-facto contracts package (4,286 lines, well-maintained). **`packages/ui` is a README only** — no shared UI kit exists, so the spec's "build missing screens with the shared UI kit" instruction has nothing to build against; each client has its own components. |
| D4 PaymentProvider adapter + mock | **Razorpay is hard-wired** (`lib/razorpayClient.ts`, `enum PaymentProvider { razorpay }`). Cleanly isolated and lazily constructed, so adapter-ising is small — but it is not an adapter today, and there is no mock. |
| D5 PayoutProvider adapter + mock | Absent. |
| D6 Deep links (Branch/AppsFlyer) + deferred deep linking | **Absent entirely.** Blocks F2, F3, W-M2. |
| D8 FoodDataProvider adapter + seed list | `lib/openFoodFactsClient.ts` — real, hard-wired, not an adapter. |
| SMS/OTP provider | Absent (`lib/mailer.ts` is email only). |
| D9 React Native (Expo) | ✅ Matches. |
| D11 48h offer expiry, 3 re-matches then Admin queue | `ProfessionalOffer.expiresAt` exists and stalled-offer detection is built; the **3-re-match limit is not**. |
| D2/D3/D7/D13 config-flagged defaults | No config-flag layer exists; `packages/config` has no source. |

The spec's instruction to "code each D-default behind config so the final answer is a setting
change" cannot be followed until `packages/config` becomes a real package.

---

## H. Definition-of-done cross-cuts

- **Translation.** DoD: "Copy is in English and wired for translation (no strings in code)."
  `LanguageSelectionScreen` persists a preference across 10 Indian languages and its own doc comment
  admits "real i18n … isn't built". Every string in the app is inline. This is a large, mechanical
  retrofit that gets more expensive per screen added — worth doing before the missing screens, not after.
- **GST.** No GST calculation or "incl. GST" display anywhere (D3). `TaxConfig` exists admin-side but
  is not wired to checkout — and there is no checkout.
- **Units.** ✅ `UnitSystem` defaults to `metric` (kg/cm) with an imperial switch.
- **Dark theme.** ✅ Real semantic token set (`theme/tokens.ts`), OLED-friendly background. One
  deviation: the accent is teal (`#35E6C5`); the Overview specifies a **blue** accent.
- **Accessibility.** Not audited in this pass. DoD requires WCAG 2.1 AA contrast, 44×44pt targets and
  screen-reader labels on all controls — recommend a dedicated pass.
- **Sensitive data in logs/analytics.** Spot-checked as clean (partner responses carry no health
  fields). No automated guard; add a test.
- **`DESIGN-PENDING <ID>` convention.** Not used anywhere in the repo. Existing gap tracking uses a
  different scheme ("gap §29"). Pick one.

---

## Recommended sequence

**Step 0 — resolve, don't build.** Get written answers on A1–A4. Every one of them is working,
tested code that the spec says should not exist. Building the U-M professional screens before A1 is
settled risks building them twice.

**Step 1 — the config/brand foundation.** Make `packages/config` a real package with `BRAND_NAME`
and a D-defaults flag layer; sweep the 100 FynroX files; add the `FX-` referral prefix. Nothing
downstream is safe to write before this exists.

**Step 2 — the four data-model gaps that block whole features**, in this order: earning/commission
states (unblocks A-M3, C-M2, acceptance test 15) → privacy request entity (unblocks U-M17, A-M5,
F8, test 17) → partner application lifecycle states (unblocks A-M2, G-M2, C-M3) → relationship
`completed` + equipment staleness.

**Step 3 — BR-ADM-005.** Make `reason` required and add typed confirmation across high-impact admin
actions. It is small, it is a named acceptance test, and it is currently false.

**Step 4 — the two cheap wins.** Swap Recover into the tab bar and Progress into More (A4). Build the
admin assignment-queue screen over the API that already exists (A-M1).

**Step 5 — the large surfaces**, in dependency order: user checkout (U-M1/2/3, needs Step 1 + GST) →
partner portals (~25 screens) → website R1 pages + deep-link adapter (D6) → i18n retrofit.

**Do not** treat §7's "both portals are complete apart from small items" or §5's "Professional App is
85% complete" as descriptions of this repository. They describe the Figma files. Against the code,
those two surfaces are the largest remaining builds.


---

## What has been closed

Four commits on this branch, each verified with typecheck across all six workspaces,
lint at zero errors, and the full `apps/api` suite. The suite went from **281 tests
in 45 files** to **343 tests in 52 files**; every pre-existing test still passes,
and the four that were changed are noted below with why.

### Closed

| Finding | What landed |
|---|---|
| **B — Brand** | `packages/config` is a real source package with `BRAND_NAME`, the fynrox.app / fynrox.com domains and lowercase link builders. 101 files swept. Structural usages (TOTP issuer, gateway display name, User-Agent, reset email, AI prompt) read the constant. **Q12**: user codes now carry `FX-`, with a lookup that accepts either shape so old codes keep working. |
| **G — config-flagged D-defaults** | `r1Flags` carries all of D1–D14 as env-overridable settings, defaulting to the handoff's own build-to answers. |
| **A1 — marketplace vs controlled assignment** | New `GuidanceRequest` gives a user a way to ask for help without naming a professional; `POST /admin/guidance-requests/:id/match` turns it into an offer. Journey **F5 now connects end to end**, with D11's re-match limit and §10's one-active-professional-per-service rule enforced. Discovery, profiles and booking are gated off by default rather than deleted. |
| **A2 — gamification** | Streak Tracker hidden behind `GAMIFICATION_ENABLED` (default off). |
| **A4 — navigation** | Recover is a tab; Progress moved into More with the Progress card on Today that §2 requires. |
| **C3 — earning/commission states** | `CreatorCommission` (per-payment, with DISPUTED/REVERSED), `PayoutBatch`, and the full earning lifecycle. |
| **C4 — privacy requests** | `PrivacyRequest` with the §10 lifecycle, a cancellable 30-day deletion window, and an admin verify → start → complete/reject flow. |
| **C4 — partner / professional / relationship / equipment states** | All the missing enum values, including relationship `completed` with a real `completeRelationship()`. |
| **D — audit columns** | `AuditLog` gains `stateBefore`, `stateAfter`, `ruleId` as real columns, populated by every path touched. |
| **D — events** | `lib/eventRegistry.ts` maps all 60 spec events to emitted names, with a test that fails when a claimed emitter disappears. Ten genuinely-missing events now emitted. |
| **A-M1** | Admin assignment queue screen, over the API that already existed. |
| **A-M3** | Payout run: preview, approve, batch with race-safe claiming, settle with per-row failures. |
| **U-M5 / U-M7** | `RequestGuidanceScreen` — request form, live status, and an honest "no match found" state. |
| **Acceptance test 5** | D14's tiering is real: a heart condition pauses, anything else warns. Previously **any** declared condition escalated, which made this test vacuously true and the warning path unreachable. |
| **Acceptance test 12** | `access.revoked` now emitted on both end and completion. The 403 half was always real. |
| **Acceptance test 14** | Was already true with nothing guarding it. Now has a shape-based regression guard that walks partner responses for forbidden keys at any depth — plus a test that the guard itself still catches a planted leak. |
| **Acceptance test 15** | A full refund reverses the linked commission, a partial one disputes it, and the payment stays `paid`. |
| **Acceptance test 16** | `assertHighImpactConfirmed` — reason of at least 10 characters plus an exact typed `RESOLVE`, enforced in the service as well as the schema. |
| **Acceptance test 17** | Deletion through the tracked request removes owned rows and leaves the audit row with a null actor. |

### Corrections to this review

Two findings above were wrong, and the implementation is what surfaced them:

- **W-M1 and W-M7 do not apply to this repository.** §F said the website's nav copy
  defect and store buttons "both still apply". They do not: `apps/landing` never lists
  the app's tabs anywhere, and `download.html` and `about.html` already state plainly
  that FynroX is not on an app store. Both were Figma-only defects.
- **The Recover/Progress swap was not an oversight.** §A4 called it a defect. It was a
  deliberate 14 Sep decision, correct under the work package's BR-USR-001/002 at the
  time; the handoff then explicitly changed those two rules. The finding stands, the
  characterisation did not.

One process note worth keeping: the event-registry coverage test **passed vacuously on
first draft**, because it grepped for emitted names across a source tree that included
the registry naming all of them. Excluding the registry revealed nine events claimed but
never emitted. A test that can only pass is worse than no test.

### Still open

After a second implementation pass, in the order the review recommends:

1. **i18n.** Language preference persists across ten languages; every string is still
   inline. This is now the largest single piece of remaining work, and it gets more
   expensive with each screen added — the eleven screens added in the second pass all
   carry inline copy that will have to move.
2. **Redis/BullMQ and object storage.** The in-memory rate limiter still caps the API at
   one instance, and there is no object storage for professional evidence uploads, meal
   photos or generated exports. Both are deployment-shaped rather than feature-shaped,
   and both block real scale rather than any single R1 screen.
3. **Professional app (P-M1 to P-M16).** Still 19 screens. The whole earnings surface,
   the multi-step application form, MFA and forgot-password, the offers list with decline
   reasons, incoming handover, and the safety flag are all absent. This is the largest
   remaining *screen* build.
4. **The remaining Website R1 pages.** How it works, Programs, Professional Guidance,
   For Professionals with its application form, Learn's Nutrition and Understand
   categories, FAQ, Safety & Privacy, and Early Access with its four states. The
   invite/referral landings, cookie banner and 404 landed; these did not.
5. **Real providers.** The adapter seams exist and the mocks are honest, but D4 (payment),
   D5 (payout), D6 (deep links) and D8 (food data) all still need a real vendor decision.
   D5 and D6 report themselves unconfigured, which is why a payout run records intent
   rather than settlement and an install still loses its attribution.
6. **Dropping the plaintext health columns.** The encrypted columns and the backfill are
   live; the two plaintext columns stay until the backfill has run in every environment,
   then need a follow-up migration.
7. **Admin screens for what the second pass built.** Payout runs, privacy requests, gym
   help requests and commission disputes all have working APIs and action-queue items,
   but only the assignment queue got a screen.
8. **Accessibility.** Still not audited. The DoD requires WCAG 2.1 AA contrast, 44x44pt
   targets and screen-reader labels throughout.

The four structural decisions in §A remain *implemented to the spec's answer behind
flags*, not settled. Flipping any of them back is a config change; deleting the
superseded code is still a product decision, and deliberately not taken here.

### Second implementation pass

Six further commits, same verification bar. The suite went from **281 tests in 45 files**
at the start of this work to **403 in 57 files**.

| Area | What landed |
|---|---|
| **Provider adapters (D4, D5, D6, D8)** | `src/providers` with Razorpay + mock payments, a payout placeholder, Open Food Facts + an offline seed list, and a deep-link resolver. Two honesty bugs caught in review: the payment selector originally fell back to the mock when credentials were missing (a production deploy that lost its keys would have "accepted" payments), and the payout mock originally reported itself configured (it would have told an admin money moved when none did). |
| **Checkout (U-M1/2/3), U-M4, U-M22** | Server-side pricing with an exact GST-inclusive split, "Have a code?" that degrades rather than failing, a processing state that replaces the pay button, `pending`/`suspended` subscription states with `expiring` derived on read, and refund status finally visible to the user who paid. |
| **Health data encrypted at rest (§10)** | AES-256-GCM, lists encrypted as one blob so the count cannot leak, decryption failure throwing rather than returning an empty list, and one shared accessor because a missed decrypt site fails *quietly*. Backfill exercised against a real legacy row. |
| **Gym Partner Lite** | 3 screens to 7: equipment profile with the CURRENT/STALE cycle, invite QR, partnership status with a reason line per end state, and trainer help requests whose model deliberately has no member link. |
| **Creator Partner Lite** | 2 screens to 7: commission ledger with C-M2's payout-failure reason (which needed a ledger fix, not just a screen), referral tools with per-link liveness, and agreement/account pages that say plainly what D5 and D13 have not settled. |
| **Website (W-M2, W-M3, 404)** | Invite and referral landings that resolve codes against the API before promising anything, a cookie banner that actually gates a consent flag, and a real 404 with a real status. |

Worth recording, because it is the pattern rather than the exception: **three bugs in the
website work were found only by driving the real pages in a browser against a real API** —
relative asset paths breaking under a path rewrite, CORS blocking the public link
endpoints, and then two successive fixes that each shipped an open CORS origin *together
with* credentials. Typecheck and the test suite were green throughout. The equivalent
lesson from the first pass was an event-registry test that passed vacuously. Both suggest
the same thing: the checks that catch real defects here are the ones that exercise the
running system, not the ones that read it.

### Third implementation pass

Two further commits. The suite went from **403 tests in 57 files** to **443 in 61**, at the
same verification bar (typecheck on all six workspaces, lint at 0 errors, full API suite).

| Area | What landed |
|---|---|
| **Shared rate-limit store + object storage (§11)** | All five limiters share a Redis store when `REDIS_URL` is set. The piece worth reviewing is `assertRateLimitStoreIsSafe()`: `API_INSTANCE_COUNT > 1` without Redis is now a **boot failure**, because an in-memory limiter behind a load balancer gives an attacker `limit x instanceCount` attempts and *nothing errors* — the control is simply weaker than its configuration claims, silently. The object storage adapter is local disk and reports `isConfigured()` as `false`, like the payout provider and for the same reason. |
| **The remaining Website R1 pages (§8, W-M4, W-M5, W-M6)** | How it works, Programs, Professional Guidance, For Professionals, Learn (all three categories, one article each through a shared template), FAQ, Safety & Privacy, and Early Access. Real application and contact forms on the gym, creator, professional, contact and early-access pages, replacing `mailto:` links. A mobile nav, and `sync-shell.js` so 24 copy-pasted headers cannot drift apart. |

The forms needed a backend, so `PublicApplication` and `POST /public/applications` exist
now: one table, `kind` carrying the distinction, `(kind, email)` unique. §8's four form
states come straight out of it — `201` is success, `200 already_registered` is deliberately
**not** an error (treating it as one just teaches people to resubmit from a second address,
which is how a clean list becomes a dirty one), `400` carries a `fields[]` array the page
marks field by field, and consent is `z.literal(true)` so a submission that lost the
checkbox fails validation rather than quietly becoming a lawful basis to email someone.
Partner applications raise an action-queue item; Early Access deliberately does not, because
a few thousand signups would bury the dozen applications that need a decision.

Three defects in this pass were again found only by driving the real pages:

- The forms' `POST` was **blocked by CORS** from a different origin — which is exactly what
  a separately-deployed marketing site is. `/public/*` joined the open-origin set, still
  with `credentials: false`, and the test asserts the absence of the credentials header
  rather than only the presence of the origin one.
- A form hidden on success **stayed on screen**, because `display: grid` beats the `hidden`
  attribute. Invisible only to a reader of the CSS; obvious in a browser.
- Two pieces of **marketing copy had gone stale against locked decisions**: `features.html`
  and `index.html` promised browsing and booking coaches (D9 turns the marketplace off in
  R1 — guidance is matched, not browsed), and both `features.html` and `pricing.html` listed
  streaks (D-gamification is off). `support.html` still explained how to purchase a program
  individually, which D2 removed. Copy drifts against config exactly the way code does, and
  nothing in the build catches it.

`pricing.html` still shows three tiers, deliberately: the seed data and `SubscriptionTier`
really do carry `basic`/`pro`/`elite` today, so collapsing the page to one Premium tier
ahead of the schema would make the website lie about what the checkout sells. A3 remains
open, and that page changes when the plans do.

### Still open after the third pass

1. **i18n.** Unchanged, and now larger — the nine new website pages are English-only, as is
   the rest of `apps/landing` (which has no i18n mechanism at all).
2. **Real providers.** D4, D5, D6 and D8 still need vendor decisions, not code.
3. **Dropping the plaintext health columns**, once the backfill has run everywhere.
4. **Accessibility.** Still not audited end to end. The new pages were built to 44px targets
   and were checked for a single `h1`, a labelled nav, focus-visible inputs and no
   horizontal overflow at 390px — but that is a spot check, not a WCAG 2.1 AA audit.
5. ~~An admin screen for the application queue.~~ **Built** — Growth → Applications, with
   the action queue drilling through to it filtered by form. Adding it surfaced a separate
   defect: `packages/types`' `AdminActionItemType` union had never been updated for
   `professional_assignment_pending` or `gym_help_request`, both live and emitting, so
   admin-web's own filter could not offer them. A hand-maintained copy of an enum narrows
   silently every time the enum grows, so `tests/enumParity.test.ts` now asserts the union
   and the Prisma enum match in both directions (and asserts it is reading real values, so
   it cannot pass on two empty lists).
6. **The four §A structural decisions**, which remain implemented-behind-flags rather than
   settled. Unchanged.
