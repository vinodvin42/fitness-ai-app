# MVP Launch Plan — FynroX Consumer Mobile App

**Written 20 Aug 2026.** This is a delivery plan, not a new roadmap — it reuses `docs/platform/roadmap.md`'s phases and `docs/mobile/07-open-questions-gaps.md`'s gap numbers rather than re-deriving them, and narrows down to one question: what actually has to happen, in what order, to get this app in front of real users.

**Update, 5 Sep 2026:** two items this section originally listed as open have since closed — AI Coach shipped as a real feature (not just provider plumbing) and gained an Azure OpenAI provider option, and the Razorpay currency-mismatch decision below (§3's "real INR list prices, or USD settlement") was resolved as real INR list prices. Both are superseded by `docs/mobile/07-open-questions-gaps.md` gap §39; the paragraphs below are left as-written rather than edited, per this plan's own point-in-time framing.

## 1. What "MVP" means here

`docs/platform/roadmap.md` already made this call on 18 Aug 2026: the consumer mobile app ships first, on its own, ahead of the admin console and the coach app. Phase 4 is where the roadmap itself says "the mobile app is a complete, monetizable, solo-use product" — no coach, no admin back office required. This plan adopts that as the MVP boundary rather than inventing a new one.

**In scope for MVP:** `apps/api` + `apps/user-mobile` reaching a real, launchable state — Phases 0 through 4.

**Out of scope for MVP, by the roadmap's own explicit sequencing:** the coach marketplace (Phase 5 — blocked on a real product decision, `docs/coach/06-cross-app-integration.md` §2) and the admin console (Phases 6–11 — `apps/admin-web` is still just a placeholder README). Section 7 below lists exactly what that means gets cut or shipped as a stub for v1.

If "MVP" was meant to include the coach app or admin console, this plan is the wrong shape — say so and it gets rebuilt around that instead.

## 2. Where things actually stand today

Phases 0–1 are essentially done. Phases 2–4 are partial — real, shipped features sitting alongside genuinely unbuilt ones, not placeholders pretending to be finished. The two things worth knowing before anything else:

- **`apps/api` has never run against a live database.** It's fully typechecked and its route/service/schema layer is real, but in this build sandbox `prisma generate` can't reach `binaries.prisma.sh` (network-blocked), so the API can't even boot here — confirmed by actually trying. This is a sandbox limitation, not a code defect, but it also means the whole backend is unverified at runtime. Closing this is the single highest-priority, highest-uncertainty item in this plan (Milestone D).
- **No crash reporting, no error monitoring, no legal documents (Terms/Privacy) exist anywhere in this build.** None of these came up as "gaps" in the mobile build because they were never in scope for a screen-by-screen Figma implementation — but an app store submission needs at least the legal documents, and shipping without observability means the first real crash is invisible.

Everything else follows the detail already recorded in `roadmap.md` and the gap doc; this plan doesn't repeat the full feature-by-feature state here.

## 3. Decisions that block build work (not something more building resolves)

**20 Aug 2026 update:** three of these are now resolved — see the "Decided" list right below. The rest are still open.

**Decided:**

- **Payment gateway: Razorpay.** `apps/api/src/modules/payments` now has a real order/verify/webhook integration — see gap §38 for the full flow and what it does and doesn't cover yet (no real merchant credentials in this build environment, and a real, unresolved currency mismatch between this app's USD-labeled seeded prices and Razorpay's native INR — see that gap entry before assuming this is ready to charge real money).
- **Phone+OTP vs. email+password: staying email+password for launch.** Phone+OTP is explicitly deferred, not a fast-follow with a date — see gap §9's 20 Aug 2026 update. If a future phase wants it as an *additional* sign-in option, that's still real, unblocked-except-for-a-vendor-choice work.
- **AI Coach scope for v1: infrastructure only, no chat feature yet.** Provider-agnostic key configuration is real (`apps/api/src/lib/aiClient.ts`, gap §38) — pick `AI_PROVIDER`/supply a key and `generateCompletion()` works — but no screen or endpoint calls it yet. This resolves "how would we even call an AI provider" without committing to shipping AI Coach chat, a workout generator, or diet-log vision for MVP; that's still a separate, larger scope call (conversation persistence, prompt design, streaming, rate limiting, cost controls) nobody has made yet.

**Still open:**

- **Real goal-setting system.** Calorie/macro/water targets are hardcoded placeholders (`DAILY_TARGETS`, `WATER_GOAL_GLASSES` — gap §10/§25), duplicated by hand across three screens. Decide whether MVP ships with a real per-user goal (onboarding-derived or user-set) or launches with the placeholder and fast-follows a real one — a nutrition app whose "compliance" tracking is measured against a number the user never set is a real credibility risk if it ships silently.
- **Referral reward.** Refer & Invite has real attribution tracking but no actual reward mechanism (gap §20). Low-stakes to defer past MVP — recommend shipping the referral *tracking* now (already real) and deferring the reward grid to a fast-follow once a reward is defined.
- ~~**Two-factor authentication.** Currently unbuilt (gap §17). Decide if this is a launch requirement (some jurisdictions/payment processors effectively expect it) or genuinely post-MVP.~~ **Resolved 25 Aug 2026** — real TOTP-based 2FA shipped (gap §17), this line predates that and is left struck through rather than deleted, per this doc's own 5 Sep update note at the top which already caught two other stale items but missed this one.
- **Android timing.** The Figma design is iOS-only (gap §7); confirm whether MVP is iOS-only at launch or needs Android in the same window — this affects Milestone F's app-store work directly.
- **DOB vs. age.** Edit Profile/onboarding collect `age`, not a real date of birth (gap §31). Converting is lossy for existing test data and needs an onboarding UI change, not just a backend field. Decide if MVP needs a real DOB (e.g. for legal age-verification reasons) or age is an acceptable substitution long-term.
- **Annual subscription pricing convention.** Currently a flat 10×-monthly convention chosen unilaterally during the build (gap §35) — this one just needs a quick confirm-or-adjust, not a real workshop.
- **New, surfaced by the Razorpay integration: real INR list prices, or USD settlement.** Every seeded price in this app is USD-cent-denominated; Razorpay's native currency is INR. This needs an actual answer before real money should flow through Milestone C's checkout — see gap §38.

None of the above needs new code to resolve — they need a decision-maker's answer. Recommend batching these into one working session rather than trickling them out.

## 4. Work that just needs building — no decision blocking it

This can start immediately, in parallel with Section 3's decisions:

- **Toast/snackbar system** — the last third of gap §23 (error states, offline banner, and auto-retry are already real as of 20 Aug 2026).
- **Membership Details screen** — low priority, overlaps heavily with the already-real Subscription screen; the parts of it that don't overlap (payment method, billing history, auto-renewal) are blocked on the payment-gateway decision anyway, so this is small either way.
- **Minimal admin-side payments visibility** (`roadmap.md`'s Phase 3 note: just 06.01 Subscriptions/Revenue and 06.03 Payments, not the full Commerce module) — needed so there's *some* way for a human to see real subscriptions/payments once they exist, without waiting for the full admin console. Needs `apps/admin-web` to exist as a real scaffold first, which it currently doesn't (placeholder README only) — this is effectively "stand up a minimal admin-web app," not just two screens.
- **A real design pass on the auth screens** — `roadmap.md`'s Phase 0 status already flags these as "functional-but-undesigned." Not code work, but needs to happen before launch, not after.

## 5. Infrastructure and off-repo work

None of this is "add a feature" — it's what has to exist outside the codebase before Section 3/4's work can actually go live:

- **A real Postgres instance**, `prisma migrate deploy` + `prisma generate` run against it for the first time ever, and the full auth → onboarding → workout-logging → purchase flow smoke-tested end to end on real infrastructure. This can start today — it needs zero product decisions, only real network access and a database, neither of which exist in this build sandbox.
- **Production API hosting** + secrets management for JWT signing keys, the database URL, and (once decided) the payment/SMS provider credentials.
- **Apple Developer account + EAS build pipeline** (Expo's managed build service) to get past `npx expo export --platform web`'s dev-preview role and produce a real signed iOS build for TestFlight.
- **A real Razorpay merchant account.** The integration itself is built (gap §38), but this build environment has no real `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET` — test-mode keys from a real Razorpay dashboard unblock end-to-end testing before the account is fully verified for production. Also needs the real-INR-prices-vs-USD-settlement decision (Section 3) resolved first.
- **SMS/OTP provider account** — only relevant if a later phase decides to add phone+OTP as an additional sign-in option; not needed for MVP (Section 3).
- **Crash reporting / error monitoring** (e.g. Sentry) — not currently wired anywhere in this app. Cheap to add, and launching without it means the first production crash is invisible until a user reports it manually.
- **Terms of Service and Privacy Policy documents** — referenced by Profile's legal-links quick-link (currently blocked because these don't exist) and required by both app stores for submission review, independent of anything else in this plan.

## 6. Sequenced milestones

**A — Decisions workshop.** Resolve Section 3 in one sitting where possible. Blocks parts of C, F, and downstream QA, but blocks nothing in B or D.

**B — Close remaining pure-build gaps** (Section 4). Can run immediately, in parallel with A.

**C — Wire the decided infrastructure.** **20 Aug 2026: substantially done** — Razorpay checkout is real (gap §38), email+password is confirmed as the launch auth (no phone+OTP work needed), and AI provider config is real (though no feature calls it yet, by design). What's left in this bucket: a real goal-setting system if MVP needs one, 2FA if required, and real INR pricing or USD-settlement configuration for Razorpay before it can charge real money — all still gated on Section 3's remaining open decisions.

**D — Get off the sandbox.** Real Postgres, real `prisma generate`, a live deployed API, and a genuine end-to-end smoke test of the whole app against it — the first time this will have actually happened. Start this immediately; it's independent of every decision in Section 3 and is the biggest unverified assumption in the whole build.

**E — Design pass + legal documents.** Auth screens get a real design review; Terms/Privacy get written or sourced from counsel. Neither is code work, both block submission.

**F — Platform readiness.** Apple Developer account, EAS build, TestFlight internal testing; execute or explicitly defer the Android decision from Section 3.

**G — Observability and hardening.** Crash reporting wired in; a basic security review (rate limiting, secrets handling, the audit-log coverage that already exists); a light load-test of the API now that it can actually run.

**H — QA pass.** Real device testing — this session's web-preview and typecheck/lint gates catch a lot, but nothing here has run on an actual phone yet. Full regression across all screens now wired to error/empty/offline states (gap §23), plus a dry run of the real payment flow in test mode.

**I — Launch.** TestFlight/Play internal beta first, then public release.

Milestones B and D can both start today, without waiting on anything else in this plan. Everything downstream of C depends on Section 3 landing first.

## 7. Explicitly cut from MVP, not forgotten

Per the roadmap's own phase sequencing, MVP ships without: the coach marketplace and any coach-facing app (Phase 5, blocked on a real coach-discovery/booking design conflict), the full admin console beyond Milestone C's minimal payments visibility (Phases 6–11), Recovery & Devices / any wearable integration (needs a real Bluetooth/HealthKit/Google Fit SDK decision, gap §13), GPS run/cycle tracking, an Exercise Detail video player (no video content or player library exist yet, gap §26), live chat support, and custom notification sounds or server-push delivery for reminders (local-only for v1, gap §16). None of these are defects in the MVP — they're the parts of the design that need infrastructure or a business decision this plan deliberately doesn't force before launch.

## 8. Biggest risks, in order

1. **The API has never run against a live database.** Everything else in this plan assumes the backend behaves the way its types and tests suggest it will — Milestone D is where that assumption actually gets tested for the first time.
2. **No crash reporting or monitoring exists today.** Shipping without it means production issues are invisible until a user complains.
3. **No legal documents exist.** Both app stores require them for submission — this is a hard blocker on Milestone F regardless of how everything else lands.
4. **The auth screens have never had a design review.** Shipping "functional-but-undesigned" screens as someone's first impression of the app is a real risk, not a cosmetic one.
5. **The Razorpay integration has never processed a real payment.** It's built against the real API contract (order/verify/webhook, real signature verification), but with no merchant credentials in this build environment, none of it has actually been exercised end to end — that first real test-mode transaction should happen before trusting this in production, same category of risk as #1.
6. **A real currency mismatch sits between this app's prices and Razorpay's.** Every seeded price is USD-labeled cents; Razorpay defaults to INR. Left unresolved, real customers would be charged roughly 1/80th of the intended price — this needs an explicit answer, not a default.
7. **Section 3's remaining decisions are still load-bearing.** A real goal system, 2FA, and Android timing remain open — resolving these early de-risks what's left of Milestone C.
