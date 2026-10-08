# Proposed Project Structure & Stack

This is a **proposal for review**, not a decision already made — no tech stack was specified in the brief or the Figma file, so the options below are recommendations to confirm with the team before any code is written. Nothing in this document has been scaffolded as actual application code yet; only the top-level, code-free skeleton described in §4 has been created, matching the "structure and documentation before code" project rule.

## 1. Suggested high-level architecture

A **monorepo** with a clear split between the admin web app, its backend API, and shared code — this matches the module-based IA well (each of the 12 modules maps to a feature folder on both sides):

```
fitness-ai-app/
├── docs/                     ← planning & spec documents (admin console + docs/mobile/ + docs/coach/)
├── figma-reference/          ← Figma node-ID lookup tables (one per reviewed Figma file)
├── apps/
│   ├── admin-web/            ← the Super Admin Console (vi-admin Figma file, 54 screens)
│   ├── user-mobile/          ← the FynroX consumer app (v1-user Figma file, 82 screens)
│   ├── coach-mobile/         ← the FynroX coach/professional app (v1-coach Figma file, 16 screens)
│   └── api/                  ← backend API serving ALL THREE apps — see docs/mobile/06-cross-app-integration.md and docs/coach/06-cross-app-integration.md
└── packages/
    ├── ui/                   ← shared design-system components (see 04-design-system.md, docs/mobile/04-design-system.md, docs/coach/04-design-system.md)
    ├── config/                ← shared lint/tsconfig/env schema
    └── types/                 ← shared TypeScript types/contracts between api and all three apps
```

**Important:** `api` is deliberately singular — per [docs/mobile/06-cross-app-integration.md](../mobile/06-cross-app-integration.md) and [docs/coach/06-cross-app-integration.md](../coach/06-cross-app-integration.md), the three apps share core entities (subscriptions, transactions, programs/content, coaching relationships, credentials, referrals, support tickets) and must be served by one backend/data model, not three independently-built APIs that later need reconciling. **Do not start `coach-mobile` or `user-mobile` scaffolding for the coach-discovery/booking feature specifically until the duplication in [docs/coach/06-cross-app-integration.md](../coach/06-cross-app-integration.md) §2 is resolved with product/design** — it's the one place where building against either Figma file as-is will produce the wrong thing.

## 2. Suggested stack (recommendation, needs sign-off)

| Layer | Recommendation | Why it fits what was observed |
|---|---|---|
| Frontend framework | React + TypeScript (Next.js or Vite, either works — Next.js if SEO/SSR is ever needed for any public surface, Vite/CSR is simpler for an internal-only console) | Screens are almost entirely authenticated, data-table/dashboard heavy — a CSR SPA is sufficient; Next.js adds routing/layout conventions that map well to the module structure. |
| UI/component layer | Tailwind CSS + a headless component library (Radix UI / shadcn-style) | The design is a bespoke dark theme with a small, consistent set of primitives (cards, tables, tabs, badges, toggles) — a utility-CSS + headless-component approach avoids fighting a heavier design-system library for a one-off visual style. |
| Charts | A lightweight charting library (e.g. Recharts or visx) | Line/area charts, sparklines, donuts, waterfalls, and heatmaps all appear — pick one library that covers all of these rather than mixing several. |
| State/data fetching | React Query (TanStack Query) for server state; minimal client state (Zustand or React context) for UI-only state (filters, selected tabs) | Nearly every screen is a filtered table or dashboard bound to server data — a server-state cache library removes a lot of boilerplate. |
| Backend framework | Node.js + TypeScript (NestJS or a lighter Express/Fastify + Zod setup) | Keeps the type contract shared with the frontend (`packages/types`) and matches the module boundaries (one module = one feature area with its own controller/service). |
| Database | PostgreSQL | Relational data (users, professionals, relationships, transactions, ledger entries) with strong consistency needs (finance, audit logs) fits relational modeling well; see [06-data-model.md](../admin/06-data-model.md). |
| Auth | Session or JWT-based auth with a dedicated RBAC middleware enforcing the permission matrix from [05-roles-permissions.md](../admin/05-roles-permissions.md) on every API route — **not** just hidden UI, per the design's own disclaimer. |
| Audit logging | A write-once `audit_log` table + middleware that records actor/action/entity on every mutating request, matching the "Audit logging active" indicator shown throughout the UI. |

Alternatives exist at every layer above (e.g. Vue/Svelte instead of React, a BaaS like Supabase instead of a custom Node API) — this table is a starting recommendation based on what the design implies (data density, RBAC, audit requirements), not a constraint from the brief.

**Mobile app stack — decided 18 Aug 2026: React Native + Expo.** The `v1-user` Figma file is designed iOS-only (see [docs/mobile/07-open-questions-gaps.md](../mobile/07-open-questions-gaps.md) §7), but the app ships first per [roadmap.md](roadmap.md), so React Native/Expo was chosen over native Swift/SwiftUI for TypeScript code/type-sharing with the backend (`packages/types`) and a lower-friction path to Android later, at the cost of some native polish on the GPS run/cycle tracking and wearable/Bluetooth features the design leans on. Android launch timing itself is still open — revisit if/when that's confirmed, since a hard "iOS-only, forever" answer could still justify reconsidering native Swift for those specific hardware-heavy screens even with Expo as the primary shell.

