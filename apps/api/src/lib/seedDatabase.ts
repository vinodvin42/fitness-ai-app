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
 * Every write below is a stable-id upsert specifically so this is safe to
 * call more than once against the same database — re-seeding never
 * duplicates rows, and (see the admin/coach bootstrap accounts near the
 * bottom) never silently resets a password that's already been set.
 */
import { prisma } from "../db/prisma";
import bcrypt from "bcryptjs";

export async function seedDatabase() {
  // Annual variants (added 19 Aug 2026, docs/mobile/03-screen-inventory.md
  // §M's Monthly/Annual switch) are priced at 10× the monthly price — a
  // ~2-months-free framing, this pass's own reasonable convention since
  // the design doesn't specify a number, see gap §35. Basic stays
  // monthly-only: it's free, so a billing-cycle choice is meaningless for
  // a $0 plan. Existing monthly plan ids (`basic`/`pro`/`elite`) are left
  // exactly as they were — an existing `Subscription.planId` foreign key
  // must keep resolving — the new annual rows get their own new ids
  // rather than reusing/renaming anything.
  const plans = await Promise.all(
    [
      { id: "basic", tier: "basic" as const, name: "Basic", priceCents: 0, billingCycle: "monthly" as const },
      { id: "pro", tier: "pro" as const, name: "Pro", priceCents: 1499, billingCycle: "monthly" as const },
      { id: "pro-annual", tier: "pro" as const, name: "Pro", priceCents: 14990, billingCycle: "annual" as const },
      { id: "elite", tier: "elite" as const, name: "Elite", priceCents: 2999, billingCycle: "monthly" as const },
      { id: "elite-annual", tier: "elite" as const, name: "Elite", priceCents: 29990, billingCycle: "annual" as const },
    ].map(({ id, ...plan }) =>
      prisma.subscriptionPlan.upsert({
        where: { id }, // stable id keeps seeding idempotent
        create: { id, ...plan },
        update: plan,
      }),
    ),
  );

  const programs = [
    {
      id: "prog-full-body-beginner",
      name: "Full Body Foundations",
      type: "fitness" as const,
      description: "A 4-week full-body program for people new to structured training.",
      durationWeeks: 4,
      isAiOnly: true,
      priceCents: 0,
    },
    {
      id: "prog-strength-intermediate",
      name: "Progressive Strength",
      type: "fitness" as const,
      description: "An 8-week strength-focused program with progressive overload.",
      durationWeeks: 8,
      isAiOnly: true,
      priceCents: 1999,
    },
    {
      id: "prog-nutrition-reset",
      name: "Nutrition Reset",
      type: "nutrition" as const,
      description: "A 2-week guided nutrition reset with daily meal plans.",
      durationWeeks: 2,
      isAiOnly: true,
      priceCents: 999,
    },
  ];
  await Promise.all(programs.map((p) => prisma.program.upsert({ where: { id: p.id }, create: p, update: p })));

  const exercises = [
    {
      id: "ex-jog",
      name: "Jog in Place",
      muscleGroup: "Cardio",
      equipment: "None",
      difficulty: "beginner" as const,
      instructions: [
        "Stand tall with your feet hip-width apart and arms relaxed at your sides.",
        "Lift your knees to a comfortable height, alternating legs at a steady rhythm.",
        "Pump your arms naturally as if running, keeping your core lightly braced.",
        "Land softly on the balls of your feet to reduce impact.",
        "Keep breathing steadily and maintain the pace for the target duration.",
      ],
    },
    {
      id: "ex-squat",
      name: "Bodyweight Squat",
      muscleGroup: "Legs",
      equipment: "None",
      difficulty: "beginner" as const,
      instructions: [
        "Stand with feet shoulder-width apart, toes turned slightly outward.",
        "Brace your core and start the movement by pushing your hips back.",
        "Bend your knees and lower until your thighs are roughly parallel to the floor.",
        "Keep your chest up and knees tracking over your toes throughout.",
        "Drive through your heels to return to standing.",
      ],
    },
    {
      id: "ex-pushup",
      name: "Push-Up",
      muscleGroup: "Chest",
      equipment: "None",
      difficulty: "beginner" as const,
      instructions: [
        "Start in a plank position with hands slightly wider than shoulder-width.",
        "Keep your body in a straight line from head to heels.",
        "Lower your chest toward the floor by bending your elbows.",
        "Stop just before your chest touches the ground.",
        "Press back up to the starting position without letting your hips sag.",
      ],
    },
    {
      id: "ex-deadlift",
      name: "Barbell Deadlift",
      muscleGroup: "Back",
      equipment: "Barbell",
      difficulty: "intermediate" as const,
      instructions: [
        "Stand with the bar over mid-foot, feet hip-width apart.",
        "Hinge at the hips and bend your knees to grip the bar just outside your shins.",
        "Flatten your back, brace your core, and pull your chest up before initiating the pull.",
        "Drive through your heels and extend your hips and knees together to stand up.",
        "Lower the bar back down with control by reversing the motion.",
      ],
    },
    {
      id: "ex-plank",
      name: "Plank",
      muscleGroup: "Core",
      equipment: "None",
      difficulty: "beginner" as const,
      instructions: [
        "Rest on your forearms and toes, elbows directly under your shoulders.",
        "Keep your body in a straight line from head to heels.",
        "Brace your core and squeeze your glutes to avoid sagging or piking your hips.",
        "Keep your neck neutral by looking at a spot on the floor just ahead of your hands.",
        "Hold the position for the target duration, breathing steadily throughout.",
      ],
    },
    {
      id: "ex-pullup",
      name: "Pull-Up",
      muscleGroup: "Back",
      equipment: "Pull-up bar",
      difficulty: "advanced" as const,
      instructions: [
        "Grip the bar slightly wider than shoulder-width, palms facing away from you.",
        "Hang with arms fully extended and shoulders engaged, not shrugged.",
        "Pull your chest toward the bar by driving your elbows down and back.",
        "Continue until your chin clears the bar.",
        "Lower yourself back down with control to a full hang before the next rep.",
      ],
    },
    {
      id: "ex-stretch",
      name: "Full Body Stretch",
      muscleGroup: "Full Body",
      equipment: "None",
      difficulty: "beginner" as const,
      instructions: [
        "Start standing tall, then reach both arms overhead and lengthen through your spine.",
        "Slowly fold forward from the hips, letting your head and arms hang toward the floor.",
        "Hold each stretch position for several slow breaths without bouncing.",
        "Move through major muscle groups — hamstrings, quads, shoulders, and back.",
        "Keep movements slow and controlled, stopping short of any sharp discomfort.",
      ],
    },
  ];
  await Promise.all(exercises.map((e) => prisma.exercise.upsert({ where: { id: e.id }, create: e, update: e })));

  // Workouts + their exercise lists — docs/mobile/03-screen-inventory.md §C
  // Program Detail / Workout Detail / Active Workout need real navigable
  // data, not just a bare Program row.
  const workouts = [
    {
      id: "wk-fbf-day1",
      programId: "prog-full-body-beginner",
      name: "Day 1: Full Body A",
      order: 1,
      durationMinutes: 30,
      intensity: "beginner" as const,
      exercises: [
        { id: "we-fbf-d1-1", exerciseId: "ex-jog", phase: "warmup" as const, order: 1, targetSets: 1, targetReps: 1 },
        { id: "we-fbf-d1-2", exerciseId: "ex-squat", phase: "main" as const, order: 1, targetSets: 3, targetReps: 12 },
        { id: "we-fbf-d1-3", exerciseId: "ex-pushup", phase: "main" as const, order: 2, targetSets: 3, targetReps: 10 },
        { id: "we-fbf-d1-4", exerciseId: "ex-plank", phase: "main" as const, order: 3, targetSets: 3, targetReps: 1 },
        { id: "we-fbf-d1-5", exerciseId: "ex-stretch", phase: "cooldown" as const, order: 1, targetSets: 1, targetReps: 1 },
      ],
    },
    {
      id: "wk-fbf-day2",
      programId: "prog-full-body-beginner",
      name: "Day 2: Full Body B",
      order: 2,
      durationMinutes: 35,
      intensity: "beginner" as const,
      exercises: [
        { id: "we-fbf-d2-1", exerciseId: "ex-jog", phase: "warmup" as const, order: 1, targetSets: 1, targetReps: 1 },
        { id: "we-fbf-d2-2", exerciseId: "ex-deadlift", phase: "main" as const, order: 1, targetSets: 3, targetReps: 8 },
        { id: "we-fbf-d2-3", exerciseId: "ex-pullup", phase: "main" as const, order: 2, targetSets: 3, targetReps: 5 },
        { id: "we-fbf-d2-4", exerciseId: "ex-stretch", phase: "cooldown" as const, order: 1, targetSets: 1, targetReps: 1 },
      ],
    },
  ];

  for (const w of workouts) {
    const { exercises: workoutExercises, ...workoutData } = w;
    await prisma.workout.upsert({ where: { id: w.id }, create: workoutData, update: workoutData });
    await Promise.all(
      workoutExercises.map((we) =>
        prisma.workoutExercise.upsert({
          where: { id: we.id },
          create: { ...we, workoutId: w.id },
          update: { ...we, workoutId: w.id },
        }),
      ),
    );
  }

  const recipes = [
    { id: "rec-oats", name: "Overnight Oats", mealType: "breakfast" as const, calories: 350, proteinG: 14, carbsG: 52, fatG: 9, prepTimeMinutes: 5, tags: ["vegetarian", "high-fiber"] },
    { id: "rec-chicken-bowl", name: "Grilled Chicken Bowl", mealType: "lunch" as const, calories: 520, proteinG: 45, carbsG: 48, fatG: 15, prepTimeMinutes: 20, tags: ["high-protein"] },
    { id: "rec-salmon", name: "Baked Salmon & Greens", mealType: "dinner" as const, calories: 480, proteinG: 38, carbsG: 20, fatG: 26, prepTimeMinutes: 25, tags: ["high-protein", "omega-3"] },
    { id: "rec-smoothie", name: "Berry Protein Smoothie", mealType: "snack" as const, calories: 220, proteinG: 20, carbsG: 28, fatG: 4, prepTimeMinutes: 5, tags: ["vegetarian"] },
  ];
  await Promise.all(recipes.map((r) => prisma.recipe.upsert({ where: { id: r.id }, create: r, update: r })));

  const summary: string[] = [
    `Seeded ${plans.length} plans, ${programs.length} programs, ${workouts.length} workouts, ${exercises.length} exercises, ${recipes.length} recipes.`,
  ];

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
        { id: "offer-alex-fitness", serviceType: "fitness" as const, label: "Fitness Coaching", durationMinutes: 45, priceCents: 1800 },
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
        { id: "offer-priya-nutrition", serviceType: "nutrition" as const, label: "Nutrition Session", durationMinutes: 30, priceCents: 1200 },
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
        { id: "offer-jordan-fitness", serviceType: "fitness" as const, label: "Fitness Coaching", durationMinutes: 45, priceCents: 2000 },
        { id: "offer-jordan-nutrition", serviceType: "nutrition" as const, label: "Nutrition Session", durationMinutes: 30, priceCents: 1500 },
        { id: "offer-jordan-combined", serviceType: null, label: "Combined Session", durationMinutes: 60, priceCents: 3000 },
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
