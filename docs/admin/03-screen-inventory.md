# Screen Inventory — Functional Spec

All 54 screens live on a single Figma page ("Page 1") as top-level frames, 1440×1024 (or taller for scrollable dashboards), arranged in a grid by module. Node IDs are listed for quick lookup in [figma-reference/admin-web.md](../../figma-reference/admin-web.md). Table columns and tab/sub-nav labels below were read directly from each frame's layer names, not guessed.

---

## Module 01 — Dashboard

### 01.01 Executive Dashboard
**Purpose:** Single-screen operating view of the whole business for the Super Admin — the landing page after login.
**Key data:** KPI row (Total Users, Active Users, Paid Users, Active Professionals — each with a trend %); "Business Health Analytics" section with a 6-month User Growth chart, a Gross Revenue (MTD) trend chart, a Net Platform Revenue paid-conversion funnel (Free Registered → Trial Users → Converted Paid, with counts and %), and an N-day retention heatmap for churn; a "Marketplace Status" quick-link list (pending professional applications, active professionals, active coaching relationships, pending coaching requests, unassigned users pool — each with a count); a "Requires Attention" list of exceptions (failed premium payments, open refund requests, open support tickets, expiring credentials, suspended suspicious accounts) each tagged HIGH/MEDIUM/LOW with a "Review →" action.
**Primary actions:** Click through any KPI/quick-link/attention row to its owning module; no data entry on this screen.

---

## Module 02 — Users

### 02.01 User Directory
**Purpose:** Search, filter, and bulk-manage the end-user base.
**Key data (table columns):** checkbox, User & Account ID, Email Identity, Region, Status, Membership, Channel (acquisition), Registered (date), Last Sync, Actions.
**Filters:** Country, Status, Plan, Acquisition Channel, Date range.
**Primary actions:** Bulk-select rows (a bulk action bar appears with selection count + bulk actions); open a row into the User Profile.

### 02.02 User Profile
**Purpose:** 360° view of a single end user for support/ops use.
**Tabs:** Overview, Activity, Subscription, Payments, Relationships, Support History.
**Key data (Overview):** Profile metadata (phone, city, timezone, acquisition source, referral code), Subscription details (tier, billing cycle, next renewal, amount due, auto-renew toggle), Lifetime financial value (total spent, months active, avg monthly spend, payment success rate), Assigned Professionals list with status, Recent event/audit log feed, and a locked "Sensitive Health Metrics" panel requiring authorized (supervisor-approved, logged) access.
**Primary actions:** Toggle auto-renew; request authorized access to sensitive health data; navigate to assigned professionals.

---

## Module 03 — Professionals

### 03.01 Professional Directory
**Purpose:** Directory of all coaches/nutritionists with verification-state triage.
**Tabs:** All Professionals, Pending Verification, Active, Rejected, Suspended, Credentials Expiring — each tab shows a live count in the summary strip (e.g. 1,247 Active / 23 Pending / 4 Rejected / 3 Suspended / 8 Expiring).
**Key data (table columns):** checkbox, Professional (name/avatar), Region, Services (Fitness/Nutrition tags), Languages, Experience, Rating, Active Clients, Earnings (MTD), Status, Actions.
**Filters:** Region, Service type, Rating range, Experience level, free-text search.
**Primary actions:** Open a row into the Professional Profile; jump to Credential Verification for pending items.

### 03.02 Professional Profile
**Purpose:** Full record for one professional.
**Tabs:** Overview, Clients, Sessions, Earnings, Reviews, Credentials.
**Key data:** Profile card (contact/meta), performance card (activity stats grid), earnings card. Header shows status badge and star rating.
**Primary actions:** Navigate between tabs to review clients, session history, earnings, reviews, and credentials.

### 03.03 Credential Verification
**Purpose:** A dedicated approval workflow/queue for verifying professional certifications (distinct from just filtering the directory).
**Layout:** Split panel — left is a "Pending Review Queue" list (applicant name, region flag, service applied for, submitted date); right is a detail panel per applicant with one review block **per credential type** (e.g. Fitness Credential Review, Nutrition Credential Review), each showing qualification, issuing body, certificate/ID number, issue/expiry dates, an uploaded document link, and **Approve / Reject / Request Info** actions. Also includes a government KYC identity check line and an admin review notes/log field, plus a "Suspend Application" action.
**Primary actions:** Approve or reject each credential independently; request more info; suspend the whole application; all actions implied to be audit-logged.

---

## Module 04 — Relationships

