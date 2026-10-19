import type { RecipeVideo, RecipeVideoStep } from "@fitness-ai-app/types";

/**
 * Recipe video fields in the Recipes form (05.03). Step start times are typed
 * as one `m:ss` (or plain seconds) per method step, comma- or line-separated,
 * in step order: "0:02, 0:08, 0:18" = steps 1, 2, 3. A "-" leaves that step
 * without a marker (no "Watch this step" in the app). The API re-checks
 * everything (adminPrograms.schema.ts recipeVideoSchema).
 */

export function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec - m * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatStepTimes(steps: RecipeVideoStep[]): string {
  const out: string[] = [];
  for (const s of steps) {
    while (out.length < s.step - 1) out.push("-");
    out.push(formatSeconds(s.startSec));
  }
  return out.join(", ");
}

function parseTime(token: string): number | null {
  const mmss = /^(\d{1,2}):([0-5]\d)$/.exec(token);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  if (/^\d{1,3}$/.test(token)) return Number(token);
  return null;
}

export type StepTimesResult = { steps: RecipeVideoStep[] } | { error: string };

export function parseStepTimes(text: string): StepTimesResult {
  const tokens = text.split(/[\n,]/).map((t) => t.trim());
  while (tokens.length > 0 && tokens[tokens.length - 1] === "") tokens.pop();
  const steps: RecipeVideoStep[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "-" || token === "") continue;
    const sec = parseTime(token);
    if (sec == null) return { error: `Step ${i + 1}: "${token}" isn't a time like 0:08` };
    const prev = steps[steps.length - 1];
    if (prev && sec <= prev.startSec) return { error: `Step ${i + 1} must start after step ${prev.step}` };
    steps.push({ step: i + 1, startSec: sec });
  }
  return { steps };
}

/**
 * The form's three video inputs → the API's `video` value. Empty URL means
 * no video: `undefined` on create, `null` (clear) on edit.
 */
export function videoFromForm(
  form: { videoUrl: string; videoDurationSec: string; videoStepsText: string },
  editing: boolean,
): { video: RecipeVideo | null | undefined } | { error: string } {
  const url = form.videoUrl.trim();
  if (!url) return { video: editing ? null : undefined };
  const durationSec = Number(form.videoDurationSec);
  if (!form.videoDurationSec.trim() || !Number.isInteger(durationSec) || durationSec < 5 || durationSec > 600) {
    return { error: "Video length must be a whole number of seconds from 5 to 600" };
  }
  const parsed = parseStepTimes(form.videoStepsText);
  if ("error" in parsed) return parsed;
  const late = parsed.steps.find((s) => s.startSec >= durationSec);
  if (late) return { error: `Step ${late.step} starts at or after the end of the video` };
  return { video: { url, durationSec, steps: parsed.steps } };
}
