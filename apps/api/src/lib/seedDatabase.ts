/**
 * Phase 0 content-seeding stopgap (docs/platform/roadmap.md Phase 0).
 *
 * Moved here from apps/api/scripts/seed.ts on 4 Sep 2026 so this logic is
 * callable from more than just a local CLI invocation — specifically, from
 * a one-time internal HTTP trigger (see app.ts's "Go-live hardening"
 * comment) for seeding a real deployed database where there's no
 * reasonable way to get a shell with working node_modules (Azure App
 * Service's Kudu/SCM console runs in a separate, unprivileged sandbox from
 * the actual app container — see AZURE-DEPLOY-RUNBOOK.md's own notes on
 * this if it ever needs re-explaining). scripts/seed.ts is now a thin CLI
 * wrapper around `seedDatabase()` below — both paths run the exact same
 * logic, nothing forked or duplicated.
 *
 * The admin Programs/CMS module (docs/admin/03-screen-inventory.md 05.xx)
 * doesn't exist until Phase 6, so Train/Fuel would have nothing to show
 * without this. Replace with the real CMS-authored content once that ships
 * — don't grow this file into a permanent content pipeline.
 *
 * **4 Sep 2026 content pass.** Programs 3 -> 18, exercises 7 -> 396,
 * workouts 2 -> 42, recipes 4 -> 80, and all three content types now carry
 * real imagery (`Program.imageUrl` and `Recipe.imageUrl` were added to the
 * schema for this; `Exercise.mediaUrl` already existed and had never been
 * populated). Images are hotlinked, not stored — there is no object
 * storage anywhere in this build (see `ProgressPhoto`'s doc comment in
 * prisma/schema.prisma for that standing constraint), so a URL to an
 * already-hosted image is the only honest option here.
 *
 * Two sources, both chosen for licensing that actually permits this use:
 * - **Program and Recipe artwork: Unsplash** (https://unsplash.com), under
 *   the Unsplash License — free for commercial use, no attribution
 *   required. Only free photos are used; Unsplash+ (`premium_photo-...`)
 *   ids are deliberately avoided, since those 404 for anonymous callers
 *   and carry different terms. Served through images.unsplash.com, which
 *   is a CDN with on-the-fly resizing — see the `unsplash()` helper below.
 * - **Exercise demonstration photos: free-exercise-db**
 *   (https://github.com/yuhonas/free-exercise-db), released under the
 *   Unlicense (public domain), which is also where the new exercises'
 *   instruction steps come from. Served from raw.githubusercontent.com.
 *
 * Hotlinking means the apps depend on those two hosts staying up. That is
 * a real, accepted tradeoff for pilot seed content, not an oversight —
 * every consumer of these fields treats a broken or missing image as
 * optional and falls back to the icon tile it used before this pass.
 *
 * Every write below is a stable-id upsert specifically so this is safe to
 * call more than once against the same database — re-seeding never
 * duplicates rows, and (see the admin/coach bootstrap accounts near the
 * bottom) never silently resets a password that's already been set.
 */
import { prisma } from "../db/prisma";
import bcrypt from "bcryptjs";
import { seedPrograms } from "./seedContent/programs";
import { seedExercises } from "./seedContent/exercises";
import { seedWorkouts } from "./seedContent/workouts";
import { seedRecipes } from "./seedContent/recipes";

/**
 * `includeAccounts: false` seeds content only — plans, programs, exercises,
 * workouts and recipes — and skips the demo-coach and bootstrap-admin
 * sections at the bottom of this file entirely.
 *
 * Added 4 Sep 2026 for `.github/workflows/seed-azure-content.yml`, which
 * re-seeds the live database from a GitHub runner. That runner has no
 * access to the App Service's own SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD
 * settings, so a full seed there would not find the live admin account by
 * email and would helpfully create a *second* super_admin at this file's
 * default address with its known default password. Content is the only
 * thing that re-seed needs to touch, so this makes "don't touch accounts"
 * an explicit, enforced mode rather than a convention someone has to
 * remember. The CLI (`npm run db:seed`) still defaults to a full seed, so
 * local setup is unchanged.
 */
