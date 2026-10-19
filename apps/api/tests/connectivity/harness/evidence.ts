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
 *   blocked  — the step could not be judged: either a business decision is
 *              missing, or an earlier step it depends on failed (named in
 *              `blockedBy`).
 *
 * Layer: every entry produced by this harness is "api-integration". Browser
 * UI and native-device results are never produced here; the report lists
 * them as not executed.
 */
import fs from "node:fs";
import path from "node:path";

export type Verdict = "passed" | "failed" | "current-behaviour" | "blocked";
export type Layer = "api-integration";

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
  /** What this step proves about ownership or isolation, if anything. */
  isolation?: string;
  blockedBy?: string;
  notes?: string;
}

export interface StoredEvidence extends EvidenceEntry {
  at: string;
  runId: string;
  layer: Layer;
  testName: string;
}

/**
 * Every entry point (vitest, tsx scripts) runs with apps/api as the working
 * directory (npm --workspace sets it), so results live in
 * apps/api/test-results/connectivity. Resolved from the working directory
 * rather than __dirname so it is the same in Vitest's main process
 * (globalSetup) and its workers.
 */
export const RESULTS_DIR = path.resolve(process.cwd(), "test-results", "connectivity");
export const EVIDENCE_FILE = path.join(RESULTS_DIR, "evidence.jsonl");

const SECRET_LIKE = /(bearer\s+[a-z0-9._-]+|eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+|test-only-[a-z0-9-]+|postgres(ql)?:\/\/[^\s]+)/gi;

/** Strips anything token-, secret- or connection-string-shaped before it is written to disk. */
export function redact(text: string): string {
  return text.replace(SECRET_LIKE, "[redacted]");
}

export function appendEvidence(entry: EvidenceEntry, meta: { runId: string; testName: string }): void {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const safe: StoredEvidence = {
    ...entry,
    expected: redact(entry.expected),
    observed: redact(entry.observed),
    notes: entry.notes ? redact(entry.notes) : undefined,
    isolation: entry.isolation ? redact(entry.isolation) : undefined,
    at: new Date().toISOString(),
    runId: meta.runId,
    layer: "api-integration",
    testName: meta.testName,
  };
  fs.appendFileSync(EVIDENCE_FILE, JSON.stringify(safe) + "\n");
}

/** Short, secret-free description of an HTTP response for the `observed` field. */
export function describeResponse(res: { status: number; body?: unknown }): string {
  const body = res.body as { error?: { code?: string } } | undefined;
  const code = body && typeof body === "object" && body.error?.code ? ` ${body.error.code}` : "";
  return `HTTP ${res.status}${code}`;
}