The "Relationships" module manages the pairing between end users and professionals (who is coaching whom).

### 04.01 Relationship Directory
**Purpose:** List every active/past user↔professional pairing.
**Key data (table columns):** User, Professional, Service, Status, Start (date), Pricing, Sessions, Payments, Actions.
**Filters:** Service type, Status, Country, Date range picker (calendar).
**Primary actions:** Open a pairing into Relationship Detail.

### 04.02 Relationship Detail
**Purpose:** Deep dive on a single user↔professional relationship.
**Tabs:** Overview, History.
**Key data:** A visual connection block (user ↔ professional) with both parties' avatars/meta.
**Primary actions:** Review relationship history; presumably reassign/end pairing (see Change/Intervention Queue).

### 04.03 Change / Intervention Queue
**Purpose:** A moderation queue for requested changes to a pairing (e.g., reassignment requests) requiring admin sign-off.
**Key data (table columns):** User, Current (professional), Requested (new professional), Reason, Submitted (date), Status. A policy note box explains the intervention rule set.
**Primary actions:** Approve or deny a requested professional reassignment.

---

## Module 05 — Programs (Content)

Shares one sub-nav across five screens: Programs, Exercises, Recipes, Educational Content, Review/Approval. A persistent "content-approval-banner" (with an alert icon and action link) appears at the top of the Programs list, surfacing items awaiting review.

### 05.01 Programs
**Purpose:** Catalog of fitness/nutrition/combined coaching programs.
**Tabs:** Fitness Programs, Nutrition Programs, Combined Programs, Exercises, Recipes, Educational Content.
**Key data (table columns):** checkbox, Name, Creator, Type, Status, Duration, Exercises (count), Subscribers, Updated, Actions.
**Filters:** Status, Creator, Category, Date range.

### 05.02 Exercises
**Purpose:** Exercise library management.
**Key data (table columns):** checkbox, Name, Muscle (group), Equipment, Difficulty, Media, Programs (usage count), Status, Updated.
**Filters:** Muscle group, Equipment, Difficulty.

### 05.03 Recipes
**Purpose:** Recipe library management.
**Key data (table columns):** checkbox, Name, Meal Type, Calories, Prep Time, Tags, Programs (usage), Rating, Status, Updated.
**Filters:** Meal type, Diet type, Cuisine.

### 05.04 Educational Content
**Purpose:** Articles/guides/education library.
**Key data (table columns):** checkbox, Name, Type, Topic, Audience, Views, Duration, Status, Author.
**Filters:** Content type, Topic, Audience.

### 05.05 Review / Approval
**Purpose:** Unified moderation queue across all content types above.
**Tabs:** All, Pending, In Review, Approved, Rejected.
**Key data (table columns):** checkbox, Name, Type, Author, Date, Reviewer, Priority, Status, SLA, Actions.

---

## Module 06 — Commerce

Customer-facing commerce, distinct from the internal accounting suite in Finance (Module 10). Shares a `module-subnav`: Subscriptions, Transactions, Payments, Refunds, Pricing/Coupons.

### 06.01 Subscriptions
**Purpose:** Revenue/subscription overview for commerce.
**Tabs:** Revenue Dashboard, Transactions, Subscriptions, Payments, Refunds, Coach Settlements.
**Key data:** KPI row; a revenue waterfall chart (Gross → Discounts → Gateway fees → Refunds → Settlements → Net) with a legend; growth and revenue trend charts; a country-by-country revenue breakdown table.

### 06.02 Transactions
**Purpose:** Single-transaction detail/ledger view (a detail screen, not a list).
**Key data:** Transaction meta (status badge, audit notice), a ledger flow card (line items), payment details card, related-entities card, and an audit trail/timeline.

### 06.03 Payments
**Purpose:** Payment gateway operations view.
**Key data:** KPI row, gateway health indicator, filterable transaction table.

### 06.04 Refunds
**Purpose:** Refund request queue and processing.
**Key data:** KPI row, filterable table with per-row action buttons (approve/deny refund, implied).

### 06.05 Pricing / Coupons
**Purpose:** Manage subscription plans and discount coupons.
**Key data:** A plans table and a separate coupons table.

---

## Module 07 — Growth

Influencer/referral growth engine. Shares a `module-subnav`: Influencers, Influencer Detail, Referrals, Campaigns & Attribution.

### 07.01 Influencers
**Purpose:** Directory of the influencer partner program.
**Tabs:** Influencers, Referrals, Campaigns, Attribution.
**Key data (table columns):** Influencer, Code, Discount, Clicks, Registrations, Paid (conversions), Revenue, Commission, Retention, Status, Actions. Top KPI grid with sparkline cards.

