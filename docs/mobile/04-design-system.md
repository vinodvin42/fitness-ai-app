# Design System Notes — Mobile App (observed)

Same caveat as the admin console's design notes: `get_variable_defs` returned empty for this file too — **no Figma variables/tokens are published**, so colors below are eyeballed approximations from rendered screenshots, not a spec. Confirm exact values with design before implementation.

## 1. Theme

- **Dark mode**, consistent with the admin console — near-black background throughout every screen sampled.
- Cards sit on slightly raised dark surfaces with rounded corners (~12–16px, more rounded than the admin console's ~8–10px, appropriate for a touch-first mobile UI).
- A **Preferences** screen includes a dark-mode toggle and an **Accent Colour** picker (sample options: Green, Yellow, Red) — meaning **the app is designed to be re-themeable per user**, and "dark blue" is just the default, not necessarily the only supported look. This is an important build implication: color should be implemented as a swappable accent token, not hard-coded.

## 2. Color roles

| Role | Observed usage |
|---|---|
| Accent (default) | A saturated blue (roughly `#3B82F6`–`#4F7DF3`) — primary buttons, active tab, links, progress rings, chart lines. This differs from the admin console's mint-green accent — see the open question on brand consistency in [07-open-questions-gaps.md](07-open-questions-gaps.md). |
| Secondary accents | Green (positive/success, e.g. "Good Recovery", low stress, completed items), amber/orange (warnings, streak/fire elements), purple/pink (used decoratively in the logo mark and some AI-related highlights), red (errors, delete actions, payment failed). |
| AI-specific accent | A distinct purple/violet tone recurs specifically on AI elements (the AI Coach FAB, "sparkles" icons, AI banners) — this looks like a deliberate "AI accent color" separate from the app's primary blue, worth formalizing as its own token (`color.ai.accent`) since AI touchpoints are a core differentiator (see [01-product-requirements.md](01-product-requirements.md) §3). |
| Text | White/near-white primary, muted gray secondary/meta text — consistent with the admin console. |

## 3. Typography & iconography

- A single sans-serif family, consistent weight hierarchy: bold large numerals for scores/metrics (readiness score, calorie ring, recovery score), medium-weight headers, regular body text, small muted meta text — same hierarchy pattern as the admin console, reinforcing a shared type scale across both apps.
- Icon names visible in layer data (`dumbbell`, `flame`, `heart`, `moon`, `activity`, `sparkles`, `shield-check`, `trending-up`, `alert-triangle`, `refresh-cw`, `chevron-right`, etc.) again strongly resemble the [Lucide](https://lucide.dev) icon set — same apparent library as the admin console, which is a good sign for shared component/icon tooling across both apps.

## 4. Layout system

- Fixed 390×844 iOS canvas (iPhone-class viewport); every screen includes iOS status-bar and home-indicator layers as part of the frame — these are **design artifacts to represent the OS chrome**, not app-rendered UI, and should be excluded from actual implementation (the OS renders its own status bar).
- A persistent 5-tab bottom bar (`nav-bar` / `bottom-nav-container`) on nearly all post-onboarding screens.
- A floating action button pattern used for two distinct purposes: the global **AI Coach FAB** (chat entry point) and screen-specific primary actions (e.g. Log Meal, Add).
- Card-based vertical scrolling is the dominant layout — dashboards are stacks of purpose-built cards (readiness, training, nutrition, hydration, recovery), not dense tables like the admin console.
- Ring/circular progress is used heavily and consistently for "a value out of a goal" (readiness score, calorie ring, recovery score, program-progress, overall-progress) — this should be one shared `ProgressRing` component, not rebuilt per screen.
- Chip/pill selectors (multi-select goal chips, filter chips, day-of-week pickers) recur across onboarding, workout settings, reminders, and coach-filtering — another clear shared-component candidate.

## 5. Recurring components (build these once, reuse everywhere)

- **App shell**: 5-tab bottom bar + AI Coach FAB + per-screen header (back button, title, contextual right action).
- **Progress ring** (see §4) — value/goal, label, optional color-coded status.
- **Stat/metric tile** (icon + label + value, used in readiness factors, recovery metrics, activity summary, run/cycle telemetry).
- **AI banner/card** — a recurring visual pattern (icon, short insight text, and either a single CTA or an Accept/Why or Why/Override action pair) used for the daily brief, recovery insight, exercise-swap AI pick, meal-plan AI banner, and active-workout AI banner. This is the mobile counterpart to the admin console's "Requires Attention" row and should be one shared component with configurable actions.
- **Chip selector** (single- or multi-select pill group) — goals, filters, diet types, allergens, days of week.
- **Card-based list row** (routine card, device card, notification row, coach card, recipe card) — consistent icon-left / content-middle / action-right shape throughout.
- **Bottom sheet** (barcode-scanner product result) and **modal-style overlay** (device-pairing scan animation, rest-timer overlay) for transient/contextual content without leaving the current screen.
- **Toggle switch** — used extensively (permissions, notification categories, settings) and should match the admin console's toggle styling for cross-app consistency.
- **Plan/pricing card** — used in both Subscription Plans and Program Purchase with a consistent shape (name, price, feature list, CTA, "most popular"-style badge).

## 6. Consistency with the admin console

Both files share: the same dark-theme-first approach, the same apparent icon library, a similar type-scale hierarchy, and the same "23" + FynroX branding. They **diverge** on primary accent color (mobile = blue + purple-for-AI, admin = mint green) and information density (mobile = card-based/spacious, admin = dense tables). Before building a shared component package (see [../07-project-structure.md](../platform/project-structure.md) `packages/ui`), decide whether both apps should converge on one accent color or intentionally keep distinct "consumer" vs. "operator" palettes — see [07-open-questions-gaps.md](07-open-questions-gaps.md).

## 7. Gaps (mirrors the admin console's doc 09/04 §6)

- No empty, loading, error, or skeleton states designed for any of the 82 screens.
- No Android or tablet layouts.
- No Figma variables/tokens published — needs a proper extraction pass before implementation.
- Icon library not formally confirmed as Lucide (same note as admin console).
