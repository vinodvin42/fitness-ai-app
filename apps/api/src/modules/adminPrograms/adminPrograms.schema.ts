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

export const createExerciseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  muscleGroup: z.string().trim().min(1).max(100),
  equipment: z.string().trim().min(1).max(100),
  difficulty: z.enum(difficulties),
  mediaUrl: z.string().trim().url().optional(),
  instructions: z.array(z.string().trim().min(1).max(500)).max(30).optional(),
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
});

export const updateRecipeSchema = createRecipeSchema.partial().refine((v) => Object.keys(v).length > 0, {
  message: "At least one field is required",
});

// ---- Review / Approval (05.05) ---------------------------------------------
// Mirrors prisma/schema.prisma's ContentReviewContentType/ContentReviewStatus
// enums exactly. See adminPrograms.service.ts's doc comment for why this
// only covers Programs/Exercises/Recipes, not Educational Content.

export const contentReviewContentTypes = ["program", "exercise", "recipe"] as const;
export const contentReviewStatuses = ["pending", "approved", "rejected"] as const;

export const listContentReviewsQuerySchema = z.object({
  status: z.enum(contentReviewStatuses).optional(),
});

export const reviewContentReviewSchema = z.object({
  reviewNotes: z.string().trim().max(2000).optional(),
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
