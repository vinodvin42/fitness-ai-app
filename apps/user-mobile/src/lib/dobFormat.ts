/**
 * Date of birth as members type and read it on View Profile (20 Oct 2026):
 * DD/MM/YYYY, day first (the order used in India). The API still stores and
 * returns YYYY-MM-DD; these helpers only change what is shown and typed.
 * Pure, so tests/dobFormat.check.cjs can run them in plain Node.
 */

/** "1995-01-15" (or a longer ISO timestamp) -> "15/01/1995"; "" when it isn't a date. */
export function isoToDmy(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/**
 * Formats what is typed into DD/MM/YYYY: digits only, at most 8, with a "/"
 * added once the next part starts ("1501" -> "15/01", "15011995" ->
 * "15/01/1995"), so deleting back over a slash works naturally.
 */
export function maskDmy(text: string): string {
  const d = text.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "15/01/1995" -> its parts; null unless it is a complete DD/MM/YYYY. */
export function splitDmy(text: string): { day: string; month: string; year: string } | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  return m ? { day: m[1], month: m[2], year: m[3] } : null;
}
