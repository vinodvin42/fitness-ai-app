import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { BrandLockup } from "./BrandLockup";

/**
 * Copies apps/admin-web's AppShell.tsx shape (fixed sidebar + fluid content
 * area, same sign-out affordance) scaled down to this portal's genuinely
 * narrow "Lite" scope — two real destinations (Dashboard, Support), not
 * the admin console's 13-module sidebar.
 */
// Keys, not labels — this array is module-level and evaluated once at
// import, so a translated string in it would freeze whichever language
// was active when the module first loaded.
const NAV_ITEMS = [
  { key: "dashboard", path: "/", glyph: "▦" },
  { key: "invite", path: "/invite", glyph: "▢" },
  { key: "equipment", path: "/equipment", glyph: "▣" },
  { key: "help", path: "/help", glyph: "◉" },
  { key: "partnership", path: "/partnership", glyph: "◈" },
  { key: "support", path: "/support", glyph: "◑" },
];

export function AppShell({ children, title }: { children: ReactNode; title: string }) {
  const { t } = useTranslation();
  const location = useLocation();
  const { gym, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-canvas text-text-primary">
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-border-subtle bg-surface">
        <div className="flex items-center border-b border-border-subtle px-5 py-5">
          <BrandLockup subtitle={t("shell.portalName")} />
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path;
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
                {t(`nav.${item.key}`)}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border-subtle px-4 py-3 text-[10px] text-text-dim">
          {t("shell.aggregateOnly")}
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-[72px] items-center justify-between border-b border-border-subtle bg-canvas px-8">
          <div>
            <h1 className="text-lg font-semibold">{title}</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium">{gym?.name}</div>
              <div className="text-[10px] uppercase tracking-widest text-text-dim">{gym?.contactName}</div>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:border-danger hover:text-danger"
            >
              {t("shell.signOut")}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
