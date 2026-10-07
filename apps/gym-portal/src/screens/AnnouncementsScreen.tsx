import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { apiClient } from "../lib/api";
import { extractErrorMessage } from "../lib/apiError";

interface Announcement {
  id: string;
  title: string;
  body: string;
  kind: "holiday" | "notice";
  postedAt: string;
  expiresAt: string | null;
}

const input = "w-full rounded-md border border-border-subtle bg-canvas px-3 py-2 text-sm text-text-primary";

/** Notices shown to linked members on My Gym until they expire. */
export function AnnouncementsScreen() {
  const queryClient = useQueryClient();
  const key = ["gym-portal-announcements"];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => apiClient.get<{ items: Announcement[] }>("/gym-portal/announcements").then((r) => r.data.items),
  });
  const [form, setForm] = useState({ title: "", body: "", kind: "notice", expiresAt: "" });
  const [error, setError] = useState<string | null>(null);

  const post = useMutation({
    mutationFn: () =>
      apiClient.post("/gym-portal/announcements", {
        title: form.title,
        body: form.body,
        kind: form.kind,
        ...(form.expiresAt ? { expiresAt: new Date(form.expiresAt).toISOString() } : {}),
      }),
    onSuccess: () => {
      setError(null);
      setForm({ title: "", body: "", kind: "notice", expiresAt: "" });
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err) => setError(extractErrorMessage(err, "Couldn't post this announcement.")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/gym-portal/announcements/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    post.mutate();
  };
  const now = Date.now();

  return (
    <AppShell title="Announcements">
      <div className="max-w-2xl space-y-4">
        <form onSubmit={submit} className="space-y-3 rounded-lg border border-border-subtle bg-surface p-4">
          <h2 className="text-sm font-semibold">Post an announcement</h2>
          <input className={input} placeholder="Title, e.g. Holiday update" value={form.title} maxLength={100} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <textarea className={input} rows={3} placeholder="Message members will see" value={form.body} maxLength={500} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
          <div className="flex items-center gap-3">
            <select className={input} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="notice">Notice</option>
              <option value="holiday">Holiday</option>
            </select>
            <label className="flex items-center gap-2 whitespace-nowrap text-xs text-text-secondary">
              Hide after
              <input className={input} type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
            </label>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button type="submit" disabled={post.isPending} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-canvas disabled:opacity-60">
            Post
          </button>
        </form>

        <div className="rounded-lg border border-border-subtle bg-surface">
          {isLoading && <p className="p-4 text-sm text-text-secondary">Loading…</p>}
          {data?.length === 0 && <p className="p-4 text-sm text-text-secondary">Nothing posted yet.</p>}
          {data?.map((a) => {
            const expired = a.expiresAt !== null && new Date(a.expiresAt).getTime() <= now;
            return (
              <div key={a.id} className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0">
                <div>
                  <div className="text-sm font-medium">
                    {a.title} <span className="text-xs text-text-dim">({a.kind})</span>{" "}
                    {expired && <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] text-text-dim">expired</span>}
                  </div>
                  <div className="text-xs text-text-secondary">{a.body}</div>
                  <div className="text-[11px] text-text-dim">
                    Posted {new Date(a.postedAt).toLocaleString()}
                    {a.expiresAt ? ` · hides ${new Date(a.expiresAt).toLocaleString()}` : ""}
                  </div>
                </div>
                <button type="button" onClick={() => remove.mutate(a.id)} className="text-xs text-danger hover:underline">
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
