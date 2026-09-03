import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import {
  CreateExerciseInput,
  CreateProgramInput,
  CreateRecipeInput,
  ListContentReviewsQuery,
  ListExercisesQuery,
  ListProgramsQuery,
  ListRecipesQuery,
  ReviewContentReviewInput,
  UpdateExerciseInput,
  UpdateProgramInput,
  UpdateRecipeInput,
} from "./adminPrograms.schema";

/**
 * Module 05 — Programs (Content CMS), docs/admin/03-screen-inventory.md §05,
 * added 22 Aug 2026. Covers 05.01 Programs, 05.02 Exercises, 05.03 Recipes
 * — real create/edit/publish/unpublish against the exact same `Program`/
 * `Exercise`/`Recipe` models `apps/user-mobile` already reads from (see
 * `apps/api/src/modules/programs`, whose doc comment cross-references this
 * one). Closes the gap that comment has flagged since Phase 0: these three
 * tables were `scripts/seed.ts`-only, with no admin UI to create or edit
 * them. **25 Aug 2026: 05.05 Review/Approval joined the three above** — see
 * its own section further down for what changed and why now.
 *
 * Deliberately NOT built this pass, and why:
 * - **05.04 Educational Content** — needs a brand-new `EducationalContent`
 *   entity with no real producer OR consumer flow anywhere in this build
 *   (unlike Program/Exercise/Recipe, which the mobile apps already read
 *   live, and unlike 04.03's `RelationshipChangeRequest`, which turned out
 *   to already exist when that gap was re-examined). Checked again for
 *   this pass — still nothing: no `EducationalContent` table, no admin
 *   screen, no mobile reader anywhere in either app. Building it now would
 *   still be empty by construction, not just by current data.
 * - **Delete** — not built for any of the three types. `Program`/
 *   `Exercise` cascade-delete real dependent rows (`Workout`,
 *   `WorkoutExercise`, `ExerciseSetLog`, `ProgramPurchase`) that may belong
 *   to real users; an irreversible delete with that blast radius needs a
 *   deliberate confirmation flow this pass doesn't build. Unpublish
 *   (hides from consumers, fully reversible) covers the realistic "take
 *   this down" need instead.
 *
 * What's real vs. honestly not modeled, against the Figma's fuller spec:
 * - Programs (05.01): every spec'd column and filter is real — Creator is
 *   the admin who created it via this CMS (null for pre-CMS/seeded rows),
 *   "Exercises" is a real distinct-exercise count across the program's
 *   workouts, "Subscribers" is a real `ProgramPurchase` count.
 * - Exercises (05.02): every spec'd column and filter is real — "Programs
 *   (usage count)" is a real distinct-program count via
 *   `WorkoutExercise.workout.programId`.
 * - Recipes (05.03): the Figma's "Programs (usage)" column has no real
 *   backing relation at all — `Recipe` connects only to `MealLog`, never to
 *   `Program` — so `timesLogged` (a real `MealLog` count) is offered as a
 *   genuine usage substitute instead, same "derive a real value rather
 *   than fabricate the spec'd one" precedent as Module 02's Membership/
 *   Channel. "Rating" (no Review/rating entity for recipes) and the
 *   "Diet type"/"Cuisine" filters (no backing field) are honestly listed
 *   in `notAvailable` rather than faked.
 *
 * No role-gating beyond `requireAdminAuth` for Programs/Exercises/Recipes'
 * own create/edit — real per-module/action RBAC (`requirePermission`) does
 * gate every route as of 25 Aug 2026 (see adminPermissions.ts), but the
 * `content` role's own grants bundle create+edit+approve together for
 * `programs` — there's no role that can only review, not also author. Same
 * situation super_admin is in. This is why "05.05 Review/Approval" below
 * still leans on a self-review guard at the individual-admin level, not a
 * role split, to make review real.
 *
 * ============================================================================
 * 05.05 Review / Approval — added 25 Aug 2026
 * ============================================================================
 *
 * The status report this build tracks against had flagged this as needing
 * "a polymorphic ContentReview entity AND a real creator-vs-reviewer role
 * distinction, neither of which exists." Re-examined for this pass:
 * - The role-distinction half of that reasoning cited gap §7 — "only
 *   super_admin is enforced" — which stopped being true the moment
 *   `apps/api/src/middleware/adminPermissions.ts` shipped real RBAC for all
 *   8 roles (same day, earlier in this build). But even with real RBAC, no
 *   role in `PERMISSION_MATRIX` grants `programs: approve` without also
 *   granting `create`/`edit` — so "reviewer" and "creator" are still never
 *   *structurally* different roles here. What IS real and was always
 *   available: distinct AdminUser *accounts*. The same pattern
 *   `adminUsers.service.ts` used for Sensitive Data Access Requests
 *   (`cannot_approve_own_request`) applies directly — a genuine two-party
 *   review doesn't need a reviewer-only role, it needs a guard preventing
 *   the same admin from approving their own submission. That guard is
 *   `cannot_approve_own_content_review` below.
 * - The polymorphic-entity half is real too now — `ContentReview` in
 *   prisma/schema.prisma, discriminated by `contentType` +
 *   an unenforced `contentId` (same precedent as `AuditLog.entityType`/
 *   `entityId`, already used everywhere in this build for exactly this
 *   "reference any of several tables" situation).
 *
 * Scope, deliberately narrower than the Figma's 05.05:
 * - **Programs/Exercises/Recipes only** — `ContentReviewContentType` has no
 *   fourth "educationalContent" value, because that entity doesn't exist
 *   (see this file's 05.04 note above). A truly unified queue "across all
 *   content types" can't include a type that isn't modeled.
 * - **3 states, not 4** — `pending`/`approved`/`rejected` real;
 *   `notAvailable`s "In Review" (a distinct "claimed by a reviewer" state)
 *   isn't modeled — nothing in this pass gives a reviewer a way to "claim"
 *   an item before deciding, so a fourth status would be a cosmetic tab,
 *   not a real state transition. Same "model what's real, not a UI label"
 *   precedent as `RelationshipChangeStatus` dropping the Figma's finer
 *   states.
 * - **"Priority" and "SLA"** — no backing field or due-date concept
 *   anywhere; surfaced via `notAvailable` on the list response rather than
 *   faked.
 * - **Additive, not mandatory** — submitting a draft for review does NOT
 *   block the existing direct Publish/Unpublish actions above; both stay
 *   exactly as they were. Making review a required gate before publishing
 *   would be a real behavior change to already-shipped functionality this
 *   pass didn't set out to touch. "Submit for Review" is an optional path
 *   for a creator who wants a second pair of eyes; "Approve" reuses the
 *   existing `publishProgram`/`publishExercise`/`publishRecipe` functions
 *   as its real effect (same "reuse the existing action as the honest
 *   effect" precedent as 04.03's Approve reusing `endRelationship`);
 *   "Reject" leaves the content untouched (still draft) and just records
 *   the reviewer's notes.
 * - Only draft content can be submitted; a second submission while one is
 *   already `pending` for the same item is rejected (409), same pattern as
 *   "already published"/"already reviewed" elsewhere in this build.
 */

