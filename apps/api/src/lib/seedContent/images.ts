/**
 * Image URL helpers for the seed content in this directory.
 *
 * Both sources are hotlinked, not stored — this build has no object storage
 * (see `ProgressPhoto`'s doc comment in prisma/schema.prisma for that standing
 * constraint), so a URL to an already-hosted file is the only honest option.
 * See ../seedDatabase.ts's doc comment for the licensing of each source and
 * for the tradeoff hotlinking accepts.
 */

/**
 * Builds an images.unsplash.com delivery URL for a photo id.
 *
 * `auto=format` serves WebP/AVIF to clients that accept it, and the fixed
 * 1200x800 crop means every card and hero in the apps gets the same 3:2 shape
 * regardless of the original photo's orientation — a good number of these are
 * portrait, and would otherwise crop unpredictably per screen.
 *
 * Only ids of *free* Unsplash photos work here. An Unsplash+ id (they start
 * `premium_photo-`) returns 404 to an anonymous caller and carries different
 * licence terms, so none are used — worth knowing before adding a new one.
 */
export const unsplash = (photoId: string) =>
  `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=1200&h=800&q=80`;

/**
 * Builds a free-exercise-db demonstration photo URL from that project's own
 * exercise id. Every exercise there ships at least `0.jpg`; the seed uses the
 * first frame only, since the pair is a two-position "start/finish" sequence
 * rather than something the app has a UI to animate.
 */
export const exercisePhoto = (sourceId: string) =>
  `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${sourceId}/0.jpg`;
