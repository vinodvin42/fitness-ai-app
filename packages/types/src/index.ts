/**
 * Shared contracts between apps/api and apps/user-mobile.
 *
 * Phase 0 scope only — see docs/platform/roadmap.md. Fields are the minimum
 * needed to support Onboarding + Auth + the Today/Train/Fuel core loop
 * (docs/mobile/02-information-architecture.md §2). Entities not yet built
 * (WorkoutSession, MealLog, Coach/CoachBooking, etc. — full list in
 * docs/mobile/05-data-model.md §2) are intentionally NOT modeled here yet;
 * add them in the same phase that implements the feature that needs them,
 * rather than speculatively up front.
 */

// ---- Auth ----------------------------------------------------------------

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Unix ms timestamp the access token expires at. */
  accessTokenExpiresAt: number;
}

export interface SignupInput {
  email: string;
  password: string;
  fullName: string;
  /** §O "Refer & Invite" — someone else's `User.referralCode`. An unrecognized code is silently ignored. */
  referralCode?: string;
  /** R1 Developer 1 U1 (14 Sep 2026) — a raw, client-captured acquisition string like "gym:ABC123". See apps/api/prisma/schema.prisma's User.acquisitionContext comment. */
  acquisitionContext?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

/**
 * Shared shape for /auth/signup, /users/me, and (on success) POST
 * /auth/2fa/verify — all three tell the client whether the onboarding
 * wizard still needs to run, since that's what RootNavigator branches on
 * (Auth -> Onboarding -> MainTabs). NOT used directly by POST /auth/login
 * any more — see LoginResponse below, added 25 Aug 2026 for Two-Factor
 * Authentication (gap §17).
 */
export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
  onboardingCompleted: boolean;
}

export interface MeResponse {
  user: User;
  onboardingCompleted: boolean;
}

// §L "Security" — Two-Factor Authentication (25 Aug 2026, gap §17) made
// POST /auth/login's response a discriminated union: the password step
// always runs, but if the account has 2FA enabled, real tokens are
// withheld and a short-lived challenge token is returned instead — the
// client must then call POST /auth/2fa/verify with that token plus a
// code from the user's authenticator app (or a recovery code) to
// actually receive tokens (that response is a plain AuthResponse above).
// Branch on `twoFactorRequired` before touching `.user`/`.tokens`.
export interface LoginTwoFactorRequiredResponse {
  twoFactorRequired: true;
  twoFactorToken: string;
}

export interface LoginSuccessResponse {
  twoFactorRequired: false;
  user: User;
  tokens: AuthTokens;
  onboardingCompleted: boolean;
}

export type LoginResponse = LoginTwoFactorRequiredResponse | LoginSuccessResponse;

/** Matches apps/api's verifyTwoFactorLoginSchema (Zod). `code` is either a live 6-digit TOTP code or a 10-char recovery code. */
export interface VerifyTwoFactorLoginInput {
  twoFactorToken: string;
  code: string;
}

// Forgot/Reset Password (R1 Developer 1, 18 Sep 2026, gap §53).
export interface ForgotPasswordInput {
  email: string;
}

/** Deliberately generic-response shape — see apps/api's auth.service.ts forgotPassword() doc comment for why `emailSent` never implies "this email has an account". */
export interface ForgotPasswordResponse {
  message: string;
  emailSent: boolean;
}

/** `token` is the raw value from a `primefit://reset-password?token=...` deep link (see apps/user-mobile's App.tsx deep-link capture). */
export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

export interface ResetPasswordResponse {
  message: string;
}

// ---- User ------------------------------------------------------------------
// Corresponds to the admin console's `User` entity (docs/admin/06-data-model.md).
// This is deliberately the SAME logical record across admin/mobile/coach —
// see docs/mobile/06-cross-app-integration.md.

export type UnitSystem = "metric" | "imperial";
export type AccentColor = "blue" | "green" | "yellow" | "red";

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  /** ISO 3166-1 alpha-2, e.g. "US" — added 26 Aug 2026 for Module 09.05 Geographic. Null until the user sets it on Edit Profile; never inferred from `phone`. See UpdateProfileInput's doc comment. */
  countryCode: string | null;
  languagePreference: string;
  unitSystem: UnitSystem;
  accentColor: AccentColor;
  /** §L "Notification Settings" master toggle — see UpdateProfileInput's doc comment. */
  notificationsEnabled: boolean;
  /** §O "Refer & Invite" — generated once at signup, never user-editable. See the Referral model's doc comment for why it carries no reward value. */
  referralCode: string;
  /** §L "Security" — Two-Factor Authentication (25 Aug 2026, gap §17). Drives whether SecurityScreen shows "Set up" or "Turn off". Never carries the secret or recovery codes themselves — those never leave apps/api. */
  twoFactorEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Day-of-week keys used by `preferredTrainingDays` below — lowercase, 3-letter, Monday-first. */
export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/**
 * Equipment/gym-context self-report (R1 Developer 1, 18 Sep 2026) — a
 * plain, honest, user-reported string, same "raw, honest, never
 * fabricated" pattern `User.acquisitionContext` established, NOT a foreign
 * key to a `Gym`/partner/location entity (deliberately deferred to
 * Developer 3's own future platform ownership — see apps/api's
 * plans.service.ts top comment).
 */
export type EquipmentContext = "full_gym" | "home_dumbbells_bands" | "home_bodyweight_only" | "none_travel";

// §4 Privacy/Consent settings (R1 Developer 1, 18 Sep 2026) — matches
// apps/api's `ConsentType` (prisma/schema.prisma) field-for-field. See
// that model's own doc comment for why these three, specifically.
export type ConsentType = "marketing_emails" | "data_analytics" | "health_data_processing";

export interface Consent {
  type: ConsentType;
  granted: boolean;
  /** Null when this type has never been explicitly set — see users.service.ts's listConsents doc comment: this is NOT the same as `granted: false` meaning "declined". */
  updatedAt: string | null;
}

/** Matches apps/api's updateConsentSchema (Zod). */
export interface UpdateConsentInput {
  type: ConsentType;
  granted: boolean;
}

export interface OnboardingProfile {
  userId: string;
  gender: string | null;
  age: number | null;
  weightKg: number | null;
  heightCm: number | null;
  goals: string[];
  trainingLevel: "beginner" | "intermediate" | "advanced" | null;
  dietType: string | null;
  allergens: string[];
  medicalConditions: string[];
  injuries: string[];
  /** Availability/Schedule (18 Sep 2026) — see OnboardingProfileInput's own doc comment. */
  trainingDaysPerWeek: number | null;
  preferredTrainingDays: DayOfWeek[];
  sessionLengthMinutes: number | null;
  /** Wired into Plan-Generation's selection prompt — see apps/api's plans.service.ts. */
  equipmentContext: EquipmentContext | null;
}

/**
 * The write side of OnboardingProfile — matches apps/api's
 * onboardingProfileSchema (Zod) field-for-field. Used to type the 5-step
 * wizard's accumulated in-progress state on the client
 * (docs/mobile/03-screen-inventory.md §A: About You -> Goals -> Training
 * Level -> Food/Diet -> Safety).
 */
/**
 * The write side of a profile update — matches apps/api's
 * updateProfileSchema (Zod). Backs both View/Edit Profile (fullName/phone)
 * and Preferences (languagePreference/unitSystem/accentColor) —
 * docs/mobile/03-screen-inventory.md §N. At least one field is required.
 */
export interface UpdateProfileInput {
  fullName?: string;
  phone?: string;
  languagePreference?: string;
  unitSystem?: UnitSystem;
  accentColor?: AccentColor;
  notificationsEnabled?: boolean;
  /** ISO 3166-1 alpha-2, uppercase (e.g. "US"). See `COMMON_COUNTRIES` below for the picker's curated list — this field itself accepts any 2-letter code, format-validated only. */
  countryCode?: string;
}

/**
 * A curated list of common markets for Edit Profile's country picker
 * (added 26 Aug 2026, Module 09.05 Geographic's capture-method decision)
 * — NOT exhaustive, and not a server-side allowlist (`UpdateProfileInput.
 * countryCode` accepts any real 2-letter code via regex, see
 * apps/api's users.schema.ts). The picker itself offers an "Other" option
 * that reveals a raw 2-letter code input for anyone whose country isn't
 * in this list, so real coverage isn't capped by what's hardcoded here.
 */
