import { Platform, Share } from "react-native";
import type { JourneyReport, TimelineCategory, TimelineEvent } from "@fitness-ai-app/types";
import { BRAND_NAME } from "./brand";
import { colors } from "../theme/tokens";

export const CATEGORY_LABEL: Record<TimelineCategory, string> = {
  strength: "Strength",
  cardio: "Cardio",
  body: "Body",
  health: "Health",
  recovery: "Recovery",
  life: "Life",
};

export const CATEGORY_COLOR: Record<TimelineCategory, string> = {
  strength: colors.accent,
  cardio: colors.orange,
  body: colors.warning,
  health: colors.success,
  recovery: colors.aiAccent,
  life: colors.textMuted,
};

export const TYPE_LABEL: Record<TimelineEvent["type"], string> = {
  pr: "Personal Record",
  milestone: "Milestone",
  program_complete: "Program Complete",
  weight: "Weight Log",
  measurement: "Measurement",
  cardio: "Cardio Best",
  recovery: "Sleep Streak",
  health: "Resting Heart Rate",
  start: "Journey Start",
};

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  return new Date(iso).toLocaleDateString(undefined, opts);
}

export function eventShareText(e: TimelineEvent): string {
  return `${e.title}\n${e.detail}\n${fmtDate(e.occurredAt)} · ${CATEGORY_LABEL[e.category]} · ${e.evidence === "measured" ? "Measured" : "Estimated"}\nShared from ${BRAND_NAME}`;
}

const tag = (e: "measured" | "estimated") => (e === "measured" ? "[Measured]" : "[Estimated]");

export function reportShareText(r: JourneyReport): string {
  const lines: string[] = [
    `${BRAND_NAME} Journey Report`,
    r.summaryTitle,
    `Generated ${fmtDate(r.generatedAt)} · Period: ${fmtDate(r.periodStart)} - ${fmtDate(r.periodEnd)}`,
    "",
  ];
  r.sections.forEach((s, i) => {
    lines.push(`Section ${i + 1}: ${s.title}`);
    if (s.lines.length === 0) lines.push(`  ${s.emptyNote}`);
    for (const l of s.lines) lines.push(`  - ${l.text} ${tag(l.evidence)}`);
    lines.push("");
  });
  lines.push(r.disclaimer);
  return lines.join("\n");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Self-contained printable HTML for expo-print / window.print. */
export function reportHtml(r: JourneyReport): string {
  const sections = r.sections
    .map(
      (s, i) => `
    <section>
      <h2>Section ${i + 1} - ${esc(s.title)}</h2>
      ${
        s.lines.length === 0
          ? `<p class="muted">${esc(s.emptyNote)}</p>`
          : `<ul>${s.lines.map((l) => `<li>${esc(l.text)} <span class="tag ${l.evidence}">${l.evidence === "measured" ? "Measured" : "Estimated"}</span></li>`).join("")}</ul>`
      }
    </section>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(BRAND_NAME)} Journey Report</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;margin:32px;line-height:1.45}
  h1{font-size:24px;margin:0} .sub{color:#52525b;margin:4px 0 16px}
  .summary{border:1px solid #2563eb;border-radius:10px;padding:12px 14px;margin:16px 0;font-weight:600}
  section{border:1px solid #e4e4e7;border-radius:10px;padding:10px 14px;margin:10px 0;page-break-inside:avoid}
  h2{font-size:14px;margin:0 0 6px;color:#2563eb} ul{margin:0;padding-left:18px} li{margin:3px 0;font-size:13px}
  .tag{font-size:10px;border-radius:4px;padding:1px 5px;margin-left:4px} .measured{background:#d1fae5;color:#065f46} .estimated{background:#fef3c7;color:#92400e}
  .muted,.disc{color:#71717a;font-size:11px}
</style></head><body>
<h1>${esc(BRAND_NAME)} Journey Report</h1>
<div class="sub">Longitudinal Health Legacy Analysis<br>Generated ${esc(fmtDate(r.generatedAt))} · Period: ${esc(fmtDate(r.periodStart))} - ${esc(fmtDate(r.periodEnd))}</div>
<div class="summary">${esc(r.summaryTitle)}</div>
${sections}
<p class="disc">Measured = entered by you or synced from a device. Estimated = derived from your logs.</p>
<p class="disc">${esc(r.disclaimer)}</p>
</body></html>`;
}

/** RN Share sheet (text). On web falls back to the Web Share API or the clipboard; never throws. */
export async function shareText(message: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { share?: (d: { text: string }) => Promise<void> }) : undefined;
      if (nav?.share) await nav.share({ text: message });
      else if (nav?.clipboard) await nav.clipboard.writeText(message);
      return;
    }
    await Share.share({ message });
  } catch {
    /* user dismissed the share sheet */
  }
}
