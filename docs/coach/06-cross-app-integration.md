# Cross-App Integration — Coach App

Three Figma files now describe one product: the admin console (operator), the consumer app (`docs/mobile/`), and this coach app. This document maps the coach app into the same picture built in [../mobile/06-cross-app-integration.md](../mobile/06-cross-app-integration.md) — read that first for the general framework.

## 1. Direct module correspondences

| Coach app area | Admin console module | Relationship |
|---|---|---|
| Service Selection, Credential Verification, Verification Status | **03 Professionals** — Credential Verification (03.03) | This app is where a professional *submits* what the admin's 03.03 workflow *reviews and approves/rejects*. The per-service, per-credential structure observed here should directly shape that admin screen's backing data (see [05-data-model.md](05-data-model.md) §2). |
| Coach Dashboard, Client Profile | **03 Professionals** — Professional Profile (03.02) + **04 Relationships** | A coach's own dashboard/client list is their scoped, self-service view of the same relationships admin sees in aggregate in the Relationship Directory (04.01) and a professional's own profile (03.02, tabs: Clients/Sessions/Earnings/Reviews). |
| Discovery/Booking/My Professional Team/Change Professional | **03 Professionals** + **04 Relationships** (Change/Intervention Queue, 04.03) | Same correspondence already documented for the consumer app's coaching screens in [../mobile/06-cross-app-integration.md](../mobile/06-cross-app-integration.md) — **these are the same user journey, designed a second time in this file.** See §2 below. |

## 2. The coach-discovery/booking duplication, and how to resolve it

Both the consumer app (`v1-user`) and this file (`v1-coach`) independently design "find and book a coach." They are **not identical**:

| Aspect | v1-user version | v1-coach version |
|---|---|---|
| Screens | Find Coach → Coach Booking → Coach Messaging → Session Summary (4 screens) | Discovery Filters → Discovery List → Coach Profile Detail → Booking: Service Selection → Booking Confirmation (5 screens) |
| Coach type filter | All / Fitness / Nutrition / **Yoga** / **Sports** (5 categories) | Fitness Coach / Nutrition Professional / **Fitness + Nutrition** (3 categories, matches the admin console's actual taxonomy) |
| Booking flow shape | One screen: pick a session package, pick a date, book | Two screens: pick a service+price, pick date/time, then a separate confirmation screen |
| Ongoing relationship management | Not present as a dedicated screen in v1-user | "My Professional Team" + "Change Professional" (present here, and maps directly to admin's Change/Intervention Queue) |
| Bottom nav on these screens | Today/Train/Fuel/Recover/More (matches the rest of v1-user) | Home/Explore/Sessions/Messages/Profile (matches **neither** file's own shell) |

**The coach-type taxonomy mismatch is the most consequential difference**: the admin console's Professional Directory filters by "Service: Fitness/Nutrition/Both" ([../03-screen-inventory.md](../admin/03-screen-inventory.md) Module 03), and this coach app's own onboarding only ever offers Fitness/Nutrition as selectable services ([03-screen-inventory.md](03-screen-inventory.md) §B). The consumer app's "Yoga" and "Sports Performance" categories don't correspond to anything a coach can actually register as elsewhere in the product — either that's aspirational scope not yet reflected in coach onboarding, or it's stale/placeholder content that should be removed from the consumer app's filter design.

**Recommendation:** treat `v1-coach`'s discovery/booking/relationship-management screens as the **more authoritative version** for backend planning — they're more detailed (pricing per service, per-service booking, an explicit change-relationship flow that ties to the admin console), more internally consistent with the rest of the product's Fitness/Nutrition taxonomy, and include the relationship-management screens the consumer app lacks entirely. The consumer app's simpler 4-screen version likely needs to be redesigned to match, rather than building two separate implementations. **This is a design decision to confirm with the product/design team, not something to resolve unilaterally in engineering.**

**20 Aug 2026 — this recommendation was adopted for the backend data model only, to unblock the rest of Phase 5**, not as a substitute for the product/design confirmation this section still calls for. See [07-open-questions-gaps.md](07-open-questions-gaps.md)'s "Phase 5 started" entry for exactly what that did and didn't unblock — in short: `apps/api`'s `Professional`/`ProfessionalCredential`/`Relationship` schema now follows this section's taxonomy and parent/child modeling, and `apps/coach-mobile` has a real auth/onboarding/dashboard slice, but **no discovery/booking screen was built on either app** — that specific decision is still open.

**25 Aug 2026 — this recommendation was confirmed and the screens were built.** The product/design confirmation this section called for was obtained directly, with the four-way comparison above (and the taxonomy-mismatch analysis) presented as the options. **Decision: `v1-coach`'s version wins for both apps** — its 7-screen flow (adding Coach Profile Detail and My Professional Team/Change Professional to the 5 named in the table above) and its Fitness/Nutrition/Fitness+Nutrition taxonomy, exactly as this section recommended. `v1-user`'s simpler 4-screen version and its Yoga/Sports categories are not implemented — they're treated as stale/superseded, per this section's own reasoning about why they don't correspond to anything a coach can register as. The 6 built screens live in `apps/user-mobile` (the `user-`-prefixed screens are the consumer-facing ones per the Figma naming) and call a new `apps/api` `coaching` module. Full build notes and deliberate simplifications (no rating system, fixed availability grid, no payment collection yet) are in [07-open-questions-gaps.md](07-open-questions-gaps.md)'s "25 Aug 2026 — Gap §1 resolved" entry. The bottom-nav mismatch noted in the table's last row does not apply to what was built — these are `MoreStack` screens reached from the consumer app's own More tab, not a separate shell with its own nav bar.

## 3. Entities that must be shared (extends the list in the mobile doc)

In addition to the entities already listed in [../mobile/06-cross-app-integration.md](../mobile/06-cross-app-integration.md) §2, add:

- `Coach`/`Professional` — must be the exact same record a coach manages here, a user browses in either discovery flow, and admin verifies/administers in the Professional Directory.
- `Relationship`/`ClientRelationship`/`CoachBooking` — per §2 above and [05-data-model.md](05-data-model.md) §3, these three names across three files most likely need to converge into **one** relationship/booking model, not three.
- `CoachCredential` — the per-service verification records this app submits and the admin's Credential Verification (03.03) reviews.

## 4. Recommended next step

Before finalizing [../06-data-model.md](../admin/06-data-model.md) as canonical, run the reconciliation it already calls for ([../mobile/06-cross-app-integration.md](../mobile/06-cross-app-integration.md) §4) as a three-way exercise across all three Figma files, not two — the coach app surfaces real structural detail (per-service credentials, an explicit change-relationship flow) that the other two files only implied.
