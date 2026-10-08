import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { trackEvent } from "../../lib/analytics";
import { ApiHttpError } from "../../middleware/errorHandler";
import { generateCompletion, isAiConfigured } from "../../lib/aiClient";
import { effectiveAge } from "../../lib/age";
import { DecideRecommendationInput } from "./plans.schema";
import { getDecryptedOnboardingProfile } from "../../lib/healthData";

/**
 * Plan-Generation / Recommendation Engine (14 Sep 2026).
 *
 * The R1 work-package split (Developer 1: consumer app, Developer 2:
 * professional app, Developer 3: admin/web/platform — three real Word
 * documents reviewed this session) each name an "Assessment → Plan" flow
 * and an ongoing "Recommendation" with real state machines
 * (Plan: generating/generated/failed/retry; Recommendation: active/
 * accepted/modified/declined/no_change/superseded), but none of the
 * three claims ownership of the engine that actually produces one.
 * Developer 1 owns the Plan/Recommendation screens and states; Developer
 * 2 owns *reviewing* a recommendation (Accept/Modify/No Change). Neither
 * generates one. Picked up here as shared platform logic — the same way
 * `apps/api/src/lib/aiClient.ts`'s `generateCompletion()` already sits
 * underneath AI Coach without being "owned" by any one screen.
 *
 * **Real design decision made, not left implicit:** a Plan is an
 * AI-driven SELECTION of one real, existing, admin-authored `Program`
 * from the catalog — grounded in the user's real `OnboardingProfile`
 * (goals, training level, safety flags) — never AI-authored novel
 * workouts/sets/reps. Same reasoning `aiCoach.service.ts`'s own doc
 * comment already establishes for this codebase: an LLM inventing
 * exercises with no human review is a real safety risk (a contraindicated
 * movement for a real injury, an unsafe progression); selecting among
 * real, human-reviewed content and explaining the choice is not. The LLM
 * is asked to answer in a strict, parseable format and its answer is
 * validated against the real list of eligible Program ids before being
 * trusted — an unparseable or out-of-catalog answer is a real, honest
 * `failed` state, never silently coerced into *some* selection.
 *
 * **18 Sep 2026 update:** `buildSelectionPrompt` now includes the user's
 * own self-reported `OnboardingProfile.equipmentContext` (full gym / home
 * dumbbells+bands / home bodyweight-only / none-travel — see that field's
 * own schema.prisma comment) and instructs the model to avoid recommending
 * a program that needs equipment the user doesn't have. This is
 * deliberately still NOT the "equipment-aware selection needs Gym Context"
 * gap named below — there is still no `Gym`/partner/location entity, no
 * per-Program structured equipment requirement, and no hard filtering of
 * the catalog; it's a soft, honest steer using only the user's own raw
 * self-report, read by the LLM the same way it already reads goals/level/
 * safety context above. A real Gym-Context-driven hard dependency stays
 * Developer 3's own future platform work.
 *
 * **What this pass deliberately does NOT attempt** (real gaps, not
 * hidden ones): equipment-aware selection needs Gym Context, Developer
 * 3's own future work (no `Gym`/equipment model exists yet); this reuses
 * `OnboardingProfile` as today's assessment source rather than a new
 * `Assessment` entity with its own resumable/corrected state machine
 * (Developer 1's own screen work, not this engine's); Recommendation
 * only ever proposes switching to a different single Program or
 * confirming "no change" — no multi-program sequencing, no mid-plan
 * exercise-level substitution (Exercise Swap, a separate deferred gap).
 * Professional review (Developer 2's Accept/Modify/No Change UI +
 * Decision Records) is designed to sit on top of the exact same
 * `decideRecommendation()` this pass builds for self-serve users —
 * `decidedByRole`/`decidedById` on `Recommendation` are plain strings,
 * not a FK to `User` alone, specifically so a future professional caller
 * doesn't need a schema change to use it.
 */

const MAX_RECENT_SESSIONS = 5;

interface PlanDTO {
  id: string;
  version: number;
  status: "generating" | "generated" | "failed";
  programId: string | null;
  programName: string | null;
  rationale: string | null;
  failureReason: string | null;
  isActive: boolean;
  createdAt: Date;
}

type PlanRow = {
  id: string;
  userId: string;
  version: number;
  status: string;
  programId: string | null;
  rationale: string | null;
  failureReason: string | null;
  isActive: boolean;
  createdAt: Date;
};

