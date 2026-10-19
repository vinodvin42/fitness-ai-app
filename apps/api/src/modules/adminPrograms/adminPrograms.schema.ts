import { z } from "zod";

// Mirrors prisma/schema.prisma's ProgramType/Difficulty/MealType/
// ContentStatus enums exactly.
export const programTypes = ["fitness", "nutrition", "combined"] as const;
export const difficulties = ["beginner", "intermediate", "advanced"] as const;
export const mealTypes = ["breakfast", "lunch", "dinner", "snack"] as const;
export const contentStatuses = ["draft", "published"] as const;

// ---- Programs (05.01) ------------------------------------------------------

export const listProgramsQuerySchema = z.object({
  type: z.enum(programTypes).optional(),
  status: z.enum(contentStatuses).optional(),
  search: z.string().trim().max(200).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const createProgramSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(programTypes),
  description: z.string().trim().min(1).max(5000),
  durationWeeks: z.number().int().min(1).max(104),
  isAiOnly: z.boolean().optional(),
  priceCents: z.number().int().min(0).optional(),
  // 4 Sep 2026 — same `.url()` validation and same optionality as
  // createExerciseSchema.mediaUrl just below: an image is a URL to an
  // already-hosted file (no object storage in this build), and content
  // without artwork stays valid.
  imageUrl: z.string().trim().url().optional(),
});

export const updateProgramSchema = createProgramSchema.partial().refine((v) => Object.keys(v).length > 0, {
  message: "At least one field is required",
});

// ---- Exercises (05.02) -----------------------------------------------------

export const listExercisesQuerySchema = z.object({
  muscleGroup: z.string().trim().max(100).optional(),
  equipment: z.string().trim().max(100).optional(),
  difficulty: z.enum(difficulties).optional(),
  status: z.enum(contentStatuses).optional(),
  search: z.string().trim().max(200).optional(),
});

// A hosted video the app plays directly: https, a progressive MP4 or an HLS
// playlist. Shared by recipe and exercise videos.
const videoUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((u) => /^https:\/\//i.test(u) && /\.(mp4|m3u8)$/i.test(new URL(u).pathname), {
    message: "Must be an https link to an .mp4 file or an .m3u8 playlist",
  });

// Exercise video (Oct 2026) — see schema.prisma's Exercise.video. A clip
// that isn't our own must carry its credit: the licence link and where it
// came from (CC BY / CC BY-SA require attribution next to the video; CC0
// doesn't, but the source is still recorded).
// "Royalty-free" covers stock licences such as YMove's free clips (commercial
// use, no attribution required); the licence page and source are still kept.
export const videoLicences = ["CC BY-SA 4.0", "CC BY 4.0", "CC0", "Royalty-free", "Own"] as const;
// The clip's shape, so the app frames it without cropping (YMove clips are
// portrait 9:16). Absent = 16:9.
export const videoAspects = ["16:9", "9:16", "1:1"] as const;

export const exerciseVideoSchema = z
  .object({
    url: videoUrlSchema,
    durationSec: z.number().int().min(1).max(120),
    aspect: z.enum(videoAspects).optional(),
    // A still from the clip itself, shown before it plays (not the exercise's
    // library photo, which may show a different person or angle).
    posterUrl: z
      .string()
      .trim()
      .url()
      .max(2000)
      .refine((u) => /^https:\/\//i.test(u), { message: "Must be an https link" })
      .optional(),
    credit: z.object({
      author: z.string().trim().min(1).max(120),
      licence: z.enum(videoLicences),
      licenceUrl: z.string().trim().url().max(500).optional(),
      sourceUrl: z.string().trim().url().max(2000).optional(),
      changes: z.string().trim().max(200).optional(),
    }),
  })
  .superRefine((v, ctx) => {
    if (v.credit.licence === "Own") return;
    if (!v.credit.licenceUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["credit", "licenceUrl"], message: "A licensed clip needs its licence link" });
    }
    if (!v.credit.sourceUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["credit", "sourceUrl"], message: "A licensed clip needs a link to where it came from" });
    }
  });

export const createExerciseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  muscleGroup: z.string().trim().min(1).max(100),
  equipment: z.string().trim().min(1).max(100),
  difficulty: z.enum(difficulties),
  mediaUrl: z.string().trim().url().optional(),
  instructions: z.array(z.string().trim().min(1).max(500)).max(30).optional(),
  // null clears an existing video on update.
  video: exerciseVideoSchema.nullable().optional(),
});

export const updateExerciseSchema = createExerciseSchema.partial().refine((v) => Object.keys(v).length > 0, {
  message: "At least one field is required",
});

// ---- Recipes (05.03) --------------------------------------------------------

export const listRecipesQuerySchema = z.object({
  mealType: z.enum(mealTypes).optional(),
  status: z.enum(contentStatuses).optional(),
  search: z.string().trim().max(200).optional(),
});

