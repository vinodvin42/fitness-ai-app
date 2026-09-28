import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

/**
 * Creator Partner Lite's shell. Mirrors apps/gym-portal's AppShell so
 * the two partner portals stay recognisably one product, with this
 * portal's own destinations.
 *
 * The footer line is not decoration: a creator's whole relationship with
 * this product is commercial, and stating the boundary where they will
 * see it every day is cheaper than explaining it later.
 */
const NAV_ITEMS = [
  { label: "Dashboard", path: "/", glyph: "▦" },
  { label: "Campaigns", path: "/campaigns", glyph: "▣" },
  { label: "Referral tools", path: "/referral-tools", glyph: "▢" },
  { label: "Commission", path: "/commission", glyph: "◈" },
  { label: "Agreement", path: "/agreement", glyph: "◉" },
  { label: "Account", path: "/account", glyph: "◑" },
];

export function AppShell({ children, title }: { children: ReactNode; title: string }) {
  const location = useLocation();
  const { influencer, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-canvas text-text-primary">
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-border-subtle bg-surface">
        <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm font-bold text-canvas">
            FX
          </div>
          <div>
            <div className="text-sm font-semibold tracking-wide">FYNROX</div>
            <div className="text-[10px] uppercase tracking-widest text-text-dim">Creator Portal</div>
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
          Commercial data only — never a member's identity, training, food or health data.
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-[72px] items-center justify-between border-b border-border-subtle bg-canvas px-8">
          <h1 className="text-lg font-semibold">{title}</h1>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium">{influencer?.name}</div>
              <div className="text-[10px] uppercase tracking-widest text-text-dim">
                {influencer?.handle ?? "Creator"}
              </div>
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
