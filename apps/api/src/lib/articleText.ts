/**
 * 05.04 Educational Content (Oct 2026) — helpers for Article text. The body
 * is plain text: paragraphs separated by blank lines, "## " starts a
 * heading, "- " a bullet (see schema.prisma's Article).
 */

/** Typical adult reading speed for screen text. */
const WORDS_PER_MINUTE = 200;

export function readMinutesFor(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/** "Sleep & recovery: 5 habits" → "sleep-recovery-5-habits-1a2b3c" (the suffix keeps slugs unique). */
export function articleSlug(title: string, id: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  const suffix = id.replace(/-/g, "").slice(0, 6);
  return base ? `${base}-${suffix}` : `article-${suffix}`;
}