// Recipe video (Oct 2026) — see schema.prisma's Recipe.video. A hosted
// square video (progressive MP4 or an HLS playlist, https only: the app
// plays it directly) plus where each numbered method step starts in it.
// Markers are optional per step, but in step order and inside the video.
// Whether step N exists is checked against the recipe's own instructions in
// the service, which has the row.
export const recipeVideoSchema = z
  .object({
    url: videoUrlSchema,
    durationSec: z.number().int().min(5).max(600),
    steps: z
      .array(z.object({ step: z.number().int().min(1).max(30), startSec: z.number().min(0) }))
      .max(30),
  })
  .superRefine((v, ctx) => {
    v.steps.forEach((s, i) => {
      if (s.startSec >= v.durationSec) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["steps", i, "startSec"], message: "Must start before the video ends" });
      }
      const prev = v.steps[i - 1];
      if (prev && (s.step <= prev.step || s.startSec <= prev.startSec)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["steps", i], message: "Steps must be in order, each starting later than the one before" });
      }
    });
  });

export const createRecipeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  mealType: z.enum(mealTypes),
  calories: z.number().int().min(0).max(10000),
  proteinG: z.number().int().min(0).max(1000).optional(),
  carbsG: z.number().int().min(0).max(1000).optional(),
  fatG: z.number().int().min(0).max(1000).optional(),
  prepTimeMinutes: z.number().int().min(0).max(1440),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  // 4 Sep 2026 — see createProgramSchema.imageUrl above.
  imageUrl: z.string().trim().url().optional(),
  // null clears an existing video on update.
  video: recipeVideoSchema.nullable().optional(),
});

export const updateRecipeSchema = createRecipeSchema.partial().refine((v) => Object.keys(v).length > 0, {
  message: "At least one field is required",
});

// ---- Review / Approval (05.05) ---------------------------------------------
// Mirrors prisma/schema.prisma's ContentReviewContentType/ContentReviewStatus
// enums exactly. See adminPrograms.service.ts's doc comment for why this
// only covers Programs/Exercises/Recipes, not Educational Content.

export const contentReviewContentTypes = ["program", "exercise", "recipe", "article"] as const;
export const contentReviewStatuses = ["pending", "approved", "rejected"] as const;

export const listContentReviewsQuerySchema = z.object({
  status: z.enum(contentReviewStatuses).optional(),
});

export const reviewContentReviewSchema = z.object({
  reviewNotes: z.string().trim().max(2000).optional(),
  // 05.04 (Oct 2026): approving an article must name the expert who checked
  // it — required for articles, ignored for other types (see
  // approveContentReview).
  expertReviewerName: z.string().trim().min(2).max(120).optional(),
  expertReviewerCredentials: z.string().trim().min(2).max(160).optional(),
});

export type ListContentReviewsQuery = z.infer<typeof listContentReviewsQuerySchema>;
export type ReviewContentReviewInput = z.infer<typeof reviewContentReviewSchema>;

export type ListProgramsQuery = z.infer<typeof listProgramsQuerySchema>;
export type CreateProgramInput = z.infer<typeof createProgramSchema>;
export type UpdateProgramInput = z.infer<typeof updateProgramSchema>;
export type ListExercisesQuery = z.infer<typeof listExercisesQuerySchema>;
export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;
export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;
export type ListRecipesQuery = z.infer<typeof listRecipesQuerySchema>;
export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;

// ---- 05.04 Educational Content (Oct 2026) — see schema.prisma's Article. ----
export const articleTopics = ["training", "nutrition", "recovery", "sleep", "mindset"] as const;
export const articleAudiences = ["everyone", "beginner", "intermediate", "advanced"] as const;

const coverImageUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((u) => /^https:\/\//i.test(u), { message: "Must be an https link" });

export const listArticlesQuerySchema = z.object({
  status: z.enum(["draft", "published"]).optional(),
  topic: z.enum(articleTopics).optional(),
  audience: z.enum(articleAudiences).optional(),
  search: z.string().trim().max(200).optional(),
});

export const createArticleSchema = z.object({
  title: z.string().trim().min(3).max(140),
  summary: z.string().trim().min(10).max(300),
  body: z.string().trim().min(50).max(20000),
  topic: z.enum(articleTopics),
  audience: z.enum(articleAudiences).default("everyone"),
  coverImageUrl: coverImageUrlSchema.nullable().optional(),
});

export const updateArticleSchema = z
  .object({
    title: z.string().trim().min(3).max(140),
    summary: z.string().trim().min(10).max(300),
    body: z.string().trim().min(50).max(20000),
    topic: z.enum(articleTopics),
    audience: z.enum(articleAudiences),
    coverImageUrl: coverImageUrlSchema.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });

export type ListArticlesQuery = z.infer<typeof listArticlesQuerySchema>;
export type CreateArticleInput = z.infer<typeof createArticleSchema>;
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;
