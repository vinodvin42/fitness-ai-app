import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

/**
 * Copies apps/admin-web's AppShell.tsx shape (fixed sidebar + fluid content
 * area, same sign-out affordance) scaled down to this portal's genuinely
 * narrow "Lite" scope — two real destinations (Dashboard, Support), not
 * the admin console's 13-module sidebar.
 */
const NAV_ITEMS = [
  { label: "Dashboard", path: "/", glyph: "▦" },
  { label: "Invite members", path: "/invite", glyph: "▢" },
  { label: "Equipment", path: "/equipment", glyph: "▣" },
  { label: "Trainer help", path: "/help", glyph: "◉" },
  { label: "Partnership", path: "/partnership", glyph: "◈" },
  { label: "Support", path: "/support", glyph: "◑" },
];

export function AppShell({ children, title }: { children: ReactNode; title: string }) {
  const location = useLocation();
  const { gym, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-canvas text-text-primary">
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-border-subtle bg-surface">
        <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm font-bold text-canvas">
            FX
          </div>
          <div>
            <div className="text-sm font-semibold tracking-wide">FYNROX</div>
            <div className="text-[10px] uppercase tracking-widest text-text-dim">Gym Partner Portal</div>
          </div>
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
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border-subtle px-4 py-3 text-[10px] text-text-dim">
          Aggregate data only — never a member list (see Support for details).
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
              Sign out
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
