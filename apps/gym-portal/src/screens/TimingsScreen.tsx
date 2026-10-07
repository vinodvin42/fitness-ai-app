import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { apiClient } from "../lib/api";
import { extractErrorMessage } from "../lib/apiError";

interface Timing {
  id: string;
  label: string;
  days: string;
  opensAt: string | null;
  closesAt: string | null;
  closed: boolean;
  kind: "regular" | "women_only" | "special";
}

const input = "rounded-md border border-border-subtle bg-canvas px-3 py-2 text-sm text-text-primary";

/** Opening hours members see under My Gym. Days: daily, a day (sun), a list (mon,wed) or a range (mon-sat). */
export function TimingsScreen() {
  const queryClient = useQueryClient();
  const key = ["gym-portal-timings"];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => apiClient.get<{ items: Timing[] }>("/gym-portal/timings").then((r) => r.data.items),
  });
  const [form, setForm] = useState({ label: "", days: "mon-sat", opensAt: "05:00", closesAt: "22:00", closed: false, kind: "regular" });
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () =>
      apiClient.post("/gym-portal/timings", {
        label: form.label,
        days: form.days,
        kind: form.kind,
        closed: form.closed,
        ...(form.closed ? {} : { opensAt: form.opensAt, closesAt: form.closesAt }),
      }),
    onSuccess: () => {
      setError(null);
      setForm({ ...form, label: "" });
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err) => setError(extractErrorMessage(err, "Couldn't save this timing.")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/gym-portal/timings/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate();
  };

  return (
    <AppShell title="Gym timings">
      <div className="max-w-2xl space-y-4">
        <div className="rounded-lg border border-border-subtle bg-surface">
          {isLoading && <p className="p-4 text-sm text-text-secondary">Loading…</p>}
          {data?.length === 0 && <p className="p-4 text-sm text-text-secondary">No timings yet. Members see "not added" until you add some.</p>}
          {data?.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0">
              <div>
                <div className="text-sm font-medium">
                  {t.label} <span className="text-xs text-text-dim">({t.days}{t.kind !== "regular" ? `, ${t.kind.replace("_", " ")}` : ""})</span>
                </div>
                <div className="text-xs text-text-secondary">{t.closed ? "Closed" : `${t.opensAt} – ${t.closesAt}`}</div>
              </div>
              <button type="button" onClick={() => remove.mutate(t.id)} className="text-xs text-danger hover:underline">
                Remove
              </button>
            </div>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3 rounded-lg border border-border-subtle bg-surface p-4">
          <h2 className="text-sm font-semibold">Add timing</h2>
          <div className="grid grid-cols-2 gap-3">
            <input className={input} placeholder="Label, e.g. Mon - Sat" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required />
            <input className={input} placeholder="Days, e.g. mon-sat" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} required />
            <input className={input} type="time" value={form.opensAt} disabled={form.closed} onChange={(e) => setForm({ ...form, opensAt: e.target.value })} />
            <input className={input} type="time" value={form.closesAt} disabled={form.closed} onChange={(e) => setForm({ ...form, closesAt: e.target.value })} />
            <select className={input} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="regular">Regular hours</option>
              <option value="women_only">Women-only hours</option>
              <option value="special">Special hours (overrides regular)</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input type="checkbox" checked={form.closed} onChange={(e) => setForm({ ...form, closed: e.target.checked })} /> Closed on these days
            </label>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button type="submit" disabled={add.isPending} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-canvas disabled:opacity-60">
            Add timing
          </button>
        </form>
      </div>
    </AppShell>
  );
}