type EligibleProgram = {
  id: string;
  name: string;
  type: string;
  durationWeeks: number;
  description: string;
};

function toPlanDTO(p: PlanRow, programName: string | null): PlanDTO {
  return {
    id: p.id,
    version: p.version,
    status: p.status as PlanDTO["status"],
    programId: p.programId,
    programName,
    rationale: p.rationale,
    failureReason: p.failureReason,
    isActive: p.isActive,
    createdAt: p.createdAt,
  };
}

async function eligiblePrograms(excludeProgramId?: string): Promise<EligibleProgram[]> {
  return prisma.program.findMany({
    where: { status: "published", ownerUserId: null, ...(excludeProgramId ? { id: { not: excludeProgramId } } : {}) },
    select: { id: true, name: true, type: true, durationWeeks: true, description: true },
    orderBy: { createdAt: "asc" },
  });
}

function programCatalogText(programs: EligibleProgram[]): string {
  return programs
    .map((p) => `- id: ${p.id} | name: ${p.name} | type: ${p.type} | duration: ${p.durationWeeks} weeks | description: ${p.description}`)
    .join("\n");
}

/**
 * Both prompts below ask for a strict, parseable shape rather than free
 * prose — the same "ground it, then validate the answer against real
 * data before trusting it" discipline `aiCoach.service.ts` already uses,
 * just enforced more strictly here since the output drives what a user
 * is actually assigned to train on, not a chat reply.
 */
// Human-readable phrasing for OnboardingProfile.equipmentContext's real
// enum values (see users.schema.ts's EQUIPMENT_CONTEXTS) — kept here rather
// than in users.schema.ts since it's prompt-authoring text, not validation.
const EQUIPMENT_CONTEXT_TEXT: Record<string, string> = {
  full_gym: "has access to a full gym with a wide range of equipment",
  home_dumbbells_bands: "trains at home with only dumbbells and/or resistance bands",
  home_bodyweight_only: "trains at home with no equipment at all (bodyweight only)",
  none_travel: "currently has no regular equipment access (e.g. traveling)",
};

function buildSelectionPrompt(profile: {
  goals: string[];
  trainingLevel: string | null;
  medicalConditions: string[];
  injuries: string[];
  equipmentContext: string | null;
  healthDataSkipped?: boolean;
  age?: number | null;
}, programs: EligibleProgram[]): string {
  const goals = profile.goals.length ? profile.goals.join(", ") : "not specified";
  const level = profile.trainingLevel ?? "not specified";
  const safety = [...profile.medicalConditions, ...profile.injuries];
  const safetyText = safety.length ? safety.join(", ") : "none reported";
  const equipmentText = profile.equipmentContext
    ? (EQUIPMENT_CONTEXT_TEXT[profile.equipmentContext] ?? profile.equipmentContext)
    : "not specified — no equipment self-report on file, so don't assume either way";

  // Conservative paths: (a) the user skipped health data ("Continue without
  // health data") — safety context is UNKNOWN, not "none"; (b) a minor.
  // Prompt-level caution only; NOT a clinical screen and not a hard filter.
  const cautionNotes: string[] = [];
  if (profile.healthDataSkipped) {
    cautionNotes.push(
      "IMPORTANT: this user chose NOT to share medical/injury information, so their safety context is UNKNOWN (not 'none'). Prefer a lower-intensity, beginner-friendly, generally-safe program and avoid anything high-impact or maximal-effort.",
    );
  }
  if (profile.age != null && profile.age < 18) {
    cautionNotes.push(
      "IMPORTANT: this user is under 18. Choose an age-appropriate, moderate-intensity program; avoid aggressive weight-loss, extreme calorie deficit, maximal-load or very-high-intensity programs.",
    );
  }

  return [
    ...cautionNotes,
    "You are selecting ONE real training/nutrition program for a fitness app user from a fixed catalog — you are not designing a new workout.",
    `User's stated goals: ${goals}. Training level: ${level}. Reported medical conditions/injuries: ${safetyText}. Equipment access: this user ${equipmentText}.`,
    "Available programs (choose exactly one id from this list — never invent an id):",
    programCatalogText(programs),
    "Pick the single best-fitting program for this user given their goals, level, and any safety context. If a program's description conflicts with a reported injury/condition, avoid it in favor of a safer real option from the list. Likewise, avoid recommending a program that clearly requires gym equipment the user doesn't have access to when a comparable real option on this list fits their equipment access better — equipment access is a soft preference to weigh, not an automatic disqualifier, since the catalog descriptions may not always spell out equipment needs explicitly.",
    "Respond in EXACTLY this format, two lines, nothing else:",
    "PROGRAM_ID: <the exact id of your chosen program>",
    "RATIONALE: <2-3 sentences explaining the choice, referencing the user's actual goals/level/safety context above — never a generic template>",
  ].join("\n\n");
}

