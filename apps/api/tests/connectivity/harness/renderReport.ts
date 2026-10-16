/**
 * Connectivity harness — render the per-scenario report (16 Oct 2026).
 *
 *   npm run connectivity:report --workspace=apps/api
 *
 * Reads test-results/connectivity/evidence.jsonl (written by the journeys)
 * and, if present, test-results/connectivity/junit.xml (Vitest's JUnit
 * output), and writes test-results/connectivity/report.md.
 *
 * The report only states what was executed. A scenario with no evidence
 * lines is shown as "not executed", never as passed.
 */
import fs from "node:fs";
import path from "node:path";
import { EVIDENCE_FILE, RESULTS_DIR, type EvidenceEntry } from "./evidence";

const SCENARIOS: Record<string, string> = {
  A: "Authentication",
  B: "Landing application",
  C: "Coaching",
  D: "Gym equipment",
  E: "Referral and commission",
  F: "Payments and access",
};

type Line = EvidenceEntry & { at: string };

function readEvidence(): Line[] {
  if (!fs.existsSync(EVIDENCE_FILE)) return [];
  return fs
    .readFileSync(EVIDENCE_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Line);
}

function junitSummary(): string {
  const file = path.join(RESULTS_DIR, "junit.xml");
  if (!fs.existsSync(file)) return "Vitest JUnit file not found (the run may not have completed).";
  const xml = fs.readFileSync(file, "utf8");
  const m = xml.match(/<testsuites[^>]*tests="(\d+)"[^>]*failures="(\d+)"[^>]*errors="(\d+)"/);
  return m ? `Vitest: ${m[1]} tests, ${m[2]} failures, ${m[3]} errors (from junit.xml).` : "Vitest JUnit file present but not parsed.";
}

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

function main() {
  const lines = readEvidence();
  const out: string[] = [];
  out.push("# FynroX connectivity journeys — executed results");
  out.push("");
  out.push(`Generated ${new Date().toISOString()}. Synthetic TEST-ONLY data on a disposable local PostgreSQL database.`);
  out.push("These are API-level journeys run in-process on the endpoints each surface calls. The mobile apps and web portals themselves were not run, and no deployed host was contacted.");
  out.push("");
  out.push(junitSummary());
  out.push("");

  const counts = { passed: 0, failed: 0, "current-behaviour": 0, blocked: 0 } as Record<string, number>;
  for (const l of lines) counts[l.verdict] = (counts[l.verdict] ?? 0) + 1;
  out.push(`| Passed | Failed | Current behaviour (not a pass) | Blocked on a decision |`);
  out.push(`|---|---|---|---|`);
  out.push(`| ${counts.passed} | ${counts.failed} | ${counts["current-behaviour"]} | ${counts.blocked} |`);
  out.push("");

  for (const [id, name] of Object.entries(SCENARIOS)) {
    const mine = lines.filter((l) => l.scenario === id);
    out.push(`## ${id}. ${name}`);
    out.push("");
    if (mine.length === 0) {
      out.push("**Not executed** — no evidence was recorded for this scenario in this run.");
      out.push("");
      continue;
    }
    for (const l of mine) {
      out.push(`### ${l.check} — ${l.verdict.toUpperCase()}`);
      out.push("");
      out.push(`- **Surface:** ${esc(l.surface)}`);
      out.push(`- **Configuration:** ${esc(l.configuration)}`);
      if (l.endpoints.length) out.push(`- **Endpoints:** ${l.endpoints.map((e) => "`" + e + "`").join(", ")}`);
      if (l.files.length) out.push(`- **Files:** ${l.files.map((f) => "`" + f + "`").join(", ")}`);
      out.push(`- **Records written:** ${l.recordsWritten.length ? esc(l.recordsWritten.join("; ")) : "none"}`);
      out.push(`- **Records read:** ${l.recordsRead.length ? esc(l.recordsRead.join("; ")) : "none"}`);
      out.push(`- **Expected:** ${esc(l.expected)}`);
      out.push(`- **Observed:** ${esc(l.observed)}`);
      if (l.blockedBy) out.push(`- **Blocked by:** ${esc(l.blockedBy)}`);
      if (l.notes) out.push(`- **Notes:** ${esc(l.notes)}`);
      out.push(`- **Command:** \`npm run test:connectivity --workspace=apps/api\` (see tests/connectivity/README.md for the environment)`);
      out.push("");
    }
  }

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const target = path.join(RESULTS_DIR, "report.md");
  fs.writeFileSync(target, out.join("\n"));
  console.log(`[connectivity] report written: ${target}`);
}

main();
