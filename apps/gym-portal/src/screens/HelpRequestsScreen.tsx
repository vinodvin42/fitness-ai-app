import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { StatusBadge } from "../components/StatusBadge";
import { apiClient } from "../lib/api";
import { extractErrorMessage } from "../lib/apiError";

interface HelpRequest {
  id: string;
  category: string;
  subject: string;
  body: string;
  gymReference: string | null;
  status: string;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  location: { id: string; name: string } | null;
}

interface GymLocation {
  id: string;
  name: string;
}

const CATEGORIES = [
  { value: "trainer_support", label: "Trainer support" },
  { value: "equipment", label: "Equipment" },
  { value: "member_onboarding", label: "Member onboarding" },
  { value: "billing", label: "Billing" },
  { value: "other", label: "Something else" },
];

/**
 * Trainer help requests + request detail, which the handoff lists among
 * the portal's complete-as-designed screens. DESIGN-PENDING here.
 *
 * BR-GYM-003 shapes the form: there is no member picker and no member
 * field. A gym describing a situation writes its own free-text reference
 * ("the 6am group") if it wants one. Offering a member selector would
 * make the gym expect member-level answers back, which this product
 * cannot and must not give them.
 */
export function HelpRequestsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("trainer_support");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [locationId, setLocationId] = useState("");
  const [gymReference, setGymReference] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const requests = useQuery({
    queryKey: ["gymHelpRequests"],
    queryFn: async () => (await apiClient.get<HelpRequest[]>("/gym-portal/help-requests")).data,
  });
  const locations = useQuery({
    queryKey: ["gymLocations"],
    queryFn: async () => (await apiClient.get<GymLocation[]>("/gym-portal/locations")).data,
  });

  const create = useMutation({
    mutationFn: () =>
      apiClient.post("/gym-portal/help-requests", {
        category,
        subject,
        body,
        locationId: locationId || undefined,
        gymReference: gymReference.trim() || undefined,
      }),
    onSuccess: () => {
      setSubject("");
      setBody("");
      setGymReference("");
      queryClient.invalidateQueries({ queryKey: ["gymHelpRequests"] });
    },
  });

  const rows = requests.data ?? [];

  return (
    <AppShell title={t("nav.help")}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">{t("help.yourRequests")}</h2>
          {requests.isLoading ? (
            <p className="text-sm text-text-dim">Loading…</p>
          ) : requests.isError ? (
            <p className="text-sm text-danger">
              {extractErrorMessage(requests.error, "Couldn't load your requests.")}
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-text-dim">
              {t("help.empty")}
            </p>
          ) : (
            <div className="space-y-3">
              {rows.map((r) => (
                <article key={r.id} className="rounded-lg border border-border-subtle bg-surface p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <button
                        type="button"
                        onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                        className="text-left text-sm font-medium text-text-primary hover:text-accent"
                      >
                        {r.subject}
                      </button>
                      <p className="mt-0.5 text-xs text-text-dim">
                        {CATEGORIES.find((c) => c.value === r.category)?.label ?? r.category}
                        {r.location ? ` · ${r.location.name}` : ""}
                        {r.gymReference ? ` · ${r.gymReference}` : ""}
                        {` · ${new Date(r.createdAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>

                  {expanded === r.id ? (
                    <div className="mt-3 border-t border-border-subtle pt-3">
                      <p className="whitespace-pre-wrap text-sm text-text-secondary">{r.body}</p>
                      {r.resolutionNote ? (
                        <div className="mt-3 rounded-md bg-accent/10 px-3 py-2">
                          <p className="text-xs font-medium text-accent">{t("help.replied")}</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">{r.resolutionNote}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border-subtle bg-surface p-5">
          <h2 className="text-sm font-semibold text-text-primary">{t("help.ask")}</h2>

          {create.isError ? (
            <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
              {extractErrorMessage(create.error, "Couldn't send your request.")}
            </p>
          ) : null}

          <label className="mt-4 block text-xs text-text-dim" htmlFor="help-category">
            {t("help.about")}
          </label>
          <select
            id="help-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-md border border-border-subtle bg-canvas px-3 py-2 text-sm text-text-primary"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          {(locations.data ?? []).length > 1 ? (
            <>
              <label className="mt-4 block text-xs text-text-dim" htmlFor="help-location">
                {t("help.location")}
              </label>
              <select
                id="help-location"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="mt-1 w-full rounded-md border border-border-subtle bg-canvas px-3 py-2 text-sm text-text-primary"
              >
                <option value="">{t("help.allLocations")}</option>
                {locations.data!.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}

          <label className="mt-4 block text-xs text-text-dim" htmlFor="help-subject">
            Subject
          </label>
          <input
            id="help-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            className="mt-1 w-full rounded-md border border-border-subtle bg-canvas px-3 py-2 text-sm text-text-primary"
          />

          <label className="mt-4 block text-xs text-text-dim" htmlFor="help-body">
            {t("help.need")}
          </label>
          <textarea
            id="help-body"
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
            className="mt-1 w-full rounded-md border border-border-subtle bg-canvas px-3 py-2 text-sm text-text-primary"
          />

          <label className="mt-4 block text-xs text-text-dim" htmlFor="help-ref">
            {t("help.reference")}
          </label>
          <input
            id="help-ref"
            value={gymReference}
            onChange={(e) => setGymReference(e.target.value)}
            maxLength={200}
            placeholder={t("help.referencePlaceholder")}
            className="mt-1 w-full rounded-md border border-border-subtle bg-canvas px-3 py-2 text-sm text-text-primary"
          />
          {/* Said out loud, because a gym will otherwise assume they can
              name a member and get member-level answers back. */}
          <p className="mt-1 text-[11px] text-text-dim">
            {t("help.referenceNote")}
          </p>

          <button
            type="button"
            disabled={create.isPending || subject.trim().length < 3 || body.trim().length < 10}
            onClick={() => create.mutate()}
            className="mt-5 w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-canvas disabled:opacity-40"
          >
            {t("help.send")}
          </button>
        </section>
      </div>
    </AppShell>
  );
}
