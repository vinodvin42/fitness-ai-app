/**
 * Shared contextual sub-panel for Module 12 — Admin & System, added 22 Aug
 * 2026 once a second real screen (12.03 Audit Logs) joined 12.01 Admin
 * Users — see AppShell.tsx's own doc comment for why `/admin-system`
 * routed directly to `AdminUsersScreen` (no `subNav`) before this.
 *
 * This folder was renamed from `screens/adminAccounts/` (this pass) to
 * `screens/adminSystem/` to match every other module's "one screens
 * folder per Figma module" convention (`programs/`, `commerce/`,
 * `support/`, ...) now that it holds more than one Module 12 screen. The
 * backend module `apps/api/src/modules/adminAccounts` keeps its name —
 * that's specifically the 12.01 admin-account-management service, a
 * different, narrower concern than "everything under Module 12".
 *
 * **25 Aug 2026:** 12.06 Integrations joins as the third real screen — see
 * `adminIntegrations.service.ts`'s own doc comment.
 *
 * **Same day, later:** 12.05 Security joins as the fourth — see
 * `SecurityScreen.tsx`'s own doc comment for why only password-change is
 * real (added the same pass as `PATCH /admin/auth/password` itself, once
 * that endpoint existed with no UI calling it).
 *
 * **26 Aug 2026:** 12.02 Roles & Permissions (read-only) and 12.04
 * Privacy & Data Governance join as the fifth and sixth real screens —
 * see `RolesPermissionsScreen.tsx`/`adminRoles.service.ts` and
 * `PrivacyScreen.tsx`/`adminPrivacy.service.ts`'s own doc comments. Only
 * 12.07 Notifications and 12.08 Platform Settings remain unbuilt now —
 * see docs/platform/roadmap.md.
 *
 * Order below matches the Figma's own Module 12 sub-nav order
 * (docs/admin/03-screen-inventory.md's Module 12 header) for the screens
 * that exist, rather than build order.
 */
export const ADMIN_SYSTEM_SUB_NAV = [
  { label: "Admin Users", path: "/admin-system" },
  { label: "Roles & Permissions", path: "/admin-system/roles" },
  { label: "Audit Logs", path: "/admin-system/audit-logs" },
  { label: "Privacy & Data Governance", path: "/admin-system/privacy" },
  { label: "Security", path: "/admin-system/security" },
  { label: "Integrations", path: "/admin-system/integrations" },
];
