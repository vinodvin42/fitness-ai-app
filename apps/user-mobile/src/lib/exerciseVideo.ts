import type { ExerciseVideo } from "@fitness-ai-app/types";

/**
 * Exercise video (Oct 2026, apps/api schema.prisma Exercise.video): a hosted
 * demonstration clip plus the credit its licence needs. Pure helpers, so
 * tests/exerciseVideo.check.cjs runs them in plain Node; Exercise Detail and
 * components/VideoCredit.tsx do the showing.
 */

const isHttps = (u: string | undefined): u is string => !!u && /^https:\/\//i.test(u.trim());

/**
 * A playable video needs an https link and a length. A licensed clip also
 * needs its credit (author, licence link, source link); without it the clip
 * isn't shown at all, because showing it uncredited would break its licence.
 */
export function hasExerciseVideo(exercise: { video?: ExerciseVideo | null } | null | undefined): exercise is { video: ExerciseVideo } {
  const v = exercise?.video;
  if (!v || !isHttps(v.url) || !(v.durationSec > 0) || !v.credit?.author?.trim()) return false;
  return v.credit.licence === "Own" || (isHttps(v.credit.licenceUrl) && isHttps(v.credit.sourceUrl));
}

export type PlayerShape = { aspectRatio: number; fit: "cover" | "contain"; backdrop?: string };

/**
 * How Exercise Detail frames a clip so nothing is cropped off. A 16:9 clip
 * fills a 16:9 box. A portrait (9:16) clip is shown whole in a 4:5 box (a
 * full-height 9:16 box would push the rest of the screen out of view) on a
 * light grey that blends with studio-white backgrounds. A square clip fills
 * a square.
 */
export function playerShape(video: Pick<ExerciseVideo, "aspect">): PlayerShape {
  if (video.aspect === "9:16") return { aspectRatio: 4 / 5, fit: "contain", backdrop: PORTRAIT_BACKDROP };
  if (video.aspect === "1:1") return { aspectRatio: 1, fit: "cover" };
  return { aspectRatio: 16 / 9, fit: "cover" };
}

/** Matches the light studio wall in portrait stock clips (YMove). */
export const PORTRAIT_BACKDROP = "#EDEDED";

export type CreditLine = {
  author: string;
  licence: string;
  licenceUrl: string;
  sourceUrl: string;
  changes: string | null;
};

/** What the credit line under the video shows; null for our own video (nothing to credit). */
export function creditLine(video: ExerciseVideo): CreditLine | null {
  const c = video.credit;
  if (c.licence === "Own" || !isHttps(c.licenceUrl) || !isHttps(c.sourceUrl)) return null;
  return {
    author: c.author.trim(),
    licence: c.licence,
    licenceUrl: c.licenceUrl.trim(),
    sourceUrl: c.sourceUrl.trim(),
    changes: c.changes?.trim() || null,
  };
}