export const COMMON_COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "MX", name: "Mexico" },
  { code: "BR", name: "Brazil" },
  { code: "AR", name: "Argentina" },
  { code: "CL", name: "Chile" },
  { code: "CO", name: "Colombia" },
  { code: "PE", name: "Peru" },
  { code: "GB", name: "United Kingdom" },
  { code: "IE", name: "Ireland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "ES", name: "Spain" },
  { code: "PT", name: "Portugal" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "CH", name: "Switzerland" },
  { code: "AT", name: "Austria" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "PL", name: "Poland" },
  { code: "CZ", name: "Czechia" },
  { code: "RO", name: "Romania" },
  { code: "GR", name: "Greece" },
  { code: "UA", name: "Ukraine" },
  { code: "RU", name: "Russia" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "IL", name: "Israel" },
  { code: "TR", name: "Turkey" },
  { code: "QA", name: "Qatar" },
  { code: "ZA", name: "South Africa" },
  { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" },
  { code: "EG", name: "Egypt" },
  { code: "IN", name: "India" },
  { code: "PK", name: "Pakistan" },
  { code: "BD", name: "Bangladesh" },
  { code: "LK", name: "Sri Lanka" },
  { code: "NP", name: "Nepal" },
  { code: "CN", name: "China" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "HK", name: "Hong Kong" },
  { code: "TW", name: "Taiwan" },
  { code: "SG", name: "Singapore" },
  { code: "MY", name: "Malaysia" },
  { code: "TH", name: "Thailand" },
  { code: "ID", name: "Indonesia" },
  { code: "PH", name: "Philippines" },
  { code: "VN", name: "Vietnam" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
];

/**
 * Availability/Schedule + Equipment/gym-context + broader Baseline/
 * measurements (R1 Developer 1, 18 Sep 2026). `trainingDaysPerWeek`/
 * `preferredTrainingDays`/`sessionLengthMinutes` and `equipmentContext`
 * map straight onto new OnboardingProfile columns. `bodyFatPercent`/
 * `waistCm`/`hipsCm` do NOT — they're the wizard's new baseline-
 * measurements step, and apps/api's users.service.ts#upsertOnboardingProfile
 * writes them into a real BodyMeasurement row instead of a second,
 * competing measurements table on OnboardingProfile (see that function's
 * own comment). All three are clearly optional — most users won't have a
 * precise body-fat% reading, and a tape-measure baseline is a nice-to-have,
 * not a requirement to finish onboarding.
 */
export interface OnboardingProfileInput {
  gender?: string;
  age?: number;
  weightKg?: number;
  heightCm?: number;
  goals: string[];
  trainingLevel?: "beginner" | "intermediate" | "advanced";
  dietType?: string;
  allergens: string[];
  medicalConditions: string[];
  injuries: string[];
  trainingDaysPerWeek?: number;
  preferredTrainingDays: DayOfWeek[];
  sessionLengthMinutes?: number;
  equipmentContext?: EquipmentContext;
  bodyFatPercent?: number;
  waistCm?: number;
  hipsCm?: number;
}

/**
 * §N "View/Edit Profile" (docs/mobile/03-screen-inventory.md) — gender/
 * age/height/weight editing, added 19 Aug 2026 (GET+PATCH /users/me/
 * onboarding). Distinct from OnboardingProfileInput above (the 5-step
 * wizard's write shape, which always stamps `completedAt`) — this is a
 * genuine partial edit of an already-completed profile and leaves
 * `completedAt` untouched. There's no real "date of birth" field anywhere
 * in this schema — the design names one, but onboarding's own "About You"
 * step only ever collected `age`, so this edits `age`, not a DOB — see
 * gap §31.
 */
export interface EditOnboardingProfileInput {
  gender?: string;
  age?: number;
  weightKg?: number;
  heightCm?: number;
}

// ---- Programs / Exercises / Recipes ---------------------------------------
// These correspond 1:1 to the admin console's Program/Exercise/Recipe
// entities (docs/admin/06-data-model.md) — authored/moderated in the admin
// console (Phase 6), *consumed* here. Read-only from the mobile app's side
// in Phase 0/1; the admin CMS doesn't exist yet, so Phase 0 seeds these
// directly (see apps/api/scripts/seed.ts).

export type ProgramType = "fitness" | "nutrition" | "combined";

/**
 * `draft` | `published` — added 22 Aug 2026 alongside the admin CMS
 * (Module 05, `apps/api/src/modules/adminPrograms`). Deliberately a
 * simpler 2-state than the Figma's 4-state moderation pipeline (draft/
 * pending review/approved/rejected) — see `apps/api/prisma/schema.prisma`'s
 * `ContentStatus` doc comment for why. `GET /programs`, `/exercises`, and
 * `/recipes` (the mobile-facing discovery endpoints) only ever return
 * `published` rows; the admin Directory screens below are the only place
 * `draft` rows are visible.
 */
export type ContentStatus = "draft" | "published";

export interface Program {
  id: string;
  name: string;
  type: ProgramType;
  description: string;
  durationWeeks: number;
  isAiOnly: boolean;
  priceCents: number;
  /** Cover image URL, added 4 Sep 2026. Null for a program with no artwork — clients fall back to their icon tile. */
  imageUrl: string | null;
  /** Added 22 Aug 2026 — see `ContentStatus`'s own doc comment. */
  status: ContentStatus;
  /** Null for content seeded via `scripts/seed.ts` before the admin CMS existed, or created before this field was added. */
  createdByAdminId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  mediaUrl: string | null;
  instructions: string[];
  /** Added 22 Aug 2026 — see `ContentStatus`'s own doc comment. */
  status: ContentStatus;
  createdByAdminId: string | null;
  updatedAt: string;
}

/** Exercise + a real, computed "alternatives" list (same muscle group) — see GET /exercises/:id. */
export interface ExerciseDetail extends Exercise {
  alternatives: Exercise[];
}

// ---- Training: Workout / WorkoutSession -----------------------------------
// docs/mobile/03-screen-inventory.md §C: Program Detail -> Workout Detail ->
// Active Workout -> Workout Complete. Added Phase 1 (18 Aug 2026) alongside
// apps/api/prisma/schema.prisma's Workout/WorkoutExercise/WorkoutSession/
// ExerciseSetLog models.

export type WorkoutPhase = "warmup" | "main" | "cooldown";

export interface WorkoutExercise {
  id: string;
  exercise: Exercise;
  phase: WorkoutPhase;
  order: number;
  targetSets: number;
  targetReps: number;
}

export interface Workout {
  id: string;
  programId: string;
  name: string;
  order: number;
  durationMinutes: number;
  intensity: "beginner" | "intermediate" | "advanced";
}

/** Workout + its exercise list — the shape GET /workouts/:id returns. */
export interface WorkoutDetail extends Workout {
  exercises: WorkoutExercise[];
  /** Enough of the parent Program to gate "Start Workout" — see §I below. */
  program: { id: string; name: string; priceCents: number; purchased: boolean };
}

/** Program + its workout list — the shape GET /programs/:id returns. */
export interface ProgramDetail extends Program {
  workouts: Workout[];
  /** True for free programs, or a priced one this user has bought — §I below. */
  purchased: boolean;
}

// ---- Programs Commerce: one-off Program purchases -------------------------
// docs/mobile/03-screen-inventory.md §I. Deliberately single-tier — no
// AI-only vs AI+Coach add-on (needs Coach infra, Phase 5) and no payment
// gateway (purchase activates directly) — see
// docs/mobile/07-open-questions-gaps.md §14/§15.

export interface ProgramPurchase {
  id: string;
  userId: string;
  programId: string;
  priceCents: number;
  createdAt: string;
}

/** One row of "My Programs" — GET /programs/mine. */
export interface MyProgram {
  program: Program;
  totalWorkouts: number;
  completedWorkouts: number;
  status: "active" | "completed";
  purchasedAt: string | null;
}

/**
 * Program Progress + Program Completion share this shape — GET
 * /programs/:id/progress. Which screen the client shows is just `status`.
 * No streak (see gap §13's Streak Tracker), timeline, or AI insight/
 * recommendation — all real numbers from WorkoutSession/ExerciseSetLog.
 */
export interface ProgramProgressDetail {
  program: Program;
  totalWorkouts: number;
  completedWorkouts: number;
  status: "active" | "completed";
  purchasedAt: string | null;
  startedAt: string | null;
  lastCompletedAt: string | null;
  completedThisWeek: number;
  totalSetsLogged: number;
}

// ---- Timeline ---------------------------------------------------------
// docs/mobile/03-screen-inventory.md §G. A real "milestone spine" computed
// live from WorkoutSession/ExerciseSetLog/Program data — not a stored
// TimelineEvent table (same "computed, not stored" pattern as Personal
// Records). No "Goal Reached" events (no goal-setting feature exists yet,
// gap §10) or "VO2 max improvement" events (needs Recovery & Devices
// wearable data, gap §13/§E). Events are derived, not stored rows, so `id`
// is a synthetic-but-stable key (see apps/api's timeline.service.ts) — the
// client passes the whole event through navigation rather than re-fetching
// a single event by id.

export type TimelineEventType = "pr" | "milestone" | "program_complete";

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  detail: string;
  occurredAt: string;
}

export type WorkoutSessionStatus = "in_progress" | "completed" | "abandoned";

export interface ExerciseSetLog {
  id: string;
  exerciseId: string;
  setNumber: number;
  weightKg: number | null;
  reps: number;
  rpe: number | null;
  /** Set/Rest Tracker fields (trn-08) — false/null unless set from that screen. */
  isWarmup: boolean;
  isDropSet: boolean;
  note: string | null;
  loggedAt: string;
}

export interface WorkoutSession {
  id: string;
  userId: string;
  workoutId: string;
  status: WorkoutSessionStatus;
  startedAt: string;
  completedAt: string | null;
  /** U3 (15 Sep 2026) — real, server-persisted resume point. See ActiveWorkoutScreen. */
  currentExerciseIndex: number;
  setLogs: ExerciseSetLog[];
}

export interface LogSetInput {
  exerciseId: string;
  setNumber: number;
  weightKg?: number;
  reps: number;
  rpe?: number;
  isWarmup?: boolean;
  isDropSet?: boolean;
  note?: string;
}

/**
 * Workout History (docs/mobile/03-screen-inventory.md §C trn-11) — one row
 * per WorkoutSession, with real per-session totals computed server-side
 * (GET /workout-sessions). Not a stored table of its own, same "compute
 * from what's already logged" pattern as Timeline events and Personal
 * Records.
 */
export interface WorkoutHistoryEntry {
  id: string;
  workoutId: string;
  workoutName: string;
  programName: string;
  status: WorkoutSessionStatus;
  startedAt: string;
  completedAt: string | null;
  durationMinutes: number | null;
  totalSets: number;
  totalVolumeKg: number;
}

/**
 * Workout Complete (trn-10, docs/mobile/03-screen-inventory.md §C) — real
 * session totals, any new Personal Records set specifically during this
 * session (this session's best beating whatever was this user's best
 * BEFORE this session started, not just "is currently a PR"), and the
 * user's real current training streak (GET /workout-sessions/:id/summary,
 * added 19 Aug 2026). Not built: a heart-rate distribution chart (needs
 * wearable data, gap §13/§E).
 */
export interface WorkoutCompletionSummary {
  totalSets: number;
  totalVolumeKg: number;
  durationMinutes: number | null;
  newPersonalRecords: Array<{ exerciseId: string; exerciseName: string; weightKg: number; reps: number }>;
  trainingStreak: { currentStreak: number; longestStreak: number };
}

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface Recipe {
  id: string;
  name: string;
  mealType: MealType;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  prepTimeMinutes: number;
  tags: string[];
  /** Hero image URL, added 4 Sep 2026 — Recipe Detail specified one from the start and never had it. Null falls back to the icon tile. */
  imageUrl: string | null;
  /** Added 22 Aug 2026 — see `ContentStatus`'s own doc comment. */
  status: ContentStatus;
  createdByAdminId: string | null;
  updatedAt: string;
}

// ---- Nutrition: Recipe -> logged MealLog ----------------------------------
// docs/mobile/03-screen-inventory.md §D: Nutrition Dashboard's meal
// timeline, Recipe Detail's "Log" action, Log Meal's manual-entry card.
// Added Phase 1 (18 Aug 2026) alongside apps/api/prisma/schema.prisma's
// MealLog model.

/** `ai_estimate` added U4 (15 Sep 2026) — see `FoodEstimate`'s own doc comment below. */
export type MealLogSource = "recipe" | "manual" | "ai_estimate";

export interface MealLog {
  id: string;
  userId: string;
  recipeId: string | null;
  mealType: MealType;
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  source: MealLogSource;
  loggedAt: string;
}

/**
 * The write side of MealLog — matches apps/api's logMealSchema (Zod).
 * Either recipeId (Recipe Detail's "Log" action, macros copied
 * server-side) or name+calories (Log Meal's manual-entry card) must be
 * provided.
 */
export interface LogMealInput {
  mealType: MealType;
  recipeId?: string;
  name?: string;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}

// ---- Nutrition: Food input data-quality flow (Estimate -> Confirm/Edit) --
// U4 (15 Sep 2026) — BR-DAT-003 ("estimated data is not actual until
// confirmed/edited where required") and the Food-input row of the Core
// State Requirements table ("Estimated; user-confirmed; edited; logged.
// Estimate is not treated as confirmed fact."). See apps/api's FoodEstimate
// model (schema.prisma) for the full design reasoning. `POST
// /food-estimates` is synchronous, same convention as `POST /plans/generate`
// (apps/api's plans.service.ts) — it awaits the real AI call and resolves
// with a FINAL status (`estimated` or `insufficient_context`), never a
// persisted "estimating" — that phase only exists client-side, as the
// loading UI while the request is in flight.

export type FoodEstimateStatus = "estimated" | "insufficient_context" | "confirmed" | "edited";

export interface FoodEstimate {
  id: string;
  userId: string;
  mealType: MealType;
  /** The raw text the user typed, e.g. "2 eggs and a slice of toast". */
  description: string;
  status: FoodEstimateStatus;
  /** Null only when status is `insufficient_context` — no real numbers to show. */
  name: string | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  /** Set only when status is `insufficient_context` — a real, user-facing reason, never a raw error. */
  failureReason: string | null;
  /** Set once this estimate is confirmed/edited into a real MealLog. */
  mealLogId: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

/** Body for POST /food-estimates — matches apps/api's createFoodEstimateSchema (Zod). */
export interface CreateFoodEstimateInput {
  mealType: MealType;
  description: string;
}

/**
 * Body for POST /food-estimates/:id/confirm — matches apps/api's
 * confirmFoodEstimateSchema (Zod). Every field is optional: send none to
 * confirm the estimate exactly as given (status becomes `confirmed`), or
 * send whichever fields the user changed on the Confirm/Edit screen (status
 * becomes `edited`) — the server, not the client, decides which of the two
 * happened, by comparing against the estimate's own original values.
 */
export interface ConfirmFoodEstimateInput {
  name?: string;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}

// ---- Nutrition: WaterLog --------------------------------------------------
// docs/mobile/03-screen-inventory.md §D's "water-intake tracker (glasses
// toward a goal)". Added alongside apps/api/prisma/schema.prisma's
// WaterLog model (19 Aug 2026) — see gap §25 for what's a real per-user
// goal vs. a hardcoded client placeholder.

export interface WaterLog {
  id: string;
  userId: string;
  glasses: number;
  loggedAt: string;
}

export interface LogWaterInput {
  glasses?: number;
}

// ---- Progress & Body: logged BodyMeasurement + computed PersonalRecord ----
// docs/mobile/03-screen-inventory.md §F: Progress Overview, Body
// Measurements, Log Measurements. Added Phase 2 (19 Aug 2026) alongside
// apps/api/prisma/schema.prisma's BodyMeasurement model. PersonalRecord is
// NOT a stored entity — it's computed server-side from ExerciseSetLog (the
// heaviest logged weight per exercise), not a calculated 1RM.

export interface BodyMeasurement {
  id: string;
  userId: string;
  weightKg: number | null;
  chestCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  armsCm: number | null;
  thighsCm: number | null;
  /** Broader Baseline/measurements (18 Sep 2026) — clearly optional, most users won't have a precise reading. See schema.prisma's BodyMeasurement.bodyFatPercent comment. */
  bodyFatPercent: number | null;
  loggedAt: string;
}

/** The write side of BodyMeasurement — matches apps/api's logMeasurementSchema (Zod). At least one field is required. */
export interface LogMeasurementInput {
  weightKg?: number;
  chestCm?: number;
  waistCm?: number;
  hipsCm?: number;
  armsCm?: number;
  thighsCm?: number;
  bodyFatPercent?: number;
}

/**
 * Progress Photos (docs/mobile/03-screen-inventory.md §F), added 19 Aug
 * 2026. `imageData` is a full `data:image/jpeg;base64,...` URI — real,
 * server-persisted, but stored directly in Postgres rather than object
 * storage, since none exists in this build. See the ProgressPhoto model's
 * own doc comment in apps/api/prisma/schema.prisma and gap §34.
 */
export interface ProgressPhoto {
  id: string;
  userId: string;
  imageData: string;
  note: string | null;
  takenAt: string;
}

/** The write side of ProgressPhoto — matches apps/api's createProgressPhotoSchema (Zod). */
export interface CreateProgressPhotoInput {
  imageData: string;
  note?: string;
}

export interface PersonalRecord {
  exerciseId: string;
  exerciseName: string;
  bestWeightKg: number;
  reps: number;
  achievedAt: string;
}

/** The shape GET /progress/overview returns. */
export interface ProgressOverview {
  latestMeasurement: BodyMeasurement | null;
  /** Oldest-first, ready to plot left-to-right as a trend. */
  weightHistory: Array<{ weightKg: number; loggedAt: string }>;
  personalRecords: PersonalRecord[];
}

// ---- Streak Tracker --------------------------------------------------
// docs/mobile/03-screen-inventory.md §F: "a 'fire' streak banner, a grid
// heatmap (calendar-style), and a per-category streak list (training,
// nutrition, mindfulness, hydration)." Added 19 Aug 2026, computed
// server-side (GET /progress/streaks) from real WorkoutSession/MealLog/
// WaterLog dates already logged — not a stored StreakRecord table, same
// "computed, not stored" precedent as PersonalRecord above. "mindfulness"
// is NOT one of the categories here — no mindfulness feature or data model
// exists anywhere in this app, see gap §29.

export type StreakCategory = "training" | "nutrition" | "hydration";

export interface CategoryStreak {
  category: StreakCategory;
  currentStreak: number;
  longestStreak: number;
  /** "YYYY-MM-DD" (UTC) — every day this category had any logged activity, all-time. The client groups these into a month grid itself, same pattern as Workout History/Nutrition Calendar. */
  activeDates: string[];
}

/** The shape GET /progress/streaks returns. */
export interface StreakSummary {
  categories: CategoryStreak[];
  /** A day counts if ANY category was active that day. */
  overall: { currentStreak: number; longestStreak: number };
}

// ---- Check-In (R1 Developer 1 U5, 15 Sep 2026) --------------------------
// The required "Daily / weekly Check-In" screen (work package §4) — see
// apps/api's CheckIn model (schema.prisma) for the full design. Three
// real self-reported ratings (1-5 each: energy, soreness, adherence to
// plan) plus an optional note, at most one per user per real calendar
// period (today, or the current ISO week) — enforced by a real DB unique
// constraint, not a client-side guess. Deliberately NOT wired into the
// Plan/Recommendation engine's AI reasoning (apps/api's plans.service.ts,
// owned by a parallel U5 workstream) and deliberately does NOT compute a
// "context confidence" score — see docs/mobile/07-open-questions-gaps.md
// for the full reasoning.

export type CheckInPeriod = "daily" | "weekly";

export interface CheckIn {
  id: string;
  userId: string;
  period: CheckInPeriod;
  /** "YYYY-MM-DD" (UTC) for daily, "YYYY-Www" (ISO week) for weekly — the real period this entry claims. */
  periodKey: string;
  energy: number;
  soreness: number;
  adherence: number;
  note: string | null;
  createdAt: string;
}

/** Body for POST /check-ins — matches apps/api's submitCheckInSchema (Zod). */
export interface SubmitCheckInInput {
  period: CheckInPeriod;
  energy: number;
  soreness: number;
  adherence: number;
  note?: string;
}

export interface CheckInPeriodStatus {
  submitted: boolean;
  /** The real entry for the current period, if one was submitted — never fabricated when `submitted` is false. */
  checkIn: CheckIn | null;
}

/** The shape GET /check-ins/status returns. */
export interface CheckInStatus {
  daily: CheckInPeriodStatus;
  weekly: CheckInPeriodStatus;
}

// ---- Subscriptions -----------------------------------------------------
// Corresponds to the admin console's Plan/Subscription entities — one
// shared table, not duplicated between apps (docs/mobile/05-data-model.md §2).

export type SubscriptionTier = "basic" | "pro" | "elite";
// `expired`/`revoked` added 18 Sep 2026 (gap §57) — see
// apps/api/prisma/schema.prisma's SubscriptionStatus enum doc comment for
// the full real cancel-at-period-end policy and force-revoke design.
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "expired" | "revoked";
/** Named 25 Aug 2026 for Module 06.05's AdminPlanListItem — was previously only ever an inline literal. */
export type BillingCycle = "monthly" | "annual";

export interface SubscriptionPlan {
  id: string;
  tier: SubscriptionTier;
  name: string;
  priceCents: number;
  billingCycle: BillingCycle;
}

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  status: SubscriptionStatus;
  renewsAt: string | null;
  createdAt: string;
  /** Gap §57 (18 Sep 2026) — set true by the real cancel-at-period-end policy; see subscriptions.service.ts. */
  cancelAtPeriodEnd: boolean;
  /** Gap §57 — only ever set by the admin force-revoke action. */
  revokedAt: string | null;
  revokedReason: string | null;
}

/**
 * Subscription with its Plan joined in — the shape apps/api's
 * subscriptions endpoints actually return (GET /subscriptions/me,
 * /subscriptions/history, POST /subscriptions, /subscriptions/cancel).
 * Added Phase 3 (19 Aug 2026) — docs/mobile/03-screen-inventory.md §M.
 */
export interface SubscriptionDetail extends Subscription {
  plan: SubscriptionPlan;
}

/** The write side of subscribing/changing plan — matches apps/api's subscribeSchema (Zod). */
export interface SubscribeInput {
  planId: string;
}

/** Gap §57 (18 Sep 2026) — matches apps/api's revokeSubscriptionSchema (Zod), POST /admin/subscriptions/:id/revoke. */
export interface RevokeSubscriptionInput {
  reason: string;
}

export interface RevokeSubscriptionResponse {
  subscription: SubscriptionDetail;
}

// ---- Payments (Razorpay integration, added 20 Aug 2026) -------------------
// Closes gap §14 — see apps/api/src/modules/payments's own doc comment for
// the full order/verify/webhook flow. Shared by both Subscription &
// Payments (§M) and Programs Commerce (§I), which is why `referenceId` is
// generic (a SubscriptionPlan.id or a Program.id) rather than two
// separate purpose-specific shapes.

/** PAY-01 (5 Sep 2026) added "booking" — a coach session payment, alongside subscriptions and program purchases. */
export type PaymentPurpose = "subscription" | "program_purchase" | "booking";
/** `Payment.status` — added 21 Aug 2026 for apps/admin-web's Module 02 (Users), the Payment model itself predates this by a day but had no shared status type yet since nothing outside apps/api read it directly until now. */
export type PaymentStatus = "created" | "paid" | "failed";

export interface CreateRazorpayOrderInput {
  purpose: PaymentPurpose;
  /** A SubscriptionPlan.id, a Program.id, or (purpose "booking") a ProfessionalServiceOffering.id. */
  referenceId: string;
  /** Module 06.05 Coupons (31 Aug 2026) — an optional discount code applied server-side; an invalid code fails the order. */
  couponCode?: string;
  /** PAY-01 (5 Sep 2026) — required when purpose is "booking": the specific session time being paid for. Ignored otherwise. */
  scheduledAt?: string;
}

/** What POST /payments/razorpay/orders returns — everything RazorpayCheckoutModal.tsx needs to open a real Razorpay Checkout. */
export interface RazorpayOrder {
  orderId: string;
  amountCents: number;
  currency: string;
  keyId: string;
  name: string;
  description: string;
  /** Module 06.05 Coupons (31 Aug 2026) — the applied code + discount, null when none. `amountCents` above is already discounted. */
  couponCode?: string | null;
  discountCents?: number | null;
}

/** POST /coupons/validate — the pre-checkout discount preview. */
export type CouponValidatePreview =
  | { valid: false; reason: string }
  | { valid: true; code: string; description: string | null; discountCents: number; finalCents: number };

export interface VerifyRazorpayPaymentInput {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface VerifyRazorpayPaymentResult {
  verified: boolean;
  purpose: PaymentPurpose;
  referenceId: string;
  /** PAY-01 (5 Sep 2026) — set only when purpose is "booking" and this specific /verify call is what activated the payment (an idempotent retry of an already-verified one omits it — see payments.service.ts's own comment). The real BookingConfirmation, so the client can go straight to Booking Confirmation without a second request. */
  booking?: BookingConfirmation;
}

// U6 Premium entitlement (15 Sep 2026, §9 / BR-COM-011) — "paid" alone was
// never sufficient to mean "the user has the thing they paid for," see
// payments.service.ts's Payment model + activatePayment() doc comments for
// the full "money captured but entitlement grant failed" story this closes.

/** GET /payments/:id — a specific payment's real activation state, for a recoverable post-checkout screen to read/poll instead of trusting only the one-shot /verify result. */
export interface PaymentStatusDetail {
  id: string;
  purpose: PaymentPurpose;
  referenceId: string;
  status: PaymentStatus;
  /** Set once the entitlement (Subscription/ProgramPurchase) was actually granted — distinct from `status === "paid"`, which only means Razorpay captured the money. */
  activatedAt: string | null;
  /** Set when a prior activation attempt captured the money but failed to grant the entitlement — retryable via POST /payments/:id/retry-activation, never a reason to re-charge. */
  activationFailedAt: string | null;
  activationFailureReason: string | null;
}

/** POST /payments/:id/retry-activation — same result shape as a successful /verify, since it's the same underlying activation. */
export type RetryActivationResult = VerifyRazorpayPaymentResult;

// ---- Reminders ----------------------------------------------------------
// docs/mobile/03-screen-inventory.md §K "Add Reminder", Phase 4. Purely
// local, on-device notifications scheduled by the client via
// expo-notifications (see apps/user-mobile's src/lib/reminderNotifications.ts)
// — there's no server-push infrastructure here. daysOfWeek uses JS's
// Date.getDay() convention (0 = Sunday .. 6 = Saturday) everywhere,
// including client-side scheduling, which converts to Expo's own
// `weekday` trigger convention (1 = Sunday .. 7 = Saturday) only at the
// point it calls expo-notifications.

export type ReminderCategory = "workout" | "meal" | "water" | "measurement" | "general";

export interface Reminder {
  id: string;
  userId: string;
  category: ReminderCategory;
  label: string;
  hour: number;
  minute: number;
  daysOfWeek: number[];
  playSound: boolean;
  isEnabled: boolean;
  createdAt: string;
}

/** Matches apps/api's createReminderSchema (Zod). */
export interface CreateReminderInput {
  category?: ReminderCategory;
  label: string;
  hour: number;
  minute: number;
  daysOfWeek: number[];
  playSound?: boolean;
  isEnabled?: boolean;
}

/** Matches apps/api's updateReminderSchema (Zod) — all fields optional, at least one required. */
export type UpdateReminderInput = Partial<CreateReminderInput>;

// ---- Settings / Account management --------------------------------------
// docs/mobile/03-screen-inventory.md §L "Security" (+ "Data & Privacy",
// folded into the same screen — see apps/user-mobile's
// SecurityScreen.tsx). Real password change, active-session list/revoke,
// GDPR-style data export, and account deletion — all backed by
// apps/api's existing User/RefreshToken models, no new tables.

/** Matches apps/api's changePasswordSchema (Zod). Revokes every active session on success. */
export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/**
 * One RefreshToken issuance. No device metadata is captured at login (no
 * user-agent/device-name field on RefreshToken), so this is a plain list
 * of session issuances, not the phone/laptop/tablet icons the design
 * shows — see docs/mobile/07-open-questions-gaps.md.
 */
export interface Session {
  id: string;
  createdAt: string;
  expiresAt: string;
}

/** Matches apps/api's deleteAccountSchema (Zod) — current password required as confirmation. */
export interface DeleteAccountInput {
  password: string;
}

// §L "Security" — Two-Factor Authentication (25 Aug 2026, gap §17). TOTP
// (authenticator-app style), not SMS — see apps/api's lib/twoFactor.ts
// for why that's the genuinely unblocked half of this gap. Three-call
// flow: setup (get a QR to scan) -> enable (prove a real code from it,
// receive recovery codes once) -> disable (password-confirmed, any time).

/** POST /users/me/2fa/setup response — `secret` is for manual entry if the QR can't be scanned; `qrCodeDataUrl` is a ready-to-render `data:image/png;base64,...` string, rendered server-side so no QR library is needed on the client. */
export interface SetupTwoFactorResponse {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

/** Matches apps/api's enableTwoFactorSchema (Zod). */
export interface EnableTwoFactorInput {
  code: string;
}

/** POST /users/me/2fa/enable response — `recoveryCodes` are shown in PLAINTEXT exactly once; there's no way to retrieve them again after this response. */
export interface EnableTwoFactorResponse {
  recoveryCodes: string[];
}

/** Matches apps/api's disableTwoFactorSchema (Zod) — current password required as confirmation, same pattern as DeleteAccountInput. */
export interface DisableTwoFactorInput {
  password: string;
}

/** The full shape returned by GET /users/me/export — everything this user owns, gathered live. */
export interface UserDataExport {
  exportedAt: string;
  profile: User;
  onboardingProfile: OnboardingProfile | null;
  workoutSessions: WorkoutSession[];
  mealLogs: MealLog[];
  bodyMeasurements: BodyMeasurement[];
  programPurchases: ProgramPurchase[];
  subscriptions: Subscription[];
  reminders: Reminder[];
}

// ---- Support --------------------------------------------------------------
// docs/mobile/03-screen-inventory.md §L "Support", Phase 4, added 19 Aug
// 2026. The mobile-writable subset of docs/admin/06-data-model.md's
// SupportTicket entity — `priority`/`status`/`assignee`/a message thread
// are admin-console (Phase 6) concerns; from here, a ticket is create +
// list-your-own only, always starting (and, until Phase 6, staying) `open`.

export type SupportTicketCategory = "bug" | "feature_request" | "billing" | "account" | "other";
export type SupportTicketPriority = "low" | "normal" | "high";
export type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";

export interface SupportTicket {
  id: string;
  userId: string;
  category: SupportTicketCategory;
  subject: string;
  message: string;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
}

/** Matches apps/api's createSupportTicketSchema (Zod). */
export interface CreateSupportTicketInput {
  category?: SupportTicketCategory;
  subject: string;
  message: string;
}

// Support Ticket Messages (added 3 Sep 2026, closes gap §19's remaining
// "no message thread" note) — see apps/api's prisma/schema.prisma
// SupportTicketMessage doc comment for the full design. `sender` is who
// wrote a given reply; a "user" message is always from the ticket's one
// owner, an "admin" message from whichever admin replied.
export type SupportTicketMessageSender = "user" | "admin";

export interface SupportTicketMessage {
  id: string;
  sender: SupportTicketMessageSender;
  body: string;
  createdAt: string;
}

/** GET /support/tickets/:id — owner-only ticket detail + its full thread. */
export interface SupportTicketDetailResponse {
  ticket: SupportTicket;
  messages: SupportTicketMessage[];
}

/** Body for POST /support/tickets/:id/messages — matches support.schema.ts's sendSupportTicketMessageSchema. */
export interface SendSupportTicketMessageInput {
  body: string;
}

// ---- Referral -------------------------------------------------------------
// §O "Refer & Invite" (docs/mobile/03-screen-inventory.md), added 19 Aug
// 2026. See the `Referral` model's doc comment in apps/api's
// prisma/schema.prisma for why there's no reward/earnings field here —
// the design's "you get / friend gets" rewards grid needs a real
// referral-bonus decision this build doesn't make.

/** The shape returned by GET /referrals/me. */
export interface ReferralSummary {
  code: string;
  /** Count of real signups attributed to this user's code — not "invited" (unmeasurable without real invite-send tracking, see docs/mobile/07-open-questions-gaps.md). */
  referredSignups: number;
  /** Real earned subscription-credit balance in months (31 Aug 2026 — see referrals.service.ts's grantReferralRewardIfEligible). */
  creditMonths: number;
  /** Count of granted ReferralReward rows. */
  rewardsEarned: number;
}

// ---- Admin console (Phase 6, added 20 Aug 2026) ----------------------------
// docs/admin/*.md. AdminUser is a genuinely separate identity from `User`
// above — see apps/api's prisma/schema.prisma AdminUser doc comment for
// why. Only `super_admin` is actually enforced anywhere yet (gap §7 in
// docs/admin/07-open-questions-gaps.md); the other 7 role names are listed
// here because they're real, confirmed role names from the Figma review,
// not because their permission matrices are implemented.

export type AdminRole =
  | "super_admin"
  | "user_operations"
  | "coach_operations"
  | "finance"
  | "content"
  | "growth"
  | "analytics"
  | "support";

export type AdminUserStatus = "active" | "disabled";

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  status: AdminUserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Matches apps/api's adminLoginSchema (Zod). */
export interface AdminLoginInput {
  email: string;
  password: string;
}

export interface AdminLoginResult {
  adminUser: AdminUser;
  token: string;
  tokenExpiresAt: number;
}

/** The shape returned by GET /admin/dashboard/stats — see adminDashboard.service.ts's own doc comment for what's real vs. deliberately not-yet-available. */
export interface AdminDashboardStats {
  kpis: {
    totalUsers: number;
    newUsersLast30d: number;
    activeUsers30d: number;
    activePaidUsers: number;
    totalPrograms: number;
    totalProgramPurchases: number;
  };
  userGrowth: { month: string; count: number }[];
  conversionFunnel: {
    freeRegistered: number;
    trialUsers: number;
    convertedPaid: number;
  };
  subscriptionsByTier: { tier: string; count: number }[];
  revenue: {
    totalPaidCents: number;
    failedPayments: number;
  };
  requiresAttention: {
    openSupportTickets: number;
    inProgressSupportTickets: number;
    failedPayments: number;
    /** Real as of 6 Sep 2026 — was notAvailable before the Refund model was wired up to this KPI. */
    openRefundRequests: number;
  };
  /** Real as of 20 Aug 2026 (Phase 5) — see adminDashboard.service.ts's doc comment. */
  marketplaceStatus: {
    activeProfessionals: number;
    pendingProfessionalApplications: number;
    activeCoachingRelationships: number;
    unassignedUsersPool: number;
  };
  recentSignups: { id: string; fullName: string; email: string; createdAt: string }[];
  /** Names of spec'd Executive Dashboard KPIs this backend can't compute yet — see adminDashboard.service.ts. */
  notAvailable: string[];
}

// ---- Coach marketplace (Phase 5, apps/coach-mobile) -----------------------
// Added 20 Aug 2026 — see docs/coach/07-open-questions-gaps.md's "Phase 5
// started" entry for exactly what was and wasn't decided. `Professional` is
// a separate identity from `User`/`AdminUser` (its own auth, its own JWT
// secret) — see apps/api/src/modules/professionalAuth. **25 Aug 2026:**
// Discovery & Booking (the types below, after ProfessionalDashboardStats)
// is now real too, closing gap §1 — see coaching.service.ts's doc comment
// for the full "what's real vs. simplified" breakdown.

export type ProfessionalServiceType = "fitness" | "nutrition";
export type CredentialStatus = "not_verified" | "pending" | "verified" | "rejected";
export type ProfessionalStatus = "active" | "suspended";
/**
 * `Professional.lifecycleStatus` (R2 Wave 1, 20 Sep 2026) — the account-
 * level slice of Developer 2's R1 work package §2 lifecycle
 * (`APPLICATION -> VERIFICATION -> APPROVED -> AVAILABLE -> ...`); only
 * these first 4 stages plus `suspended` exist as real DB state today —
 * everything from OFFERED onward is `RelationshipStatus` above, a later
 * wave's scope. Additive alongside `ProfessionalStatus` and
 * `CredentialStatus` — see apps/api's schema.prisma comment on this same
 * enum for the full, documented interaction between all three.
 */
export type ProfessionalLifecycleStatus = "application" | "verification" | "approved" | "available" | "suspended";
/**
 * `Relationship.status` (docs/coach/05-data-model.md §3) — added 21 Aug 2026
 * for apps/admin-web's Module 03/04, the Relationship model itself predates
 * this by a day (see prisma/schema.prisma) but had no shared type yet since
 * nothing outside apps/api read it directly until now. **Extended 15 Sep
 * 2026 (R1 U6)** from just `active | ended` to the real six-stage lifecycle
 * schema.prisma's own `RelationshipStatus` enum comment describes.
 * **16 Sep 2026 (gap §56):** `accepted` is now reached only via a real
 * coach review (apps/coach-mobile's Pending Requests screen, see
 * `PendingRelationshipItem` below) — `requested` no longer auto-advances.
 */
export type RelationshipStatus = "requested" | "accepted" | "awaiting_payment" | "activating" | "active" | "ended";

/** Public shape — never carries passwordHash or the raw kycDocumentData (see professionalAuth.service.ts's toPublicProfessional). */
export interface Professional {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  bio: string | null;
  specializationTags: string[];
  yearsExperience: number | null;
  status: ProfessionalStatus;
  kycStatus: CredentialStatus;
  /** R2 Wave 1 (20 Sep 2026) — see `ProfessionalLifecycleStatus`'s own doc comment. */
  lifecycleStatus: ProfessionalLifecycleStatus;
  /** R2 Wave 1 (20 Sep 2026) — flat cap on currently-`active` Relationship rows, coach/admin-editable. Default 15. */
  maxActiveClients: number;
  createdAt: string;
  updatedAt: string;
}

/** Matches professionalAuth.schema.ts's professionalSignupSchema. */
export interface ProfessionalSignupInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}

/** Matches professionalAuth.schema.ts's professionalLoginSchema. */
export interface ProfessionalLoginInput {
  email: string;
  password: string;
}

/** Shared shape for /professionals/auth/signup and /professionals/auth/login — mirrors AuthResponse. */
export interface ProfessionalAuthResponse {
  professional: Professional;
  tokens: AuthTokens;
  onboardingCompleted: boolean;
}

/** Mirrors MeResponse, for GET /professionals/me. */
export interface ProfessionalMeResponse {
  professional: Professional;
  onboardingCompleted: boolean;
}

/**
 * One row per (professional, serviceType) pair — docs/coach/05-data-model.md
 * §2's correction from an earlier one-row-per-professional draft. Document
 * fields are omitted from GET /professionals/me/onboarding's response
 * (see professionalOnboarding.service.ts's getOnboardingStatus) but ARE
 * echoed back by POST /professionals/me/credentials today — both are typed
 * as optional here to cover both real response shapes honestly rather than
 * picking the stricter one and being wrong about the other.
 */
export interface ProfessionalCredential {
  id: string;
  professionalId: string;
  serviceType: ProfessionalServiceType;
  certificationName: string | null;
  certifyingBody: string | null;
  yearObtained: number | null;
  certificationDocData?: string | null;
  qualificationDocData?: string | null;
  status: CredentialStatus;
  createdAt: string;
  updatedAt: string;
}

/** Matches professionalOnboarding.schema.ts's selectServicesSchema. */
export interface SelectServicesInput {
  services: ProfessionalServiceType[];
}

/** Matches professionalOnboarding.schema.ts's submitCredentialSchema. `*DocData` are data: URIs (image or PDF), same convention as CreateProgressPhotoInput. */
export interface SubmitCredentialInput {
  serviceType: ProfessionalServiceType;
  certificationName?: string;
  certifyingBody?: string;
  yearObtained?: number;
  certificationDocData?: string;
  qualificationDocData?: string;
}

/** Matches professionalOnboarding.schema.ts's submitKycSchema. */
export interface SubmitKycInput {
  kycDocumentData: string;
}

/** The shape returned by GET /professionals/me/onboarding. */
export interface ProfessionalOnboardingStatus {
  credentials: ProfessionalCredential[];
  kycStatus: CredentialStatus;
}

/** One row of the coach's real schedule — shared by ProfessionalDashboardStats.todaysSchedule and GET /professionals/me/schedule. */
export interface CoachScheduleItem {
  id: string;
  clientFullName: string;
  offeringLabel: string;
  serviceType: ProfessionalServiceType | null;
  scheduledAt: string;
  durationMinutes: number;
  status: BookingStatus;
}

/** The shape returned by GET /professionals/me/dashboard — see professionalDashboard.service.ts's own doc comment for what's real vs. not-yet-available. */
export interface ProfessionalDashboardStats {
  services: { serviceType: ProfessionalServiceType; verificationStatus: CredentialStatus }[];
  activeClients: number;
  /** Real since 26 Aug 2026 — confirmed Bookings in the next 7 days (rolling, not calendar-week). See professionalDashboard.service.ts. */
  sessionsThisWeek: number;
  /** Real since 26 Aug 2026 — confirmed Bookings scheduled for today (UTC calendar day, same convention as coaching.service.ts's availability grid). */
  todaysSchedule: CoachScheduleItem[];
  /** Always ["avgRating"] today — no Review model exists anywhere in this build. sessionsThisWeek/todaysSchedule are no longer in this list as of 26 Aug 2026. */
  notAvailable: string[];
}

// ---- Coach Discovery & Booking (added 25 Aug 2026) -------------------
// Closes docs/coach/07-open-questions-gaps.md gap §1 — v1-coach's
// 7-screen version (Discovery Filters+List, Coach Profile Detail,
// Booking: Service Selection, Booking Confirmation, My Professional
// Team, Change Professional) adopted as authoritative over the consumer
// app's original 4-screen design, per an explicit product decision, not
// an engineering guess — see apps/api's coaching.service.ts doc comment
// for the full "what's real vs. simplified" breakdown (no rating/review
// system, a fixed availability grid rather than coach-configured hours,
// no payment collection yet).

export type BookingStatus = "confirmed" | "cancelled";
export type ChangeReasonCategory = "schedule_conflict" | "different_specialization" | "other";
export type RelationshipChangeStatus = "pending" | "approved" | "rejected";

/** One row of GET /coaching/professionals — the Discovery List card. */
export interface CoachDiscoveryItem {
  id: string;
  fullName: string;
  bio: string | null;
  specializationTags: string[];
  yearsExperience: number | null;
  verifiedServices: ProfessionalServiceType[];
  /** Cheapest active offering's priceCents, or null if this coach has no active offerings yet. */
  startingPriceCents: number | null;
}

/** The shape returned by GET /coaching/professionals. */
export interface CoachDiscoveryResponse {
  items: CoachDiscoveryItem[];
  /** rating/reviewCount/languages/region — no backing entity anywhere in this build, see coaching.service.ts. */
  notAvailable: string[];
}

/** `serviceType: null` means a combined (both-service) offering — see schema.prisma's ProfessionalServiceOffering comment. */
export interface CoachServiceOffering {
  id: string;
  serviceType: ProfessionalServiceType | null;
  label: string;
  durationMinutes: number;
  priceCents: number;
}

/** The shape returned by GET /coaching/professionals/:id. */
export interface CoachProfileDetail {
  id: string;
  fullName: string;
  bio: string | null;
  specializationTags: string[];
  yearsExperience: number | null;
  verifiedServices: ProfessionalServiceType[];
  totalClients: number;
  offerings: CoachServiceOffering[];
  notAvailable: string[];
}

export interface AvailabilitySlot {
  /** ISO 8601 timestamp for the slot's start. */
  time: string;
  available: boolean;
}

/** The shape returned by GET /coaching/professionals/:id/availability?date=YYYY-MM-DD — a fixed 9:00-18:00 hourly grid, not a coach-configured schedule, see coaching.service.ts. */
export interface CoachAvailabilityResponse {
  date: string;
  slots: AvailabilitySlot[];
}

/** Matches coaching.schema.ts's createBookingSchema. */
export interface CreateBookingInput {
  professionalId: string;
  offeringId: string;
  /** ISO 8601 date-time. */
  scheduledAt: string;
}

/** The shape returned by POST /coaching/bookings — everything Booking Confirmation needs. */
export interface BookingConfirmation {
  id: string;
  professionalId: string;
  professionalFullName: string;
  offeringLabel: string;
  scheduledAt: string;
  durationMinutes: number;
  priceCents: number;
  status: BookingStatus;
  relationshipIds: string[];
}

/**
 * U6 (15 Sep 2026) — the shape returned by GET /coaching/relationships/status,
 * backing the real "Professional guidance request / status / active
 * relationship entry" screen. One row per relationship that isn't `ended`
 * (requested/accepted/awaiting_payment/activating/active), so the client
 * can render a genuine state stepper — see coaching.service.ts's
 * listRelationshipStatus doc comment.
 */
export interface RelationshipStatusItem {
  relationshipId: string;
  professionalId: string;
  professionalFullName: string;
  serviceType: ProfessionalServiceType;
  status: RelationshipStatus;
  createdAt: string;
}

export interface RelationshipStatusResponse {
  relationships: RelationshipStatusItem[];
}

/**
 * **16 Sep 2026 (gap §56)** — the real coach-side review gate: one row of
 * GET /professionals/me/relationships/requests, backing apps/coach-mobile's
 * new Pending Requests screen. Only ever `requested` relationships (a
 * relationship this coach has already accepted/declined never appears
 * here again) — see coaching.service.ts's listPendingRelationships doc
 * comment.
 */
export interface PendingRelationshipItem {
  relationshipId: string;
  userId: string;
  userFullName: string;
  serviceType: ProfessionalServiceType;
  createdAt: string;
}

export interface PendingRelationshipsResponse {
  requests: PendingRelationshipItem[];
}

/** Matches coaching.schema.ts's declineRelationshipSchema — POST /professionals/me/relationships/:id/decline's optional body. */
export interface DeclineRelationshipInput {
  reason?: string;
}

/** One row of "My Professional Team" — real last/next session dates computed from Booking. */
export interface CoachTeamMember {
  relationshipId: string;
  professionalId: string;
  professionalFullName: string;
  specializationTags: string[];
  serviceType: ProfessionalServiceType;
  lastSessionAt: string | null;
  nextSessionAt: string | null;
}

/** The shape returned by GET /coaching/team. */
export interface CoachTeamResponse {
  team: CoachTeamMember[];
  /** Top-by-experience verified coaches not already on the team — a real, defensible substitute for a recommendation engine that doesn't exist, see coaching.service.ts. */
  recommended: CoachDiscoveryItem[];
}

/** Matches coaching.schema.ts's createChangeRequestSchema. */
export interface CreateChangeRequestInput {
  reason: ChangeReasonCategory;
  note?: string;
}

/**
 * The shape returned by GET /professionals/me/schedule (added 26 Aug
 * 2026) — apps/coach-mobile's real Calendar tab, scoped as a "no design
 * source exists" decision (docs/coach/02-information-architecture.md §2:
 * "Calendar has no frames in this file"): a real, sectioned list of the
 * coach's own Bookings, not an invented month-grid calendar widget. See
 * coaching.service.ts's `listMySchedule` doc comment.
 */
export interface CoachScheduleResponse {
  upcoming: CoachScheduleItem[];
  past: CoachScheduleItem[];
  /** True if `past` was capped — see coaching.service.ts for the limit. */
  pastTruncated: boolean;
}

/** The shape returned by POST /coaching/relationships/:id/change-request. Stays `pending` until a future admin Change/Intervention Queue screen exists to review it — see schema.prisma's RelationshipChangeStatus comment. */
export interface RelationshipChangeRequest {
  id: string;
  relationshipId: string;
  userId: string;
  reason: ChangeReasonCategory;
  note: string | null;
  status: RelationshipChangeStatus;
  createdAt: string;
}

// ---- Coach: Client Profile (apps/coach-mobile, added 31 Aug 2026) --------
// docs/coach/03-screen-inventory.md §D — the coach-facing counterpart to
// the consumer app's "My Professional Team". A coach sees only users they
// have an ACTIVE Relationship with (authorization enforced server-side in
// professionalClients.service.ts). Coaching-relevant onboarding fields
// (goals, training level, diet type) are surfaced because they're what a
// coach needs to coach; genuinely sensitive health data (age, weight,
// height, medical conditions, injuries) is NOT — it stays behind the same
// access boundary Module 02's SensitiveDataAccessRequest gates for admins,
// listed in `notAvailable` rather than exposed to a coach without an
// equivalent consent workflow, which this build doesn't have.

/** One row of GET /professionals/me/clients — the Clients list. */
export interface CoachClientListItem {
  userId: string;
  fullName: string;
  /** Distinct service types across this client's active relationships with the coach. */
  serviceTypes: ProfessionalServiceType[];
  /** Earliest active-relationship start date with this coach. */
  activeSince: string;
  /** Confirmed bookings with this coach whose time has passed. */
  sessionsCompleted: number;
  lastSessionAt: string | null;
  nextSessionAt: string | null;
}

export interface CoachClientListResponse {
  clients: CoachClientListItem[];
}

/** GET /professionals/me/clients/:userId — the Client Profile detail. */
export interface CoachClientProfile {
  userId: string;
  fullName: string;
  serviceTypes: ProfessionalServiceType[];
  activeSince: string;
  /** Coaching-relevant onboarding fields only — see the block comment above. */
  coaching: {
    goals: string[];
    trainingLevel: "beginner" | "intermediate" | "advanced" | null;
    dietType: string | null;
  };
  sessions: {
    upcoming: CoachScheduleItem[];
    past: CoachScheduleItem[];
    /** True if `past` was capped — same 50-row limit as the Calendar. */
    pastTruncated: boolean;
    totalCompleted: number;
  };
  /** Sensitive health fields a coach can't see without a consent workflow this build doesn't have. */
  notAvailable: string[];
}

// ---- Coach: Client Recommendation review (Wave 2.4, 20 Sep 2026) ---------
// The professional-authed counterpart to apps/user-mobile's own
// WhyThisChangedScreen — a coach reviewing one of their client's real AI
// Plan Recommendations. See apps/api's plans.service.ts#decideRecommendation
// doc comment: this wires the `decidedByRole: "professional"` parameter
// that function has accepted since it was written, via a thin new route
// (professionalClients.routes.ts) rather than new decision logic. Reuses
// `Recommendation`/`RecommendationKind`/`RecommendationStatus`/
// `DecideRecommendationInput` above unchanged — same shape a self-serve
// user's own decide call already uses.

/** GET /professionals/me/clients/:userId/recommendations — pending (status "active") Recommendations for one client, gated on a real active Relationship. */
export interface CoachClientRecommendationsResponse {
  recommendations: Recommendation[];
}

// ---- Coach ↔ Client Messaging (added 31 Aug 2026) ------------------------
// Backs the Messages tab in BOTH apps. One flat thread per (User,
// Professional) pair, gated on an active Relationship. NOT real-time — both
// clients poll (react-query refetch); see schema.prisma's CoachMessage doc
// comment. The API is symmetric: `partnerId`/`partnerName` is always the
// OTHER party (a professional for a user viewer, a user for a coach viewer),
// so both apps share these shapes.

export type CoachMessageSender = "user" | "professional";

export interface CoachMessageItem {
  id: string;
  sender: CoachMessageSender;
  content: string;
  createdAt: string;
  /** Set once the other party has opened the thread; null while unread. */
  readAt: string | null;
}

/** GET /coaching/conversations/:professionalId (user) or /professionals/me/conversations/:userId (coach). */
export interface CoachThreadResponse {
  partnerId: string;
  partnerName: string;
  messages: CoachMessageItem[];
}

export interface CoachConversationSummary {
  partnerId: string;
  partnerName: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  /** Messages from the other party this viewer hasn't opened yet. */
  unreadCount: number;
}

export interface CoachConversationListResponse {
  conversations: CoachConversationSummary[];
}

/** Body for POST …/conversations/:id — matches coachMessages.schema.ts. */
export interface SendCoachMessageInput {
  content: string;
}

// ---- Admin: Module 03 — Professionals (apps/admin-web) --------------------
// Added 21 Aug 2026 — see apps/api's adminProfessionals.service.ts doc
// comment for exactly what's real vs. honestly not modeled (Region,
// Languages, Rating, Earnings MTD, Sessions, Earnings, Reviews all have no
// backing entity yet).

export const professionalDirectoryTabs = [
  "all",
  "pendingVerification",
  "active",
  "rejected",
  "suspended",
  "credentialsExpiring",
] as const;
export type ProfessionalDirectoryTab = (typeof professionalDirectoryTabs)[number];

/** One row of GET /admin/professionals — a trimmed-down Professional, no passwordHash/kycDocumentData. */
export interface AdminProfessionalListItem {
  id: string;
  fullName: string;
  email: string;
  status: ProfessionalStatus;
  kycStatus: CredentialStatus;
  yearsExperience: number | null;
  services: { serviceType: ProfessionalServiceType; status: CredentialStatus }[];
  activeClients: number;
}

/** The shape returned by GET /professionals/me/lifecycle and used by the admin directory's own capacity edit. */
export interface ProfessionalLifecycleSummary {
  lifecycleStatus: ProfessionalLifecycleStatus;
  status: ProfessionalStatus;
  maxActiveClients: number;
  activeClients: number;
  isAvailableForNewClients: boolean;
}

/** Matches professionalLifecycle.schema.ts's updateMaxActiveClientsSchema (and adminProfessionals.schema.ts's admin equivalent). */
export interface UpdateMaxActiveClientsInput {
  maxActiveClients: number;
}

/** The shape returned by GET /admin/professionals. */
export interface AdminProfessionalDirectoryResponse {
  professionals: AdminProfessionalListItem[];
  counts: Record<ProfessionalDirectoryTab, number>;
  /** Figma-spec'd 03.01 columns with no backing field — see adminProfessionals.service.ts. */
  notAvailable: string[];
}

/** A `ProfessionalCredential` as the admin review screen sees it — INCLUDES the raw document data (certificationDocData/qualificationDocData), unlike the coach's own `ProfessionalOnboardingStatus` view. */
export interface AdminProfessionalCredential {
  id: string;
  professionalId: string;
  serviceType: ProfessionalServiceType;
  certificationName: string | null;
  certifyingBody: string | null;
  yearObtained: number | null;
  certificationDocData: string | null;
  qualificationDocData: string | null;
  status: CredentialStatus;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `Professional` as the admin review screen sees it — INCLUDES kycDocumentData/adminNotes, unlike the coach's own public `Professional` type. */
export interface AdminProfessionalDetailRecord {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  bio: string | null;
  specializationTags: string[];
  yearsExperience: number | null;
  status: ProfessionalStatus;
  kycStatus: CredentialStatus;
  kycDocumentData: string | null;
  adminNotes: string | null;
  /** R2 Wave 1 (20 Sep 2026) — see `ProfessionalLifecycleStatus`'s own doc comment. */
  lifecycleStatus: ProfessionalLifecycleStatus;
  maxActiveClients: number;
  createdAt: string;
  updatedAt: string;
  credentials: AdminProfessionalCredential[];
}

export interface AdminProfessionalClient {
  relationshipId: string;
  userId: string;
  userFullName: string;
  userEmail: string;
  serviceType: ProfessionalServiceType;
  status: RelationshipStatus;
  createdAt: string;
  endedAt: string | null;
}

/** The shape returned by GET /admin/professionals/:id. */
export interface AdminProfessionalDetailResponse {
  professional: AdminProfessionalDetailRecord;
  clients: AdminProfessionalClient[];
  /** 03.02's Sessions/Earnings/Reviews tabs — no backing entity, see adminProfessionals.service.ts. */
  notAvailable: string[];
}

/** Matches adminProfessionals.schema.ts's verifyCredentialSchema / verifyKycSchema. "Request Info" isn't a status — see that service's own comment for why. */
export interface AdminVerifyCredentialInput {
  status: "verified" | "rejected";
  adminNotes?: string;
}

export type AdminVerifyKycInput = AdminVerifyCredentialInput;

export interface AdminSuspendProfessionalInput {
  adminNotes?: string;
}

// ---- Admin: Module 04 — Relationships (apps/admin-web) --------------------
// Added 21 Aug 2026 — see apps/api's adminRelationships.service.ts doc
// comment for exactly what's real vs. honestly not modeled (Pricing,
// Sessions, Payments, and the Country filter have no backing field).
// **25 Aug 2026: 04.03 Change/Intervention Queue is real too** — see the
// AdminChangeRequest* types further below and adminRelationships.service.ts's
// top comment for the full design, including why "Requested (new
// professional)" has no backing field.

/** One row of GET /admin/relationships — both parties' identity flattened onto the pairing, since 04.01's table shows User and Professional as sibling columns, not a nested object. */
export interface AdminRelationshipListItem {
  id: string;
  userId: string;
  userFullName: string;
  userEmail: string;
  professionalId: string;
  professionalFullName: string;
  professionalEmail: string;
  serviceType: ProfessionalServiceType;
  status: RelationshipStatus;
  createdAt: string;
  endedAt: string | null;
}

/** The shape returned by GET /admin/relationships. */
export interface AdminRelationshipDirectoryResponse {
  relationships: AdminRelationshipListItem[];
  total: number;
  /** Figma-spec'd 04.01 columns/filters with no backing field — see adminRelationships.service.ts. */
  notAvailable: string[];
}

/** One `AuditLog` row for 04.02's History tab — the admin-action trail for one relationship, NOT the Figma's session/payment history (no `Booking` entity exists for that) — see adminRelationships.service.ts's own comment. */
export interface AdminRelationshipHistoryEntry {
  id: string;
  action: string;
  actorAdminId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** The shape returned by GET /admin/relationships/:id. */
export interface AdminRelationshipDetailResponse {
  relationship: AdminRelationshipListItem;
  history: AdminRelationshipHistoryEntry[];
  /** 04.02 Overview's Pricing/Sessions/Payments — see adminRelationships.service.ts. */
  notAvailable: string[];
}

/** Matches adminRelationships.schema.ts's endRelationshipSchema. */
export interface AdminEndRelationshipInput {
  reason?: string;
}

// 04.03 Change/Intervention Queue, added 25 Aug 2026.

/** One row of GET /admin/relationships/change-requests — both parties flattened onto the request, same convention as AdminRelationshipListItem. "requestedProfessionalId/FullName" don't exist — see adminRelationships.service.ts for why. */
export interface AdminChangeRequestListItem {
  id: string;
  relationshipId: string;
  userId: string;
  userFullName: string;
  userEmail: string;
  currentProfessionalId: string;
  currentProfessionalFullName: string;
  currentProfessionalEmail: string;
  serviceType: ProfessionalServiceType;
  reason: ChangeReasonCategory;
  note: string | null;
  status: RelationshipChangeStatus;
  reviewedByAdminId: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
}

/** The shape returned by GET /admin/relationships/change-requests. */
export interface AdminChangeRequestDirectoryResponse {
  requests: AdminChangeRequestListItem[];
  total: number;
  /** Always ["requestedProfessional"] — see AdminChangeRequestListItem's own comment. */
  notAvailable: string[];
}

/** Matches adminRelationships.schema.ts's reviewChangeRequestSchema — used for both approve and deny. */
export interface AdminReviewChangeRequestInput {
  reviewNotes?: string;
}

/** The shape returned by POST .../change-requests/:id/approve and .../deny. */
export interface AdminChangeRequestResponse {
  request: AdminChangeRequestListItem;
}

// ---- Admin: Module 02 — Users (apps/admin-web) -----------------------------
// Added 21 Aug 2026 — see apps/api's adminUsers.service.ts doc comment for
// exactly what's real vs. honestly not modeled (Region, Status, Last Sync,
// city/timezone/acquisition source, the auto-renew toggle, the Activity
// tab, and — deliberately never populated at all, not just listed as
// missing — the Figma's locked Sensitive Health Metrics panel). This
// module is read-only: neither 02.01's nor 02.02's spec'd primary actions
// (bulk-select, toggle auto-renew, request sensitive-data access) have a
// real backing mechanism, so unlike Modules 03/04 there's no input type
// here for a state-changing action.

export type MembershipTier = "basic" | "pro" | "elite" | "free";
/** "referral" if a `Referral` row exists with this user as referee, else "organic" — see adminUsers.service.ts. No richer acquisition-channel taxonomy is tracked anywhere in this schema. */
export type UserAcquisitionChannel = "referral" | "organic";
/** Mirrors `ProfessionalStatus`/`AdminUserStatus` exactly — account-operations only, added 26 Aug 2026. Not a moderation/trust-and-safety taxonomy (no "banned" state) — see `User.status`'s own schema comment. */
export type UserAccountStatus = "active" | "suspended";

/** One row of GET /admin/users. */
export interface AdminUserListItem {
  id: string;
  fullName: string;
  email: string;
  createdAt: string;
  membership: MembershipTier;
  channel: UserAcquisitionChannel;
  status: UserAccountStatus;
}

/** The shape returned by GET /admin/users. */
export interface AdminUserDirectoryResponse {
  users: AdminUserListItem[];
  total: number;
  /** Figma-spec'd 02.01 columns/filters with no backing field — see adminUsers.service.ts. "status" removed 26 Aug 2026, now real. */
  notAvailable: string[];
}

/** Matches apps/api's suspendUserSchema (Zod) — mirrors AdminSuspendProfessionalInput. */
export interface AdminSuspendUserInput {
  adminNotes?: string;
}

/** `User` as the admin Profile screen sees it — no passwordHash, and deliberately NO `OnboardingProfile` fields (gender/age/weightKg/heightCm/medicalConditions/injuries/allergens) — see adminUsers.service.ts's own comment on why that's a privacy decision, not just an honest gap. */
export interface AdminUserProfileRecord {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  referralCode: string;
  createdAt: string;
  updatedAt: string;
  /** Added 26 Aug 2026 — real, see AdminUserListItem's own comment. */
  status: UserAccountStatus;
}

export interface AdminUserLifetimeValue {
  totalSpentCents: number;
  monthsActive: number;
  avgMonthlySpendCents: number;
  /** null if this user has never attempted a payment. */
  paymentSuccessRate: number | null;
}

/** A `Payment` row as the admin Profile screen's Payments tab sees it. */
export interface AdminUserPayment {
  id: string;
  purpose: PaymentPurpose;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  createdAt: string;
}

/** A `Relationship` row from the user's side — mirrors `AdminProfessionalClient` but with the professional (not the user) as the "other party". */
export interface AdminUserRelationship {
  relationshipId: string;
  professionalId: string;
  professionalFullName: string;
  professionalEmail: string;
  serviceType: ProfessionalServiceType;
  status: RelationshipStatus;
  createdAt: string;
  endedAt: string | null;
}

/** One `AuditLog` row where this user is the actor — 02.02 Overview's "recent event/audit log feed", genuinely populated since most consumer-side mutations call `recordAudit()` with `actorId`. */
export interface AdminUserAuditEvent {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
}

// Sensitive Data Access Requests (02.02's locked "Sensitive Health
// Metrics" panel), added 25 Aug 2026 — see apps/api's
// adminUsers.service.ts top comment and prisma/schema.prisma's
// SensitiveDataAccessRequest model for the full design.

export type SensitiveAccessStatus = "pending" | "approved" | "denied";

/** One SensitiveDataAccessRequest row, as either party sees it. */
export interface SensitiveAccessRequest {
  id: string;
  reason: string;
  status: SensitiveAccessStatus;
  reviewNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

/** The real, backed data behind 02.02's locked panel — only ever present in AdminUserDetailResponse when sensitiveAccess.permitted is true. */
export interface SensitiveHealthMetrics {
  gender: string | null;
  age: number | null;
  weightKg: number | null;
  heightCm: number | null;
  allergens: string[];
  medicalConditions: string[];
  injuries: string[];
}

/** The CALLING admin's own state for this user's sensitive panel — see adminUsers.service.ts's getUserDetail. */
export interface AdminUserSensitiveAccess {
  /** True if this admin's role holds `sensitiveData: view` at all — false means don't offer a "Request Access" control. */
  canRequest: boolean;
  /** True if this admin's role holds `sensitiveData: approve` — gates whether pendingRequestForReview (and Approve/Deny controls) should render. */
  canReview: boolean;
  /** True only when this admin has an approved request for this exact user — the sole condition under which sensitiveHealthMetrics is populated. */
  permitted: boolean;
  /** This admin's own most recent request for this user, if any. */
  myLatestRequest: SensitiveAccessRequest | null;
  /** The most recent OTHER admin's still-pending request for this user — only ever non-null when canReview is true. A simplification (single most recent, not a full queue) matching the Figma's one-card panel, not a list screen. */
  pendingRequestForReview: { id: string; reason: string; createdAt: string; requestedByAdminId: string; requestedByAdminFullName: string } | null;
}

/** Matches apps/api's createSensitiveAccessRequestSchema (Zod). */
export interface CreateSensitiveAccessRequestInput {
  reason: string;
}

/** Matches apps/api's reviewSensitiveAccessRequestSchema (Zod) — used for both approve and deny. */
export interface ReviewSensitiveAccessRequestInput {
  reviewNotes?: string;
}

export interface SensitiveAccessRequestResponse {
  request: SensitiveAccessRequest;
}

/** The shape returned by GET /admin/users/:id. */
export interface AdminUserDetailResponse {
  user: AdminUserProfileRecord;
  membership: MembershipTier;
  lifetimeValue: AdminUserLifetimeValue;
  currentSubscription: SubscriptionDetail | null;
  subscriptions: SubscriptionDetail[];
  /** Gap §57 (18 Sep 2026) — true when the VIEWING admin's role holds `commerce: approve`, the force-revoke gate. Frontend-only convenience; the route itself enforces the same check server-side. */
  canForceRevoke: boolean;
  payments: AdminUserPayment[];
  relationships: AdminUserRelationship[];
  supportTickets: SupportTicket[];
  recentActivity: AdminUserAuditEvent[];
  /** 02.02's city/timezone/acquisition source, auto-renew toggle, and the Activity tab — see adminUsers.service.ts. "sensitiveHealthMetrics" is no longer in this list — its availability is real, per-viewing-admin state now, see sensitiveAccess below. */
  notAvailable: string[];
  sensitiveAccess: AdminUserSensitiveAccess;
  /** Only populated when sensitiveAccess.permitted is true. */
  sensitiveHealthMetrics: SensitiveHealthMetrics | null;
}

// ---- Admin: Module 12.01 — Admin Users (apps/admin-web) -------------------
// docs/admin/03-screen-inventory.md §12.01, added 22 Aug 2026. Reuses the
// AdminRole/AdminUserStatus/AdminUser types already defined above (this
// screen manages the exact same AdminUser entity adminAuth.service.ts
// authenticates against) rather than redefining a parallel shape — see
// apps/api's adminAccounts.service.ts for what's real vs. honestly not
// modeled, including why the Figma's "Invite" is relabeled "Create Admin
// User" and why the temporary password is a one-time response field.

/** The shape returned by GET /admin/admin-users. */
export interface AdminAccountDirectoryResponse {
  adminUsers: AdminUser[];
  counts: { total: number; active: number; disabled: number };
}

/** Matches apps/api's createAdminUserSchema (Zod). No password field — the server always generates the temporary password itself. */
export interface CreateAdminUserInput {
  email: string;
  fullName: string;
  role: AdminRole;
}

/**
 * The one-time response from POST /admin/admin-users. `temporaryPassword`
 * is plaintext, shown here once for the creating admin to copy/relay
 * out-of-band — it is never logged, never stored in plaintext, and not
 * retrievable again after this response.
 */
export interface CreateAdminUserResult {
  adminUser: AdminUser;
  temporaryPassword: string;
}

// ---- Admin: Module 05 — Programs (Content CMS) (apps/admin-web) -----------
// docs/admin/03-screen-inventory.md §05, added 22 Aug 2026. Covers 05.01
// Programs, 05.02 Exercises, 05.03 Recipes — real CRUD against the same
// `Program`/`Exercise`/`Recipe` models the mobile apps already read from
// (see apps/api's `ContentStatus` doc comment). **25 Aug 2026: 05.05
// Review/Approval is real too** — see `AdminContentReviewListItem` below.
// 05.04 Educational Content is still deliberately NOT built — it needs a
// brand-new entity with no real producer/consumer flow anywhere in this
// build ("empty by construction", same reasoning as 04.03 used to have
// before that gap turned out to already be resolved) — see apps/api's
// adminPrograms.service.ts doc comment for the full reasoning, including
// why 05.05 no longer needs a distinct creator/reviewer role to be real.

/** One row of the Programs Directory (05.01) — GET /admin/programs. */
export interface AdminProgramListItem {
  id: string;
  name: string;
  type: ProgramType;
  /** Not a table column in the Figma's 05.01, but returned here (cheap — already fetched) so the Edit form can prefill without a separate detail request. */
  description: string;
  status: ContentStatus;
  durationWeeks: number;
  isAiOnly: boolean;
  priceCents: number;
  /** Cover image URL — see `Program.imageUrl`. */
  imageUrl: string | null;
  /** Real count of distinct Exercises used across this program's Workouts. */
  exerciseCount: number;
  /** Real count of ProgramPurchase rows for this program. */
  subscriberCount: number;
  /** Null for content created before this field existed, or seeded via scripts/seed.ts. */
  creatorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProgramDirectoryResponse {
  programs: AdminProgramListItem[];
  counts: { total: number; published: number; draft: number };
}

/** Matches apps/api's createProgramSchema (Zod). */
export interface CreateAdminProgramInput {
  name: string;
  type: ProgramType;
  description: string;
  durationWeeks: number;
  isAiOnly?: boolean;
  priceCents?: number;
  imageUrl?: string;
}

/** Matches apps/api's updateProgramSchema (Zod) — all fields optional, at least one required. */
export type UpdateAdminProgramInput = Partial<CreateAdminProgramInput>;

/** One row of the Exercises Directory (05.02) — GET /admin/exercises. */
export interface AdminExerciseListItem {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  mediaUrl: string | null;
  /** Not a table column in the Figma's 05.02, but returned here so the Edit form can prefill without a separate detail request. */
  instructions: string[];
  status: ContentStatus;
  /** Real count of distinct Programs (via Workout -> WorkoutExercise) using this exercise — the Figma's "Programs (usage count)". */
  programUsageCount: number;
  creatorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminExerciseDirectoryResponse {
  exercises: AdminExerciseListItem[];
  counts: { total: number; published: number; draft: number };
}

/** Matches apps/api's createExerciseSchema (Zod). */
export interface CreateAdminExerciseInput {
  name: string;
  muscleGroup: string;
  equipment: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  mediaUrl?: string;
  instructions?: string[];
}

export type UpdateAdminExerciseInput = Partial<CreateAdminExerciseInput>;

/**
 * One row of the Recipes Directory (05.03) — GET /admin/recipes.
 * `timesLogged` is a real derived substitute for the Figma's "Programs
 * (usage)" column — `Recipe` has no relation to `Program` at all (recipes
 * are logged via `MealLog`, never attached to a Program), so the literal
 * spec'd field can't be computed. `timesLogged` (a count of real `MealLog`
 * rows referencing this recipe) is offered instead as genuine usage signal
 * — same "derive a real substitute rather than fabricate the spec'd field"
 * precedent as Module 02's Membership/Channel. See
 * apps/api's adminPrograms.service.ts for the full reasoning.
 */
export interface AdminRecipeListItem {
  id: string;
  name: string;
  mealType: MealType;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  prepTimeMinutes: number;
  tags: string[];
  /** Hero image URL — see `Recipe.imageUrl`. */
  imageUrl: string | null;
  status: ContentStatus;
  timesLogged: number;
  creatorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminRecipeDirectoryResponse {
  recipes: AdminRecipeListItem[];
  counts: { total: number; published: number; draft: number };
  /** "rating" (no Review/rating entity for recipes), "dietType"/"cuisine" (no backing field, no real filter) — see adminPrograms.service.ts. */
  notAvailable: string[];
}

/** Matches apps/api's createRecipeSchema (Zod). */
export interface CreateAdminRecipeInput {
  name: string;
  mealType: MealType;
  calories: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  prepTimeMinutes: number;
  tags?: string[];
  imageUrl?: string;
}

export type UpdateAdminRecipeInput = Partial<CreateAdminRecipeInput>;

/** Matches prisma/schema.prisma's ContentReviewContentType/ContentReviewStatus enums. */
export type ContentReviewContentType = "program" | "exercise" | "recipe";
export type ContentReviewStatus = "pending" | "approved" | "rejected";

/**
 * One row of the Review/Approval queue (05.05) — GET /admin/content-reviews.
 * `contentType`/`contentId` are the polymorphic reference (see apps/api's
 * ContentReview doc comment); `contentName` is resolved server-side so this
 * screen never has to fetch three different directories to display a name.
 * `reviewedByAdminId`/`reviewedByName`/`reviewedAt` are null until a
 * `pending` request is acted on.
 */
export interface AdminContentReviewListItem {
  id: string;
  contentType: ContentReviewContentType;
  contentId: string;
  contentName: string | null;
  submittedByAdminId: string;
  submittedByName: string;
  reviewedByAdminId: string | null;
  reviewedByName: string | null;
  status: ContentReviewStatus;
  reviewNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface AdminContentReviewListResponse {
  reviews: AdminContentReviewListItem[];
  counts: { total: number; pending: number; approved: number; rejected: number };
  /** "priority", "sla" — no backing field or due-date concept anywhere; see apps/api's adminPrograms.service.ts. */
  notAvailable: string[];
}

/** Matches apps/api's reviewContentReviewSchema (Zod) — used for both Approve and Reject. */
export interface AdminReviewContentReviewInput {
  reviewNotes?: string;
}

// ---- Module 06 — Commerce (06.02 Transactions + 06.03 Payments), added
// 22 Aug 2026. See apps/api's adminPayments.service.ts for the full
// real-vs-not breakdown and why 06.01/06.04/06.05 aren't in this pass.

export interface AdminPaymentListItem {
  id: string;
  userId: string;
  userFullName: string;
  userEmail: string;
  purpose: PaymentPurpose;
  referenceId: string;
  /** The paid-for SubscriptionPlan/Program name, resolved server-side. Falls back to `referenceId` on the frontend when null (see adminPayments.service.ts for the — currently unreachable — case this covers). */
  referenceLabel: string | null;
  amountCents: number;
  currency: string;
  provider: string;
  status: PaymentStatus;
  providerOrderId: string;
  providerPaymentId: string | null;
  createdAt: string;
}

export interface AdminPaymentSummary {
  totalCount: number;
  capturedRevenueCents: number;
  failedCount: number;
  successRate: number | null;
}

export interface AdminPaymentDirectoryResponse {
  payments: AdminPaymentListItem[];
  summary: AdminPaymentSummary;
  /** "gatewayHealth" — no real uptime/incident metric exists for the Razorpay integration. */
  notAvailable: string[];
}

export type AdminPaymentReference =
  | { type: "plan"; id: string; name: string; tier: SubscriptionTier; priceCents: number; billingCycle: "monthly" | "annual" }
  | { type: "program"; id: string; name: string; priceCents: number };

export interface AdminPaymentAuditEntry {
  id: string;
  action: string;
  actorId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminPaymentDetailResponse {
  payment: AdminPaymentListItem;
  /** Null only if the referenced Plan/Program row no longer exists — see adminPayments.service.ts. */
  reference: AdminPaymentReference | null;
  auditTrail: AdminPaymentAuditEntry[];
  /** "ledgerLineItems" — no discount/fee/tax breakdown exists, only the one real gross `amountCents`. */
  notAvailable: string[];
}

// ---- Module 08 — Support & Safety (08.01 Support Tickets + 08.02
// Escalations), 08.01 added 22 Aug 2026, 08.02 added 25 Aug 2026. See
// apps/api's adminSupport.service.ts for the full real-vs-not breakdown,
// including why 08.02 turned out to be a resolvable gap while 08.03/08.04
// remain genuine ones, and why this module was picked over Module 07 —
// Growth for the 22 Aug 2026 cycle.

export interface AdminSupportTicketListItem {
  id: string;
  userId: string;
  userFullName: string;
  userEmail: string;
  category: SupportTicketCategory;
  subject: string;
  message: string;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSupportTicketStats {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
}

export interface AdminSupportTicketDirectoryResponse {
  tickets: AdminSupportTicketListItem[];
  stats: AdminSupportTicketStats;
  /** "assignee" (no backing field — see adminSupport.service.ts). The conversation thread is real now (3 Sep 2026); see AdminSupportTicketDetailResponse.messages. */
  notAvailable: string[];
}

export interface AdminSupportTicketHistoryEntry {
  id: string;
  action: string;
  actorAdminId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// Support Ticket Messages (added 3 Sep 2026) — the admin-side view of the
// same thread apps/user-mobile's SupportTicketMessage backs. Carries
// `senderAdminName` (unlike the consumer-side `SupportTicketMessage`)
// because, unlike a ticket's one fixed owner, any admin can reply — the
// UI needs to say which one wrote a given message.
export interface AdminSupportTicketMessageItem {
  id: string;
  sender: SupportTicketMessageSender;
  /** Set only when sender is "admin" — the ticket's own userFullName covers "user" messages. */
  senderAdminName: string | null;
  body: string;
  createdAt: string;
}

export interface AdminSupportTicketDetailResponse {
  ticket: AdminSupportTicketListItem;
  /** Real triage-change audit trail — see adminSupport.service.ts. */
  history: AdminSupportTicketHistoryEntry[];
  /** This ticket's most recent Escalation, if it's ever been escalated — `null` otherwise. Added 25 Aug 2026 (08.02). */
  escalation: AdminEscalationListItem | null;
  /** Real conversation thread, added 3 Sep 2026 — see adminSupport.service.ts. */
  messages: AdminSupportTicketMessageItem[];
  notAvailable: string[];
}

/** Matches apps/api's updateSupportTicketSchema (Zod) — at least one field required. */
export interface UpdateAdminSupportTicketInput {
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  category?: SupportTicketCategory;
}

/** Matches apps/api's sendAdminSupportTicketMessageSchema (Zod). Added 3 Sep 2026. */
export interface AdminSendSupportTicketMessageInput {
  body: string;
}

// 08.02 Escalations, added 25 Aug 2026 — see adminSupport.service.ts for
// why this shipped and 08.03/08.04 didn't.

export type EscalationStatus = "open" | "resolved";

export interface AdminEscalationListItem {
  id: string;
  supportTicketId: string;
  ticketSubject: string;
  ticketCategory: SupportTicketCategory;
  ticketPriority: SupportTicketPriority;
  ticketStatus: SupportTicketStatus;
  ticketUserFullName: string;
  ticketUserEmail: string;
  reason: string;
  status: EscalationStatus;
  escalatedByAdminId: string;
  escalatedByName: string;
  resolvedByAdminId: string | null;
  resolvedByName: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AdminEscalationListResponse {
  escalations: AdminEscalationListItem[];
  counts: { total: number; open: number; resolved: number };
}

/** Matches apps/api's escalateSupportTicketSchema (Zod). */
export interface AdminEscalateSupportTicketInput {
  reason: string;
}

/** Matches apps/api's resolveEscalationSchema (Zod). */
export interface AdminResolveEscalationInput {
  resolutionNotes?: string;
}

// ---- BR-SAF-004 Safety Escalations, added 18 Sep 2026 — Module 08's real
// second queue, alongside 08.02 Escalations just above. See apps/api's
// adminSafety.service.ts and prisma/schema.prisma's `SafetyEscalation`
// model doc comment for the full design.

export interface AdminSafetyEscalationListItem {
  id: string;
  userId: string;
  userFullName: string;
  userEmail: string;
  medicalConditions: string[];
  injuries: string[];
  createdAt: string;
  reviewedAt: string | null;
  reviewedByAdminId: string | null;
  reviewedByAdminName: string | null;
}

export interface AdminSafetyEscalationListResponse {
  escalations: AdminSafetyEscalationListItem[];
  counts: { total: number; unreviewed: number; reviewed: number };
}

// ---- Module 12.03 — Audit Logs, added 22 Aug 2026. See apps/api's
// adminAuditLogs.service.ts for the full real-vs-not breakdown, including
// why this is a search box rather than an entityType/action dropdown, and
// why results cap at the most-recent 200 with a real totalCount/truncated
// rather than faking full pagination.

export type AuditLogActorType = "user" | "admin" | "professional";

export interface AdminAuditLogEntry {
  id: string;
  /** Null only if a row somehow has none of the three actor FKs set — doesn't happen today, see adminAuditLogs.service.ts. */
  actorType: AuditLogActorType | null;
  actorId: string | null;
  /** Null if the actor's own row was deleted after the fact — never happens today, no delete path exists for User/AdminUser/Professional. */
  actorLabel: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminAuditLogStats {
  totalCount: number;
  adminActions: number;
  userActions: number;
  professionalActions: number;
}

export interface AdminAuditLogDirectoryResponse {
  entries: AdminAuditLogEntry[];
  stats: AdminAuditLogStats;
  /** True when more rows match the current filters than the 200-row cap returned — see adminAuditLogs.service.ts. */
  truncated: boolean;
}

// ---- Module 07.03 — Referrals, added 25 Aug 2026. See apps/api's
// adminReferrals.service.ts for the full real-vs-not breakdown — the
// Referral row/directory/leaderboard/stats are real; the Figma's funnel
// visualization and referral economics ("you get / friend gets") are not,
// since neither has any backing data anywhere in this build.

export interface AdminReferralListItem {
  id: string;
  referrerId: string;
  referrerName: string;
  referrerEmail: string;
  refereeId: string;
  refereeName: string;
  refereeEmail: string;
  createdAt: string;
}

export interface AdminReferralStats {
  totalReferrals: number;
  uniqueReferrers: number;
}

export interface AdminReferralTopReferrer {
  userId: string;
  name: string;
  email: string;
  referralCount: number;
}

export interface AdminReferralDirectoryResponse {
  entries: AdminReferralListItem[];
  stats: AdminReferralStats;
  topReferrers: AdminReferralTopReferrer[];
  /** Always ["referralFunnel", "referralRewards"] today — see adminReferrals.service.ts. */
  notAvailable: string[];
}

// ---- Module 09 — Analytics, 09.01 added 25 Aug 2026; 09.02/09.03 and
// 09.01's AI tab + compare toggle added 26 Aug 2026. See apps/api's
// adminAnalytics.service.ts for the full real-vs-not breakdown — User
// Analytics/Training/Nutrition/AI tabs are real, plus now-separate 09.02
// Engagement and 09.03 Fitness & Nutrition screens; Recovery/Business/
// Geographic remain unbuilt (named in notAvailable), since none has any
// backing data anywhere in this build.

export interface AdminAnalyticsKpi {
  value: number;
  /** The immediately preceding period's raw value — added 26 Aug 2026 to back the "compare" toggle. */
  previousValue: number;
  /** % change vs. the immediately preceding period of equal length. Null when the previous period was 0 — a % change from zero can't be expressed honestly. */
  trendPct: number | null;
}

export interface AdminAnalyticsDaySignups {
  date: string;
  count: number;
}

export interface AdminAnalyticsDayRevenue {
  date: string;
  amountCents: number;
}

export interface AdminAnalyticsRetentionOffset {
  offset: number;
  /** Null when this relative month hasn't happened yet for this cohort — not 0, which would misrepresent "nobody's returned yet" as "nobody returned". */
  retainedPct: number | null;
}

export interface AdminAnalyticsCohort {
  cohort: string;
  cohortSize: number;
  monthIndex: number;
  retention: AdminAnalyticsRetentionOffset[];
}

export interface AdminAnalyticsTrainingStats {
  totalWorkoutsCompleted: number;
  totalSetsLogged: number;
  avgSetsPerSession: number | null;
}

export interface AdminAnalyticsNutritionStats {
  totalMealsLogged: number;
  totalWaterLogs: number;
  avgWaterLogsPerActiveUser: number | null;
}

/** Real since 26 Aug 2026 — AiCoachMessage aggregates. `role: "user"` rows only (the user's own prompts, not the assistant's echoing replies). */
export interface AdminAnalyticsAiStats {
  totalMessages: number;
  usersUsingAi: number;
  avgMessagesPerAiUser: number | null;
  messageSeries: AdminAnalyticsDaySignups[];
}

/** One row of the Geographic breakdown table — `countryCode: null` is the real "Unknown" bucket (profile not set), not an omission. */
/** `countryName` isn't sent by the backend (apps/api never imports COMMON_COUNTRIES — see that package's own boundary) — resolve it client-side via `COMMON_COUNTRIES`, falling back to the raw code (or "Unknown" for null) when it's outside that curated list. */
export interface AdminAnalyticsGeographicRow {
  countryCode: string | null;
  userCount: number;
  /** 0–100, one decimal place, of the current total user count. */
  userPct: number;
  /** All-time captured (`status: "paid"`) revenue attributed to this country — NOT scoped to the KPI date filter, same "own fixed axis" precedent as retentionCohorts. */
  revenueCents: number;
}

/** Real since 26 Aug 2026 — a live snapshot of `User.countryCode`, deliberately decoupled from the KPI date filter (same precedent as retentionCohorts: a population breakdown, not a period trend). A map visualization is NOT built — no mapping/GeoJSON library exists in this build — this is an honest table instead, sorted by userCount descending. */
export interface AdminAnalyticsGeographic {
  totalUsers: number;
  breakdown: AdminAnalyticsGeographicRow[];
}

export interface AdminUserAnalyticsResponse {
  period: { start: string; end: string };
  kpis: {
    newUsers: AdminAnalyticsKpi;
    activeUsers: AdminAnalyticsKpi;
    revenueCents: AdminAnalyticsKpi;
    referralSignups: AdminAnalyticsKpi;
  };
  signupSeries: AdminAnalyticsDaySignups[];
  revenueSeries: AdminAnalyticsDayRevenue[];
  retentionCohorts: AdminAnalyticsCohort[];
  trainingStats: AdminAnalyticsTrainingStats;
  nutritionStats: AdminAnalyticsNutritionStats;
  aiStats: AdminAnalyticsAiStats;
  geographic: AdminAnalyticsGeographic;
  /** Always ["recoveryAnalytics", "businessAnalytics"] today — see adminAnalytics.service.ts. Geographic is no longer in this list as of 26 Aug 2026. */
  notAvailable: string[];
}

// ---- Module 09.02 — Engagement, added 26 Aug 2026. A conversion funnel
// (signup → onboarding → first workout → 7-day retention) plus a weekly
// retention curve — see adminAnalytics.service.ts's top comment for why
// this is a genuinely distinct screen from 09.01, not a near-duplicate.

export interface AdminEngagementFunnel {
  signedUp: number;
  completedOnboarding: number;
  loggedFirstWorkout: number;
  retainedWeek1: number;
}

export interface AdminEngagementWeeklyCohort {
  cohort: string;
  cohortSize: number;
  weekIndex: number;
  retention: AdminAnalyticsRetentionOffset[];
}

export interface AdminEngagementFunnelByDay extends AdminEngagementFunnel {
  date: string;
}

export interface AdminEngagementAnalyticsResponse {
  period: { start: string; end: string };
  funnel: AdminEngagementFunnel;
  weeklyRetention: AdminEngagementWeeklyCohort[];
  /** Null (with "funnelByDay" in notAvailable) for date ranges over 31 days — see adminAnalytics.service.ts. */
  byDay: AdminEngagementFunnelByDay[] | null;
  notAvailable: string[];
}

// ---- Module 09.03 — Fitness & Nutrition, added 26 Aug 2026. A drill-down
// below 09.01's Training/Nutrition tabs' plain totals — top exercises,
// per-program completion rates, top-logged meals, plus the same AI stats
// as 09.01's AI tab (the spec's combined "recovery/AI usage card").

export interface AdminTopExercise {
  exerciseId: string;
  name: string;
  muscleGroup: string;
  setsLogged: number;
}

export interface AdminProgramProgress {
  programId: string;
  name: string;
  purchasers: number;
  /** Avg % of the program's workouts each purchaser has completed at least once. Null when there's nothing to average (no workouts or no purchasers, though this build only returns programs with ≥1 purchase). */
  avgCompletionPct: number | null;
}

export interface AdminTopMeal {
  name: string;
  timesLogged: number;
}

export interface AdminFitnessNutritionAnalyticsResponse {
  period: { start: string; end: string };
  training: {
    stats: AdminAnalyticsTrainingStats;
    topExercises: AdminTopExercise[];
    programProgress: AdminProgramProgress[];
  };
  nutrition: {
    stats: AdminAnalyticsNutritionStats;
    topMeals: AdminTopMeal[];
  };
  ai: AdminAnalyticsAiStats;
  activeUsers: number;
  /** Always ["recoveryAnalytics"] today — no wearable/HealthKit integration exists anywhere in this build. */
  notAvailable: string[];
}

// ---- Module 09.06 — Unit Economics / Cohorts, added 27 Aug 2026 --------
// reports/build-plan.html's own "needs your decision" framing said CAC
// needed "an admin-entered monthly spend figure" — that figure already
// existed as Finance's `Expense.category: "marketing"` (10.03, shipped a
// day earlier); this just reads it. See apps/api's adminAnalytics.
// service.ts's `getUnitEconomics` doc comment for the full real-vs-not
// breakdown, including why LTV:CAC has no fabricated "benchmark" tag.

/** Same shape as AdminAnalyticsKpi, but nullable — CAC can genuinely have nothing to divide (no marketing spend logged, or no signups that period), and `null` (not a fabricated $0) is how that's represented here too. */
export interface AdminAnalyticsNullableKpi {
  value: number | null;
  previousValue: number | null;
  /** Null whenever either period's value is null, in addition to the usual "previous period was 0" case. */
  trendPct: number | null;
}

/** One row of the Cohort Economics table — a signup-month cohort's real lifetime revenue-per-user alongside that same calendar month's real marketing spend/CAC. The one place LTV and CAC are genuinely comparable, since both are scoped to the same cohort month (unlike the top-level `ltvToCacRatio`, which mixes an all-time LTV with a period CAC). */
export interface AdminCohortEconomics {
  cohort: string;
  cohortSize: number;
  monthIndex: number;
  /** Null when the cohort has 0 users. */
  avgLtvCents: number | null;
  marketingSpendCents: number;
  /** Null when this cohort's month had $0 logged marketing spend, or 0 users — not a fabricated $0 CAC. */
  cacCents: number | null;
}

export interface AdminUnitEconomicsResponse {
  period: { start: string; end: string };
  kpis: {
    newUsers: AdminAnalyticsKpi;
    marketingSpendCents: AdminAnalyticsKpi;
    cacCents: AdminAnalyticsNullableKpi;
  };
  /** All-time, deliberately NOT scoped to `period` — same "own fixed axis" reasoning as Geographic's revenue-by-country and the Retention Cohort table. Null only when there are 0 users at all. */
  avgLtvCents: number | null;
  totalUsers: number;
  /** avgLtvCents ÷ the *selected period's* cacCents — a real simplification (a true cohort-matched ratio would need cohort-level LTV, which `cohorts` below provides instead). Null whenever either side is null. */
  ltvToCacRatio: number | null;
  cohorts: AdminCohortEconomics[];
  /** Always ["acquisitionChannelSplit", "unitEconomicsWaterfall"] today — see adminAnalytics.service.ts. */
  notAvailable: string[];
}

// ---- Module 06.05 — Pricing (Plans), added 25 Aug 2026 -----------------
// Plans half only — see apps/api's adminPlans.service.ts doc comment for
// why Coupons aren't built (no Coupon entity exists anywhere in this
// build).

/** One row of the Pricing screen's Plans table (06.05) — GET /admin/plans. */
export interface AdminPlanListItem {
  id: string;
  name: string;
  tier: SubscriptionTier;
  billingCycle: BillingCycle;
  priceCents: number;
  /** false = archived — no longer offered to new subscribers, but existing Subscription rows on it are untouched. */
  isActive: boolean;
  /** Real, all-time Subscription row count on this plan (every status, not just currently-active). */
  subscriberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPlanDirectoryResponse {
  plans: AdminPlanListItem[];
  counts: { total: number; active: number; archived: number };
  /** Always ["coupons"] today — see adminPlans.service.ts. */
  notAvailable: string[];
}

/** Matches apps/api's createPlanSchema (Zod). */
export interface CreateAdminPlanInput {
  name: string;
  tier: SubscriptionTier;
  billingCycle: BillingCycle;
  priceCents: number;
}

/** Matches apps/api's updatePlanSchema (Zod) — all fields optional, at least one required. */
export type UpdateAdminPlanInput = Partial<CreateAdminPlanInput>;

// ---- Module 12.06 — Integrations, added 25 Aug 2026 ---------------------
// Integrations table half only — see apps/api's adminIntegrations.service.ts
// doc comment for why the API Keys card isn't built (no third-party-facing
// API key concept exists in this build).

export interface AdminIntegrationUsageSummary {
  label: string;
  count: number;
  // Optional as of 25 Aug 2026 (AI Coach shipped, Phase 2 §H) — Razorpay
  // has a real captured-revenue figure to show alongside its count; AI
  // Coach has a real message count but no per-call cost tracked anywhere
  // in this build, so showing "$0.00 total" next to it would misreport a
  // real (just untracked) cost as zero. Omit rather than fabricate — see
  // adminIntegrations.service.ts's own doc comment.
  amountCents?: number;
}

/** One row of the Integrations table (12.06) — GET /admin/integrations. */
export interface AdminIntegrationListItem {
  id: "razorpay" | "ai_provider" | "sentry";
  name: string;
  category: "payment_gateway" | "ai_provider" | "error_monitoring";
  configured: boolean;
  detail: string;
  /** Null when the integration is configured but genuinely has nothing to count (Sentry — it captures errors as they happen rather than producing a running total) or isn't configured at all. Real once there's real activity — see adminIntegrations.service.ts. */
  usageSummary: AdminIntegrationUsageSummary | null;
}

export interface AdminIntegrationDirectoryResponse {
  integrations: AdminIntegrationListItem[];
  /** Always ["apiKeys"] today — see adminIntegrations.service.ts. */
  notAvailable: string[];
}

// ---- AI Coach (Phase 2 §H, added 25 Aug 2026) --------------------------
// docs/mobile/03-screen-inventory.md §H, apps/api/src/modules/aiCoach.
// One flat, ordered message log per user — see AiCoachMessage's own
// comment in schema.prisma for why this isn't a multi-conversation-thread
// shape.

export type AiCoachMessageRole = "user" | "assistant";

export interface AiCoachMessage {
  id: string;
  role: AiCoachMessageRole;
  content: string;
  createdAt: string;
}

/** GET /ai-coach/messages. `truncated` mirrors AdminAuditLog's own "cap it, report the cap honestly" precedent. */
export interface AiCoachMessagesResponse {
  messages: AiCoachMessage[];
  truncated: boolean;
}

/** Matches apps/api's sendAiCoachMessageSchema (Zod). */
export interface SendAiCoachMessageInput {
  content: string;
}

/** POST /ai-coach/messages. */
export interface SendAiCoachMessageResponse {
  userMessage: AiCoachMessage;
  assistantMessage: AiCoachMessage;
}

/** GET /ai/status — lets the client confirm whether an AI provider is configured server-side before offering the chat at all, without exposing the key. */
export interface AiProviderStatus {
  provider: "anthropic" | "openai";
  configured: boolean;
  model: string;
}

// ---- Module 11 — AI Operations, added 27 Aug 2026 -----------------------
// The scoped-down slice reports/build-plan.html's own 11.01–11.03 entry
// named as smaller and genuinely buildable: a real on/off switch for AI
// Coach chat, not the full Feature Console (rollout %, multiple
// capability rows), Usage metrics screen, or Safety/Overrides log — see
// apps/api's adminAiOps.service.ts for the full real-vs-not breakdown.

/** GET / PATCH /admin/ai-ops/ai-coach. */
export interface AdminAiCoachSettingsResponse {
  isEnabled: boolean;
  /** Null until an admin has ever explicitly toggled this — the flag defaults to enabled without needing a row to exist yet. */
  updatedByAdminName: string | null;
  updatedAt: string | null;
  /** Read context for the toggle, not itself editable here — same `getAiProviderStatus()` Module 12.06 Integrations already surfaces. */
  provider: AiProviderStatus;
}

/** Matches apps/api's updateAiCoachSettingsSchema (Zod). */
export interface AdminUpdateAiCoachSettingsInput {
  isEnabled: boolean;
}

// ---- Module 10 — Finance, added 26 Aug 2026 ----------------------------
// Built from the "one ledger" architecture decision — see
// reports/finance-architecture-plan.html and apps/api's
// adminFinance.service.ts for the full real-vs-not breakdown across all
// 10 screens. 10.06 Coach Settlements, 10.07 Influencer Payouts, and
// 10.09 Bank/Payment Accounts have no types here at all — see that
// service file's top comment for why.

export type ExpenseCategory =
  | "coach_settlement"
  | "influencer_payout"
  | "gateway_fee"
  | "ops"
  | "marketing"
  | "refund"
  | "other";
export type ExpenseStatus = "pending" | "paid";

export interface AdminExpenseListItem {
  id: string;
  category: ExpenseCategory;
  description: string;
  amountCents: number;
  currency: string;
  status: ExpenseStatus;
  incurredAt: string;
  paidAt: string | null;
  notes: string | null;
  recordedByAdminName: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminExpenseSummary {
  totalCount: number;
  totalCents: number;
  pendingCents: number;
  paidCents: number;
  byCategory: Record<string, number>;
}

export interface AdminExpenseListResponse {
  expenses: AdminExpenseListItem[];
  summary: AdminExpenseSummary;
  /** Always ["coachSettlements", "influencerPayouts"] — the Payouts half of 10.03, neither entity exists yet. */
  notAvailable: string[];
}

/** Matches apps/api's createExpenseSchema (Zod). */
export interface AdminCreateExpenseInput {
  category: ExpenseCategory;
  description: string;
  amountCents: number;
  currency?: string;
  incurredAt: string;
  notes?: string;
}

export interface AdminInvoiceListItem {
  id: string;
  number: string;
  issuedAt: string;
  amountCents: number;
  userFullName: string;
  userEmail: string;
  paymentId: string;
}

export interface AdminInvoiceListResponse {
  invoices: AdminInvoiceListItem[];
  summary: { totalCount: number; totalCents: number };
}

export interface AdminFinanceDashboardKpis {
  revenueMtdCents: number;
  expensesMtdCents: number;
  netProfitMtdCents: number;
  accountsReceivableCents: number;
  accountsPayableCents: number;
  cashBalanceCents: number;
}

export interface AdminFinanceCashFlowMonth {
  month: string;
  inflowCents: number;
  outflowCents: number;
  netCents: number;
}

export interface AdminFinanceDashboardResponse {
  range: { startDate: string; endDate: string };
  kpis: AdminFinanceDashboardKpis;
  cashFlow: AdminFinanceCashFlowMonth[];
  /** Null when the trailing 6-month average cash flow isn't negative — not a fabricated 0. */
  burnRateCents: number | null;
  /** Null when there's no positive burn rate to divide the cash balance by. */
  runwayMonths: number | null;
  /** `openRefundRequests` added 6 Sep 2026 — real since this pass, previously notAvailable. */
  requiredActions: { overdueReceivables: { count: number; amountCents: number }; openRefundRequests: number };
  /** Always ["pendingSettlements", "pendingPayouts"] as of 6 Sep 2026 (openRefundRequests moved into requiredActions). */
  notAvailable: string[];
}

export interface AdminRevenueByPlanItem {
  planId: string;
  planName: string;
  tier: string;
  revenueCents: number;
  count: number;
}

export interface AdminRevenueResponse {
  range: { startDate: string | null; endDate: string | null };
  totalRevenueCents: number;
  /** `bookingCents` added 5 Sep 2026 (PAY-01) — coach bookings are a real third revenue purpose now. */
  byPurpose: { subscriptionCents: number; programPurchaseCents: number; bookingCents: number };
  byPlan: AdminRevenueByPlanItem[];
  trend: Array<{ month: string; revenueCents: number }>;
  statusBreakdown: { paid: number; created: number; failed: number };
  /** Always ["regionalBreakdown"] — no User.region field exists, same gap 09.05 Geographic is blocked on. */
  notAvailable: string[];
}

/** GET /admin/finance/revenue-waterfall (5 Sep 2026, PAY-06) — see apps/api's adminFinance.service.ts's getRevenueWaterfall() doc comment for how each stage is computed. */
export interface AdminRevenueWaterfallResponse {
  range: { startDate: string | null; endDate: string | null };
  stages: {
    grossCents: number;
    discountCents: number;
    netOfDiscountsCents: number;
    refundCents: number;
    coachSettlementCents: number;
    netRevenueCents: number;
  };
  /** Always ["influencerPayoutCents"] — not netted against Gross since influencer payouts aren't computed from real attributed revenue. */
  notAvailable: string[];
}

export type ReceivableAgingBucket = "0-30" | "31-60" | "61-90" | "90+";

export interface AdminReceivableItem {
  id: string;
  source: "subscription_past_due" | "failed_payment";
  userFullName: string;
  userEmail: string;
  description: string;
  amountCents: number;
  dueSince: string;
  daysOverdue: number;
  agingBucket: ReceivableAgingBucket;
}

export interface AdminPayableItem {
  id: string;
  category: ExpenseCategory;
  description: string;
  amountCents: number;
  incurredAt: string;
  daysOutstanding: number;
  agingBucket: ReceivableAgingBucket;
}

export interface AdminReceivablesPayablesResponse {
  receivables: AdminReceivableItem[];
  receivablesTotalCents: number;
  payables: AdminPayableItem[];
  payablesTotalCents: number;
  /** Always "expenses_only" — coach/influencer payables aren't in `payables`, neither entity exists yet. */
  payablesScope: "expenses_only";
  netPositionCents: number;
}

export interface AdminTaxConfigListItem {
  id: string;
  jurisdiction: string;
  ratePercent: number | null;
  isActive: boolean;
  updatedByAdminName: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminTaxConfigListResponse {
  taxConfigs: AdminTaxConfigListItem[];
}

/** Matches apps/api's upsertTaxConfigSchema (Zod). Upserts by jurisdiction — an existing row for the same jurisdiction is updated, not duplicated. */
export interface AdminUpsertTaxConfigInput {
  jurisdiction: string;
  ratePercent?: number;
  isActive?: boolean;
}

export interface AdminFinancialReportsResponse {
  range: { startDate: string; endDate: string };
  profitAndLoss: {
    revenueCents: number;
    expensesByCategory: Record<string, number>;
    expensesCents: number;
    netProfitCents: number;
  };
  cashFlow: AdminFinanceCashFlowMonth[];
  revenue: { byPurpose: { subscriptionCents: number; programPurchaseCents: number; bookingCents: number }; byPlan: AdminRevenueByPlanItem[]; trend: Array<{ month: string; revenueCents: number }> };
  expense: { byCategory: Record<string, number>; totalCents: number };
  ratios: { netMarginPct: number | null; expenseToRevenuePct: number | null };
  /** Always ["pendingSettlements", "pendingPayouts", "regionalBreakdown"] as of 6 Sep 2026. */
  notAvailable: string[];
}

// ---- Module 12.02 — Roles & Permissions (read-only), added 26 Aug 2026.
// See apps/api's adminRoles.service.ts for why "Create New Role"/"Edit
// Role Schemas" aren't built — this build's RBAC is a fixed AdminRole enum
// + PERMISSION_MATRIX, not admin-editable data.

export type AdminRoleName =
  | "super_admin"
  | "user_operations"
  | "coach_operations"
  | "finance"
  | "content"
  | "growth"
  | "analytics"
  | "support";

export interface AdminRoleSummary {
  role: AdminRoleName;
  /** Design-sourced "stated scope" text from docs/admin/05-roles-permissions.md §1 — not fabricated. */
  description: string;
  /** Real, live AdminUser.count({where:{role}}) — not the Figma's static sample numbers. */
  memberCount: number;
}

export interface AdminRoleListResponse {
  roles: AdminRoleSummary[];
  /** Always ["createRole", "editRoleSchemas"] — see adminRoles.service.ts. */
  notAvailable: string[];
}

/** Matches apps/api's PERMISSION_MATRIX row shape — module key -> granted actions. */
export type AdminPermissionMatrix = Partial<Record<string, Array<"view" | "create" | "edit" | "delete" | "export" | "approve">>>;

export interface AdminRoleMember {
  id: string;
  fullName: string;
  email: string;
  status: string;
  lastLoginAt: string | null;
}

export interface AdminRoleDetailResponse {
  role: AdminRoleName;
  description: string;
  permissions: AdminPermissionMatrix;
  members: AdminRoleMember[];
}

// ---- Module 12.04 — Privacy & Data Governance, added 26 Aug 2026. See
// apps/api's adminPrivacy.service.ts's top comment: this screen surfaces
// TWO distinct, both-real privacy artifacts console-wide for the first
// time — a genuine self-service DSAR trail (`dsarLog`, from
// `apps/user-mobile`'s real data-export/account-deletion actions) and a
// separate admin-side sensitive-data access log (`sensitiveAccessLog`).
// Neither should be mistaken for the other.

export interface AdminDsarLogEntry {
  id: string;
  type: "export" | "deletion";
  /** Null for a `deletion` entry whose User row is gone — AuditLog.actorId is onDelete: SetNull by design, see adminPrivacy.service.ts. Render as "Deleted account (anonymized)", not a fabricated name. */
  user: { id: string; fullName: string; email: string } | null;
  createdAt: string;
}

export interface AdminDsarLog {
  kpis: { exports: number; deletions: number };
  entries: AdminDsarLogEntry[];
  totalCount: number;
  truncated: boolean;
}

export interface AdminSensitiveAccessLogEntry {
  id: string;
  user: { id: string; fullName: string; email: string };
  reason: string;
  status: SensitiveAccessStatus;
  reviewNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
  requestedByAdmin: { id: string; fullName: string };
  reviewedByAdmin: { id: string; fullName: string } | null;
}

export interface AdminSensitiveAccessLog {
  kpis: { total: number; pending: number; approved: number; denied: number };
  entries: AdminSensitiveAccessLogEntry[];
  totalCount: number;
  truncated: boolean;
}

export interface AdminPrivacyDashboardResponse {
  dsarLog: AdminDsarLog;
  sensitiveAccessLog: AdminSensitiveAccessLog;
  /** Always ["consentManagement", "dataRetention"] — see adminPrivacy.service.ts. */
  notAvailable: string[];
}

// ---- API envelope -----------------------------------------------------

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ======================================================================
// Phase 3–11 gap closure (added 31 Aug 2026) — Settlements, Influencer
// Payouts, Coupons, Refunds, Business Analytics, Referral rewards, and
// the Recovery manual-entry stopgap. See each apps/api module's own doc
// comment for the real-vs-honest-boundary reasoning.
// ======================================================================

export type PayoutStatus = "pending" | "paid";

// ---- Coach Settlements (admin 10.06) + coach Earnings ----
export interface CoachSettlementRow {
  professionalId: string;
  professionalName: string;
  commissionPct: number;
  grossCents: number;
  commissionCents: number;
  netCents: number;
  bookingCount: number;
  settlement: { id: string; status: PayoutStatus; paidAt: string | null } | null;
}

export interface AdminSettlementsResponse {
  month: string;
  periodStart: string;
  periodEnd: string;
  rows: CoachSettlementRow[];
  summary: { grossCents: number; commissionCents: number; netCents: number; unsettledNetCents: number };
  notAvailable: string[];
}

export interface CoachEarningsResponse {
  commissionPct: number;
  currentMonth: { grossCents: number; commissionCents: number; netCents: number };
  lifetimePaidCents: number;
  settlements: Array<{
    id: string;
    periodStart: string;
    grossCents: number;
    commissionPct: number;
    netCents: number;
    status: PayoutStatus;
    paidAt: string | null;
  }>;
}

// ---- Influencers (admin 07) + Payouts (admin 10.07) ----
export type InfluencerStatus = "active" | "inactive";

export interface AdminInfluencerListItem {
  id: string;
  name: string;
  email: string | null;
  handle: string | null;
  platform: string | null;
  commissionPct: number;
  status: InfluencerStatus;
  paidCents: number;
  pendingCents: number;
  payoutCount: number;
  createdAt: string;
}

export interface AdminInfluencerListResponse {
  influencers: AdminInfluencerListItem[];
  counts: { total: number; active: number; totalPaidCents: number; totalPendingCents: number };
}

export interface AdminInfluencerPayout {
  id: string;
  amountCents: number;
  periodLabel: string;
  status: PayoutStatus;
  paidAt: string | null;
  note: string | null;
  createdAt: string;
}

export interface AdminInfluencerDetail {
  id: string;
  name: string;
  email: string | null;
  handle: string | null;
  platform: string | null;
  commissionPct: number;
  status: InfluencerStatus;
  notes: string | null;
  createdAt: string;
  payouts: AdminInfluencerPayout[];
  notAvailable: string[];
}

// ---- Coupons (admin 06.05) + consumer validate ----
export type CouponDiscountType = "percent" | "fixed";

export interface AdminCouponListItem {
  id: string;
  code: string;
  description: string | null;
  discountType: CouponDiscountType;
  discountValue: number;
  maxRedemptions: number | null;
  timesRedeemed: number;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export interface AdminCouponListResponse {
  coupons: AdminCouponListItem[];
  counts: { total: number; active: number; totalRedemptions: number };
}

export type CouponValidationResult =
  | { valid: false; reason: string }
  | { valid: true; code: string; description: string | null; discountCents: number; finalCents: number };

// ---- Refunds (admin 06.04) ----
export type RefundStatus = "pending" | "processed" | "failed";

export interface AdminRefundRow {
  id: string;
  paymentId: string;
  amountCents: number;
  currency: string;
  reason: string | null;
  status: RefundStatus;
  providerRefundId: string | null;
  userName: string;
  userEmail: string;
  createdAt: string;
  processedAt: string | null;
}

export interface AdminRefundsResponse {
  refunds: AdminRefundRow[];
  summary: { totalCount: number; processedCents: number; pendingCents: number };
  notAvailable: string[];
}

// ---- Business Analytics (admin 09.04) ----
export interface BusinessAnalyticsResponse {
  marketplace: {
    gmvCents: number;
    platformCommissionCents: number;
    coachEarningsCents: number;
    bookingCount: number;
    activeCoaches: number;
    avgBookingValueCents: number;
    takeRatePct: number | null;
    settlementsPaidCents: number;
  };
  revenueBySource: Array<{ source: string; amountCents: number; count: number }>;
  notAvailable: string[];
}

// ---- Recovery manual-entry (mobile Phase 2 §E) ----
export interface RecoveryLogItem {
  id: string;
  date: string;
  restingHeartRate: number | null;
  sleepHours: number | null;
  hrvMs: number | null;
  soreness: number | null;
  energyLevel: number | null;
  notes: string | null;
}

export interface RecoveryResponse {
  logs: RecoveryLogItem[];
  latest: RecoveryLogItem | null;
  averages: {
    restingHeartRate: number | null;
    sleepHours: number | null;
    hrvMs: number | null;
    soreness: number | null;
    energyLevel: number | null;
  };
  rangeDays: number;
  source: "self_reported";
}

export interface UpsertRecoveryInput {
  date: string;
  restingHeartRate?: number;
  sleepHours?: number;
  hrvMs?: number;
  soreness?: number;
  energyLevel?: number;
  notes?: string;
}

// ---- Plan-Generation / Recommendation Engine (14 Sep 2026) ---------------
// See apps/api/src/modules/plans/plans.service.ts's own doc comment for
// the full design reasoning — shared platform logic none of the three R1
// work packages (Developer 1 consumer app / Developer 2 professional app
// / Developer 3 admin+web+platform) claimed ownership of.

export type PlanStatus = "generating" | "generated" | "failed";

export interface Plan {
  id: string;
  version: number;
  status: PlanStatus;
  programId: string | null;
  programName: string | null;
  /** AI-generated, grounded in the user's real goals/level/safety context. Null until generated. */
  rationale: string | null;
  /** Set only when status is "failed" — a real error, never silently swallowed. */
  failureReason: string | null;
  /** Exactly one Plan per user has this true at a time — the one Today/Train reads from. */
  isActive: boolean;
  createdAt: string;
}

export type RecommendationKind = "no_change" | "switch_program";
export type RecommendationStatus = "active" | "accepted" | "modified" | "declined" | "no_change" | "superseded";

export interface Recommendation {
  id: string;
  planId: string;
  kind: RecommendationKind;
  status: RecommendationStatus;
  /** Grounded in real recent WorkoutSession/BodyMeasurement data, not a generic template. */
  rationale: string;
  suggestedProgramId: string | null;
  suggestedProgramName: string | null;
  /** "user" for a self-serve decision; "professional" once Developer 2's review UI calls the same decide endpoint. Null until decided. */
  decidedByRole: "user" | "professional" | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface DecideRecommendationInput {
  action: "accept" | "decline" | "modify";
  /** Required only when action is "modify". */
  replacementProgramId?: string;
}

// U3 (15 Sep 2026) — Today's real "what to do next", resolved from the
// active Plan's selected Program. See apps/api's
// plans.service.ts#getNextWorkoutForActivePlan.

export interface NextWorkoutSummary {
  id: string;
  name: string;
  durationMinutes: number;
  intensity: string;
}

export interface PlanNextWorkout {
  plan: Plan;
  workout: NextWorkoutSummary | null;
  /** True when every workout in the active Plan's Program is already completed. */
  programComplete: boolean;
}
