import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BRAND_MARK } from "@fitness-ai-app/config";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { GlobalSearch } from "./GlobalSearch";

/**
 * The shared shell (docs/admin/02-information-architecture.md §1) — fixed
 * 240px sidebar + fluid content area. Only "Dashboard" is a real, clickable
 * route in this first slice; the other 11 modules render as inert rows
 * (same precedent as apps/user-mobile's MoreScreen for Programs/Coaching
 * before Phase 5 existed) rather than 404-ing or being hidden entirely —
 * so the full 12-module IA is visible from day one, honestly labeled as
 * not-yet-built.
 *
 * Sidebar pattern: gap §2 in docs/admin/07-open-questions-gaps.md flags a
 * real inconsistency across the reviewed Figma screens (a rail+flyout
 * pattern on most screens vs. a rail+status-pill+second-panel pattern on
 * Finance/AI Operations) and recommends standardizing on "primary rail +
 * contextual sub-panel" since it scales better to Finance's 12
 * destinations. This slice only has one real screen, so there's no
 * sub-panel to show yet — that appears once a module (e.g. Commerce or
 * Finance) actually ships more than one screen.
 *
 * No icon library is wired in (gap §10 — Lucide is a strong visual match
 * but unconfirmed with design) — plain text/monogram glyphs stand in,
 * same precedent as apps/user-mobile's repeated plain-shape substitution
 * for unconfirmed iconography.
 *
 * **21 Aug 2026:** Professionals is the first module to ship more than one
 * screen (Directory + Profile + Credential Verification) — this is the
 * point gap §2's own comment above said the "contextual sub-panel" pattern
 * would appear. `subNav` below renders that sub-panel as a row of pills
 * under the page header, standardized on the doc's own recommendation
 * rather than the inconsistent rail+flyout vs. rail+status-pill patterns
 * the Figma review found across different modules.
 *
 * **Same day, Module 04 — Relationships:** ships Directory + Detail only
 * (Detail is a row-click drill-down, not a distinct nav destination, same
 * as Professional Profile) — no `subNav` here yet, since a single top-level
 * screen doesn't need the contextual sub-panel pattern any more than
 * Dashboard alone did. That appears once 04.03 Change/Intervention Queue
 * is built (see adminRelationships.service.ts for why it isn't yet).
 *
 * **Same day, Module 02 — Users:** same shape as Relationships — Directory
 * + Detail (a row-click drill-down), no `subNav`. See
 * adminUsers.service.ts for what's real vs. not on both screens.
 *
 * **22 Aug 2026, Module 12.01 — Admin Users:** "Admin & System" (`/admin-system`)
 * covers all 8 of Module 12's sub-screens (12.01–12.08) in the Figma, but
 * only 12.01 is built so far — rather than introduce a `subNav` for one
 * real pill (premature — see this file's own "appears once a module ships
 * more than one screen" comment above), `/admin-system` routes directly to
 * `AdminUsersScreen`, same precedent as Users/Relationships/Professionals
 * before their second screen existed.
 *
 * **Same day, Module 12.03 — Audit Logs:** the predicted trigger above
 * arrived the same day — 12.03 is Module 12's second real screen, so
 * `/admin-system` and `/admin-system/audit-logs` now share
 * `ADMIN_SYSTEM_SUB_NAV` (`screens/adminSystem/subNav.ts`), same pattern
 * as Professionals/Programs. 12.02 and 12.04–12.08 remain unbuilt — see
 * `adminAuditLogs.service.ts`'s own doc comment for 12.03's real-vs-not
 * breakdown and `docs/platform/roadmap.md` for why the rest are deferred.
 *
 * **Same day, Module 05 — Programs (Content CMS):** the second module,
 * after Professionals, to ship more than one screen from day one —
 * Programs/Exercises/Recipes (05.01/05.02/05.03) share `PROGRAMS_SUB_NAV`.
 * 05.04 Educational Content and 05.05 Review/Approval are NOT in that
 * sub-nav — they're not built this pass, see adminPrograms.service.ts's
 * own doc comment for why.
 *
 * **Same day, Module 06 — Commerce:** ships 06.02 Transactions + 06.03
 * Payments only, same Directory + Detail shape (no `subNav`) as
 * Relationships/Users before it — Transactions is a row-click drill-down
 * from Payments, not a separate nav destination. 06.01/06.04/06.05 aren't
 * built this pass, see adminPayments.service.ts's own doc comment for why.
 *
 * **25 Aug 2026:** 06.05 Pricing's Plans half ships — Commerce's second
 * nav-level screen, so it gains `COMMERCE_SUB_NAV`
 * (`screens/commerce/subNav.ts`), same trigger as every other module's
 * first `subNav` above. 06.01/06.04 and Pricing's Coupons half remain
 * unbuilt — see adminPlans.service.ts's own doc comment for why.
 *
 * **Same day, Module 12.06 — Integrations:** Admin & System's third real
 * screen, joining `ADMIN_SYSTEM_SUB_NAV`. Unlike every prior "half-real"
 * module, both rows on this screen are entirely real — this build only
 * ever wires up two external services (Razorpay, the AI provider), and
 * both already had a real status helper written for a different reason.
 * See adminIntegrations.service.ts's own doc comment for why the API Keys
 * half isn't built (no third-party-facing API key concept exists here).
 *
 * **Same day, Module 08 — Support & Safety:** ships 08.01 Support Tickets
 * only, as a single split-panel screen (list + detail both visible at
 * once, matching the Figma's own "Split panel" layout instruction) rather
 * than a separate Directory/Detail route pair — no `subNav` needed for
 * one top-level screen, same as Relationships/Users/Commerce. Picked over
 * Module 07 — Growth this cycle; see adminSupport.service.ts's own doc
 * comment for the reasoning and for why 08.02/08.03/08.04 aren't built.
 *
 * **25 Aug 2026, Module 07 — Growth:** the deferred module from the
 * comment above finally ships its one real fraction, 07.03 Referrals —
 * a single top-level screen, no `subNav` (07.01/07.02/07.04 all still
 * need new entities). See adminReferrals.service.ts's own doc comment
 * for why this was the one remaining genuinely unblocked slice in the
 * console after Modules 06/08/12.03 shipped.
 *
 * **Same day, Module 09 — Analytics:** ships 09.01 User Analytics only, a
 * single top-level screen with an in-page tab strip (not a `subNav` —
 * the tabs are sub-views of one screen/query, not separate routes) for
 * User Analytics/Training/Nutrition/Recovery/AI/Business/Geographic. The
 * first module needing NO new Prisma entity at all — see
 * adminAnalytics.service.ts's own doc comment for the full real-vs-not
 * breakdown across its 7 tabs.
 *
 * **Same day, Module 04 — Relationships:** the predicted trigger from
 * this file's own "Same day, Module 04" comment above finally arrives —
 * 04.03 Change/Intervention Queue ships, so Relationships gains
 * `RELATIONSHIPS_SUB_NAV` (`screens/relationships/subNav.ts`), same
 * pattern as every other module's first `subNav`. See
 * adminRelationships.service.ts's own doc comment for what "Approve"
 * actually does now that the queue is real.
 *
 * **Same day, Module 08 — Escalations:** the trigger predicted by this
 * file's own "Same day, Module 08" comment above finally arrives too —
 * 08.02 Escalations ships, so Support & Safety gains `SUPPORT_SUB_NAV`
 * (`screens/support/subNav.ts`) covering Support Tickets (still the
 * split panel) and the new Escalations queue. 08.03 Complaints and 08.04
 * Safety/Abuse Reports remain genuinely unbuilt — see
 * adminSupport.service.ts's own doc comment for why 08.02 turned out
 * different from those two.
 *
 * **26 Aug 2026, Module 10 — Finance:** built directly from the "one
 * ledger" architecture decision recorded in
 * reports/finance-architecture-plan.html — Finance flips from an inert
 * row to a real one, gaining `FINANCE_SUB_NAV` (`screens/finance/
 * subNav.ts`) covering 7 of the Figma's 10 screens. 10.06 Coach
 * Settlements, 10.07 Influencer Payouts, and 10.09 Bank/Payment Accounts
 * stay unbuilt — see adminFinance.service.ts's own doc comment for why.
 *
 * **27 Aug 2026, Module 11 — AI Operations:** flips from the last inert
 * row to a real one too — not the full Feature Console/Usage/Safety-
 * Overrides spec, but the scoped-down slice reports/build-plan.html's own
 * 11.01–11.03 entry named as smaller and genuinely buildable: a real
 * on/off switch for AI Coach chat. One screen, no `subNav` (same as
 * Dashboard/Growth/Analytics before they grew a second screen) — see
 * `screens/aiOps/AiCoachSettingsScreen.tsx`'s own doc comment for the
 * full real-vs-not breakdown. No module in this sidebar is still inert.
 *
 * **22 Sep 2026, Global cross-entity search (R1 Wave 6):** a dedicated
 * audit found no global search anywhere in this console — every directory
 * screen has its own local, independent search, but nothing let an admin
 * find "this user/professional/gym/campaign by name/email/id" from one
 * place. `GlobalSearch` (own file, `./GlobalSearch.tsx`) now lives in this
 * shared header — not a per-screen element, so it works from every route —
 * over the real `GET /admin/search` endpoint. See that component's and
 * adminSearch.service.ts's own doc comments for the full scope (exact/
 * prefix match only, permission-gated per entity type, Relationships
 * deliberately excluded).
 */

