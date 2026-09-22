import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { AdminSearchResponse, AdminSearchResultItem, AdminSearchResultType } from "@fitness-ai-app/types";
import { apiClient } from "../lib/api";
import { extractErrorMessage } from "../lib/apiError";

/**
 * Global cross-entity admin search (R1 Wave 6, 22 Sep 2026) — the real
 * search element this wave's own audit found missing: every directory
 * screen (Users/Professionals/Gyms/Campaigns/Relationships) had its own
 * local, independent search, but there was no single place to find "this
 * user/professional/gym/campaign by name/email/id" from anywhere in the
 * console. Lives in AppShell's persistent header (rendered once, not
 * per-screen) over the real `GET /admin/search` endpoint — see
 * adminSearch.service.ts's own doc comment for the backend scope
 * (exact/prefix match only, permission-gated per entity type, no
 * Relationship results).
 *
 * Debounced (250ms) rather than firing on every keystroke — plain
 * setTimeout, no shared debounce utility exists elsewhere in this codebase
 * to reuse. No keyboard-shortcut-to-focus (out of scope this wave, per the
 * work package's own "skip unless trivially easy" — a real global key
 * listener that doesn't collide with browser/OS shortcuts and every other
 * screen's own key handling is not a trivial addition).
 */

const TYPE_LABELS: Record<AdminSearchResultType, string> = {
  user: "Users",
  professional: "Professionals",
  gym: "Gyms",
  campaign: "Campaigns",
};
const TYPE_ORDER: AdminSearchResultType[] = ["user", "professional", "gym", "campaign"];

async function fetchSearch(q: string): Promise<AdminSearchResponse> {
  const res = await apiClient.get<AdminSearchResponse>("/admin/search", { params: { q } });
  return res.data;
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(inputValue.trim()), 250);
    return () => clearTimeout(handle);
  }, [inputValue]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-global-search", debouncedQuery],
    queryFn: () => fetchSearch(debouncedQuery),
    enabled: debouncedQuery.length > 0,
  });

  function goTo(result: AdminSearchResultItem) {
    setIsOpen(false);
    setInputValue("");
    setDebouncedQuery("");
    navigate(result.path);
  }

  const groups = TYPE_ORDER.map((type) => ({
    type,
    label: TYPE_LABELS[type],
    items: (data?.results ?? []).filter((r) => r.type === type),
  })).filter((g) => g.items.length > 0);

  const showPanel = isOpen && debouncedQuery.length > 0;

  return (
    <div ref={containerRef} className="relative w-72">
      <input
        type="search"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder="Search users, professionals, gyms, campaigns…"
        className="w-full rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
      />

      {showPanel && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-50 max-h-96 w-96 overflow-y-auto rounded-lg border border-border-subtle bg-surface shadow-lg">
          {isLoading && <div className="px-4 py-3 text-xs text-text-secondary">Searching…</div>}

          {isError && (
            <div className="px-4 py-3 text-xs text-danger">
              {extractErrorMessage(error, "Couldn't search right now.")}
            </div>
          )}

          {!isLoading && !isError && groups.length === 0 && (
            <div className="px-4 py-3 text-xs text-text-dim">
              No matches for "{debouncedQuery}".
            </div>
          )}

          {!isLoading &&
            !isError &&
            groups.map((group) => (
              <div key={group.type} className="border-b border-border-subtle last:border-0">
                <div className="px-4 pt-2 text-[10px] uppercase tracking-widest text-text-dim">{group.label}</div>
                <div className="pb-1">
                  {group.items.map((item) => (
                    <button
                      key={`${item.type}-${item.id}`}
                      type="button"
                      onClick={() => goTo(item)}
                      className="flex w-full flex-col items-start px-4 py-1.5 text-left text-xs hover:bg-surface-raised"
                    >
                      <span className="font-medium text-text-primary">{item.label}</span>
                      {item.sublabel && <span className="text-text-dim">{item.sublabel}</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
