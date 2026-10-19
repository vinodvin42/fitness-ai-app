import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminArticleDetailResponse,
  AdminArticleListItem,
  AdminArticleListResponse,
  AdminCreateArticleInput,
  ArticleAudience,
  ArticleTopic,
} from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { PROGRAMS_SUB_NAV } from "./subNav";

export const TOPIC_LABELS: Record<ArticleTopic, string> = {
  training: "Training",
  nutrition: "Nutrition",
  recovery: "Recovery",
  sleep: "Sleep",
  mindset: "Mindset",
};

const AUDIENCE_LABELS: Record<ArticleAudience, string> = {
  everyone: "Everyone",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const INPUT_CLASS =
  "rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent disabled:opacity-60";

type Draft = { title: string; summary: string; body: string; topic: ArticleTopic; audience: ArticleAudience; coverImageUrl: string };
const EMPTY_DRAFT: Draft = { title: "", summary: "", body: "", topic: "training", audience: "everyone", coverImageUrl: "" };

/** Renders the article body format: blank-line paragraphs, "## " headings, "- " bullets. */
export function ArticleBodyPreview({ body }: { body: string }) {
  const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-3 text-sm leading-6 text-text-primary">
      {blocks.map((block, i) => {
        if (block.startsWith("## ")) return <h3 key={i} className="text-base font-semibold">{block.slice(3)}</h3>;
        const lines = block.split("\n");
        if (lines.every((l) => l.trim().startsWith("- "))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => <li key={j}>{l.trim().slice(2)}</li>)}
            </ul>
          );
        }
        return <p key={i} className="whitespace-pre-wrap">{block}</p>;
      })}
    </div>
  );
}

function reviewLabel(a: AdminArticleListItem): string {
  if (a.status === "published") return "Published";
  if (a.reviewStatus === "pending") return "Awaiting review";
  if (a.reviewStatus === "rejected") return "Changes requested";
  return "Draft";
}

/**
 * 05.04 Educational Content (docs/admin/03-screen-inventory.md §05.04), Oct
 * 2026 — the app's Learn library (GET/POST/PATCH /admin/articles; see
 * adminPrograms.service.ts). Articles are health information, so there is no
 * Publish button here: "Submit for review" sends a draft to 05.05 Review /
 * Approval, where a different admin approves it and names the expert who
 * checked it. A published article's text is locked (unpublish to edit), and
 * editing a draft's text clears an earlier sign-off. No articles are seeded.
 */
