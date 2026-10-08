import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { StatusBadge } from "../components/StatusBadge";
import { apiClient } from "../lib/api";
import { extractErrorMessage } from "../lib/apiError";

interface GymLocation {
  id: string;
  name: string;
  address: string;
  equipment: string | null;
  equipmentConfirmedAt: string | null;
  equipmentStale: boolean;
  hasEquipmentProfile: boolean;
}

/**
 * Equipment profile, with the spec's CURRENT -> STALE -> CURRENT cycle
 * (§10 "Equipment profile", and the portal's own "stale equipment ->
 * reconfirm" screen).
 *
 * DESIGN-PENDING — no Figma for this portal's inner screens.
 *
 * Why this screen matters beyond bookkeeping: the equipment list is what
 * a member's generated plan is built against. A year-old list quietly
 * produces programmes for racks the gym no longer has, and the member
 * blames the app. Confirming is therefore a first-class action, separate
 * from editing, so a gym with unchanged kit can clear the warning
 * honestly in one click rather than retyping to make it go away.
 */
export function EquipmentScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const locations = useQuery({
    queryKey: ["gymLocations"],
    queryFn: async () => (await apiClient.get<GymLocation[]>("/gym-portal/locations")).data,
  });

  useEffect(() => {
    if (!locations.data) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const l of locations.data) {
        if (next[l.id] === undefined) next[l.id] = l.equipment ?? "";
      }
      return next;
    });
  }, [locations.data]);

  const save = useMutation({
    mutationFn: ({ id, equipment }: { id: string; equipment: string }) =>
      apiClient.patch(`/gym-portal/locations/${id}/equipment`, { equipment }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["gymLocations"] }),
  });

  const reconfirm = useMutation({
    mutationFn: (id: string) => apiClient.post(`/gym-portal/locations/${id}/equipment/reconfirm`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["gymLocations"] }),
  });

  return (
    <AppShell title={t("nav.equipment")}>
      <p className="mb-5 max-w-2xl text-sm text-text-secondary">
        {t("equipment.why")}
      </p>

      {save.isError ? (
        <p className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {extractErrorMessage(save.error, "Couldn't save the equipment list.")}
        </p>
      ) : null}

      {locations.isLoading ? (
        <p className="text-sm text-text-dim">Loading…</p>
      ) : locations.isError ? (
        <p className="text-sm text-danger">{extractErrorMessage(locations.error, "Couldn't load your locations.")}</p>
      ) : (locations.data ?? []).length === 0 ? (
        <p className="text-sm text-text-dim">
          {t("equipment.noLocations")}
        </p>
      ) : (
        <div className="space-y-5">
          {locations.data!.map((l) => (
            <section key={l.id} className="rounded-lg border border-border-subtle bg-surface p-5">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">{l.name}</h2>
                  <p className="text-xs text-text-dim">{l.address}</p>
                </div>
                <div className="text-right">
                  <StatusBadge status={l.equipmentStale ? "stale" : "current"} />
                  <p className="mt-1 text-[11px] text-text-dim">
                    {l.equipmentConfirmedAt
                      ? `Confirmed ${new Date(l.equipmentConfirmedAt).toLocaleDateString()}`
                      : "Never confirmed"}
                  </p>
                </div>
              </div>

              {/* Stated plainly rather than as a nag: the gym should know
                  what the consequence is, not just that a badge is amber. */}
              {l.equipmentStale ? (
                <p className="mb-3 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                  {l.hasEquipmentProfile
                    ? "This list hasn't been confirmed recently. Until it is, plans may be built around kit you no longer have."
                    : "No equipment listed yet, so plans for your members assume a basic setup."}
                </p>
              ) : null}

              <label className="mb-1 block text-xs text-text-dim" htmlFor={`equipment-${l.id}`}>
                {t("equipment.atLocation")}
              </label>
              <textarea
                id={`equipment-${l.id}`}
                rows={4}
                value={drafts[l.id] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [l.id]: e.target.value }))}
                placeholder={t("equipment.placeholder")}
                className="w-full rounded-md border border-border-subtle bg-canvas px-3 py-2 text-sm text-text-primary"
              />

              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  disabled={save.isPending || !(drafts[l.id] ?? "").trim()}
                  onClick={() => save.mutate({ id: l.id, equipment: drafts[l.id] })}
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-canvas disabled:opacity-40"
                >
                  {t("equipment.save")}
                </button>
                {l.hasEquipmentProfile ? (
                  <button
                    type="button"
                    disabled={reconfirm.isPending}
                    onClick={() => reconfirm.mutate(l.id)}
                    className="rounded-md border border-border-subtle px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary disabled:opacity-40"
                  >
                    {t("equipment.stillAccurate")}
                  </button>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
