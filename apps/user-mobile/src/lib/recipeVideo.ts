import type { RecipeVideo } from "@fitness-ai-app/types";

/**
 * Recipe video (Oct 2026, apps/api schema.prisma Recipe.video): one square,
 * muted, overhead video per recipe plus where each numbered method step
 * starts in it. Pure helpers, so tests/recipeVideo.check.cjs can run them in
 * plain Node; components/RecipeVideo.tsx does the playing.
 */

export type VideoClip = { startSec: number; endSec: number };

/** A recipe has a playable video only with a non-empty https link and a length. */
export function hasVideo(recipe: { video?: RecipeVideo | null } | null | undefined): recipe is { video: RecipeVideo } {
  const v = recipe?.video;
  return !!v && typeof v.url === "string" && /^https:\/\//i.test(v.url.trim()) && v.durationSec > 0;
}

/**
 * The part of the video for method step `stepIndex` (0-based, as cooking mode
 * counts): from its marker to the next marker, or to the end of the video.
 * Null when that step has no marker, so cooking mode shows no "Watch this step".
 */
export function stepClip(video: RecipeVideo | null | undefined, stepIndex: number): VideoClip | null {
  if (!video) return null;
  const steps = [...video.steps].sort((a, b) => a.step - b.step);
  const i = steps.findIndex((s) => s.step === stepIndex + 1);
  if (i < 0) return null;
  const startSec = steps[i].startSec;
  const endSec = Math.min(steps[i + 1]?.startSec ?? video.durationSec, video.durationSec);
  return endSec > startSec ? { startSec, endSec } : null;
}

/**
 * What the player should do at `positionMs` while playing a clip: carry on,
 * jump back to the clip start (looping a step while hands are busy), or stop
 * at its end. A position before the clip (a seek still landing) carries on.
 */
export function clipAction(positionMs: number, clip: VideoClip | null, loop: boolean): "continue" | "restart" | "pause" {
  if (!clip || positionMs < clip.endSec * 1000) return "continue";
  return loop ? "restart" : "pause";
}

/** "0:06" for the button and length chip. */
export function clipLengthLabel(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