function countsOf(rows: Array<{ status: string }>): { total: number; published: number; draft: number } {
  return {
    total: rows.length,
    published: rows.filter((r) => r.status === "published").length,
    draft: rows.filter((r) => r.status === "draft").length,
  };
}

function dateRangeWhere(startDate?: Date, endDate?: Date) {
  if (!startDate && !endDate) return undefined;
  return { gte: startDate, lte: endDate };
}

// ============================================================================
// Programs (05.01)
// ============================================================================

type ProgramRow = {
  id: string;
  name: string;
  type: string;
  description: string;
  durationWeeks: number;
  isAiOnly: boolean;
  priceCents: number;
  status: string;
  createdByAdminId: string | null;
  createdByAdmin: { fullName: string } | null;
  createdAt: Date;
  updatedAt: Date;
  workouts: Array<{ exercises: Array<{ exerciseId: string }> }>;
  _count: { purchases: number };
};

function toProgramListItem(p: ProgramRow) {
  const exerciseIds = new Set<string>();
  for (const workout of p.workouts) {
    for (const we of workout.exercises) exerciseIds.add(we.exerciseId);
  }
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    description: p.description,
    status: p.status,
    durationWeeks: p.durationWeeks,
    isAiOnly: p.isAiOnly,
    priceCents: p.priceCents,
    exerciseCount: exerciseIds.size,
    subscriberCount: p._count.purchases,
    creatorName: p.createdByAdmin?.fullName ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export async function listPrograms(query: ListProgramsQuery) {
  const createdAtRange = dateRangeWhere(query.startDate, query.endDate);
  const where = {
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { description: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(createdAtRange ? { createdAt: createdAtRange } : {}),
  };

  const rows = (await prisma.program.findMany({
    where,
    include: {
      createdByAdmin: { select: { fullName: true } },
      workouts: { include: { exercises: { select: { exerciseId: true } } } },
      _count: { select: { purchases: true } },
    },
    orderBy: { createdAt: "desc" },
  })) as ProgramRow[];

  const counts = countsOf(rows);

  const filtered = rows.filter(
    (r) => (query.type ? r.type === query.type : true) && (query.status ? r.status === query.status : true),
  );

  return { programs: filtered.map(toProgramListItem), counts };
}

async function getProgramOrThrow(id: string): Promise<ProgramRow> {
  const program = await prisma.program.findUnique({
    where: { id },
    include: {
      createdByAdmin: { select: { fullName: true } },
      workouts: { include: { exercises: { select: { exerciseId: true } } } },
      _count: { select: { purchases: true } },
    },
  });
  if (!program) {
    throw new ApiHttpError(404, "not_found", "Program not found");
  }
  return program as ProgramRow;
}

export async function createProgram(actorAdminId: string, input: CreateProgramInput) {
  const program = await prisma.program.create({
    data: { ...input, status: "draft", createdByAdminId: actorAdminId },
  });
  await recordAudit({
    actorAdminId,
    action: "program.create",
    entityType: "Program",
    entityId: program.id,
    metadata: { name: input.name, type: input.type },
  });
  return toProgramListItem(await getProgramOrThrow(program.id));
}

export async function updateProgram(actorAdminId: string, id: string, input: UpdateProgramInput) {
  await getProgramOrThrow(id);
  await prisma.program.update({ where: { id }, data: input });
  await recordAudit({ actorAdminId, action: "program.update", entityType: "Program", entityId: id, metadata: input });
  return toProgramListItem(await getProgramOrThrow(id));
}

export async function publishProgram(actorAdminId: string, id: string) {
  const program = await getProgramOrThrow(id);
  if (program.status === "published") {
    throw new ApiHttpError(409, "program_already_published", "This program is already published");
  }
  await prisma.program.update({ where: { id }, data: { status: "published" } });
  await recordAudit({ actorAdminId, action: "program.publish", entityType: "Program", entityId: id });
  return toProgramListItem(await getProgramOrThrow(id));
}

export async function unpublishProgram(actorAdminId: string, id: string) {
  const program = await getProgramOrThrow(id);
  if (program.status === "draft") {
    throw new ApiHttpError(409, "program_already_draft", "This program is already a draft");
  }
  await prisma.program.update({ where: { id }, data: { status: "draft" } });
  await recordAudit({ actorAdminId, action: "program.unpublish", entityType: "Program", entityId: id });
  return toProgramListItem(await getProgramOrThrow(id));
}

// ============================================================================
// Exercises (05.02)
// ============================================================================

type ExerciseRow = {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  difficulty: string;
  mediaUrl: string | null;
  instructions: string[];
  status: string;
  createdByAdminId: string | null;
  createdByAdmin: { fullName: string } | null;
  createdAt: Date;
  updatedAt: Date;
  workoutExercises: Array<{ workout: { programId: string } }>;
};

function toExerciseListItem(e: ExerciseRow) {
  const programIds = new Set(e.workoutExercises.map((we) => we.workout.programId));
  return {
    id: e.id,
    name: e.name,
    muscleGroup: e.muscleGroup,
    equipment: e.equipment,
    difficulty: e.difficulty,
    mediaUrl: e.mediaUrl,
    instructions: e.instructions,
    status: e.status,
    programUsageCount: programIds.size,
    creatorName: e.createdByAdmin?.fullName ?? null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export async function listExercises(query: ListExercisesQuery) {
  const where = query.search
    ? {
        OR: [
          { name: { contains: query.search, mode: "insensitive" as const } },
          { muscleGroup: { contains: query.search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const rows = (await prisma.exercise.findMany({
    where,
    include: {
      createdByAdmin: { select: { fullName: true } },
      workoutExercises: { include: { workout: { select: { programId: true } } } },
    },
    orderBy: { name: "asc" },
  })) as ExerciseRow[];

  const counts = countsOf(rows);

  const filtered = rows.filter(
    (r) =>
      (query.muscleGroup ? r.muscleGroup.toLowerCase() === query.muscleGroup.toLowerCase() : true) &&
      (query.equipment ? r.equipment.toLowerCase() === query.equipment.toLowerCase() : true) &&
      (query.difficulty ? r.difficulty === query.difficulty : true) &&
      (query.status ? r.status === query.status : true),
  );

  return { exercises: filtered.map(toExerciseListItem), counts };
}

async function getExerciseOrThrow(id: string): Promise<ExerciseRow> {
  const exercise = await prisma.exercise.findUnique({
    where: { id },
    include: {
      createdByAdmin: { select: { fullName: true } },
      workoutExercises: { include: { workout: { select: { programId: true } } } },
    },
  });
  if (!exercise) {
    throw new ApiHttpError(404, "not_found", "Exercise not found");
  }
  return exercise as ExerciseRow;
}

export async function createExercise(actorAdminId: string, input: CreateExerciseInput) {
  const exercise = await prisma.exercise.create({
    data: { ...input, status: "draft", createdByAdminId: actorAdminId },
  });
  await recordAudit({
    actorAdminId,
    action: "exercise.create",
    entityType: "Exercise",
    entityId: exercise.id,
    metadata: { name: input.name },
  });
  return toExerciseListItem(await getExerciseOrThrow(exercise.id));
}

export async function updateExercise(actorAdminId: string, id: string, input: UpdateExerciseInput) {
  await getExerciseOrThrow(id);
  await prisma.exercise.update({ where: { id }, data: input });
  await recordAudit({ actorAdminId, action: "exercise.update", entityType: "Exercise", entityId: id, metadata: input });
  return toExerciseListItem(await getExerciseOrThrow(id));
}

export async function publishExercise(actorAdminId: string, id: string) {
  const exercise = await getExerciseOrThrow(id);
  if (exercise.status === "published") {
    throw new ApiHttpError(409, "exercise_already_published", "This exercise is already published");
  }
  await prisma.exercise.update({ where: { id }, data: { status: "published" } });
  await recordAudit({ actorAdminId, action: "exercise.publish", entityType: "Exercise", entityId: id });
  return toExerciseListItem(await getExerciseOrThrow(id));
}

export async function unpublishExercise(actorAdminId: string, id: string) {
  const exercise = await getExerciseOrThrow(id);
  if (exercise.status === "draft") {
    throw new ApiHttpError(409, "exercise_already_draft", "This exercise is already a draft");
  }
  await prisma.exercise.update({ where: { id }, data: { status: "draft" } });
  await recordAudit({ actorAdminId, action: "exercise.unpublish", entityType: "Exercise", entityId: id });
  return toExerciseListItem(await getExerciseOrThrow(id));
}

// ============================================================================
// Recipes (05.03)
// ============================================================================

type RecipeRow = {
  id: string;
  name: string;
  mealType: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  prepTimeMinutes: number;
  tags: string[];
  status: string;
  createdByAdminId: string | null;
  createdByAdmin: { fullName: string } | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { mealLogs: number };
};

// See this file's top doc comment — "rating"/"dietType"/"cuisine" have no
// backing field or relation at all, unlike timesLogged, which is real.
const RECIPE_NOT_AVAILABLE = ["rating", "dietType", "cuisine"];

function toRecipeListItem(r: RecipeRow) {
  return {
    id: r.id,
    name: r.name,
    mealType: r.mealType,
    calories: r.calories,
    proteinG: r.proteinG,
    carbsG: r.carbsG,
    fatG: r.fatG,
    prepTimeMinutes: r.prepTimeMinutes,
    tags: r.tags,
    status: r.status,
    timesLogged: r._count.mealLogs,
    creatorName: r.createdByAdmin?.fullName ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function listRecipes(query: ListRecipesQuery) {
  const where = query.search
    ? {
        OR: [
          { name: { contains: query.search, mode: "insensitive" as const } },
          { tags: { has: query.search } },
        ],
      }
    : {};

  const rows = (await prisma.recipe.findMany({
    where,
    include: { createdByAdmin: { select: { fullName: true } }, _count: { select: { mealLogs: true } } },
    orderBy: { name: "asc" },
  })) as RecipeRow[];

  const counts = countsOf(rows);

  const filtered = rows.filter(
    (r) => (query.mealType ? r.mealType === query.mealType : true) && (query.status ? r.status === query.status : true),
  );

  return { recipes: filtered.map(toRecipeListItem), counts, notAvailable: RECIPE_NOT_AVAILABLE };
}

async function getRecipeOrThrow(id: string): Promise<RecipeRow> {
  const recipe = await prisma.recipe.findUnique({
    where: { id },
    include: { createdByAdmin: { select: { fullName: true } }, _count: { select: { mealLogs: true } } },
  });
  if (!recipe) {
    throw new ApiHttpError(404, "not_found", "Recipe not found");
  }
  return recipe as RecipeRow;
}

export async function createRecipe(actorAdminId: string, input: CreateRecipeInput) {
  const recipe = await prisma.recipe.create({
    data: { ...input, status: "draft", createdByAdminId: actorAdminId },
  });
  await recordAudit({
    actorAdminId,
    action: "recipe.create",
    entityType: "Recipe",
    entityId: recipe.id,
    metadata: { name: input.name },
  });
  return toRecipeListItem(await getRecipeOrThrow(recipe.id));
}

export async function updateRecipe(actorAdminId: string, id: string, input: UpdateRecipeInput) {
  await getRecipeOrThrow(id);
  await prisma.recipe.update({ where: { id }, data: input });
  await recordAudit({ actorAdminId, action: "recipe.update", entityType: "Recipe", entityId: id, metadata: input });
  return toRecipeListItem(await getRecipeOrThrow(id));
}

export async function publishRecipe(actorAdminId: string, id: string) {
  const recipe = await getRecipeOrThrow(id);
  if (recipe.status === "published") {
    throw new ApiHttpError(409, "recipe_already_published", "This recipe is already published");
  }
  await prisma.recipe.update({ where: { id }, data: { status: "published" } });
  await recordAudit({ actorAdminId, action: "recipe.publish", entityType: "Recipe", entityId: id });
  return toRecipeListItem(await getRecipeOrThrow(id));
}

export async function unpublishRecipe(actorAdminId: string, id: string) {
  const recipe = await getRecipeOrThrow(id);
  if (recipe.status === "draft") {
    throw new ApiHttpError(409, "recipe_already_draft", "This recipe is already a draft");
  }
  await prisma.recipe.update({ where: { id }, data: { status: "draft" } });
  await recordAudit({ actorAdminId, action: "recipe.unpublish", entityType: "Recipe", entityId: id });
  return toRecipeListItem(await getRecipeOrThrow(id));
}

// ============================================================================
// Review / Approval (05.05) — see this file's top doc comment for the full
// "why this is real now, why Educational Content still isn't" reasoning.
// ============================================================================

type ContentTypeName = "program" | "exercise" | "recipe";

const CONTENT_TYPE_LABELS: Record<ContentTypeName, string> = {
  program: "Program",
  exercise: "Exercise",
  recipe: "Recipe",
};

type ContentReviewRow = {
  id: string;
  contentType: string;
  contentId: string;
  status: string;
  reviewNotes: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  submittedByAdminId: string;
  submittedByAdmin: { fullName: string };
  reviewedByAdminId: string | null;
  reviewedByAdmin: { fullName: string } | null;
};

const CONTENT_REVIEW_INCLUDE = {
  submittedByAdmin: { select: { fullName: true } },
  reviewedByAdmin: { select: { fullName: true } },
} as const;

// contentId is an unenforced polymorphic reference (same precedent as
// AuditLog.entityType/entityId) — resolving a display name means looking
// the row up in whichever table contentType names, one small switch
// rather than a Prisma relation Prisma itself can't express across three
// unrelated models.
async function resolveContent(
  contentType: ContentTypeName,
  contentId: string,
): Promise<{ name: string; status: string } | null> {
  if (contentType === "program") {
    return prisma.program.findUnique({ where: { id: contentId }, select: { name: true, status: true } });
  }
  if (contentType === "exercise") {
    return prisma.exercise.findUnique({ where: { id: contentId }, select: { name: true, status: true } });
  }
  return prisma.recipe.findUnique({ where: { id: contentId }, select: { name: true, status: true } });
}

// Approve's real effect — reuses the exact same publish functions the
// direct Publish button above already calls, same "reuse the existing
// action rather than duplicate it" precedent as 04.03's Approve reusing
// endRelationship().
async function publishByContentType(actorAdminId: string, contentType: ContentTypeName, contentId: string) {
  if (contentType === "program") return publishProgram(actorAdminId, contentId);
  if (contentType === "exercise") return publishExercise(actorAdminId, contentId);
  return publishRecipe(actorAdminId, contentId);
}

async function toContentReviewItem(row: ContentReviewRow) {
  const contentType = row.contentType as ContentTypeName;
  const content = await resolveContent(contentType, row.contentId);
  return {
    id: row.id,
    contentType,
    contentId: row.contentId,
    // Null only if the underlying content was somehow deleted after
    // submission — Program/Exercise/Recipe have no delete action in this
    // build (see this file's top doc comment), so this is a defensive
    // fallback, not an expected path.
    contentName: content?.name ?? null,
    submittedByAdminId: row.submittedByAdminId,
    submittedByName: row.submittedByAdmin.fullName,
    reviewedByAdminId: row.reviewedByAdminId,
    reviewedByName: row.reviewedByAdmin?.fullName ?? null,
    status: row.status,
    reviewNotes: row.reviewNotes,
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt,
  };
}

// See this file's top doc comment — "priority"/"sla" have no backing field
// anywhere; the Figma's 4th tab ("In Review") isn't a real state either,
// since nothing in this pass lets a reviewer "claim" an item first.
const CONTENT_REVIEW_NOT_AVAILABLE = ["priority", "sla"];

export async function listContentReviews(query: ListContentReviewsQuery) {
  const rows = (await prisma.contentReview.findMany({
    where: query.status ? { status: query.status } : {},
    include: CONTENT_REVIEW_INCLUDE,
    orderBy: { createdAt: "desc" },
  })) as ContentReviewRow[];

  const allRows = (await prisma.contentReview.findMany({ select: { status: true } })) as Array<{ status: string }>;
  const counts = {
    total: allRows.length,
    pending: allRows.filter((r) => r.status === "pending").length,
    approved: allRows.filter((r) => r.status === "approved").length,
    rejected: allRows.filter((r) => r.status === "rejected").length,
  };

  return {
    reviews: await Promise.all(rows.map(toContentReviewItem)),
    counts,
    notAvailable: CONTENT_REVIEW_NOT_AVAILABLE,
  };
}

async function getContentReviewOrThrow(id: string): Promise<ContentReviewRow> {
  const review = await prisma.contentReview.findUnique({ where: { id }, include: CONTENT_REVIEW_INCLUDE });
  if (!review) {
    throw new ApiHttpError(404, "not_found", "Review request not found");
  }
  return review as ContentReviewRow;
}

async function submitForReview(actorAdminId: string, contentType: ContentTypeName, contentId: string) {
  const content = await resolveContent(contentType, contentId);
  if (!content) {
    throw new ApiHttpError(404, "not_found", `${CONTENT_TYPE_LABELS[contentType]} not found`);
  }
  if (content.status !== "draft") {
    throw new ApiHttpError(
      409,
      "content_not_draft",
      `Only draft ${CONTENT_TYPE_LABELS[contentType].toLowerCase()}s can be submitted for review`,
    );
  }
  const existingPending = await prisma.contentReview.findFirst({
    where: { contentType, contentId, status: "pending" },
  });
  if (existingPending) {
    throw new ApiHttpError(409, "content_review_already_pending", "This item already has a pending review request");
  }

  const review = (await prisma.contentReview.create({
    data: { contentType, contentId, submittedByAdminId: actorAdminId },
    include: CONTENT_REVIEW_INCLUDE,
  })) as ContentReviewRow;

  await recordAudit({
    actorAdminId,
    action: "content_review.submit",
    entityType: "ContentReview",
    entityId: review.id,
    metadata: { contentType, contentId },
  });

  return { review: await toContentReviewItem(review) };
}

export async function submitProgramForReview(actorAdminId: string, id: string) {
  return submitForReview(actorAdminId, "program", id);
}

export async function submitExerciseForReview(actorAdminId: string, id: string) {
  return submitForReview(actorAdminId, "exercise", id);
}

export async function submitRecipeForReview(actorAdminId: string, id: string) {
  return submitForReview(actorAdminId, "recipe", id);
}

export async function approveContentReview(actorAdminId: string, id: string, input: ReviewContentReviewInput) {
  const review = await getContentReviewOrThrow(id);
  if (review.status !== "pending") {
    throw new ApiHttpError(409, "content_review_already_reviewed", `This request has already been ${review.status}`);
  }
  // Same guard as Sensitive Data Access's cannot_approve_own_request — the
  // only real "creator vs reviewer" boundary available, since no admin
  // role is approve-only. See this file's top doc comment.
  if (review.submittedByAdminId === actorAdminId) {
    throw new ApiHttpError(
      403,
      "cannot_approve_own_content_review",
      "You submitted this for review — a different admin needs to approve it",
    );
  }

  await publishByContentType(actorAdminId, review.contentType as ContentTypeName, review.contentId);

  const updated = (await prisma.contentReview.update({
    where: { id },
    data: { status: "approved", reviewedByAdminId: actorAdminId, reviewedAt: new Date(), reviewNotes: input.reviewNotes ?? null },
    include: CONTENT_REVIEW_INCLUDE,
  })) as ContentReviewRow;

  await recordAudit({
    actorAdminId,
    action: "content_review.approve",
    entityType: "ContentReview",
    entityId: id,
    metadata: { contentType: review.contentType, contentId: review.contentId },
  });

  return { review: await toContentReviewItem(updated) };
}

export async function rejectContentReview(actorAdminId: string, id: string, input: ReviewContentReviewInput) {
  const review = await getContentReviewOrThrow(id);
  if (review.status !== "pending") {
    throw new ApiHttpError(409, "content_review_already_reviewed", `This request has already been ${review.status}`);
  }
  if (review.submittedByAdminId === actorAdminId) {
    throw new ApiHttpError(
      403,
      "cannot_approve_own_content_review",
      "You submitted this for review — a different admin needs to review it",
    );
  }

  // Deliberately does not touch the underlying content — it stays exactly
  // as it was (draft), same "leave the record untouched" precedent as
  // 04.03's Deny.
  const updated = (await prisma.contentReview.update({
    where: { id },
    data: { status: "rejected", reviewedByAdminId: actorAdminId, reviewedAt: new Date(), reviewNotes: input.reviewNotes ?? null },
    include: CONTENT_REVIEW_INCLUDE,
  })) as ContentReviewRow;

  await recordAudit({
    actorAdminId,
    action: "content_review.reject",
    entityType: "ContentReview",
    entityId: id,
    metadata: { contentType: review.contentType, contentId: review.contentId },
  });

  return { review: await toContentReviewItem(updated) };
}
