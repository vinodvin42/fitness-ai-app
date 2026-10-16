/**
 * Connectivity harness — evidence log (16 Oct 2026).
 *
 * Every journey step records what it called, what it wrote and read, what
 * was expected and what was observed. renderReport.ts turns the log into
 * the per-scenario report. The log is written under test-results/, which
 * is git-ignored; it holds synthetic ids only, never passwords or tokens.
 *
 * Verdicts:
 *   passed   — observed matched the expected (intended) behaviour.
 *   failed   — observed did not match the intended behaviour.
 *   current-behaviour — no agreed policy exists yet; this records what the
 *              code does today. It is NOT an acceptance pass.
 *   blocked  — the intended acceptance criterion cannot be judged until a
 *              business decision is made (named in `blockedBy`).
 */
import fs from "node:fs";
import path from "node:path";

export type Verdict = "passed" | "failed" | "current-behaviour" | "blocked";

export interface EvidenceEntry {
  scenario: string; // "A" .. "F"
  check: string;
  surface: string;
  configuration: string;
  endpoints: string[];
  files: string[];
  recordsWritten: string[];
  recordsRead: string[];
  expected: string;
  observed: string;
  verdict: Verdict;
  blockedBy?: string;
  notes?: string;
}

export const RESULTS_DIR = path.resolve(__dirname, "..", "..", "..", "test-results", "connectivity");
export const EVIDENCE_FILE = path.join(RESULTS_DIR, "evidence.jsonl");

const SECRET_LIKE = /(bearer\s+[a-z0-9._-]+|eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+|test-only-[a-z0-9-]+)/gi;

/** Strips anything token- or secret-shaped before it is written to disk. */
export function redact(text: string): string {
  return text.replace(SECRET_LIKE, "[redacted]");
}

export function record(entry: EvidenceEntry): void {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const safe: EvidenceEntry = {
    ...entry,
    expected: redact(entry.expected),
    observed: redact(entry.observed),
    notes: entry.notes ? redact(entry.notes) : undefined,
  };
  fs.appendFileSync(EVIDENCE_FILE, JSON.stringify({ at: new Date().toISOString(), ...safe }) + "\n");
}

/** Short, secret-free description of an HTTP response for the `observed` field. */
export function describeResponse(res: { status: number; body?: unknown }): string {
  const body = res.body as { error?: { code?: string } } | undefined;
  const code = body && typeof body === "object" && body.error?.code ? ` ${body.error.code}` : "";
  return `HTTP ${res.status}${code}`;
}