/**
 * Runs `write` over `items` a few at a time, awaiting each batch.
 *
 * Added 4 Sep 2026 after the first live re-seed of the grown catalogue failed
 * with Prisma P2024 ("Timed out fetching a new connection from the connection
 * pool", pool size 3, timeout 10s). The seed had been firing one
 * `Promise.all` across every row of a table at once, which is 167 concurrent
 * upserts for exercises alone. That is fine against a local Postgres over a
 * loopback socket, which is why it passed locally and only failed against
 * Azure -- but pointed at a real network, ~160 of those queries sit in the
 * pool queue and the ones at the back exceed the timeout before a connection
 * frees up.
 *
 * A batch size of 5 stays comfortably under any realistic pool while keeping
 * the whole seed to a few seconds. Deliberately not `Promise.all` with a
 * bigger pool instead: the seed should not need special connection settings
 * to run against whatever DATABASE_URL it is handed.
 */
async function writeInBatches<T>(items: T[], write: (item: T) => Promise<unknown>, batchSize = 5) {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(write));
  }
}

export async function seedDatabase({ includeAccounts = true }: { includeAccounts?: boolean } = {}) {
  // Annual variants (added 19 Aug 2026, docs/mobile/03-screen-inventory.md
  // §M's Monthly/Annual switch) are priced at 10× the monthly price — a
  // ~2-months-free framing, this pass's own reasonable convention since
  // the design doesn't specify a number, see gap §35. Basic stays
  // monthly-only: it's free, so a billing-cycle choice is meaningless for
  // a $0 plan. Existing monthly plan ids (`basic`/`pro`/`elite`) are left
  // exactly as they were — an existing `Subscription.planId` foreign key
  // must keep resolving — the new annual rows get their own new ids
  // rather than reusing/renaming anything.
  //
  // priceCents is INR paise (5 Sep 2026, PAY-02 currency fix — see
  // config/env.ts's own comment). Elite's ₹2,999/mo matches
  // docs/mobile/01-product-requirements.md §5's own sampled screen
  // exactly (this file's old value, 2999, was that same number
  // mislabeled as USD cents — ×100 fixes it without changing the intended
  // price). Pro's real design value (₹299/mo) is a genuine number change,
  // not just a relabeling — the old 1499 ($14.99) was never actually
  // Pro's designed price, just an unrelated placeholder guess.
  const plans = await Promise.all(
    [
      { id: "basic", tier: "basic" as const, name: "Basic", priceCents: 0, billingCycle: "monthly" as const },
      { id: "pro", tier: "pro" as const, name: "Pro", priceCents: 29900, billingCycle: "monthly" as const },
      { id: "pro-annual", tier: "pro" as const, name: "Pro", priceCents: 299000, billingCycle: "annual" as const },
      { id: "elite", tier: "elite" as const, name: "Elite", priceCents: 299900, billingCycle: "monthly" as const },
      { id: "elite-annual", tier: "elite" as const, name: "Elite", priceCents: 2999000, billingCycle: "annual" as const },
    ].map(({ id, ...plan }) =>
      prisma.subscriptionPlan.upsert({
        where: { id }, // stable id keeps seeding idempotent
        create: { id, ...plan },
        update: plan,
      }),
    ),
  );

  // The catalogue itself lives in ./seedContent — see that directory's
  // modules for the content and this file's doc comment for where the imagery
  // comes from. It moved out of here on 4 Sep 2026, when programs went 8 -> 18,
  // exercises 43 -> 396, workouts 17 -> 42 and recipes 13 -> 80: at that size
  // the data was burying the twenty lines of logic below that actually write it.
  await writeInBatches(seedPrograms, (p) => prisma.program.upsert({ where: { id: p.id }, create: p, update: p }));

  await writeInBatches(seedExercises, (e) => prisma.exercise.upsert({ where: { id: e.id }, create: e, update: e }));

  // Fail loudly, before writing a single workout, if a workout references an
  // exercise that does not exist. 42 workouts reference ~250 exercise ids by
  // hand, so a typo is a question of when rather than whether — and without
  // this the failure would surface as a foreign-key violation partway through
  // the loop below, having already written some of the workouts. Checked
  // against the seed data rather than the database on purpose: this is a bug
  // in this repo's content, and it should be caught the same way whether the
  // target database is empty or already seeded.
  const exerciseIds = new Set(seedExercises.map((e) => e.id));
  const missing = [
    ...new Set(
      seedWorkouts.flatMap((w) =>
        w.exercises.map(([exerciseId]) => exerciseId).filter((id) => !exerciseIds.has(id)),
      ),
    ),
  ];
  if (missing.length > 0) {
    throw new Error(
      `seedContent/workouts.ts references ${missing.length} exercise id(s) that seedContent/exercises.ts does not define: ${missing.join(", ")}`,
    );
  }

  for (const w of seedWorkouts) {
    const { exercises: specs, ...workoutData } = w;
    await prisma.workout.upsert({ where: { id: w.id }, create: workoutData, update: workoutData });

    // `order` is per phase, derived from position, so re-ordering a list in
    // workouts.ts is all it takes to re-order the workout. The row id is
    // derived from the workout id plus position for the same reason.
    const phaseCounters: Record<string, number> = { warmup: 0, main: 0, cooldown: 0 };
    const workoutExercises = specs.map(([exerciseId, phase, targetSets, targetReps], i) => ({
      id: `we-${w.id}-${i + 1}`,
      workoutId: w.id,
      exerciseId,
      phase,
      order: (phaseCounters[phase] += 1),
      targetSets,
      targetReps,
    }));
    await writeInBatches(workoutExercises, (row) =>
      prisma.workoutExercise.upsert({ where: { id: row.id }, create: row, update: row }),
    );
    // Drop any WorkoutExercise this seed no longer lists for this workout.
    // Without it, shortening or re-ordering a list would leave the old rows
    // behind and the workout would show both — which is exactly what would
    // have happened to the two original workouts here, whose rows used a
    // different id scheme (`we-fbf-d1-1`) before 4 Sep 2026. Safe to delete:
    // nothing references a WorkoutExercise (a logged ExerciseSetLog points at
    // the Exercise and the WorkoutSession, never at this join row). Scoped to
    // this seeded workout, so admin-authored data is untouched.
    await prisma.workoutExercise.deleteMany({
      where: { workoutId: w.id, id: { notIn: workoutExercises.map((r) => r.id) } },
    });
  }

  await writeInBatches(seedRecipes, (r) => prisma.recipe.upsert({ where: { id: r.id }, create: r, update: r }));

  const summary: string[] = [
    `Seeded ${plans.length} plans, ${seedPrograms.length} programs, ${seedWorkouts.length} workouts, ${seedExercises.length} exercises, ${seedRecipes.length} recipes.`,
    // Counted, not asserted — this line is the one place a deploy log shows
    // whether the imagery actually made it into the database, without anyone
    // having to open the apps to check.
    `Content imagery: ${seedPrograms.filter((p) => p.imageUrl).length}/${seedPrograms.length} programs, ${seedRecipes.filter((r) => r.imageUrl).length}/${seedRecipes.length} recipes, ${seedExercises.filter((e) => e.mediaUrl).length}/${seedExercises.length} exercises have an image.`,
  ];

  if (!includeAccounts) {
    summary.push("Skipped the demo-coach and bootstrap-admin accounts (content-only seed).");
    return summary;
  }

  // Admin console (Phase 6, 20 Aug 2026) — one bootstrap super_admin
  // account, since there's no Admin Users management screen yet
  // (docs/admin/03-screen-inventory.md 12.01, still unbuilt) and no
  // self-service admin signup by design (see adminAuth.schema.ts's doc
  // comment). SEED_ADMIN_PASSWORD lets a real deployment override the
  // dev-only default below instead of shipping a known password — always
  // change it after first login regardless, since there's no
  // change-password/reset flow for admin accounts yet either.
  // Coach Discovery & Booking (25 Aug 2026, docs/coach/07-open-questions-gaps.md
  // gap §1) — no screen anywhere lets a professional set their own rates
  // (apps/coach-mobile's Dashboard quick actions are still inert, gap
  // §6), so demo `Professional`/`ProfessionalCredential`/
  // `ProfessionalServiceOffering` rows are seeded here, same "seeded not
  // admin/coach-authored yet" precedent Programs/Exercises/Recipes
  // started under before Module 05's CMS existed. Real coaches who
  // actually sign up through apps/coach-mobile's own onboarding still
  // land on `credentials: pending` exactly as before — this only adds
  // pre-verified demo accounts so Discovery has real, browsable data out
  // of the box instead of reading "0 verified coaches" in a fresh
  // environment. Password is a fixed dev-only value, same convention as
  // the admin bootstrap account below — not meant for anything beyond
  // local dev/demo.
  // Offering priceCents below are INR paise too (5 Sep 2026, PAY-02 —
  // same ×100 fix as the subscription plans above: e.g. Alex's old 1800
  // "$18.00" becomes ₹1,800, a realistic per-session Indian coaching
  // price rather than an artifact of the currency mismatch).
  const coachPasswordHash = await bcrypt.hash("Coach123!", 12);
  const coaches = [
    {
      id: "coach-alex-rivera",
      email: "alex.rivera@coach.23primefit.demo",
      fullName: "Alex Rivera",
      bio: "Strength & conditioning coach focused on sustainable progressive overload for lifters at any stage.",
      specializationTags: ["Strength Training", "HIIT"],
      yearsExperience: 6,
      services: ["fitness"] as const,
      offerings: [
        { id: "offer-alex-fitness", serviceType: "fitness" as const, label: "Fitness Coaching", durationMinutes: 45, priceCents: 180000 },
      ],
    },
    {
      id: "coach-priya-nair",
      email: "priya.nair@coach.23primefit.demo",
      fullName: "Priya Nair",
      bio: "Registered nutrition coach specializing in sustainable weight management and sports nutrition.",
      specializationTags: ["Weight Management", "Sports Nutrition"],
      yearsExperience: 4,
      services: ["nutrition"] as const,
      offerings: [
        { id: "offer-priya-nutrition", serviceType: "nutrition" as const, label: "Nutrition Session", durationMinutes: 30, priceCents: 120000 },
      ],
    },
    {
      id: "coach-jordan-blake",
      email: "jordan.blake@coach.23primefit.demo",
      fullName: "Jordan Blake",
      bio: "Dual-certified fitness and nutrition coach helping clients train and eat as one connected plan.",
      specializationTags: ["Strength Training", "Nutrition Coaching", "Injury Recovery"],
      yearsExperience: 8,
      services: ["fitness", "nutrition"] as const,
      offerings: [
        { id: "offer-jordan-fitness", serviceType: "fitness" as const, label: "Fitness Coaching", durationMinutes: 45, priceCents: 200000 },
        { id: "offer-jordan-nutrition", serviceType: "nutrition" as const, label: "Nutrition Session", durationMinutes: 30, priceCents: 150000 },
        { id: "offer-jordan-combined", serviceType: null, label: "Combined Session", durationMinutes: 60, priceCents: 300000 },
      ],
    },
  ];

  for (const coach of coaches) {
    const { services, offerings, ...coachData } = coach;
    await prisma.professional.upsert({
      where: { id: coach.id },
      create: { ...coachData, passwordHash: coachPasswordHash, status: "active" },
      // Deliberately does not overwrite passwordHash on re-seed, same
      // reasoning as the admin bootstrap account below.
      update: { ...coachData, status: "active" },
    });
    await Promise.all(
      services.map((serviceType) =>
        prisma.professionalCredential.upsert({
          where: { professionalId_serviceType: { professionalId: coach.id, serviceType } },
          create: {
            professionalId: coach.id,
            serviceType,
            certificationName: "Demo Certification",
            certifyingBody: "23PrimeFit Demo Data",
            yearObtained: 2020,
            status: "verified",
          },
          update: { status: "verified" },
        }),
      ),
    );
    await Promise.all(
      offerings.map((o) => {
        const { id, ...offeringData } = o;
        return prisma.professionalServiceOffering.upsert({
          where: { id },
          create: { id, professionalId: coach.id, ...offeringData, isActive: true },
          update: { ...offeringData, isActive: true },
        });
      }),
    );
  }
  summary.push(`Seeded ${coaches.length} demo verified coaches with real service offerings.`);

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@23primefit.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const adminPasswordHash = await bcrypt.hash(adminPassword, 12);
  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      passwordHash: adminPasswordHash,
      fullName: "Super Admin",
      role: "super_admin",
      status: "active",
    },
    // Deliberately does NOT overwrite passwordHash on re-seed — re-running
    // the seed shouldn't silently reset a real admin's password back to
    // the dev default. Delete the row first if you actually need to reset it.
    update: { fullName: "Super Admin", role: "super_admin", status: "active" },
  });
  summary.push(`Seeded 1 admin user (${adminEmail}) — password unchanged if this account already existed.`);

  return summary;
}
