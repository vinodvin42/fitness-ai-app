# Business configuration — where each value comes from (16 Oct 2026)

**Read-only inventory.** No value here was changed in Batch 0. "Test data" means the code or migration itself labels the value as starting/test data. None of these values is confirmed as an approved production value.

| Value | Current figure | Source (file) | Kind | Labelled test data? | Admin can change? |
|---|---|---|---|---|---|
| Plan prices | Basic ₹0, Grow ₹299/month (id `pro`), Prime ₹599/month (id `elite`) | `apps/api/src/lib/seedDatabase.ts:133-137`; migration `20261015120000_plans_grow_prime_price_schedule` step 4 | Seed + migration data | **Yes** ("test data only") | Yes, `/admin/plans` (scheduled changes) |
| Yearly plans | ₹0, switched off | same | Seed + migration data | Yes ("not decided yet") | Yes |
| Scheduled Grow price rise | ₹299 → ₹349 from 1 Dec 2026, with an in-app notice to current Grow subscribers | `seedDatabase.ts:149-158`; migration `20261015120000` steps 6–7 | Seed + migration data | Partly: labelled decision "D8", while the same migration calls the prices test data | Yes (cancel schedule) |
| Coach levels | Level 1 / 2 / 3 | migration `20261015130000` step 5; `seedDatabase.ts` | Migration data | **Yes** ("test data") | Yes, `/admin/coach-levels` |
| Coach fees per level (before GST) | L1 ₹1,800 / ₹1,200 / ₹2,500; L2 ₹2,000 / ₹1,500 / ₹3,000; L3 ₹2,500 / ₹1,800 / ₹3,800 (fitness / nutrition / combined) | migration `20261015130000` step 5 | Migration data | **Yes** | Yes, `/admin/coach-levels/:id/fees` |
| Coach services | Fitness 45 min, Nutrition 30 min, Combined 60 min | migration `20261015130000` step 5 | Migration data | Yes | Yes |
| FynroX commission | 20% default | migration `20261015130000` (`commission-default-start`); fallback `FALLBACK_COMMISSION_PCT = 20` in `apps/api/src/lib/coachFees.ts:22` | Migration data + hard-coded fallback | Yes ("starting default") | Yes (default and per coach) |
| GST | 18% | `DEFAULT_GST_PERCENT = 18` in `apps/api/src/lib/gst.ts:4` (used when no `TaxConfig` row exists; none is seeded) | Hard-coded fallback | Not labelled | Yes, `/admin/finance/tax-configs` |
| GST treatment | Included in plan prices; added on top of coach fees | `payments.service.ts` / `checkout` (see `checkout.test.ts`) | Code behaviour | n/a | No |
| Influencer commission | 20% default | `Influencer.commissionPct @default(20)`, `apps/api/prisma/schema.prisma:3306` | Schema default | Not labelled | Yes (per influencer) |
| Gym commission | 15% default; ₹0 per member | `schema.prisma` gym partner model (`commissionPct @default(15)`, `ratePerMemberCents @default(0)`) | Schema default | Not labelled | Yes (per gym) |
| User referral reward | 1 month credit | `apps/api/src/modules/referrals/referrals.service.ts:89,104`; flag `REFERRAL_REWARDS_ARE_EXAMPLES` defaults to true (`packages/config/src/r1Flags.ts:114`) | Hard-coded | **Yes** (flagged as examples) | No |
| AI coach daily limits | Basic 5, Grow 50, Prime 200 | `AI_COACH_DAILY_LIMITS` in `apps/api/src/modules/aiCoach/aiCoach.service.ts:73-77` | Hard-coded | Not labelled | No |
| Coupons | none seeded | `/admin/coupons` | Admin-managed | n/a | Yes |
| Partner codes (gym) | link only; no member offer | `userPartner.service.ts` | Code behaviour | n/a | n/a |
| Refunds | Admin-only, partial allowed | `adminRefunds.service.ts` | Code behaviour | n/a | Policy text is `[NEEDS A REAL POLICY]` in `legal/terms-of-service.md` |
| Cancellation | At period end | `subscriptions.service.ts` | Code behaviour | n/a | No |
| Age policy | No age limit in code | `onboardingAnyAge.test.ts`; but legal pages and landing say 16+ (`legal/terms-of-service.md:13`, `legal/privacy-policy.md:61`, `apps/landing/terms.html`, `privacy.html`) | Conflict | n/a | Needs a policy decision |
| Landing page prices | ₹299 / ₹599 | `apps/landing/pricing.html:87,100` | Hard-coded copy | Not labelled; doesn't mention the ₹349 change | No |

**Applying migrations `20261015120000` and `20261015130000` to a real database writes the test values above into it.** It also activates the ₹349 increase, notifies Grow subscribers, deletes each coach's own price, and leaves real coaches without a level. See `docs/platform/migration-safety.md`. These need your separate approval.
