import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { apiClient } from "../lib/api";
import { extractErrorMessage } from "../lib/apiError";

interface Equipment {
  id: string;
  name: string;
  category: string;
  exerciseKeyword: string | null;
  quantity: number | null;
  available: boolean;
  availabilityUpdatedAt: string;
}

// Same values as the app's exercise library "equipment" field.
const CATEGORIES = ["Machine", "Cable machine", "Barbell", "Dumbbell", "Kettlebell", "Resistance band", "Bench", "Pull-up bar", "Treadmill", "Rowing machine", "Exercise bike"];
const input = "rounded-md border border-border-subtle bg-canvas px-3 py-2 text-sm text-text-primary";

/** Equipment list and availability. Members' workouts avoid anything marked unavailable. */
export function EquipmentScreen() {
  const queryClient = useQueryClient();
  const key = ["gym-portal-equipment"];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => apiClient.get<{ items: Equipment[] }>("/gym-portal/equipment").then((r) => r.data.items),
  });
  const [form, setForm] = useState({ name: "", category: "Machine", exerciseKeyword: "" });
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () =>
      apiClient.post("/gym-portal/equipment", {
        name: form.name,
        category: form.category,
        ...(form.exerciseKeyword.trim() ? { exerciseKeyword: form.exerciseKeyword.trim() } : {}),
      }),
    onSuccess: () => {
      setError(null);
      setForm({ ...form, name: "", exerciseKeyword: "" });
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err) => setError(extractErrorMessage(err, "Couldn't add this equipment.")),
  });
  const toggle = useMutation({
    mutationFn: (e: Equipment) => apiClient.patch(`/gym-portal/equipment/${e.id}`, { available: !e.available }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/gym-portal/equipment/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate();
  };

  return (
    <AppShell title="Equipment">
      <div className="max-w-2xl space-y-4">
        <div className="rounded-lg border border-border-subtle bg-surface">
          {isLoading && <p className="p-4 text-sm text-text-secondary">Loading…</p>}
          {data?.length === 0 && <p className="p-4 text-sm text-text-secondary">No equipment listed yet.</p>}
          {data?.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0">
              <div>
                <div className="text-sm font-medium">{e.name}</div>
                <div className="text-xs text-text-dim">
                  {e.category}
                  {e.exerciseKeyword ? ` · exercises matching "${e.exerciseKeyword}"` : ""} · updated{" "}
                  {new Date(e.availabilityUpdatedAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggle.mutate(e)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${e.available ? "bg-accent/15 text-accent" : "bg-danger/15 text-danger"}`}
                >
                  {e.available ? "Available" : "Not available"}
                </button>
                <button type="button" onClick={() => remove.mutate(e.id)} className="text-xs text-text-dim hover:text-danger">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3 rounded-lg border border-border-subtle bg-surface p-4">
          <h2 className="text-sm font-semibold">Add equipment</h2>
          <div className="grid grid-cols-3 gap-3">
            <input className={input} placeholder="Name, e.g. Rowing machine" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <select className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input className={input} placeholder='Applies to names containing (optional), e.g. "row"' value={form.exerciseKeyword} onChange={(e) => setForm({ ...form, exerciseKeyword: e.target.value })} />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button type="submit" disabled={add.isPending} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-canvas disabled:opacity-60">
            Add equipment
          </button>
        </form>
      </div>
    </AppShell>
  );
}