function buildRecommendationPrompt(
  currentProgramName: string,
  recentSessions: Array<{ workoutName: string; completedAt: Date | null }>,
  latestWeightKg: number | null,
  previousWeightKg: number | null,
  candidatePrograms: EligibleProgram[],
): string {
  const sessionsText = recentSessions.length
    ? recentSessions.map((s) => `${s.workoutName}${s.completedAt ? ` (${s.completedAt.toISOString().slice(0, 10)})` : ""}`).join("; ")
    : "no completed workouts logged since this plan started";
  const weightTrend =
    latestWeightKg !== null && previousWeightKg !== null
      ? `${previousWeightKg}kg -> ${latestWeightKg}kg`
      : latestWeightKg !== null
        ? `${latestWeightKg}kg (only one measurement logged, no trend yet)`
        : "no weight measurements logged";

  return [
    `A fitness app user is currently on the program "${currentProgramName}". Decide, from their REAL recent activity below, whether to recommend continuing it (no change) or switching to a different real program.`,
    `Recent completed workouts: ${sessionsText}.`,
    `Weight trend: ${weightTrend}.`,
    "Do not invent activity or measurements beyond what's stated above — if the evidence is thin (few or no logged workouts, no weight trend), that itself is a valid reason to recommend no change rather than guessing.",
    candidatePrograms.length
      ? `If a switch is genuinely warranted, choose exactly one id from this list (never invent an id):\n${programCatalogText(candidatePrograms)}`
      : "There is no other real program available to switch to right now, so only \"no change\" is a valid answer.",
    "Respond in EXACTLY this format, two lines, nothing else:",
    "DECISION: <either NO_CHANGE or the exact id of the program you recommend switching to>",
    "RATIONALE: <2-3 sentences referencing the actual recent activity/trend above — never a generic template>",
  ].join("\n\n");
}

function parseSelection(raw: string, eligibleIds: Set<string>): { programId: string; rationale: string } | null {
  const idMatch = raw.match(/PROGRAM_ID:\s*(\S+)/i);
  const rationaleMatch = raw.match(/RATIONALE:\s*([\s\S]+)/i);
  if (!idMatch || !rationaleMatch) return null;
  const programId = idMatch[1].trim();
  const rationale = rationaleMatch[1].trim();
  if (!eligibleIds.has(programId) || rationale.length === 0) return null;
  return { programId, rationale };
}

function parseRecommendationDecision(
  raw: string,
  eligibleIds: Set<string>,
): { decision: "no_change" | "switch_program"; programId: string | null; rationale: string } | null {
  const decisionMatch = raw.match(/DECISION:\s*(\S+)/i);
  const rationaleMatch = raw.match(/RATIONALE:\s*([\s\S]+)/i);
  if (!decisionMatch || !rationaleMatch) return null;
  const token = decisionMatch[1].trim();
  const rationale = rationaleMatch[1].trim();
  if (rationale.length === 0) return null;
  if (token.toUpperCase() === "NO_CHANGE") return { decision: "no_change", programId: null, rationale };
  if (eligibleIds.has(token)) return { decision: "switch_program", programId: token, rationale };
  return null;
}