### 07.02 Influencer Detail
**Purpose:** Deep dive on one influencer partner (profile summary, code badge, status, header actions).

### 07.03 Referrals
**Purpose:** Referral funnel performance.
**Key data:** A funnel visualization (step-by-step conversion with bar fills and per-step metrics) alongside referral economics.

### 07.04 Campaigns & Attribution
**Purpose:** Campaign management and multi-touch attribution.
**Key data:** KPI row, an attribution-model selector with model tabs, a conversion funnel, and a filterable campaign table.

---

## Module 08 — Support & Safety

Shares a `module-sub-nav`: Support Tickets, Escalations, Complaints, Safety/Abuse.

### 08.01 Support Tickets
**Purpose:** Primary support inbox.
**Layout:** Split panel — a filterable ticket list on the left (status/category filters, 8 sample tickets shown) and a conversation thread on the right (message bubbles, a system/shield note, and a message composer). A stats bar with quick actions sits above.

### 08.02 Escalations
**Purpose:** Tickets that have been escalated beyond first-line support.
**Key data:** Stats row + KPI cards, a filterable/actionable table.

### 08.03 Complaints
**Purpose:** Formal complaint handling.
**Layout:** Split panel — complaints list (table) on the left, a closable "dossier" detail card on the right with fact rows and resolution actions.

### 08.04 Safety / Abuse Reports
**Purpose:** Trust & safety report queue, with a severity/indicator column and stats row.

---

## Module 09 — Analytics

Read-heavy reporting module. Sub-nav labels vary slightly by screen version but consistently cover: User Analytics, Engagement (and/or Training/Nutrition/Recovery/AI/Business/Geographic tabs on some frames), Fitness & Nutrition, Business Analytics, Geographic Analytics, Unit Economics/Cohorts.

### 09.01 User Analytics
**Purpose:** User growth/behavior analytics home.
**Tabs (on-page):** User Analytics, Training, Nutrition, Recovery, AI, Business, Geographic — plus a "compare" toggle.
**Key data:** 6-KPI row with trend badges and sparklines, a two-chart row, a cohort heatmap table.

### 09.02 Engagement
**Purpose:** Engagement funnel and cohort retention.
**Key data:** Stats row, a two-chart row, a funnel card, a cohort heatmap, and a supporting data table.

### 09.03 Fitness & Nutrition
**Purpose:** Split view of training vs. nutrition engagement metrics, plus a combined recovery/AI usage card.
**Key data:** Metrics grid, top-items list, program-progress bars (training pane); engagement stats + recovery/AI card (nutrition/recovery pane).

### 09.04 Business Analytics
**Purpose:** Commercial performance analytics.
**Key data:** KPI row, a geography toggle, a take-rate donut chart with stats, a geo performance table, and bottom comparison charts (revenue share, stacked user growth).

### 09.05 Geographic Analytics
**Purpose:** Map-based regional performance view.
**Key data:** A map visualization with pins (sample: India, USA, UAE) and a legend, a KPI grid, and a supporting data table.

### 09.06 Unit Economics / Cohorts
**Purpose:** LTV/CAC and cohort economics.
**Key data:** Metric tiles with trend pills and progress bars, a ratio-highlight callout with a benchmark tag, sparkline cards, a cohort table, a donut split with a leaderboard, and a waterfall chart.

---

## Module 10 — Finance

A full back-office accounting suite, gated behind Root Admin in the sample data ("Role: Support → Finance — approved by Super Admin" appears elsewhere, implying Finance access itself is grantable/auditable). Uses a dedicated `finance-sub-nav` with header "FINANCE UNIT" — see the nav/screen mismatch noted in [09-open-questions-gaps.md](07-open-questions-gaps.md).

### 10.01 Finance Dashboard ("Financial Command Center")
**Key data:** KPI row (Total Revenue MTD, Total Expenses MTD, Net Profit MTD — highlighted, Accounts Receivable, Accounts Payable, Cash Balance); a condensed P&L statement (revenue lines, expense/deduction lines, net profit); a 6-month cash flow snapshot chart (inflow/outflow) with operating cash flow, burn rate, and runway; a "Required Financial Actions" list (pending settlements, pending payouts, overdue invoices, pending refunds) each with a count and $ amount and a "Review →" action.

### 10.02 Revenue
**Key data:** KPI row, a revenue-source donut breakdown, a trend line chart, a plan-performance table, and a region/transaction breakdown with status.