export function EducationalContentScreen() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("id");
  const creating = params.get("new") === "1";
  const [status, setStatus] = useState<"" | "draft" | "published">("");
  const [topic, setTopic] = useState<ArticleTopic | "">("");
  const [audience, setAudience] = useState<ArticleAudience | "">("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const list = useQuery({
    queryKey: ["admin-articles", status, topic, audience, search],
    queryFn: () =>
      apiClient
        .get<AdminArticleListResponse>("/admin/articles", {
          params: { status: status || undefined, topic: topic || undefined, audience: audience || undefined, search: search || undefined },
        })
        .then((r) => r.data),
  });

  const open = (id: string | null, isNew = false) => {
    const next = new URLSearchParams();
    if (id) next.set("id", id);
    if (isNew) next.set("new", "1");
    setParams(next);
  };

  return (
    <AppShell title="Educational Content" subNav={PROGRAMS_SUB_NAV}>
      <div className="space-y-4">
        {list.data && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Articles" value={list.data.stats.total} hint={`${list.data.stats.drafts} drafts`} />
            <StatCard label="Published" value={list.data.stats.published} hint={`${list.data.stats.awaitingReview} awaiting review`} />
            <StatCard
              label="Avg views per article"
              value={list.data.stats.avgViewsPerPublished ?? "—"}
              hint={`${list.data.stats.views} opens in the app`}
            />
            <StatCard
              label="Top topic"
              value={list.data.stats.topTopic ? TOPIC_LABELS[list.data.stats.topTopic.topic] : "—"}
              hint={list.data.stats.topTopic ? `${list.data.stats.topTopic.views} views` : "No views yet"}
            />
          </div>
        )}

        <div className="rounded-lg border border-border-subtle bg-surface/50 p-4 text-xs text-text-secondary">
          Articles appear in the app's Learn library. They're health information, so each one is published only through{" "}
          <Link to="/programs/review-queue" className="text-accent hover:underline">
            Review/Approval
          </Link>
          : a different admin approves it and records the expert who checked it, which members see as "Reviewed by …". The Learn entry
          shows in the app once at least one article is published.
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={INPUT_CLASS}>
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Topic
            <select value={topic} onChange={(e) => setTopic(e.target.value as ArticleTopic | "")} className={INPUT_CLASS}>
              <option value="">All</option>
              {(Object.keys(TOPIC_LABELS) as ArticleTopic[]).map((k) => (
                <option key={k} value={k}>{TOPIC_LABELS[k]}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Audience
            <select value={audience} onChange={(e) => setAudience(e.target.value as ArticleAudience | "")} className={INPUT_CLASS}>
              <option value="">All</option>
              {(Object.keys(AUDIENCE_LABELS) as ArticleAudience[]).map((k) => (
                <option key={k} value={k}>{AUDIENCE_LABELS[k]}</option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs text-text-dim">
            Search
            <input type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Title or summary" className={INPUT_CLASS} />
          </label>
          <button type="button" onClick={() => open(null, true)} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas">
            New article
          </button>
        </div>

        {list.isLoading && <p className="text-sm text-text-secondary">Loading…</p>}
        {list.isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(list.error, "Couldn't load articles.")}
            <button type="button" onClick={() => list.refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {list.data && (
          <div className={`grid gap-4 ${selectedId || creating ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" : ""}`}>
            <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
              {list.data.articles.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-text-dim">
                  {list.data.stats.total === 0 ? "No articles yet. Your team writes them; none are pre-loaded." : "No articles match these filters."}
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-medium">Title</th>
                      <th scope="col" className="px-4 py-2 font-medium">Topic</th>
                      <th scope="col" className="px-4 py-2 font-medium">Audience</th>
                      <th scope="col" className="px-4 py-2 font-medium">Views</th>
                      <th scope="col" className="px-4 py-2 font-medium">Read</th>
                      <th scope="col" className="px-4 py-2 font-medium">Status</th>
                      <th scope="col" className="px-4 py-2 font-medium">Author</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.articles.map((a) => (
                      <tr key={a.id} className={`border-b border-border-subtle last:border-0 ${selectedId === a.id ? "bg-surface-raised" : "hover:bg-surface-raised"}`}>
                        <td className="px-4 py-2.5 align-top">
                          <button type="button" onClick={() => open(a.id)} aria-current={selectedId === a.id ? "true" : undefined} className="text-left text-accent hover:underline">
                            {a.title}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 align-top text-xs text-text-secondary">{TOPIC_LABELS[a.topic]}</td>
                        <td className="px-4 py-2.5 align-top text-xs text-text-secondary">{AUDIENCE_LABELS[a.audience]}</td>
                        <td className="px-4 py-2.5 align-top text-xs text-text-secondary">{a.viewCount}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 align-top text-xs text-text-secondary">{a.readMinutes} min</td>
                        <td className="px-4 py-2.5 align-top text-xs">
                          <StatusBadge status={a.status} />
                          {a.status === "draft" && (a.reviewStatus === "pending" || a.reviewStatus === "rejected") && (
                            <span className="mt-0.5 block text-[11px] text-text-dim">{reviewLabel(a)}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 align-top text-xs text-text-secondary">{a.authorName ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {(selectedId || creating) && (
              <div className="rounded-lg border border-border-subtle bg-surface p-4">
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => open(null)}
                    aria-label="Close the editor"
                    className="rounded-md px-2 py-0.5 text-sm text-text-dim hover:bg-surface-raised hover:text-text-primary"
                  >
                    ✕
                  </button>
                </div>
                {creating ? (
                  <ArticleEditor
                    key="new"
                    onSaved={(id) => open(id)}
                  />
                ) : (
                  <ArticleDetail key={selectedId} id={selectedId as string} />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ArticleDetail({ id }: { id: string }) {
  const detail = useQuery({
    queryKey: ["admin-article", id],
    queryFn: () => apiClient.get<AdminArticleDetailResponse>(`/admin/articles/${id}`).then((r) => r.data),
  });
  if (detail.isLoading) return <p className="text-sm text-text-secondary">Loading…</p>;
  if (detail.isError || !detail.data) return <p className="text-sm text-danger">{extractErrorMessage(detail.error, "Couldn't load this article.")}</p>;
  return <ArticleEditor existing={detail.data} />;
}

function ArticleEditor({ existing, onSaved }: { existing?: AdminArticleDetailResponse; onSaved?: (id: string) => void }) {
  const queryClient = useQueryClient();
  const article = existing?.article;
  const [draft, setDraft] = useState<Draft>(
    article
      ? { title: article.title, summary: article.summary, body: article.body, topic: article.topic, audience: article.audience, coverImageUrl: article.coverImageUrl ?? "" }
      : EMPTY_DRAFT,
  );
  const [preview, setPreview] = useState(false);

  const published = article?.status === "published";
  const pending = article?.reviewStatus === "pending";
  const textLocked = published || pending;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-articles"] });
    if (article) queryClient.invalidateQueries({ queryKey: ["admin-article", article.id] });
  };

  const save = useMutation({
    mutationFn: () => {
      const body: AdminCreateArticleInput = {
        title: draft.title.trim(),
        summary: draft.summary.trim(),
        body: draft.body.trim(),
        topic: draft.topic,
        audience: draft.audience,
        coverImageUrl: draft.coverImageUrl.trim() || null,
      };
      if (!article) return apiClient.post<{ article: AdminArticleListItem }>("/admin/articles", body);
      // Send only what changed, so metadata edits work on a locked article.
      const changed: Partial<AdminCreateArticleInput> = {};
      (Object.keys(body) as (keyof AdminCreateArticleInput)[]).forEach((k) => {
        const before = k === "coverImageUrl" ? article.coverImageUrl : article[k as Exclude<keyof AdminCreateArticleInput, "coverImageUrl">];
        if (body[k] !== before) (changed as Record<string, unknown>)[k] = body[k];
      });
      return apiClient.patch<{ article: AdminArticleListItem }>(`/admin/articles/${article.id}`, changed);
    },
    onSuccess: (res) => {
      refresh();
      onSaved?.(res.data.article.id);
    },
  });
  const submit = useMutation({
    mutationFn: () => apiClient.post(`/admin/articles/${article!.id}/submit-review`),
    onSuccess: refresh,
  });
  const unpublish = useMutation({
    mutationFn: () => apiClient.post(`/admin/articles/${article!.id}/unpublish`),
    onSuccess: refresh,
  });

  const dirty =
    !article ||
    draft.title.trim() !== article.title ||
    draft.summary.trim() !== article.summary ||
    draft.body.trim() !== article.body ||
    draft.topic !== article.topic ||
    draft.audience !== article.audience ||
    (draft.coverImageUrl.trim() || null) !== article.coverImageUrl;
  const valid = draft.title.trim().length >= 3 && draft.summary.trim().length >= 10 && draft.body.trim().length >= 50;
  const words = draft.body.trim().split(/\s+/).filter(Boolean).length;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const error = save.error ?? submit.error ?? unpublish.error;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-medium text-text-primary">{article ? article.title : "New article"}</h2>
        {article && (
          <p className="mt-1 text-xs text-text-dim">
            {reviewLabel(article)} · {article.viewCount} views · updated {new Date(article.updatedAt).toLocaleString()}
          </p>
        )}
      </div>

      {article?.expertReviewer && (
        <div className="rounded-md border border-border-subtle p-3 text-xs text-text-secondary">
          Reviewed by <span className="text-text-primary">{article.expertReviewer.name}</span>
          {article.expertReviewer.credentials ? `, ${article.expertReviewer.credentials}` : ""} on{" "}
          {new Date(article.expertReviewer.reviewedAt).toLocaleDateString()}
        </div>
      )}
      {article?.reviewStatus === "rejected" && article.reviewNotes && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-text-secondary">
          <span className="font-medium text-text-primary">Changes requested:</span> {article.reviewNotes}
        </div>
      )}
      {textLocked && (
        <p className="text-xs text-text-dim">
          {published
            ? "The text is locked while published. Unpublish to edit it; it then needs a fresh review."
            : "Waiting in Review/Approval, so the text is locked until the review is done."}{" "}
          Topic, audience and cover can still change.
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && dirty && !save.isPending) save.mutate();
        }}
        className="space-y-3"
      >
        <label className="flex flex-col gap-1 text-xs text-text-dim">
          Title
          <input value={draft.title} onChange={(e) => set("title", e.target.value)} maxLength={140} disabled={textLocked} className={INPUT_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-dim">
          Summary (shown in the list, 10–300 characters)
          <textarea rows={2} value={draft.summary} onChange={(e) => set("summary", e.target.value)} maxLength={300} disabled={textLocked} className={INPUT_CLASS} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Topic
            <select value={draft.topic} onChange={(e) => set("topic", e.target.value as ArticleTopic)} className={INPUT_CLASS}>
              {(Object.keys(TOPIC_LABELS) as ArticleTopic[]).map((k) => (
                <option key={k} value={k}>{TOPIC_LABELS[k]}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Audience
            <select value={draft.audience} onChange={(e) => set("audience", e.target.value as ArticleAudience)} className={INPUT_CLASS}>
              {(Object.keys(AUDIENCE_LABELS) as ArticleAudience[]).map((k) => (
                <option key={k} value={k}>{AUDIENCE_LABELS[k]}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs text-text-dim">
          Cover image (optional https link)
          <input value={draft.coverImageUrl} onChange={(e) => set("coverImageUrl", e.target.value)} placeholder="https://…" className={INPUT_CLASS} />
        </label>
        <div className="flex flex-col gap-1 text-xs text-text-dim">
          <div className="flex items-center justify-between">
            <label htmlFor="article-body">Article text</label>
            <button type="button" onClick={() => setPreview((p) => !p)} className="text-accent hover:underline">
              {preview ? "Edit" : "Preview"}
            </button>
          </div>
          {preview ? (
            <div className="rounded-md border border-border-subtle bg-canvas p-3">
              <ArticleBodyPreview body={draft.body} />
            </div>
          ) : (
            <textarea
              id="article-body"
              rows={14}
              value={draft.body}
              onChange={(e) => set("body", e.target.value)}
              maxLength={20000}
              disabled={textLocked}
              className={`${INPUT_CLASS} font-mono text-xs leading-5`}
            />
          )}
          <span className="text-[11px]">
            Separate paragraphs with a blank line. Start a line with "## " for a heading or "- " for a bullet. {words} words, about{" "}
            {Math.max(1, Math.ceil(words / 200))} min read.
          </span>
        </div>

        {error && <p className="text-xs text-danger">{extractErrorMessage(error, "That didn't go through.")}</p>}

        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={!valid || !dirty || save.isPending} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40">
            {save.isPending ? "Saving…" : article ? "Save changes" : "Save draft"}
          </button>
          {article && !published && !pending && (
            <button
              type="button"
              disabled={dirty || submit.isPending}
              onClick={() => submit.mutate()}
              className="rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-primary hover:bg-surface-raised disabled:opacity-40"
              title={dirty ? "Save your changes first" : undefined}
            >
              {submit.isPending ? "Submitting…" : "Submit for review"}
            </button>
          )}
          {published && (
            <button
              type="button"
              disabled={unpublish.isPending}
              onClick={() => unpublish.mutate()}
              className="rounded-md border border-danger/40 px-3 py-1.5 text-xs text-danger disabled:opacity-40"
            >
              {unpublish.isPending ? "Unpublishing…" : "Unpublish"}
            </button>
          )}
        </div>
      </form>

      {existing && existing.reviews.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-text-dim">Review history</div>
          <ul className="space-y-1 text-[11px] text-text-dim">
            {existing.reviews.map((r) => (
              <li key={r.id}>
                {new Date(r.createdAt).toLocaleDateString()} · submitted by {r.submittedByName} · {r.status}
                {r.reviewedByName ? ` by ${r.reviewedByName}` : ""}
                {r.reviewNotes ? ` · “${r.reviewNotes}”` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
