import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { AdminUserConsentsResponse, AdminUserDirectoryResponse, ConsentType } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { ADMIN_SYSTEM_SUB_NAV } from "./subNav";

const CONSENT_LABELS: Record<ConsentType, string> = {
  marketing_emails: "Marketing Emails",
  data_analytics: "Data Analytics",
  health_data_processing: "Health Data Processing",
};

async function searchUsers(search: string): Promise<AdminUserDirectoryResponse> {
  const res = await apiClient.get<AdminUserDirectoryResponse>("/admin/users", { params: { search } });
  return res.data;
}

async function fetchConsents(userId: string): Promise<AdminUserConsentsResponse> {
  const res = await apiClient.get<AdminUserConsentsResponse>(`/admin/users/${userId}/consents`);
  return res.data;
}

function fullDate(iso: string | null): string {
  if (!iso) return "Never set";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Consent Management (Wave 4, 20 Sep 2026) — closes the gap
 * `adminPrivacy.service.ts` flagged as `notAvailable: "consentManagement"`:
 * a real `Consent` model and real user-facing `GET`/`PATCH
 * /users/me/consents` endpoints (R1 Developer 1, 18 Sep 2026) existed with
 * zero admin-console visibility into which users have granted/revoked
 * what. Searchable-by-user by design (same name/email search
 * `UserDirectoryScreen.tsx` already uses against `GET /admin/users`)
 * rather than a single console-wide table — consent state is naturally a
 * per-user lookup for compliance/support purposes ("has this user opted
 * into marketing emails?"), not something an admin scans in bulk.
 *
 * Deliberately READ-ONLY — no toggle/override control here. Every other
 * place in this codebase that writes a `Consent` row is the user's own
 * choice (the mobile PrivacySettingsScreen, via `PATCH
 * /users/me/consents`); nothing in this wave's work package asked for an
 * admin to be able to grant or revoke consent on a user's behalf, and
 * doing so silently would undercut the whole point of a consent record
 * being consent. See docs/admin/07-open-questions-gaps.md's dated entry
 * for this wave for the fuller reasoning behind defaulting to read-only.
 */
export function ConsentManagementScreen() {
  const { t } = useTranslation();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const searchQuery = useQuery({
    queryKey: ["admin-consents-user-search", search],
    queryFn: () => searchUsers(search),
    enabled: search.length > 0,
  });

  const consentsQuery = useQuery({
    queryKey: ["admin-user-consents", selectedUserId],
    queryFn: () => fetchConsents(selectedUserId as string),
    enabled: !!selectedUserId,
  });

  return (
    <AppShell title={t("consentManagement.consentManagement")} subNav={ADMIN_SYSTEM_SUB_NAV}>
      <div className="space-y-4">
        <div className="rounded-lg border border-border-subtle bg-surface/50 p-4 text-xs text-text-secondary">
          Real, per-user consent state — marketing emails, data analytics, and health-data processing — exactly as
          set from that user's own Privacy Settings screen. Read-only: consent is the user's own choice everywhere
          else in this app, so nothing here can grant or revoke it on their behalf.
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
            setSelectedUserId(null);
          }}
          className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4"
        >
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            {t("consentManagement.searchForAUser")}
            <input
              type="search"
              placeholder={t("consentManagement.nameOrEmail")}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-72 rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
            disabled={!searchInput.trim()}
          >
            {t("consentManagement.search")}
          </button>
        </form>

        {searchQuery.isLoading && <p className="text-sm text-text-secondary">{t("consentManagement.searching")}</p>}

        {searchQuery.isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(searchQuery.error, "Couldn't search users.")}
          </div>
        )}

        {searchQuery.data && !selectedUserId && (
          <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-normal">{t("consentManagement.user")}</th>
                  <th className="px-4 py-3 font-normal">{t("consentManagement.email")}</th>
                  <th className="px-4 py-3 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {searchQuery.data.users.map((u) => (
                  <tr key={u.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3 text-text-primary">{u.fullName}</td>
                    <td className="px-4 py-3 text-text-dim">{u.email}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedUserId(u.id)}
                        className="text-xs text-accent hover:underline"
                      >
                        {t("consentManagement.viewConsents")}
                      </button>
                    </td>
                  </tr>
                ))}
                {searchQuery.data.users.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-text-dim">
                      No users match "{search}".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {selectedUserId && (
          <div className="rounded-lg border border-border-subtle bg-surface p-4">
            <button
              type="button"
              onClick={() => setSelectedUserId(null)}
              className="text-xs text-text-dim hover:text-text-primary"
            >
              {t("consentManagement.backToSearchResults")}
            </button>

            {consentsQuery.isLoading && <p className="mt-3 text-sm text-text-secondary">{t("consentManagement.loading")}</p>}

            {consentsQuery.isError && (
              <div className="mt-3 rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
                {extractErrorMessage(consentsQuery.error, "Couldn't load this user's consents.")}
              </div>
            )}

            {consentsQuery.data && (
              <>
                <div className="mt-3">
                  <div className="text-sm font-medium text-text-primary">{consentsQuery.data.userFullName}</div>
                  <div className="text-xs text-text-dim">{consentsQuery.data.userEmail}</div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                        <th className="px-3 py-2 font-normal">{t("consentManagement.consentType")}</th>
                        <th className="px-3 py-2 font-normal">{t("consentManagement.state")}</th>
                        <th className="px-3 py-2 font-normal">{t("consentManagement.lastUpdated")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consentsQuery.data.consents.map((c) => (
                        <tr key={c.type} className="border-b border-border-subtle last:border-0">
                          <td className="px-3 py-2 text-text-primary">{CONSENT_LABELS[c.type]}</td>
                          <td className="px-3 py-2">
                            {c.updatedAt === null ? (
                              <span className="inline-flex items-center rounded-full bg-text-dim/15 px-2.5 py-0.5 text-[11px] font-medium text-text-dim">
                                {t("consentManagement.neverSet")}
                              </span>
                            ) : c.granted ? (
                              <span className="inline-flex items-center rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-medium text-accent">
                                {t("consentManagement.granted")}
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-danger/15 px-2.5 py-0.5 text-[11px] font-medium text-danger">
                                {t("consentManagement.revoked")}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-text-dim">{fullDate(c.updatedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