### 10.03 Expenses & Payouts
**Key data:** KPI row, an expense-proportion waterfall (coach settlements / ops / gateway / influencer / refunds), a trend chart, category-performance and transaction tables.

### 10.04 Invoices
**Key data:** KPI row, bulk/add actions, an invoice table (sample rows named like `INV-2026-089`) with status pills and pagination.

### 10.05 Receivables & Payables
**Key data:** Aging-bucket cards (with sub-descriptions and status pills), a two-column ledger (Receivables / Payables) each with its own table, and a net-position summary strip.

### 10.06 Coach Settlements
**Key data:** KPI row, an expandable-row table per coach (with a breakdown drawer showing settlement line items), and a bottom action strip with Hold/Approve actions.

### 10.07 Influencer Payouts
**Key data:** KPI row, a payouts table with a batch-approve action, and a tiers sidebar card.

### 10.08 Taxes & Compliance
**Key data:** KPI row, a tax-configuration table, a tax-liability summary, a filing calendar, and a withholding-tax ledger.

### 10.09 Bank / Payment Accounts
**Key data:** A grid of connected bank account cards (logo, name, status pill, balance, "sync" footer with a refresh action) plus a linked-accounts table with row selection.

### 10.10 Financial Reports
**Tabs:** P&L, Cash Flow, Revenue, Expense.
**Key data:** A full P&L statement panel (revenue/COGS/opex/other sections) and a ratios sidebar card.

---

## Module 11 — AI Operations

Sub-nav: AI Features & Models, AI Usage & Metrics, AI Safety/Overrides.

### 11.01 AI Features & Models ("AI Feature Management Console")
**Key data:** KPI row (Active AI Features, Total Executed Models, Avg Response Time, User Satisfaction Score); a feature-flag list, one row per AI capability (e.g. "FitGPT Workout Plan Generator" on GPT-4o Mini v2, "PrimeVision Photo Diet Log" on Claude 3.5 Sonnet, "AI Health Score Forecaster" on a proprietary model, "Acoustic Sleep Coach Voice" on ElevenLabs TTS-1), each showing a gradual-rollout % bar, latency, error rate, target countries, a status badge (Active/Beta/Disabled), and an on/off toggle.
**Primary actions:** Toggle a feature on/off; adjust rollout percentage (implied by the slider).

### 11.02 AI Usage & Metrics
**Key data:** KPI row, growth/line chart, area chart, and a usage table.

### 11.03 AI Safety / Overrides
**Key data:** KPI row, a flagged-content/safety table with an alert badge, and an "overrides" log list showing correction details.

---

## Module 12 — Admin & System

Sub-nav (8 items, consistent across the module): Admin Users, Roles & Permissions, Audit Logs, Privacy & Data Governance, Security, Integrations, Notifications, Platform Settings.

### 12.01 Admin Users
**Key data:** A security summary strip, filters (role, status, search), and a table of internal admin accounts with role badges; an "Invite" action; pagination.

### 12.02 Roles & Permissions ("Role-Based Access Control (RBAC)")
**Layout:** Two columns — a left stack of role cards (Super Admin, User Operations, Coach Operations, Finance, Content, Growth, Analytics, Support), each with a description and member count; a right panel showing the selected role's full permission matrix (module rows × View/Create/Edit/Delete/Export/Approve columns) plus a role-assignment list of members. A "Create New Role" and "Edit Role Schemas" action are present. Footnote: *"Permissions are enforced by backend. UI visibility is supplementary, not authoritative."* See full matrix in [05-roles-permissions.md](05-roles-permissions.md).

### 12.03 Audit Logs
**Key data:** A filterable, paginated log table with an export action and a lock icon signaling immutability.

### 12.04 Privacy & Data Governance
**Key data:** KPI row, a consent-management card/table, a DSAR (data subject access request) card, and a data-retention card.

### 12.05 Security
**Key data:** KPI row, a security-events table, and a security-config card (2FA, password policy, session settings — inferred from input fields).

### 12.06 Integrations
**Key data:** A connected-integrations table and an API keys card.

### 12.07 Notifications
**Key data:** A notification-templates card/table and a notification-gateways list (email/SMS/push providers, inferred).

### 12.08 Platform Settings
**Layout:** Left settings-nav (General, Security, Notifications, Integrations, Billing, API, Localization) + right settings cards (platform config fields, subscription defaults, professional and coaching toggles) with a Discard/Save bar.