/** Generates a brand-new Plan (a new version) for the user, calling the real LLM and validating its answer against the real Program catalog. Requires a completed OnboardingProfile — that's this app's stand-in for a real Assessment entity (Developer 1's own future work). */
export async function generatePlan(userId: string): Promise<PlanDTO> {
  if (!isAiConfigured()) {
    throw new ApiHttpError(
      503,
      "plan_generation_not_configured",
      "Plan generation isn't configured on this server yet — set ANTHROPIC_API_KEY, OPENAI_API_KEY, or the AZURE_OPENAI_* trio",
    );
  }

  // Health fields are encrypted at rest — read through the one
  // accessor, never the columns. A direct read here would hand the
  // plan generator an empty condition list for a user who declared
  // a heart condition (§10, and the AI safety rules that depend on it).
  const profile = await getDecryptedOnboardingProfile(userId);
  if (!profile || !profile.completedAt) {
    throw new ApiHttpError(400, "assessment_incomplete", "Complete your assessment before generating a plan");
  }

  const lastVersion = await prisma.plan.findFirst({
    where: { userId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (lastVersion?.version ?? 0) + 1;

  const planRow = await prisma.plan.create({ data: { userId, version, status: "generating" } });

  // §8 "plan.generation_started"
  await trackEvent(userId, "plan.generation_started", { planId: planRow.id }, { metadata: { version } });

  return runSelectionAndPersist(planRow, {
    goals: profile.goals,
    trainingLevel: profile.trainingLevel,
    medicalConditions: profile.medicalConditions,
    injuries: profile.injuries,
    equipmentContext: profile.equipmentContext,
    healthDataSkipped: profile.healthDataSkippedAt != null,
    age: effectiveAge(profile),
  });
}

/** Re-runs generation on an existing `failed` Plan row — the "retry" state Developer 1's spec names — rather than minting a new version, since nothing about it ever succeeded the first time. */
export async function retryPlanGeneration(userId: string, planId: string): Promise<PlanDTO> {
  const existing = (await prisma.plan.findUnique({ where: { id: planId } })) as PlanRow | null;
  if (!existing || existing.userId !== userId) {
    throw new ApiHttpError(404, "plan_not_found", "Plan not found");
  }
  if (existing.status !== "failed") {
    throw new ApiHttpError(409, "plan_not_failed", "Only a failed plan can be retried");
  }
  if (!isAiConfigured()) {
    throw new ApiHttpError(503, "plan_generation_not_configured", "Plan generation isn't configured on this server yet");
  }

  // Health fields are encrypted at rest — read through the one
  // accessor, never the columns. A direct read here would hand the
  // plan generator an empty condition list for a user who declared
  // a heart condition (§10, and the AI safety rules that depend on it).
  const profile = await getDecryptedOnboardingProfile(userId);
  if (!profile || !profile.completedAt) {
    throw new ApiHttpError(400, "assessment_incomplete", "Complete your assessment before generating a plan");
  }

  const reset = await prisma.plan.update({
    where: { id: planId },
    data: { status: "generating", failureReason: null },
  });

  // §8 "plan.generation_started" — a retry is a real new generation attempt.
  await trackEvent(userId, "plan.generation_started", { planId: reset.id }, { metadata: { retry: true } });

  return runSelectionAndPersist(reset, {
    goals: profile.goals,
    trainingLevel: profile.trainingLevel,
    medicalConditions: profile.medicalConditions,
    injuries: profile.injuries,
    equipmentContext: profile.equipmentContext,
    healthDataSkipped: profile.healthDataSkippedAt != null,
    age: effectiveAge(profile),
  });
}

async function runSelectionAndPersist(
  planRow: PlanRow,
  profile: {
    goals: string[];
    trainingLevel: string | null;
    medicalConditions: string[];
    injuries: string[];
    equipmentContext: string | null;
    healthDataSkipped?: boolean;
    age?: number | null;
  },
): Promise<PlanDTO> {
  const programs = await eligiblePrograms();
  if (programs.length === 0) {
    const failed = await failPlan(planRow.id, "No published programs are available to select from right now");
    return toPlanDTO(failed, null);
  }

  let raw: string;
  try {
    raw = await generateCompletion(buildSelectionPrompt(profile, programs));
  } catch {
    const failed = await failPlan(planRow.id, "The plan-generation service didn't respond — try again in a moment");
    await recordAudit({
      actorId: planRow.userId,
      action: "plan.generation_failed",
      entityType: "Plan",
      entityId: planRow.id,
      metadata: { reason: "upstream_error" },
    });
    // §8 "plan.generation_failed"
    await trackEvent(planRow.userId, "plan.generation_failed", { planId: planRow.id }, { metadata: { reason: "upstream_error" } });
    return toPlanDTO(failed, null);
  }

  const eligibleIds = new Set(programs.map((p) => p.id));
  const parsed = parseSelection(raw, eligibleIds);
  if (!parsed) {
    const failed = await failPlan(planRow.id, "The plan-generation service returned an unusable response");
    await recordAudit({
      actorId: planRow.userId,
      action: "plan.generation_failed",
      entityType: "Plan",
      entityId: planRow.id,
      metadata: { reason: "unparseable_response" },
    });
    // §8 "plan.generation_failed"
    await trackEvent(planRow.userId, "plan.generation_failed", { planId: planRow.id }, { metadata: { reason: "unparseable_response" } });
    return toPlanDTO(failed, null);
  }

  const [generated] = await prisma.$transaction([
    prisma.plan.update({
      where: { id: planRow.id },
      data: { status: "generated", programId: parsed.programId, rationale: parsed.rationale, isActive: true },
    }),
    // Deactivate every OTHER plan this user has — the one just generated
    // above is the new current one. Scoped by userId + id-not-equal so
    // this can run in the same transaction without a write-order race.
    prisma.plan.updateMany({
      where: { userId: planRow.userId, id: { not: planRow.id }, isActive: true },
      data: { isActive: false },
    }),
  ]);

  await recordAudit({
    actorId: planRow.userId,
    action: "plan.activated",
    entityType: "Plan",
    entityId: planRow.id,
    metadata: { programId: parsed.programId, version: planRow.version },
  });

  // §8 "plan.generated" and "plan.activated" — both real and simultaneous
  // here: runSelectionAndPersist's only success path both generates AND
  // immediately activates a Plan (see this function's own transaction
  // above), so both events are honestly emitted together rather than one
  // being inferred from the other.
  await trackEvent(planRow.userId, "plan.generated", { planId: planRow.id, programId: parsed.programId });
  await trackEvent(planRow.userId, "plan.activated", { planId: planRow.id, programId: parsed.programId }, { metadata: { version: planRow.version } });

  const program = programs.find((p) => p.id === parsed.programId);
  return toPlanDTO(generated as PlanRow, program?.name ?? null);
}

async function failPlan(planId: string, failureReason: string): Promise<PlanRow> {
  return prisma.plan.update({ where: { id: planId }, data: { status: "failed", failureReason } }) as Promise<PlanRow>;
}

export async function getCurrentPlan(userId: string): Promise<PlanDTO | null> {
  const plan = (await prisma.plan.findFirst({ where: { userId, isActive: true } })) as PlanRow | null;
  if (!plan) return null;
  const program = plan.programId ? await prisma.program.findUnique({ where: { id: plan.programId }, select: { name: true } }) : null;
  return toPlanDTO(plan, program?.name ?? null);
}

interface NextWorkoutSummary {
  id: string;
  name: string;
  durationMinutes: number;
  intensity: string;
}

interface PlanNextWorkoutDTO {
  plan: PlanDTO;
  workout: NextWorkoutSummary | null;
  programComplete: boolean;
}

/**
 * Today's "what to do next" (U3, 15 Sep 2026) — the first real consumer of
 * `Plan.isActive` outside the onboarding flow that creates it (see this
 * file's own top comment: "the one Today/Train reads from"). Resolves the
 * active Plan's selected Program into one concrete next Workout: the
 * lowest-`order` workout in that Program the user hasn't yet completed.
 *
 * Deliberately does NOT duplicate the purchase/entitlement gate here —
 * WorkoutDetailScreen (client) and startSession's real server-side check
 * (workoutSessions.service.ts) already handle an unpurchased program
 * correctly; this is a read-only resolver with no side effects, same shape
 * as getCurrentPlan.
 */
export async function getNextWorkoutForActivePlan(userId: string): Promise<PlanNextWorkoutDTO | null> {
  const plan = await getCurrentPlan(userId);
  if (!plan || plan.status !== "generated" || !plan.programId) return null;

  const workouts = await prisma.workout.findMany({
    where: { programId: plan.programId },
    orderBy: { order: "asc" },
    select: { id: true, name: true, durationMinutes: true, intensity: true },
  });
  if (workouts.length === 0) return { plan, workout: null, programComplete: false };

  const completed = await prisma.workoutSession.findMany({
    where: { userId, status: "completed", workoutId: { in: workouts.map((w) => w.id) } },
    select: { workoutId: true },
  });
  const completedIds = new Set(completed.map((s) => s.workoutId));
  const next = workouts.find((w) => !completedIds.has(w.id));

  return { plan, workout: next ?? null, programComplete: !next };
}

export async function listPlans(userId: string): Promise<PlanDTO[]> {
  const plans = (await prisma.plan.findMany({ where: { userId }, orderBy: { version: "desc" } })) as PlanRow[];
  const programIds = [...new Set(plans.map((p) => p.programId).filter((id): id is string => id !== null))];
  const programs = programIds.length
    ? await prisma.program.findMany({ where: { id: { in: programIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(programs.map((p) => [p.id, p.name]));
  return plans.map((p) => toPlanDTO(p, p.programId ? (nameById.get(p.programId) ?? null) : null));
}

// ---- Recommendation ------------------------------------------------------

interface RecommendationDTO {
  id: string;
  planId: string;
  kind: "no_change" | "switch_program";
  status: "active" | "accepted" | "modified" | "declined" | "no_change" | "superseded";
  rationale: string;
  suggestedProgramId: string | null;
  suggestedProgramName: string | null;
  decidedByRole: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}

type RecommendationRow = {
  id: string;
  userId: string;
  planId: string;
  kind: string;
  // A precise literal union, not plain `string` — this value round-trips
  // straight into Prisma's `data.status` on decideRecommendation()'s
  // update call below, which (when a real generated Prisma client is
  // present, as it is once `prisma generate` has run) expects its own
  // `RecommendationStatus` enum type, not an arbitrary string. Matching
  // literals here satisfies that structurally without importing the
  // Prisma-generated enum type directly (this codebase's own convention
  // — see this file's top comment on why Prisma model types aren't
  // imported elsewhere).
  status: "active" | "accepted" | "modified" | "declined" | "no_change" | "superseded";
  rationale: string;
  suggestedProgramId: string | null;
  decidedByRole: string | null;
  decidedById: string | null;
  decidedAt: Date | null;
  createdAt: Date;
};

function toRecommendationDTO(r: RecommendationRow, suggestedProgramName: string | null): RecommendationDTO {
  return {
    id: r.id,
    planId: r.planId,
    kind: r.kind as RecommendationDTO["kind"],
    status: r.status as RecommendationDTO["status"],
    rationale: r.rationale,
    suggestedProgramId: r.suggestedProgramId,
    suggestedProgramName,
    decidedByRole: r.decidedByRole,
    decidedAt: r.decidedAt,
    createdAt: r.createdAt,
  };
}

/** Generates a fresh Recommendation against the user's active Plan, grounded in real recent WorkoutSession/BodyMeasurement data — never fabricated activity. Supersedes any prior undecided Recommendation for the same Plan first, so there's only ever one live one to act on. */
export async function generateRecommendation(userId: string): Promise<RecommendationDTO> {
  if (!isAiConfigured()) {
    throw new ApiHttpError(503, "plan_generation_not_configured", "Recommendations aren't configured on this server yet");
  }

  const plan = await prisma.plan.findFirst({ where: { userId, isActive: true, status: "generated" } });
  if (!plan || !plan.programId) {
    throw new ApiHttpError(404, "no_active_plan", "Generate a plan before requesting a recommendation");
  }
  const currentProgram = await prisma.program.findUnique({ where: { id: plan.programId }, select: { name: true } });

  const [recentSessions, latest, previous] = await Promise.all([
    prisma.workoutSession.findMany({
      where: { userId, status: "completed" },
      orderBy: { completedAt: "desc" },
      take: MAX_RECENT_SESSIONS,
      include: { workout: { select: { name: true } } },
    }),
    prisma.bodyMeasurement.findFirst({ where: { userId }, orderBy: { loggedAt: "desc" } }),
    prisma.bodyMeasurement.findMany({ where: { userId }, orderBy: { loggedAt: "desc" }, skip: 1, take: 1 }),
  ]);

  const candidates = await eligiblePrograms(plan.programId);
  const prompt = buildRecommendationPrompt(
    currentProgram?.name ?? "the current program",
    (recentSessions as Array<{ workout: { name: string }; completedAt: Date | null }>).map((s) => ({
      workoutName: s.workout.name,
      completedAt: s.completedAt,
    })),
    latest?.weightKg ?? null,
    (previous as Array<{ weightKg: number | null }>)[0]?.weightKg ?? null,
    candidates,
  );

  let raw: string;
  try {
    raw = await generateCompletion(prompt);
  } catch {
    throw new ApiHttpError(502, "recommendation_upstream_error", "The recommendation service couldn't respond right now — try again in a moment");
  }

  const eligibleIds = new Set(candidates.map((p) => p.id));
  const parsed = parseRecommendationDecision(raw, eligibleIds);
  if (!parsed) {
    throw new ApiHttpError(502, "recommendation_unusable_response", "The recommendation service returned an unusable response — try again");
  }

  // Supersede any prior undecided recommendation for this plan — only one
  // "active" recommendation should ever be outstanding at a time.
  await prisma.recommendation.updateMany({
    where: { planId: plan.id, status: "active" },
    data: { status: "superseded" },
  });

  const created = (await prisma.recommendation.create({
    data: {
      userId,
      planId: plan.id,
      kind: parsed.decision,
      status: "active",
      rationale: parsed.rationale,
      suggestedProgramId: parsed.programId,
    },
  })) as RecommendationRow;

  await recordAudit({
    actorId: userId,
    action: "recommendation.generated",
    entityType: "Recommendation",
    entityId: created.id,
    metadata: { planId: plan.id, kind: parsed.decision },
  });

  const suggestedName = parsed.programId ? candidates.find((p) => p.id === parsed.programId)?.name ?? null : null;
  return toRecommendationDTO(created, suggestedName);
}

export async function getCurrentRecommendation(userId: string): Promise<RecommendationDTO | null> {
  const rec = (await prisma.recommendation.findFirst({
    where: { userId, status: "active" },
    orderBy: { createdAt: "desc" },
  })) as RecommendationRow | null;
  if (!rec) return null;
  const name = rec.suggestedProgramId
    ? (await prisma.program.findUnique({ where: { id: rec.suggestedProgramId }, select: { name: true } }))?.name ?? null
    : null;
  return toRecommendationDTO(rec, name);
}

/**
 * Decides an active Recommendation — the same entry point Developer 2's
 * professional-review UI calls (passing decidedByRole: "professional"
 * instead of "user"), see this file's own top comment. Accepting a
 * "switch_program" recommendation creates a real new active Plan directly
 * (no second AI call — the choice is already made); "modify" does the
 * same but with an admin/professional-chosen `replacementProgramId`
 * instead of the AI's own suggestion.
 *
 * `userId` is always the CLIENT who owns the Recommendation (it's
 * validated against `rec.userId` below regardless of who's deciding) —
 * for a professional's own identity, pass it separately as
 * `actorProfessionalId` (added 20 Sep 2026, wiring Wave 2.4's first real
 * `decidedByRole: "professional"` caller — see
 * professionalClients.service.ts#decideClientRecommendation). Optional
 * and additive: omitted, this defaults to `undefined` and every existing
 * "user" caller's behavior (decidedById on the Recommendation row, and
 * `recordAudit`'s `actorId`) is unchanged.
 */
export async function decideRecommendation(
  userId: string,
  recommendationId: string,
  input: DecideRecommendationInput,
  decidedByRole: "user" | "professional" = "user",
  actorProfessionalId?: string,
): Promise<RecommendationDTO> {
  const rec = (await prisma.recommendation.findUnique({ where: { id: recommendationId } })) as RecommendationRow | null;
  if (!rec || rec.userId !== userId) {
    throw new ApiHttpError(404, "recommendation_not_found", "Recommendation not found");
  }
  if (rec.status !== "active") {
    throw new ApiHttpError(409, "recommendation_already_decided", "This recommendation has already been decided");
  }

  // Spec §11 `review.started`. §10's Recommendation state set is the
  // review: a professional opening a decision is the start of one, and
  // the decision below completes it. Only emitted for a professional
  // actor — a user accepting their own AI suggestion is not a
  // professional review, and counting it as one would inflate the very
  // metric BR-AI-009/010/011 exist to keep honest.
  if (decidedByRole === "professional") {
    await trackEvent(
      userId,
      "review.started",
      { recommendationId, planId: rec.planId, professionalId: actorProfessionalId ?? null },
      { ruleId: "BR-AI-009" },
    );
  }

  let newProgramId: string | null = null;
  let newStatus: RecommendationRow["status"];

  if (input.action === "decline") {
    newStatus = "declined";
  } else if (input.action === "modify") {
    const replacement = await prisma.program.findUnique({ where: { id: input.replacementProgramId }, select: { id: true, status: true } });
    if (!replacement || replacement.status !== "published") {
      throw new ApiHttpError(404, "program_not_found", "The replacement program could not be found");
    }
    newStatus = "modified";
    newProgramId = replacement.id;
  } else {
    // "accept" — behavior depends on what kind of recommendation this was.
    if (rec.kind === "no_change") {
      newStatus = "no_change";
    } else {
      newStatus = "accepted";
      newProgramId = rec.suggestedProgramId;
    }
  }

  // Same read-then-write race already found and fixed in payments.service.ts's
  // activatePayment(), nutrition.service.ts's confirmFoodEstimate(), and
  // adminInfluencers.service.ts's markPayoutPaid(): the `rec.status !== "active"`
  // guard above reads this call's own already-fetched snapshot, so two
  // concurrent decideRecommendation calls for the same recommendation (a
  // double-tap on Accept, or a client retry racing its own in-flight
  // request) could both pass the guard. Confirmed two concrete failure
  // modes with the old unconditional `prisma.recommendation.update(...)`:
  // (1) if both calls decide differently (e.g. one "accept", one
  // "decline"), the LAST write wins the recommendation's final `status`
  // regardless of which call's Plan-switch side effect actually landed —
  // so a user could see this recommendation as "declined" in "Why This
  // Changed" history while their active Plan silently switched anyway
  // (from the other call's "accept"); (2) two racing "accept" calls both
  // reach the `if (newProgramId)` block and both attempt to create a new
  // Plan version — `Plan`'s real `@@unique([userId, version])` constraint
  // stops the duplicate row, but the loser's whole request then throws a
  // raw, unhandled `PrismaClientKnownRequestError` (a 500) instead of the
  // honest 409 this function is supposed to return, even though its
  // `recommendation.update()` already committed moments earlier. Claiming
  // the status transition atomically (`updateMany` with a `status:
  // "active"` filter) closes both: only the caller whose update actually
  // affected a row proceeds past this point at all.
  const claimed = await prisma.recommendation.updateMany({
    where: { id: recommendationId, status: "active" },
    data: { status: newStatus, decidedByRole, decidedById: userId, decidedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new ApiHttpError(409, "recommendation_already_decided", "This recommendation has already been decided");
  }
  const updated = (await prisma.recommendation.findUnique({ where: { id: recommendationId } })) as RecommendationRow;

  if (newProgramId) {
    const lastVersion = await prisma.plan.findFirst({ where: { userId }, orderBy: { version: "desc" }, select: { version: true } });
    const version = (lastVersion?.version ?? 0) + 1;
    await prisma.$transaction([
      prisma.plan.updateMany({ where: { userId, isActive: true }, data: { isActive: false } }),
      prisma.plan.create({
        data: {
          userId,
          version,
          status: "generated",
          programId: newProgramId,
          rationale: `Switched based on a ${newStatus} recommendation: ${rec.rationale}`,
          isActive: true,
        },
      }),
    ]);
  }

  await recordAudit({
    actorId: decidedByRole === "user" ? userId : null,
    // Was `userId` here before 20 Sep 2026 — that's the CLIENT id (this
    // function's own `rec.userId !== userId` check above requires it to
    // be), never a real `Professional.id`, so it violated
    // AuditLog's `actorProfessionalId` foreign key the moment a real
    // professional caller (Wave 2.4) first exercised this branch. Fixed
    // by threading the real actor through as its own parameter instead.
    actorProfessionalId: decidedByRole === "professional" ? actorProfessionalId ?? null : null,
    action: "recommendation.decided",
    entityType: "Recommendation",
    entityId: recommendationId,
    metadata: { action: input.action, status: newStatus, decidedByRole },
  });

  // §8 "recommendation.accepted/declined/no_change" — "modified" (an
  // accept-with-a-different-program override) is honestly grouped under
  // "accepted" here: §8 names exactly these three outcome events, not a
  // fourth "modified" one, and a modify is a real decision to ACT on the
  // recommendation, just with a chosen replacement rather than the AI's
  // own suggestion — never a decline. `input.action` in the metadata keeps
  // the real distinction visible to anyone reading the event.
  const outcomeEventName =
    newStatus === "declined" ? "recommendation.declined" : newStatus === "no_change" ? "recommendation.no_change" : "recommendation.accepted";
  await trackEvent(
    userId,
    outcomeEventName,
    { recommendationId, planId: rec.planId, newProgramId },
    { metadata: { action: input.action, decidedByRole } },
  );

  // Spec §11 `review.completed`, paired with the `review.started` above.
  // Carries the outcome, so "how many reviews ended in No Change" — the
  // question BR-AI-010/011 make a correctness signal rather than a
  // product one — is answerable without joining back to the
  // recommendation.
  if (decidedByRole === "professional") {
    await trackEvent(
      userId,
      "review.completed",
      { recommendationId, planId: rec.planId, professionalId: actorProfessionalId ?? null },
      { ruleId: "BR-AI-009", metadata: { outcome: newStatus } },
    );
  }

  const name = newProgramId ? (await prisma.program.findUnique({ where: { id: newProgramId }, select: { name: true } }))?.name ?? null : null;
  return toRecommendationDTO(updated, name);
}