interface NavItem {
  label: string;
  path: string;
  glyph: string;
  builtIn: boolean;
}

interface SubNavItem {
  label: string;
  path: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/", glyph: "▦", builtIn: true },
  { label: "Users", path: "/users", glyph: "◔", builtIn: true },
  { label: "Professionals", path: "/professionals", glyph: "◈", builtIn: true },
  { label: "Relationships", path: "/relationships", glyph: "⇄", builtIn: true },
  { label: "Programs", path: "/programs", glyph: "▤", builtIn: true },
  { label: "Commerce", path: "/commerce", glyph: "◎", builtIn: true },
  { label: "Growth", path: "/growth", glyph: "↗", builtIn: true },
  { label: "Support & Safety", path: "/support", glyph: "◑", builtIn: true },
  { label: "Analytics", path: "/analytics", glyph: "▥", builtIn: true },
  { label: "Finance", path: "/finance", glyph: "◫", builtIn: true },
  { label: "AI Operations", path: "/ai-operations", glyph: "✳", builtIn: true },
  { label: "Admin & System", path: "/admin-system", glyph: "⚙", builtIn: true },
  // Gym Partner Lite (R2 Wave 4, 20 Sep 2026) — a real 13th nav destination,
  // not one of the original 12-module Figma IA this file's own top comment
  // describes. See docs/admin/07-open-questions-gaps.md's Wave 1/Wave 4
  // entries for the full Gym Partner Lite design.
  { label: "Gym Partners", path: "/gyms", glyph: "⛳", builtIn: true },
];