## 3. Feature-folder mapping (once code starts)

Both `apps/admin-web` and `apps/api` should mirror the 12 IA modules as top-level feature folders, so a developer can find "everything about Finance" in one place on either side:

```
dashboard/  users/  professionals/  relationships/  programs/
commerce/   growth/  support/  analytics/  finance/  ai-operations/  admin/
```

Cross-cutting concerns (auth, RBAC, audit logging, the app shell/sidebar, notifications) should live outside these feature folders in a `shared/` or `core/` area on each side, since they're used by every module rather than owned by one.

## 4. What has been scaffolded so far

**Updated 18 Aug 2026 — Phase 0 is real code now, not just structure.** `apps/api` and `apps/user-mobile` are functional TypeScript projects: installed, typechecked, and linted clean (see each app's README for the exact commands and the one known environment caveat — `prisma generate` couldn't run inside the cloud sandbox this was built in, since its engine-binary host isn't on that sandbox's network allowlist; it will work normally on a developer machine or in CI).

**Updated 20 Aug 2026 — `apps/admin-web` is a real scaffold too**, no longer a placeholder README. First slice: working admin login (a separate `AdminUser` identity, see `apps/api`'s schema) + the Executive Dashboard (01.01), backed by a real `GET /admin/dashboard/stats` endpoint. See `apps/admin-web/README.md` for what's real vs. still an inert sidebar placeholder, and which Figma-review gaps this slice resolved. Also fixed, while scaffolding this app: a duplicate-React install (`admin-web`'s own React 19 vs. `user-mobile`'s pinned React 18.2.0, both in the same npm workspace) that threw `Cannot read properties of null (reading 'useRef')` at runtime — resolved by pinning `admin-web` to React 18.2.0 and adding a root-level `overrides` block (see root `package.json`) so the whole workspace stays on one React copy.

**Updated 20 Aug 2026 — `apps/coach-mobile` is a real scaffold too**, no longer a placeholder README. Built by mirroring `apps/user-mobile`'s exact proven Expo/RN/TS configuration. First slice: coach signup/login (a third, genuinely separate `Professional` identity — own JWT secret, own refresh-token table, see `apps/api`'s schema), the full onboarding wizard (Service Selection → Credential Upload, looped per selected service → shared KYC step → Verification Status), and a real Dashboard. **Before scaffolding, the coach-discovery/booking design conflict this file's §1 flags (`docs/coach/06-cross-app-integration.md` §2) was given a scoped, documented default** rather than resolved outright — `v1-coach`'s data model adopted for the backend only, the actual discovery/booking screens left unbuilt on both apps — see `apps/coach-mobile/README.md`'s "Decisions made" section and `docs/coach/07-open-questions-gaps.md`'s "20 Aug 2026" entry for the full reasoning. This also let `apps/admin-web`'s Executive Dashboard pick up 4 real marketplace KPIs it previously listed as "not available."

```
fitness-ai-app/
├── README.md
├── docs/                       ← populated (admin console + mobile + coach + platform sets)
├── figma-reference/            ← populated (node-ID maps for all three Figma files)
├── apps/
│   ├── admin-web/               ← ✅ Phase 6 (started) scaffold: Vite + React 18 + TS + Tailwind v4,
│   │                                admin auth wired to api, Executive Dashboard w/ live stats
│   │                                incl. real marketplace KPIs, 11 other modules as inert placeholders
│   ├── user-mobile/            ← ✅ Phase 0/1 scaffold: Expo + RN + TS, auth wired to api,
│   │                              Today/Train/Fuel/Recover/More navigable, Train+Fuel live-data
│   ├── coach-mobile/           ← ✅ Phase 5 (started) scaffold: Expo + RN + TS (mirrors user-mobile's
│   │                              config), coach auth wired to api, onboarding wizard + Dashboard live-data,
│   │                              Clients/Calendar/Messages/More as inert tab placeholders
│   └── api/                    ← ✅ Phase 0/1/2/3/4/5/6 scaffold: Express + TS + Zod + Prisma/PostgreSQL,
│                                   auth + users + programs + payments + admin + professional modules,
│                                   seed script, audit log
└── packages/
    ├── ui/README.md            ← placeholder — pull shared components out of apps/user-mobile/src/components,
    │                              apps/admin-web/src/components, and apps/coach-mobile/src/components once
    │                              real duplication starts (coach-mobile's components/ already copies
    │                              user-mobile's near-verbatim — a clear first extraction candidate)
    ├── config/                 ← ✅ shared tsconfig.base.json + .eslintrc.base.json — Node-oriented, used by
    │                              apps/api directly; the three RN/web frontends each use their own
    │                              runtime-appropriate base (expo/tsconfig.base, a Vite/bundler config) instead
    └── types/                  ← ✅ shared TS contracts (Phase 0-6 entities, incl. Professional/onboarding/
                                    dashboard types) — src/index.ts
```

`node_modules/`, `dist/`, and Prisma migration output are gitignored (see root `.gitignore`) — not part of what's delivered as source.
