/**
 * Exercise start/end frames (Oct 2026). Exercise.mediaUrl points at
 * free-exercise-db's first still (`…/exercises/<Name>/0.jpg`, the start
 * position). The same folder has a second still, `1.jpg`, the end position.
 * All 394 seeded exercises have both (checked against the dataset's index on
 * 18 Oct 2026). Exercise Detail alternates them as a simple motion loop.
 * Any other URL (e.g. one set in the CMS) gets no second frame and stays a
 * still. Pure, so tests/exerciseFrames.check.cjs runs it in plain Node.
 */

const FREE_EXERCISE_DB_START = /^(https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/main\/exercises\/[^/?#]+\/)0\.jpg$/;

/** [start, end] still URLs, or null when only one still is known. */
export function exerciseFrames(mediaUrl: string | null | undefined): [string, string] | null {
  const m = mediaUrl ? FREE_EXERCISE_DB_START.exec(mediaUrl.trim()) : null;
  return m ? [`${m[1]}0.jpg`, `${m[1]}1.jpg`] : null;
}

/** How long each frame shows in the loop. */
export const FRAME_MS = 1200;
