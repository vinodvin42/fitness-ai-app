/**
 * Connectivity harness — render the per-scenario report (16 Oct 2026).
 *
 *   npm run connectivity:report --workspace=apps/api
 *
 * Reads, from test-results/connectivity/:
 *   world.json      — identifies THIS run (runId); without it nothing is reported
 *   evidence.jsonl  — only lines stamped with this run's id are used
 *   junit.xml       — Vitest's own pass/fail per test
 * and writes report.md.
 *
 * Never reports more than was executed:
 *   - a scenario with no evidence for this run is "not executed";
 *   - a Vitest test that failed before writing evidence is listed as
 *     "failed before recording";
 *   - browser UI and native-device layers are always listed as not executed,
 *     because this harness only drives the API.
 */
import fs from "node:fs";
import path from "node:path";
import { EVIDENCE_FILE, RESULTS_DIR, type StoredEvidence } from "./evidence";

const SCENARIOS: Record<string, string> = {
  A: "Authentication",
  B: "Landing application",
  C: "Coaching",
  D: "Gym equipment",
  E: "Referral and commission",
  F: "Payments and access",
  G: "Core daily use: workout session",
  H: "Core daily use: food logging",
  I: "Core daily use: Today / weekly review consistency",
};
const SUITE_COMMAND = "npm run test:connectivity --workspace=apps/api";

interface JunitCase {
  file: string;
  name: string;
  status: "passed" | "failed" | "skipped";
}

function readRunId(): string | null {
  const file = path.join(RESULTS_DIR, "world.json");
  if (!fs.existsSync(file)) return null;
  try {
    return (JSON.parse(fs.readFileSync(file, "utf8")) as { runId?: string }).runId ?? null;
  } catch {
    return null;
  }
}

function readEvidence(runId: string): StoredEvidence[] {
  if (!fs.existsSync(EVIDENCE_FILE)) return [];
  return fs
    .readFileSync(EVIDENCE_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as StoredEvidence)
    .filter((e) => e.runId === runId);
}

function readJunit(): { cases: JunitCase[]; summary: string } {
  const file = path.join(RESULTS_DIR, "junit.xml");
  if (!fs.existsSync(file)) return { cases: [], summary: "Vitest JUnit file not found: the journey run did not complete." };
  const xml = fs.readFileSync(file, "utf8");
  const cases: JunitCase[] = [];
  const re = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const body = m[3] ?? "";
    cases.push({
      file: /classname="([^"]*)"/.exec(attrs)?.[1] ?? "",
      name: (/\bname="([^"]*)"/.exec(attrs)?.[1] ?? "").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"'),
      status: /<(failure|error)\b/.test(body) ? "failed" : /<skipped\b/.test(body) ? "skipped" : "passed",
    });
  }
  const failed = cases.filter((c) => c.status === "failed").length;
  const suiteErrors = [...xml.matchAll(/<testsuite\b[^>]*\berrors="(\d+)"/g)].reduce((n, x) => n + Number(x[1]), 0);
  return { cases, summary: `Vitest (junit.xml): ${cases.length} tests, ${failed} failed, ${suiteErrors} suite errors.` };
}

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const shortName = (full: string) => full.split(" > ").pop() ?? full;

function main() {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const target = path.join(RESULTS_DIR, "report.md");
  const runId = readRunId();
  const out: string[] = ["# FynroX connectivity journeys — executed results", ""];

  if (!runId) {
    out.push("**No run to report.** world.json is missing, so the journeys did not start (isolation or database checks refused, or setup failed). See run-log.txt.");
    fs.writeFileSync(target, out.join("\n") + "\n");
    console.log(`[connectivity] report written (no run): ${target}`);
    process.exitCode = 1;
    return;
  }

  const lines = readEvidence(runId);
  const junit = readJunit();
  out.push(`Run ${runId}, report generated ${new Date().toISOString()}. Synthetic TEST-ONLY data on a disposable local PostgreSQL database.`);
  out.push("");
  out.push(junit.summary);
  out.push("");

  const counts: Record<string, number> = { passed: 0, failed: 0, "current-behaviour": 0, blocked: 0 };
  for (const l of lines) counts[l.verdict] = (counts[l.verdict] ?? 0) + 1;
  const recordedTests = new Set(lines.map((l) => shortName(l.testName)));
  const unrecorded = junit.cases.filter((c) => c.status !== "passed" && !recordedTests.has(shortName(c.name)));

  out.push("## Layers");
  out.push("");
  out.push("| Layer | Status |");
  out.push("|---|---|");
  out.push(`| API integration (this harness, in-process, same endpoints the surfaces call) | Executed: ${counts.passed} passed, ${counts.failed} failed, ${counts.blocked} blocked, ${counts["current-behaviour"]} current-behaviour records |`);
  out.push("| Browser UI (admin-web, gym-portal, creator-portal, landing in a browser) | **Not executed** — no browser run in this harness |");
  out.push("| Native device (user-mobile, coach-mobile on a phone or emulator) | **Not executed** — no device run in this harness |");
  out.push("");
  out.push("A passing API step does not establish a passing browser or native journey.");
  out.push("");

  if (unrecorded.length > 0) {
    out.push("## Tests that failed before recording evidence");
    out.push("");
    for (const c of unrecorded) out.push(`- ${esc(c.name)} (${c.file}) — Vitest status: ${c.status}`);
    out.push("");
  }

  out.push("## Connectivity journeys (A-F), API integration");
  out.push("");
  for (const [id, name] of Object.entries(SCENARIOS)) {
    const mine = lines.filter((l) => l.scenario === id);
    if (id === "G") {
      out.push("## Core daily-use API checks (G-I)");
      out.push("");
      out.push("API level only. Phone recovery (offline, app killed mid-workout, retries) and screen behaviour are separate native/UI checks and are not covered here.");
      out.push("");
    }
    out.push(`### ${id}. ${name}`);
    out.push("");
    if (mine.length === 0) {
      out.push("**Not executed** — no evidence was recorded for this scenario in this run.");
      out.push("");
      continue;
    }
    for (const l of mine) {
      out.push(`#### ${l.check} — ${l.verdict.toUpperCase()}`);
      out.push("");
      out.push(`- **Surface:** ${esc(l.surface)}`);
      out.push(`- **Configuration:** ${esc(l.configuration)}`);
      if (l.endpoints.length) out.push(`- **Endpoints:** ${l.endpoints.map((e) => "`" + e + "`").join(", ")}`);
      if (l.files.length) out.push(`- **Files:** ${l.files.map((f) => "`" + f + "`").join(", ")}`);
      out.push(`- **Records written:** ${l.recordsWritten.length ? esc(l.recordsWritten.join("; ")) : "none"}`);
      out.push(`- **Records read:** ${l.recordsRead.length ? esc(l.recordsRead.join("; ")) : "none"}`);
      out.push(`- **Ownership/isolation:** ${l.isolation ? esc(l.isolation) : "not an isolation check"}`);
      out.push(`- **Expected:** ${esc(l.expected)}`);
      out.push(`- **Observed (sanitized):** ${esc(l.observed)}`);
      if (l.blockedBy) out.push(`- **Blocked by:** ${esc(l.blockedBy)}`);
      if (l.notes) out.push(`- **Notes:** ${esc(l.notes)}`);
      out.push(`- **Command:** \`${SUITE_COMMAND}\` (this step alone: \`${SUITE_COMMAND} -- -t "${shortName(l.testName).split(" ")[0]} "\`)`);
      out.push("");
    }
  }

  fs.writeFileSync(target, out.join("\n") + "\n");
  console.log(`[connectivity] report written: ${target}`);
}

main();
