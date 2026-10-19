import type { ExerciseVideo, VideoAspect, VideoLicence } from "@fitness-ai-app/types";

/**
 * Exercise video fields in the Exercises form (05.02). A clip that isn't our
 * own needs its credit — author, licence link and source link — which the app
 * shows next to the video (CC BY / CC BY-SA require it). The API re-checks
 * everything (adminPrograms.schema.ts exerciseVideoSchema).
 */

export const VIDEO_LICENCES: VideoLicence[] = ["CC BY-SA 4.0", "CC BY 4.0", "CC0", "Royalty-free", "Own"];
export const VIDEO_ASPECTS: VideoAspect[] = ["16:9", "9:16", "1:1"];

/**
 * The canonical licence page, prefilled when a licence is chosen. A
 * royalty-free stock licence has no standard page: enter the provider's
 * licence page (e.g. https://ymove.app/free-exercise-videos).
 */
export const LICENCE_URLS: Partial<Record<VideoLicence, string>> = {
  "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
  "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
  CC0: "https://creativecommons.org/publicdomain/zero/1.0/",
};

export interface ExerciseVideoFields {
  videoUrl: string;
  videoDurationSec: string;
  videoAspect: VideoAspect;
  videoPosterUrl: string;
  creditAuthor: string;
  creditLicence: VideoLicence;
  creditLicenceUrl: string;
  creditSourceUrl: string;
  creditChanges: string;
}

export const EMPTY_EXERCISE_VIDEO_FIELDS: ExerciseVideoFields = {
  videoUrl: "",
  videoDurationSec: "",
  videoAspect: "16:9",
  videoPosterUrl: "",
  creditAuthor: "",
  creditLicence: "CC BY-SA 4.0",
  creditLicenceUrl: LICENCE_URLS["CC BY-SA 4.0"] ?? "",
  creditSourceUrl: "",
  creditChanges: "",
};

export function fieldsFromExerciseVideo(video: ExerciseVideo | null | undefined): ExerciseVideoFields {
  if (!video) return EMPTY_EXERCISE_VIDEO_FIELDS;
  return {
    videoUrl: video.url,
    videoDurationSec: String(video.durationSec),
    videoAspect: video.aspect ?? "16:9",
    videoPosterUrl: video.posterUrl ?? "",
    creditAuthor: video.credit.author,
    creditLicence: video.credit.licence,
    creditLicenceUrl: video.credit.licenceUrl ?? "",
    creditSourceUrl: video.credit.sourceUrl ?? "",
    creditChanges: video.credit.changes ?? "",
  };
}

/**
 * The form's video inputs → the API's `video` value. Empty URL means no
 * video: `undefined` on create, `null` (clear) on edit.
 */
export function exerciseVideoFromForm(
  f: ExerciseVideoFields,
  editing: boolean,
): { video: ExerciseVideo | null | undefined } | { error: string } {
  const url = f.videoUrl.trim();
  if (!url) return { video: editing ? null : undefined };
  const durationSec = Number(f.videoDurationSec);
  if (!f.videoDurationSec.trim() || !Number.isInteger(durationSec) || durationSec < 1 || durationSec > 120) {
    return { error: "Video length must be a whole number of seconds from 1 to 120" };
  }
  const author = f.creditAuthor.trim();
  if (!author) return { error: "Add who made the video (the credit author)" };
  const licenceUrl = f.creditLicenceUrl.trim();
  const sourceUrl = f.creditSourceUrl.trim();
  if (f.creditLicence !== "Own" && (!licenceUrl || !sourceUrl)) {
    return { error: "A licensed clip needs its licence link and a link to where it came from" };
  }
  const changes = f.creditChanges.trim();
  const posterUrl = f.videoPosterUrl.trim();
  return {
    video: {
      url,
      durationSec,
      // 16:9 is the default, so it isn't stored.
      ...(f.videoAspect !== "16:9" ? { aspect: f.videoAspect } : {}),
      ...(posterUrl ? { posterUrl } : {}),
      credit: {
        author,
        licence: f.creditLicence,
        ...(licenceUrl ? { licenceUrl } : {}),
        ...(sourceUrl ? { sourceUrl } : {}),
        ...(changes ? { changes } : {}),
      },
    },
  };
}
