# coach-mobile — Fynrox Coach

Phase 5 (`docs/platform/roadmap.md`), first real slice — added 20 Aug 2026. Implements part of the app described in `docs/coach/01-product-requirements.md` (16 screens across Auth/Onboarding/Dashboard/Clients/Coach Discovery & Booking, reverse-engineered from the `v1-coach` Figma file). This slice shipped a working coach signup/login, the full 3-step onboarding wizard (Service Selection → Credential Upload → KYC → Verification Status), and a real Dashboard, with Clients/Calendar/Messages/More rendered as honest "Coming soon" screens.

**Previously undocumented here — added retroactively 26 Aug 2026:** Coach Discovery & Booking (screen inventory §E) shipped 25 Aug 2026, resolving gap §1 — but its screens live in `apps/user-mobile`, not this app (a coach doesn't need a discovery flow to find *themselves*; see `docs/coach/07-open-questions-gaps.md`'s "25 Aug 2026" entry). What that pass changed *here*: Dashboard's Active Clients count is no longer a permanently-zero placeholder — it moves as real client bookings come in. **26 Aug 2026: Calendar is real too** — see "What's real" below.

## Stack

React Native + Expo + TypeScript, an exact mirror of `apps/user-mobile`'s proven configuration (same Expo SDK 51 pin, same npm-workspaces Metro fix, same `expo/tsconfig.base`) — see `docs/platform/project-structure.md` §2's "Mobile app stack" decision. Deliberately simpler than `user-mobile` in two ways: no Biometric Unlock app-lock (not designed anywhere in the reviewed Figma file, out of scope for this slice) and no offline banner/`@react-native-community/netinfo` (not added this pass — see "Not built" below).

## What's real vs. not-yet-built

**Real, working, backed by live queries against `apps/api`:**
- Coach signup/login (`POST /professionals/auth/signup` / `/login`) — a genuinely separate identity from `User` (consumer) and `AdminUser`. See `apps/api/prisma/schema.prisma`'s `Professional` model — own JWT secret, own refresh-token table, full access+refresh rotation (unlike `AdminUser`'s single-token pattern) since this is a real consumer-facing app, not an internal tool.
- Onboarding: Service Selection (`PUT /professionals/me/services`, multi-select, not mutually exclusive), Credential Upload looped per selected service (`POST /professionals/me/credentials`, image uploads via `expo-image-picker`, base64-data-URI-in-Postgres — no object storage anywhere in this build), a shared KYC step (`POST /professionals/me/kyc`), and Verification Status (`GET /professionals/me/onboarding`) showing real per-service + KYC status badges.
- Dashboard (`GET /professionals/me/dashboard`) — real service verification badges, a real Active Clients count (a genuine `Relationship` row count — moves once Discovery & Booking on `apps/user-mobile` creates one), and, **as of 26 Aug 2026**, real Sessions This Week and Today's Schedule stats, both joined off real `Booking` rows. Avg Rating is the one stat still rendered as an explicit "Not available yet" panel rather than faked — no `Review` entity exists anywhere in this build.
- **Calendar (`GET /professionals/me/schedule`, added 26 Aug 2026)** — a real, sectioned list of the coach's own `Booking` rows: Upcoming grouped by day, Past capped at the most recent 50 with an honest truncation note rather than a silent drop. Deliberately not an editable-availability-grid or an invented month-grid widget — no design source in either Figma file specifies what a coach's calendar should look like; see "Decisions made" below.

**Not built — inert placeholders or missing entirely:**
- Clients, Messages, More tabs — only Dashboard (and, as of 26 Aug 2026, Calendar) were actually designed or scoped with real content; Messages and More still render a real, honest "Coming soon" screen (`docs/coach/02-information-architecture.md` §2, `docs/coach/07-open-questions-gaps.md` gap §4).
- Quick Actions on Dashboard (Create Workout Plan / Create Nutrition Plan / Schedule Client Session) — listed but not wired, same "inert, not omitted" precedent as `apps/user-mobile`'s `MoreScreen`.
- Resuming an abandoned/partial onboarding: server-side, "onboarding completed" means "has selected ≥1 service" (`professionalOnboarding.service.ts`'s `hasSelectedServices`) — so a coach who backgrounds/reinstalls the app between Service Selection and finishing Credential/KYC upload lands on `MainTabs` on their next login, with no screen yet that lets them resume the upload steps from there. The Figma's own "Complete Verification" action on Verification Status isn't wired to anything in this slice.
- Offline banner / network-retry — `user-mobile`'s cross-cutting workstream (`docs/platform/roadmap.md`'s "Empty/loading/error states" entry) wasn't ported to this app this pass; `ErrorState`/`EmptyState`/`extractErrorMessage` were, so every screen still has a real retry-capable error state, just no global offline indicator.

## Decisions made resolving the Figma-review gaps

This slice resolves several `docs/coach/07-open-questions-gaps.md` gaps as pragmatic, scoped defaults — recorded in full in that doc's "20 Aug 2026 — Phase 5 started" entry, summarized here:

