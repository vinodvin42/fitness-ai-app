# Roles & Permissions (RBAC)

Source: screen **12.02 Roles & Permissions** ("Role-Based Access Control (RBAC)"), node `15:358`. The screen is a two-column role manager: a left list of role cards, and a right panel that renders the **selected** role's full permission matrix. Only the **Super Admin** role was selected/visible in the reviewed frame, so its matrix below is read directly off the design; the other seven roles' cell-level permissions were not visible in this static export and are listed with their stated scope only — capture their matrices the same way (select each role card in Figma / dev mode) before treating this as final.

## 1. Roles

| Role | Stated scope (from role card) | Members shown |
|---|---|---|
| Super Admin | Full system access | 2 |
| User Operations | User management and support | 4 |
| Coach Operations | Professional verification and management | 3 |
| Finance | Revenue, transactions, settlements | 2 |
| Content | Programs, exercises, content approval | 3 |
| Growth | Influencers, referrals, campaigns | 2 |
| Analytics | Read-only analytics and reports | 2 |
| Support | Ticket management and user assistance | 5 |

Sample role assignment shown for Super Admin: **Siddharth Mehta** — Owner / Primary Admin (`siddharth@fynrox.com`); **Ananya Roy** — CTO / Technical Admin (`ananya@fynrox.io`).

The screen also exposes **"Create New Role"** and **"Edit Role Schemas"** actions, implying roles and the permission schema itself are both admin-configurable, not hardcoded.

> The UI carries an explicit disclaimer, worth preserving verbatim in the eventual implementation: *"Permissions are enforced by backend. UI visibility is supplementary, not authoritative."* — i.e. hiding a nav item or button for a role is a UX nicety; the API/backend must independently enforce every permission below.

## 2. Permission matrix — Super Admin (as designed)

Columns are actions available per module: View, Create, Edit, Delete, Export, Approve. `✓` = granted, `–` = not granted.

| Module | View | Create | Edit | Delete | Export | Approve |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Dashboard | ✓ | ✓ | – | – | ✓ | – |
| Users | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| Professionals | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Relationships | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| Programs | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Commerce | ✓ | – | – | – | ✓ | ✓ |
| Growth | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| Analytics | ✓ | – | – | – | ✓ | – |
| Support | ✓ | ✓ | ✓ | – | ✓ | – |
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Sensitive Data | ✓ | – | ✓ | – | – | ✓ |
| Audit Logs | ✓ | – | – | – | ✓ | – |

**Notable design detail:** even the Super Admin role — described on its card as "Full system access" — does **not** have blanket Create/Edit/Delete/Approve everywhere (e.g., no Delete on Dashboard/Commerce/Analytics/Audit Logs, no Approve on most modules, no Export on Sensitive Data). This reads as a deliberate least-privilege/segregation-of-duties design rather than an inconsistency, but it should be confirmed with product before being hard-coded — it directly shapes the permission model in the backend (see [09-open-questions-gaps.md](07-open-questions-gaps.md)).

## 3. Implied module list for the permission model

The permission matrix's row set is the canonical list of permission-checkable modules and does **not** map 1:1 to the 12 nav modules — note it collapses Finance into "Commerce" and adds two modules that aren't in the primary nav at all: **Admin**, **Sensitive Data**, and **Audit Logs** as their own permission scopes. Use this row list — not the sidebar — as the basis for backend permission/module enums:

`Dashboard, Users, Professionals, Relationships, Programs, Commerce, Growth, Analytics, Support, Admin, Sensitive Data, Audit Logs`

## 4. Other RBAC signals seen elsewhere in the file

- **Sensitive data gating.** The User Profile screen (02.02) locks a "Sensitive Health Metrics" panel behind a "Request Authorized Access" action, with copy stating access "requires supervisor approval" and "is logged" — this should map directly to the `Sensitive Data` row above (View/Edit/Approve only, no Export).
- **Role elevation is itself audited.** Admin Users (12.01) shows role-change text like *"Role: Support → Finance — approved by Super Admin"*, implying role assignment changes go through an approval step and are recorded in the audit trail.
- **Persistent audit indicator.** Nearly every screen's top bar shows an "Audit active/logging" pill — this is a session-level signal (the current admin's actions are being logged), separate from the Audit Logs module/permission itself.
