# PrimeFit / 23PrimeFit — Product Documentation

**Status:** Phase 0 in progress — backend + mobile app scaffold built, planning complete for all three apps
**Sources of truth:**
- [Figma — vi-admin](https://www.figma.com/design/QFkdCAZdSnuM9slK5lkvf8/vi-admin?node-id=0-1) (Super Admin Console, 54 screens)
- [Figma — v1-user](https://www.figma.com/design/goXnXRimiQom0cq8p8Mvtj/v1-user?node-id=9-2) (23PrimeFit consumer mobile app, 82 screens)
- [Figma — v1-coach](https://www.figma.com/design/rWjLV3qEnwuEy6Avuo7ggT/v1-coach?node-id=0-1) (23PrimeFit coach/professional app, 16 screens)

**Last reviewed:** 17 Aug 2026 · **Code scaffold started:** 18 Aug 2026

## What this is

PrimeFit / 23PrimeFit is a global fitness & nutrition coaching marketplace that connects end users with verified fitness/nutrition professionals, sells subscriptions and coaching programs, runs an influencer/referral growth engine, and layers AI-powered features (workout generation, diet-log vision, health scoring, voice coaching) on top. Three Figma files were reviewed screen-by-screen before any code was written: the internal Super Admin back-office console, the consumer-facing mobile app end users use day to day, and the coach-facing app professionals use to run their practice. Per the mobile-first priority below, `apps/api` (backend) and `apps/user-mobile` now have real, typechecked Phase 0 code — see their READMEs for setup. `apps/admin-web` and `apps/coach-mobile` are still documentation-only, by design (see the roadmap).

**Start here if you only read one thing:** [docs/coach/06-cross-app-integration.md](docs/coach/06-cross-app-integration.md) §2 — the three files were designed somewhat independently and the "find/book a coach" journey exists twice, inconsistently, between the consumer and coach apps. That needs a product decision before any of the three apps' backend work starts.

**Build priority (set 18 Aug 2026):** the consumer mobile app ships first, ahead of the admin console and the coach app — see [docs/platform/roadmap.md](docs/platform/roadmap.md) for the full phase order and the reasoning.

Per project instructions, each Figma file was reviewed screen-by-screen before any implementation planning, and this documentation set is the required output of that review.

## Folder map

```
docs/
├── README.md         ← docs index (mirrors this section)
├── admin/             01–07: Super Admin Console (54 screens)
├── mobile/            01–07: consumer mobile app (82 screens)
├── coach/             01–07: coach/professional app (16 screens)
└── platform/          cross-cutting docs that apply to all three apps
figma-reference/        one node-ID lookup file per Figma file, named to match apps/
apps/                   admin-web, user-mobile, coach-mobile, api — placeholders only, no code
packages/               ui, config, types — shared across apps, placeholders only, no code
```

Every one of `docs/admin/`, `docs/mobile/`, and `docs/coach/` follows the **same 7-doc pattern**: `01-product-requirements` → `02-information-architecture` → `03-screen-inventory` → `04-design-system` → `05-data-model`(or `05-roles-permissions` for admin, with data model at `06`) → `06-cross-app-integration` (mobile/coach only) → `07-open-questions-gaps`. `docs/platform/` holds the two docs that describe all three apps together rather than one: `project-structure.md` and `roadmap.md`.

## How to use this documentation

**Admin console (`docs/admin/`)** — read in this order:

1. **[docs/admin/01-product-requirements.md](docs/admin/01-product-requirements.md)** — what the product is, who uses it, and why.
2. **[docs/admin/02-information-architecture.md](docs/admin/02-information-architecture.md)** — the navigation model and full sitemap.
3. **[docs/admin/03-screen-inventory.md](docs/admin/03-screen-inventory.md)** — every one of the 54 screens, module by module, with purpose, key data, and primary actions.
4. **[docs/admin/04-design-system.md](docs/admin/04-design-system.md)** — visual language, layout patterns, and the reusable component inventory observed in Figma.
5. **[docs/admin/05-roles-permissions.md](docs/admin/05-roles-permissions.md)** — the RBAC model (roles × modules × actions).
6. **[docs/admin/06-data-model.md](docs/admin/06-data-model.md)** — the core entities and relationships implied by the screens.
7. **[docs/admin/07-open-questions-gaps.md](docs/admin/07-open-questions-gaps.md)** — gaps, inconsistencies, and decisions found while auditing the Figma file — read this before writing any code.

**Mobile app (`docs/mobile/`)** — read in this order:

1. **[docs/mobile/01-product-requirements.md](docs/mobile/01-product-requirements.md)** — what the app is, its product pillars, and its monetization model.
2. **[docs/mobile/02-information-architecture.md](docs/mobile/02-information-architecture.md)** — the 5-tab navigation model and full sitemap.
3. **[docs/mobile/03-screen-inventory.md](docs/mobile/03-screen-inventory.md)** — every one of the 82 screens, grouped by module.
4. **[docs/mobile/04-design-system.md](docs/mobile/04-design-system.md)** — mobile visual language and shared-component inventory.
5. **[docs/mobile/05-data-model.md](docs/mobile/05-data-model.md)** — the core entities implied by the screens.
6. **[docs/mobile/06-cross-app-integration.md](docs/mobile/06-cross-app-integration.md)** — **read this one especially** — maps every mobile-app area to the admin console module that manages it, and flags which entities must be shared, not duplicated, between apps.
7. **[docs/mobile/07-open-questions-gaps.md](docs/mobile/07-open-questions-gaps.md)** — gaps and decisions specific to the mobile app.

**Coach app (`docs/coach/`)** — read in this order:

1. **[docs/coach/01-product-requirements.md](docs/coach/01-product-requirements.md)** — what the app is for, and the duplicate-flow finding (§3) flagged up front.
2. **[docs/coach/02-information-architecture.md](docs/coach/02-information-architecture.md)** — navigation shell and full sitemap.
3. **[docs/coach/03-screen-inventory.md](docs/coach/03-screen-inventory.md)** — all 16 screens.
4. **[docs/coach/04-design-system.md](docs/coach/04-design-system.md)** — coach-app visual language, including the third accent-color finding.
5. **[docs/coach/05-data-model.md](docs/coach/05-data-model.md)** — entities implied by the screens.
6. **[docs/coach/06-cross-app-integration.md](docs/coach/06-cross-app-integration.md)** — **the most important doc in this set** — maps the coach app into the admin/mobile picture and details the coach-discovery/booking duplication.
7. **[docs/coach/07-open-questions-gaps.md](docs/coach/07-open-questions-gaps.md)** — gaps and decisions specific to the coach app.

**Platform-wide (`docs/platform/`)** — applies to all three apps together:

- **[docs/platform/project-structure.md](docs/platform/project-structure.md)** — proposed monorepo layout and tech stack for when implementation starts.
- **[docs/platform/roadmap.md](docs/platform/roadmap.md)** — suggested build order across phases/milestones.

`figma-reference/admin-web.md`, `figma-reference/user-mobile.md`, and `figma-reference/coach-mobile.md` are lookup tables from screen name to Figma node ID, named to match their corresponding folder under `apps/` — for anyone who needs to jump back into any of the three design files.

## Ground rules for this project

- **Figma is the source of truth for UI.** Any screen, component, or flow not covered here should be checked against the live Figma file, not assumed.
- **Documentation and structure before code.** This folder is meant to be filled in with actual applications once the plans below are reviewed and approved — do not start scaffolding code against these docs without a sign-off pass, since the `07-open-questions-gaps.md` in each of `docs/admin/`, `docs/mobile/`, and `docs/coach/` affect architecture decisions.
- **All three apps share one backend/data model.** See [docs/mobile/06-cross-app-integration.md](docs/mobile/06-cross-app-integration.md) and [docs/coach/06-cross-app-integration.md](docs/coach/06-cross-app-integration.md) before building any app's API layer — several entities (subscriptions, transactions, coaching relationships, programs/content, referrals, credentials) must not be modeled twice or three times.
- **Known design inconsistencies need resolving before/alongside build, not after.** In particular: the duplicated coach-discovery/booking flow ([docs/coach/06-cross-app-integration.md](docs/coach/06-cross-app-integration.md) §2) and three different default accent colors across the three apps ([docs/coach/07-open-questions-gaps.md](docs/coach/07-open-questions-gaps.md) §3).
- **This is a planning snapshot.** All three Figma files will keep evolving; re-run the screen review if node IDs change or new frames are added.
- **Mobile app ships first.** Per the 18 Aug 2026 priority decision, don't sequence admin-console or coach-app work ahead of the mobile phases in [docs/platform/roadmap.md](docs/platform/roadmap.md) unless it's a hard mobile dependency (e.g. auth, backend, RBAC foundations).
