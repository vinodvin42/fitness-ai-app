import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";
import { hasAccess } from "../programPurchases/programPurchases.service";

// Phase 0/1: read-only from the mobile apps' side. Content used to be
// seeded via scripts/seed.ts only — **22 Aug 2026: the admin CMS
// (docs/admin/03-screen-inventory.md module 05) is now real**, see
// apps/api/src/modules/adminPrograms. The one change that ships here, in
// this already-live module, is small and additive: the three list()
// functions below now filter to `status: "published"` so a new draft
// Program/Exercise/Recipe created via the CMS doesn't immediately appear
// to consumers — without this filter, "draft" would be cosmetic rather
// than a real visibility control. Detail endpoints (getProgramDetail/
// getExerciseDetail/getRecipeDetail) are deliberately NOT filtered — they
// resolve by id from a context where the caller already has a legitimate
// reason to see this specific row (a purchased program's workout, a
// workout's exercise, a program a user already owns), and filtering there
// risks breaking access to something a user already has rather than
// controlling first discovery of it.

// Catalog cards (Figma Train 02) show a workout count and a level tag. Both are
// derived from the program's real workouts, no new columns: `level` is the
// highest workout intensity in the program (null when it has no workouts).
const LEVEL_RANK = { beginner: 0, intermediate: 1, advanced: 2 } as const;

export async function listPrograms() {
  const programs = await prisma.program.findMany({
    where: { status: "published", ownerUserId: null },
    orderBy: { createdAt: "desc" },
    include: { workouts: { select: { intensity: true } } },
  });
  return programs.map(({ workouts, ...program }) => ({
    ...program,
    workoutCount: workouts.length,
    level: workouts.reduce<keyof typeof LEVEL_RANK | null>(
      (top, w) => (top === null || LEVEL_RANK[w.intensity] > LEVEL_RANK[top] ? w.intensity : top),
      null,
    ),
  }));
}

// `purchased` (Phase 3, §I Programs Commerce) tells the client whether this
// user can start this program's workouts: true for free programs, or a
// priced program the user has actually bought — see
// ../programPurchases/programPurchases.service.ts.
export async function getProgramDetail(programId: string, userId: string) {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    include: { workouts: { orderBy: { order: "asc" } } },
  });
  if (!program || (program.ownerUserId && program.ownerUserId !== userId)) {
    throw new ApiHttpError(404, "program_not_found", "Program not found");
  }
  return { ...program, purchased: await hasAccess(userId, program.id, program.priceCents) };
}

export async function getWorkoutDetail(workoutId: string, userId: string) {
  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    include: {
      exercises: {
        orderBy: [{ phase: "asc" }, { order: "asc" }],
        include: { exercise: true },
      },
      program: { select: { id: true, name: true, priceCents: true, ownerUserId: true } },
    },
  });
  if (!workout || (workout.program.ownerUserId && workout.program.ownerUserId !== userId)) {
    throw new ApiHttpError(404, "workout_not_found", "Workout not found");
  }
  const purchased = await hasAccess(userId, workout.program.id, workout.program.priceCents);
  const { ownerUserId: _owner, ...programOut } = workout.program;
  return { ...workout, program: { ...programOut, purchased } };
}

export function listExercises() {
  return prisma.exercise.findMany({ where: { status: "published" }, orderBy: { name: "asc" } });
}

// Exercise Detail (docs/mobile/03-screen-inventory.md §C trn-06)'s
// "alternatives" section — a real, computed suggestion (same muscle group,
// excluding itself), not an AI recommendation. Capped at 5 so the section
// stays scannable; there's no ranking beyond alphabetical since there's no
// signal (popularity, equipment match quality, etc.) to rank by yet.
export async function getExerciseDetail(exerciseId: string) {
  const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId } });
  if (!exercise) {
    throw new ApiHttpError(404, "exercise_not_found", "Exercise not found");
  }
  const alternatives = await prisma.exercise.findMany({
    where: { muscleGroup: exercise.muscleGroup, id: { not: exercise.id }, status: "published" },
    orderBy: { name: "asc" },
    take: 5,
  });
  return { ...exercise, alternatives };
}

export function listRecipes() {
  return prisma.recipe.findMany({ where: { status: "published" }, orderBy: { name: "asc" } });
}

export async function getRecipeDetail(recipeId: string) {
  const recipe = await prisma.recipe.findUnique({ where: { id: recipeId } });
  if (!recipe) {
    throw new ApiHttpError(404, "recipe_not_found", "Recipe not found");
  }
  return recipe;
}

/**
 * Search screen (Figma Today 03): "Trending Workouts" hero + real catalog
 * counts for the Explore Categories rows. Trending = the published catalog
 * workout with the most sessions STARTED (any user) in the last 30 days; if
 * nobody has started one yet it falls back to the first workout of the
 * newest published program (`basis: "featured"`) so the card is never a
 * fabricated popularity claim. Returns `workout: null` on an empty catalog.
 */
export async function getTrendingWorkout() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const catalogWhere = { program: { status: "published" as const, ownerUserId: null } };

  const [workouts, recipes, grouped] = await Promise.all([
    prisma.workout.count({ where: catalogWhere }),
    prisma.recipe.count({ where: { status: "published" } }),
    prisma.workoutSession.groupBy({
      by: ["workoutId"],
      where: { startedAt: { gte: since }, workout: catalogWhere },
      _count: { _all: true },
      orderBy: { _count: { workoutId: "desc" } },
      take: 1,
    }),
  ]);

  const include = { program: { select: { id: true, name: true, type: true, imageUrl: true } } };
  let basis: "most_started_30d" | "featured" = "most_started_30d";
  let startCount = grouped[0]?._count._all ?? 0;
  let workout = grouped[0]
    ? await prisma.workout.findUnique({ where: { id: grouped[0].workoutId }, include })
    : null;
  if (!workout) {
    basis = "featured";
    startCount = 0;
    workout = await prisma.workout.findFirst({
      where: catalogWhere,
      orderBy: [{ program: { createdAt: "desc" } }, { order: "asc" }],
      include,
    });
  }

  return {
    workout: workout
      ? {
          id: workout.id,
          name: workout.name,
          durationMinutes: workout.durationMinutes,
          intensity: workout.intensity,
          programId: workout.program.id,
          programName: workout.program.name,
          programType: workout.program.type,
          imageUrl: workout.program.imageUrl,
        }
      : null,
    basis,
    startCount,
    catalog: { workouts, recipes },
  };
}