- **Gap §1 (coach-discovery/booking designed twice):** adopted the doc's own recommendation (`v1-coach`'s data model is authoritative) for the **backend data model only** — `ProfessionalServiceType` (Fitness/Nutrition/Both), `Relationship`-as-parent/`Booking`-as-child (`docs/coach/05-data-model.md` §3). At the time (20 Aug 2026) the actual discovery/booking screens were left unbuilt on either app, since that was a real product/design call, not an engineering guess. **Update, 25 Aug 2026: gap §1 is now fully resolved** — the screens half shipped too, adopting `v1-coach`'s fuller 7-screen flow and taxonomy per a direct product-owner decision. Those screens live in `apps/user-mobile`, not here (a coach doesn't need a discovery flow to find *themselves*) — see that app's README and `docs/coach/07-open-questions-gaps.md`'s "25 Aug 2026" entry for what shipped and what was deliberately simplified (no ratings, a fixed availability grid, no payment collection at booking time).
- **Gap §2 (three inconsistent bottom-nav label sets):** resolved for this app only — `Dashboard/Clients/Calendar/Messages/More`, its own real tab bar (`docs/coach/02-information-architecture.md` §2), not reconciled with the consumer app's `Today/Train/Fuel/Recover/More` or the stray `Home/Explore/Sessions/Messages/Profile` set found on one Figma frame.
- **Gap §3 (three different default accent colors):** left **open** — this app uses its own designed lime/yellow-green accent (`#D4FF00`–`#C6F000`, `docs/coach/04-design-system.md` §1), matching the precedent that each app ships what was actually designed for it rather than an engineering-guessed unification.
- **Gap §4 (Calendar/Messages/More have zero designed screens):** **partially resolved 26 Aug 2026** — Calendar's open UI/UX question ("an editable availability grid? a read-only list? something else") was settled as a real, sectioned `Booking` list, deliberately smaller than either richer possibility a design might have called for; see "What's real" above. **Messages and More remain genuinely open** — Messages needs both a design and a real-time delivery mechanism (no `Message` model exists anywhere in this build); More has zero frames to build against on either app or role. Both still render as honest "Coming soon" screens.
- **Gap §7 (KYC/Aadhaar privacy):** **NOT resolved** — KYC documents use the same unencrypted base64-in-Postgres storage as every other document in this build, with no redaction or scoped access control. A real security/privacy review is needed before this should ever hold a real government ID.

Gaps §5, §6 (no coach-side earnings/payout visibility, Create Workout/Nutrition Plan destination) remain open — not designed anywhere in the reviewed Figma file.

## Local development

```bash
npm install                                  # from the repo root (npm workspaces)
cp apps/coach-mobile/.env.example apps/coach-mobile/.env
npm run dev:coach                            # starts Expo (Metro) — press w for web, i for iOS Simulator

# apps/api must also be running (see apps/api/README.md).
```

`npm run typecheck` / `npm run lint` run clean in this build sandbox. `npx expo export --platform web` (`EXPO_OFFLINE=1`, no live API needed) was used to verify the app actually bundles and renders — screenshotted with Playwright — same verification approach used for `apps/user-mobile` and `apps/admin-web`, since no iOS Simulator exists in this sandbox.

## Structure

```
src/
├── theme/tokens.ts                — colors (lime accent)/spacing/radius/typography, eyeballed from docs/coach/04-design-system.md
├── lib/
│   ├── secureStore.ts              — expo-secure-store wrapper w/ a web/localStorage fallback (sandbox verification only)
│   └── apiError.ts                 — extractErrorMessage, mirrors apps/user-mobile's
├── api/
│   ├── client.ts                   — axios instance, token storage, 401 refresh + GET network-retry
│   ├── professionalAuth.ts
│   ├── professionalOnboarding.ts
│   ├── professionalDashboard.ts
│   └── coaching.ts                 — fetchMySchedule() (added 26 Aug 2026, backs the Calendar tab)
├── context/AuthContext.tsx         — professional/isLoading/isAuthenticated/onboardingCompleted/login/signup/logout
├── navigation/
│   ├── RootNavigator.tsx            — Auth -> Onboarding -> MainTabs switch
│   ├── AuthStack.tsx                 — Splash/Login/Signup
│   ├── OnboardingStack.tsx           — ServiceSelection -> CredentialUpload (looped) -> KycUpload -> VerificationStatus
│   └── MainTabs.tsx                  — Dashboard/Clients/Calendar/Messages/More
├── components/                      — Button, Card, SelectCard, ScreenContainer, StepProgressBar, WizardLayout,
│                                        ErrorState, EmptyState, StatusBadge — copied near-verbatim from user-mobile
└── screens/
    ├── auth/                         — SplashScreen, LoginScreen, SignupScreen
    ├── onboarding/                   — ServiceSelectionScreen, CredentialUploadScreen, KycUploadScreen, VerificationStatusScreen
    ├── dashboard/DashboardScreen.tsx
    ├── calendar/CalendarScreen.tsx   — added 26 Aug 2026, real Upcoming/Past Booking list, no longer a placeholder
    └── placeholder/ComingSoonScreen.tsx  — Clients/Messages/More
```
