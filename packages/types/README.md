# types

Shared TypeScript contracts between `apps/api` and `apps/user-mobile` (later `apps/admin-web`, `apps/coach-mobile`), derived from [`../../docs/admin/06-data-model.md`](../../docs/admin/06-data-model.md) and [`../../docs/mobile/05-data-model.md`](../../docs/mobile/05-data-model.md).

`src/index.ts` currently covers Phase 0/1 scope only: Auth, User/OnboardingProfile, Program/Exercise/Recipe, SubscriptionPlan/Subscription. Entities not yet built anywhere (WorkoutSession, MealLog, Coach/CoachBooking, Referral, Transaction, etc.) are intentionally not modeled here yet — add each type in the same phase that implements the feature needing it, per [`../../docs/platform/roadmap.md`](../../docs/platform/roadmap.md), rather than speculatively up front.

No build step — `apps/api` and `apps/user-mobile` both reference `src/index.ts` directly via TS path mapping (see each app's `tsconfig.json`).
