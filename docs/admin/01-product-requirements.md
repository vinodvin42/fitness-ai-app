# Product Requirements — PrimeFit Super Admin Console

## 1. Summary

PrimeFit is a two-sided marketplace: **end users** (people seeking fitness and nutrition coaching) are matched with **professionals** (certified coaches/nutritionists), pay for subscriptions and programs, and interact with AI-powered features. This document covers only the **Super Admin Console** — the internal, web-based back office that PrimeFit staff use to operate the business. It does not cover the end-user mobile/web app or the professional-facing app; those were not present in the reviewed Figma file.

Everything below is derived from reading the 54 screens in the `vi-admin` Figma file (single page, single canvas, one frame per screen, organized in a 12-row grid by module). Nothing here describes functionality beyond what the screens show or clearly imply through labeled UI (e.g., a button labeled "Approve" implies an approval action, even where the resulting state change isn't drawn).

## 2. Goals of the Super Admin Console

- Give operations, finance, support, and platform teams a single tool to run the marketplace: manage users and professionals, moderate content, handle money, run growth programs, respond to support/safety issues, monitor analytics, operate AI features, and administer the platform itself.
- Enforce accountability: every screen carries a persistent "Audit logging active" indicator and the signed-in admin's role badge, and sensitive actions (approve/reject, suspend, override) are logged.
- Support a multi-region business: a global region/country selector ("ALL REGIONS" / per-country) appears on nearly every screen, with sample data spanning India, USA, UAE, and Nigeria.
- Enforce least-privilege access through a role-based permission matrix (see [05-roles-permissions.md](05-roles-permissions.md)).

## 3. Primary users / personas

Inferred from the "Roles & Permissions" screen (12.02) and the role badges shown throughout (e.g. "ROOT ADMIN"):

| Role | Responsibility (as scoped in the permission matrix) |
|---|---|
| Super Admin | Full system access; only role with delete rights on Admin and full control of Sensitive Data and Audit Logs. |
| User Operations | User management and support (Users module + Support). |
| Coach Operations | Professional verification and management (Professionals module). |
| Finance | Revenue, transactions, settlements (Commerce + Finance). |
| Content | Programs, exercises, content approval (Programs/Content module). |
| Growth | Influencers, referrals, campaigns (Growth module). |
| Analytics | Read-only analytics and reports. |
| Support | Ticket management and user assistance (Support & Safety). |

The console itself is used exclusively by internal PrimeFit staff — there is no external/self-service persona in this file.

## 4. Scope — the 12 functional modules

The console is organized into 12 numbered modules (see the full breakdown in [03-screen-inventory.md](03-screen-inventory.md)):

1. **Dashboard** — executive KPIs and "requires attention" triage.
2. **Users** — end-user directory and 360° profile.
3. **Professionals** — coach/nutritionist directory, profile, and credential verification workflow.
4. **Relationships** — the coach↔client pairing engine, detail view, and a change/reassignment intervention queue.
5. **Programs** (Content) — fitness/nutrition programs, exercises, recipes, educational content, and a content review/approval queue.
6. **Commerce** — subscriptions, transactions, payments, refunds, pricing & coupons.
7. **Growth** — influencer program, referrals, campaigns & attribution.
8. **Support & Safety** — support tickets, escalations, complaints, safety/abuse reports.
9. **Analytics** — user, engagement, fitness & nutrition, business, geographic, and unit-economics/cohort analytics.
10. **Finance** — a full back-office accounting suite: P&L dashboard, revenue, expenses, invoices, receivables/payables, coach settlements, influencer payouts, taxes & compliance, bank accounts, and financial reports.
11. **AI Operations** — feature-flag style management of AI models (rollout %, latency, error rate), usage metrics, and safety overrides.
12. **Admin & System** — admin user management, RBAC, audit logs, privacy/data governance, security, integrations, notifications, and platform settings.

## 5. Non-functional themes observed in the design

- **Auditability by default.** A persistent "Audit active/logging" pill sits in the top bar of nearly every screen; sensitive-data panels (e.g. a user's health metrics) are explicitly locked behind "Request Authorized Access" with a note that access is logged and requires supervisor approval.
- **Multi-region operation.** A country/region selector with flags is present on most list/dashboard screens.
- **Dense, data-heavy dashboards.** KPI cards with trend sparklines, "requires attention" counters, and drill-down tables are the dominant pattern — this is an operations tool, not a marketing surface.
- **Dark theme only.** Every screen reviewed uses a single dark color scheme; no light-mode variant was found (see [04-design-system.md](04-design-system.md)).
- **Desktop-only canvas.** All 54 frames are fixed at 1440px width; no tablet/mobile breakpoints were found (see gap in [09-open-questions-gaps.md](07-open-questions-gaps.md)).

## 6. Explicitly out of scope (not found in this Figma file)

- Authentication screens (login, MFA, password reset, SSO) — the file starts directly at the authenticated Dashboard.
- The end-user-facing and professional-facing apps.
- Mobile/responsive layouts of the admin console.
- Empty, loading, and error states for any screen.

These are called out again with more detail in [09-open-questions-gaps.md](07-open-questions-gaps.md) since they affect what a first implementation phase needs to add on top of the Figma spec.