export function AppShell({
  children,
  title,
  subNav,
}: {
  children: ReactNode;
  title: string;
  /** Contextual sub-panel for a module with more than one screen — see this file's "21 Aug 2026" comment above. */
  subNav?: SubNavItem[];
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const { adminUser, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-canvas text-text-primary">
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-border-subtle bg-surface">
        <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm font-bold text-canvas">
            {BRAND_MARK}
          </div>
          <div>
            <div className="text-sm font-semibold tracking-wide">FYNROX</div>
            <div className="text-[10px] uppercase tracking-widest text-text-dim">{t("appShell.superAdmin")}</div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const isActive =
              location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(`${item.path}/`));
            if (!item.builtIn) {
              return (
                <div
                  key={item.path}
                  title={t("appShell.notBuiltYetSee")}
                  className="flex cursor-not-allowed items-center justify-between rounded-md px-3 py-2 text-sm text-text-dim"
                >
                  <span className="flex items-center gap-3">
                    <span className="w-4 text-center">{item.glyph}</span>
                    {item.label}
                  </span>
                  <span className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-dim">
                    {t("appShell.soon")}
                  </span>
                </div>
              );
            }
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-accent/15 font-medium text-accent"
                    : "text-text-secondary hover:bg-surface-raised hover:text-text-primary"
                }`}
              >
                <span className="w-4 text-center">{item.glyph}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border-subtle px-4 py-3">
          <div className="flex items-center gap-2 rounded-md bg-surface-raised px-2.5 py-2 text-xs text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            {t("appShell.auditLoggingActive")}
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-[72px] items-center justify-between border-b border-border-subtle bg-canvas px-8">
          <div>
            <h1 className="text-lg font-semibold">{title}</h1>
            <p className="text-xs text-text-dim">Last updated {new Date().toLocaleTimeString()}</p>
          </div>

          <div className="flex items-center gap-4">
            <GlobalSearch />
            <div className="rounded-full border border-border-subtle px-3 py-1 text-xs text-text-secondary">
              {t("appShell.allRegions")}
            </div>
            <div className="text-right">
              <div className="text-sm font-medium">{adminUser?.fullName}</div>
              <div className="text-[10px] uppercase tracking-widest text-text-dim">
                {adminUser?.role.replace(/_/g, " ")}
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:border-danger hover:text-danger"
            >
              {t("appShell.signOut")}
            </button>
          </div>
        </header>

        {subNav && subNav.length > 0 && (
          <div className="flex gap-1 border-b border-border-subtle bg-canvas px-8 py-2">
            {subNav.map((item) => {
              const isSubActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    isSubActive
                      ? "bg-accent/15 font-medium text-accent"
                      : "text-text-secondary hover:bg-surface-raised hover:text-text-primary"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}

        <main className="flex-1 overflow-y-auto px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
