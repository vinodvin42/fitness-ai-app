# Design System Notes (observed)

These notes describe the visual language actually used across the reviewed screens. Colors are described as **observed approximations** from rendered screenshots, not exact values — the Figma file has **no Figma Variables/styles defined** (`get_variable_defs` returned empty), so there are no authoritative design tokens to pull yet. Before implementation, run a proper token-extraction pass in Figma's dev mode / inspect panel on a few representative screens to lock exact hex/spacing values, or ask design to publish variables. Treat everything below as a starting point, not a spec.

## 1. Theme

- **Dark mode only**, consistently across all 54 screens — no light theme was found.
- Base canvas: near-black navy (roughly `#0A0D12`–`#0B0F14`).
- Sidebar: a very slightly lighter/darker panel than the canvas, with a thin separating edge.
- Cards/panels: a slightly raised dark surface (roughly `#12161C`–`#161B22`) with subtle 1px borders, rounded corners (~8–10px).

## 2. Color roles

| Role | Observed usage |
|---|---|
| Accent (brand/primary) | A mint/teal green (roughly `#12E5A6`–`#00D9A0`) — used for the logo mark, active nav item, primary buttons, positive trend arrows, "Active"/"Approved" status pills, toggle-on state, chart lines. |
| Danger | Red (roughly `#E5484D`–`#F04438`) — negative trends, "Rejected"/"Disabled" status, reject buttons, high-severity attention badges. |
| Warning | Amber/orange (roughly `#F5A623`–`#F79009`) — "Pending"/"Beta" status, medium-severity badges, warning icons. |
| Info/neutral accents | Muted blue/purple appear sparingly for secondary badges (e.g. low-severity, "Suspended"). |
| Text | White/near-white for primary text, mid-gray for secondary/metadata text, dim gray for placeholders and disabled state. |

Status pills consistently follow: **green = active/approved/healthy**, **amber = pending/warning**, **red = rejected/failed/critical**, **gray = inactive/disabled/neutral**. This mapping should become a formal token set (`status.success`, `status.warning`, `status.danger`, `status.neutral`) rather than being re-picked per screen.

## 3. Typography

- A single sans-serif family throughout (geometric grotesk-style — visually consistent with something like Inter/Söhne/similar; confirm exact family with design before implementation since font names weren't exposed via the metadata API).
- Clear hierarchy: large bold numerals for KPI values, medium-weight section headers in small caps or uppercase tracking (e.g. "TOTAL REVENUE", "BUSINESS HEALTH ANALYTICS"), regular-weight body/table text, smaller muted text for timestamps/meta.
- Monospace-style formatting appears for IDs and codes (e.g. transaction/invoice numbers, certificate numbers).

## 4. Layout system

- Fixed 1440px desktop canvas; **no responsive/tablet/mobile frames exist** in the file.
- Sidebar: fixed 240px.
- Content area: 1200px, with a consistent top bar (72px) and generous 24–32px section padding.
- Grid-based KPI card rows (typically 4–6 cards per row) with a value, label, and trend/sparkline.
- Tables: checkbox column + sortable-looking headers + status pill column + trailing actions column (often a "⋯" overflow menu), with pagination footer where lists are long.
- Two dominant page patterns: **list/table pages** (directory-style, with filter bar above a data table) and **dashboard pages** (KPI rows + charts + action lists). Detail pages (Professional Profile, User Profile, Relationship Detail) use a header block + tabs + card grid.
- Split-panel pattern for queues/workflows (Credential Verification, Support Tickets, Complaints): a list on the left, contextual detail/action panel on the right.

## 5. Recurring components (build these once, reuse everywhere)

- **App shell**: sidebar (logo, primary nav, secondary nav/flyout, status footer) + top bar (title/timestamp, global search, region selector, notification bell, admin identity + audit indicator).
- **KPI card** (value, label, trend %, optional sparkline).
- **Status badge/pill** (color-coded, see §2).
- **Data table** (checkbox select, sortable headers, status pill cell, row actions, pagination).
- **Filter bar** (a row of dropdown "pickers" + a search box + optional date-range calendar picker).
- **Tab bar** (both as page-level section switcher and as a sidebar sub-nav variant).
- **Summary/stat strip** (compact inline counts, e.g. Professional Directory's Active/Pending/Rejected/Suspended/Expiring strip).
- **Approve/Reject action pair** (credential verification, content review, coach settlements) — consistently green-approve / red-reject / neutral "request info" third option.
- **Toggle switch** (feature flags, auto-renew, settings).
- **Rollout/progress bar** (AI feature rollout %, aging buckets, program progress).
- **Split queue + detail panel** (verification, support tickets, complaints).
- **"Requires attention" / action list row** (icon + label + count + severity badge + "Review →" link) — used on the Executive Dashboard and Finance Dashboard; worth building as one shared component.
- **Locked/restricted panel** (sensitive health data) — an important pattern to formalize as a permission-gated component, not a one-off.
- **Audit indicator pill** ("Audit active" / "Audit logging active") — persistent, should be a global shell element bound to real session/audit state.

## 6. Gaps to resolve before/while building (see also doc 09)

- No empty, loading, error, or skeleton states designed for any screen.
- No responsive breakpoints — a decision is needed on whether the admin console will ever run below 1440px, or whether desktop-only is an accepted constraint.
- No Figma variables/tokens published — exact colors, spacing scale, and type scale need to be confirmed with design rather than eyeballed from screenshots.
- Icon set appears to be a standard outline icon library (icon names in the file — `layout-grid`, `users`, `award`, `git-merge`, `activity`, `shopping-bag`, `trending-up`, `bar-chart-2`, `help-circle`, `bell`, `settings`, `key`, `clipboard`, `file-text`, `user-check`, `chevron-down`, `search`, `shield-check`, `arrow-left`, `plus`, `refresh-cw`, `circle-x`, `lock`, etc. — strongly resemble [Lucide](https://lucide.dev) icon names), which is worth confirming and standardizing on directly.
