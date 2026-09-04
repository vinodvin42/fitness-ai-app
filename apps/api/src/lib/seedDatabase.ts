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
 * **4 Sep 2026 content pass.** Programs 3 -> 8, exercises 7 -> 43,
 * workouts 2 -> 17, recipes 4 -> 13, and all three content types now carry
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

  // 4 Sep 2026 content pass — see this file's top doc comment for where the
  // imagery comes from. `unsplash()` builds the delivery URL for a photo id:
  // `auto=format` serves WebP/AVIF to clients that accept it, and the fixed
  // 1200x800 crop means every card/hero in the apps gets the same 3:2 shape
  // regardless of the original photo's orientation (several of these are
  // portrait). Kept as one helper rather than 21 hand-written query strings
  // so the whole set can be re-tuned in one place.
  const unsplash = (photoId: string) =>
    `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=1200&h=800&q=80`;

  // Grew from 3 programs to 8 on 4 Sep 2026. The three original ids/prices/
  // descriptions are untouched — an existing `ProgramPurchase.programId` or
  // `Workout.programId` must keep resolving — the five new ones get their
  // own ids, same rule the annual plan variants above followed.
  const programs = [
    {
      id: "prog-full-body-beginner",
      name: "Full Body Foundations",
      type: "fitness" as const,
      description: "A 4-week full-body program for people new to structured training.",
      durationWeeks: 4,
      isAiOnly: true,
      priceCents: 0,
      imageUrl: unsplash("photo-1723117418183-2422c62a5a75"),
    },
    {
      id: "prog-strength-intermediate",
      name: "Progressive Strength",
      type: "fitness" as const,
      description: "An 8-week strength-focused program with progressive overload.",
      durationWeeks: 8,
      isAiOnly: true,
      priceCents: 1999,
      imageUrl: unsplash("photo-1521804906057-1df8fdb718b7"),
    },
    {
      id: "prog-nutrition-reset",
      name: "Nutrition Reset",
      type: "nutrition" as const,
      description: "A 2-week guided nutrition reset with daily meal plans.",
      durationWeeks: 2,
      isAiOnly: true,
      priceCents: 999,
      imageUrl: unsplash("photo-1590779033100-9f60a05a013d"),
    },
    {
      id: "prog-hiit-shred",
      name: "HIIT Fat Burn",
      type: "fitness" as const,
      description:
        "A 6-week high-intensity interval program built around short, hard circuits you can finish in under half an hour.",
      durationWeeks: 6,
      isAiOnly: true,
      priceCents: 1499,
      imageUrl: unsplash("photo-1536922246289-88c42f957773"),
    },
    {
      id: "prog-mobility-recovery",
      name: "Mobility & Recovery",
      type: "fitness" as const,
      description:
        "A 3-week mobility program of short daily sessions for stiff hips, backs and hamstrings — pairs well with any strength plan.",
      durationWeeks: 3,
      isAiOnly: true,
      priceCents: 0,
      imageUrl: unsplash("photo-1552196527-bffef41ef674"),
    },
    {
      id: "prog-lean-muscle",
      name: "Lean Muscle Builder",
      type: "combined" as const,
      description:
        "A 12-week push/pull/legs hypertrophy split paired with a matching nutrition plan for a steady, controlled gaining phase.",
      durationWeeks: 12,
      isAiOnly: true,
      priceCents: 2999,
      imageUrl: unsplash("photo-1583454110551-21f2fa2afe61"),
    },
    {
      id: "prog-home-bodyweight",
      name: "Home Bodyweight Blast",
      type: "fitness" as const,
      description:
        "A 4-week program that needs no equipment at all — every session runs in a living room with nothing but your own bodyweight.",
      durationWeeks: 4,
      isAiOnly: true,
      priceCents: 0,
      imageUrl: unsplash("photo-1760084081757-6f918c08403b"),
    },
    {
      id: "prog-core-strength",
      name: "Core & Stability",
      type: "fitness" as const,
      description:
        "A 4-week core program focused on real trunk stability — anti-rotation and anti-extension work, not just crunches.",
      durationWeeks: 4,
      isAiOnly: true,
      priceCents: 1299,
      imageUrl: unsplash("photo-1765302741884-e846c7a178df"),
    },
  ];
  await Promise.all(programs.map((p) => prisma.program.upsert({ where: { id: p.id }, create: p, update: p })));

  // Grew from 7 exercises to 43 on 4 Sep 2026, and every one that has a
  // real counterpart in the public-domain source below now carries a
  // `mediaUrl` demonstration photo. The seven original ids and their
  // hand-written instructions are unchanged; the new rows' instructions
  // come from the same public-domain dataset as their images (three
  // exceptions — Barbell Back Squat, Standing Calf Raise and Side Plank —
  // are hand-written here because the source's own text for those either
  // ran past the admin CMS's 500-character-per-step limit or was empty).
  // `Jog in Place` and `Full Body Stretch` deliberately keep a null
  // mediaUrl: the source has no exercise that actually matches either, and
  // an approximately-right photo on a how-to screen is worse than none.
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
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bodyweight_Squat/0.jpg",
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
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Pushups/0.jpg",
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
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Deadlift/0.jpg",
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
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Plank/0.jpg",
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
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Pullups/0.jpg",
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
    {
      id: "ex-barbell-squat",
      name: "Barbell Back Squat",
      muscleGroup: "Legs",
      equipment: "Barbell",
      difficulty: "intermediate" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Squat/0.jpg",
      instructions: [
        "Set the bar in a rack at roughly upper-chest height and step under it, resting it across your upper back, not your neck.",
        "Grip the bar just outside your shoulders, brace your core, and stand up to lift it out of the rack.",
        "Step back and set your feet a little wider than shoulder-width, toes turned slightly out.",
        "Push your hips back and bend your knees to lower until your thighs are at least parallel to the floor.",
        "Keep your chest up and your knees tracking over your toes throughout the descent.",
        "Drive through your whole foot to stand back up, then re-rack the bar once your set is finished.",
      ],
    },
    {
      id: "ex-goblet-squat",
      name: "Goblet Squat",
      muscleGroup: "Legs",
      equipment: "Kettlebell",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Goblet_Squat/0.jpg",
      instructions: [
        "Stand holding a light kettlebell by the horns close to your chest. This will be your starting position.",
        "Squat down between your legs until your hamstrings are on your calves. Keep your chest and head up and your back straight.",
        "At the bottom position, pause and use your elbows to push your knees out. Return to the starting position, and repeat for 10-20 repetitions.",
      ],
    },
    {
      id: "ex-walking-lunge",
      name: "Walking Lunge",
      muscleGroup: "Legs",
      equipment: "None",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bodyweight_Walking_Lunge/0.jpg",
      instructions: [
        "Begin standing with your feet shoulder width apart and your hands on your hips.",
        "Step forward with one leg, flexing the knees to drop your hips. Descend until your rear knee nearly touches the ground. Your posture should remain upright, and your front knee should stay above the front foot.",
        "Drive through the heel of your lead foot and extend both knees to raise yourself back up.",
        "Step forward with your rear foot, repeating the lunge on the opposite leg.",
      ],
    },
    {
      id: "ex-jump-squat",
      name: "Jump Squat",
      muscleGroup: "Legs",
      equipment: "None",
      difficulty: "intermediate" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Freehand_Jump_Squat/0.jpg",
      instructions: [
        "Cross your arms over your chest.",
        "With your head up and your back straight, position your feet at shoulder width.",
        "Keeping your back straight and chest up, squat down as you inhale until your upper thighs are parallel, or lower, to the floor.",
        "Now pressing mainly with the ball of your feet, jump straight up in the air as high as possible, using the thighs like springs. Exhale during this portion of the movement.",
        "When you touch the floor again, immediately squat down and jump again.",
        "Repeat for the recommended amount of repetitions.",
      ],
    },
    {
      id: "ex-leg-press",
      name: "Leg Press",
      muscleGroup: "Legs",
      equipment: "Machine",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Leg_Press/0.jpg",
      instructions: [
        "Using a leg press machine, sit down on the machine and place your legs on the platform directly in front of you at a medium (shoulder width) foot stance. (Note: For the purposes of this discussion we will use the medium stance described above which targets overall development; however you can choose any of the three stances described in the foot positioning section).",
        "Lower the safety bars holding the weighted platform in place and press the platform all the way up until your legs are fully extended in front of you. Tip: Make sure that you do not lock your knees. Your torso and the legs should make a perfect 90-degree angle. This will be your starting position.",
        "As you inhale, slowly lower the platform until your upper and lower legs make a 90-degree angle.",
        "Pushing mainly with the heels of your feet and using the quadriceps go back to the starting position as you exhale.",
        "Repeat for the recommended amount of repetitions and ensure to lock the safety pins properly once you are done. You do not want that platform falling on you fully loaded.",
      ],
    },
    {
      id: "ex-romanian-deadlift",
      name: "Romanian Deadlift",
      muscleGroup: "Hamstrings",
      equipment: "Barbell",
      difficulty: "intermediate" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Romanian_Deadlift/0.jpg",
      instructions: [
        "Put a barbell in front of you on the ground and grab it using a pronated (palms facing down) grip that a little wider than shoulder width. Tip: Depending on the weight used, you may need wrist wraps to perform the exercise and also a raised platform in order to allow for better range of motion.",
        "Bend the knees slightly and keep the shins vertical, hips back and back straight. This will be your starting position.",
        "Keeping your back and arms completely straight at all times, use your hips to lift the bar as you exhale. Tip: The movement should not be fast but steady and under control.",
        "Once you are standing completely straight up, lower the bar by pushing the hips back, only slightly bending the knees, unlike when squatting. Tip: Take a deep breath at the start of the movement and keep your chest up. Hold your breath as you lower and exhale as you complete the movement.",
        "Repeat for the recommended amount of repetitions.",
      ],
    },
    {
      id: "ex-hamstring-stretch",
      name: "Hamstring Stretch",
      muscleGroup: "Hamstrings",
      equipment: "None",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Hamstring_Stretch/0.jpg",
      instructions: [
        "Lie on your back with one leg extended above you, with the hip at ninety degrees. Keep the other leg flat on the floor.",
        "Loop a belt, band, or rope over the ball of your foot. This will be your starting position.",
        "Pull on the belt to create tension in the calves and hamstrings. Hold this stretch for 10-30 seconds, and repeat with the other leg.",
      ],
    },
    {
      id: "ex-hip-thrust",
      name: "Barbell Hip Thrust",
      muscleGroup: "Glutes",
      equipment: "Barbell",
      difficulty: "intermediate" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Hip_Thrust/0.jpg",
      instructions: [
        "Begin seated on the ground with a bench directly behind you. Have a loaded barbell over your legs. Using a fat bar or having a pad on the bar can greatly reduce the discomfort caused by this exercise.",
        "Roll the bar so that it is directly above your hips, and lean back against the bench so that your shoulder blades are near the top of it.",
        "Begin the movement by driving through your feet, extending your hips vertically through the bar. Your weight should be supported by your shoulder blades and your feet. Extend as far as possible, then reverse the motion to return to the starting position.",
      ],
    },
    {
      id: "ex-glute-bridge",
      name: "Single-Leg Glute Bridge",
      muscleGroup: "Glutes",
      equipment: "None",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Single_Leg_Glute_Bridge/0.jpg",
      instructions: [
        "Lay on the floor with your feet flat and knees bent.",
        "Raise one leg off of the ground, pulling the knee to your chest. This will be your starting position.",
        "Execute the movement by driving through the heel, extending your hip upward and raising your glutes off of the ground.",
        "Extend as far as possible, pause and then return to the starting position.",
      ],
    },
    {
      id: "ex-calf-raise",
      name: "Standing Calf Raise",
      muscleGroup: "Calves",
      equipment: "Machine",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Standing_Calf_Raises/0.jpg",
      instructions: [
        "Set the machine's shoulder pads so they sit snugly with your knees close to straight.",
        "Place the balls of your feet on the platform with your heels hanging off the back.",
        "Lower your heels under control until you feel a stretch through your calves.",
        "Press up onto your toes as high as you can, pausing briefly at the top.",
        "Lower back down slowly rather than dropping, and keep your knees from bending through the set.",
      ],
    },
    {
      id: "ex-bench-press",
      name: "Dumbbell Bench Press",
      muscleGroup: "Chest",
      equipment: "Dumbbell",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Dumbbell_Bench_Press/0.jpg",
      instructions: [
        "Lie down on a flat bench with a dumbbell in each hand resting on top of your thighs. The palms of your hands will be facing each other.",
        "Then, using your thighs to help raise the dumbbells up, lift the dumbbells one at a time so that you can hold them in front of you at shoulder width.",
        "Once at shoulder width, rotate your wrists forward so that the palms of your hands are facing away from you. The dumbbells should be just to the sides of your chest, with your upper arm and forearm creating a 90 degree angle. Be sure to maintain full control of the dumbbells at all times. This will be your starting position.",
        "Then, as you breathe out, use your chest to push the dumbbells up. Lock your arms at the top of the lift and squeeze your chest, hold for a second and then begin coming down slowly. Tip: Ideally, lowering the weight should take about twice as long as raising it.",
        "Repeat the movement for the prescribed amount of repetitions of your training program.",
      ],
    },
    {
      id: "ex-incline-press",
      name: "Incline Dumbbell Press",
      muscleGroup: "Chest",
      equipment: "Dumbbell",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Incline_Dumbbell_Press/0.jpg",
      instructions: [
        "Lie back on an incline bench with a dumbbell in each hand atop your thighs. The palms of your hands will be facing each other.",
        "Then, using your thighs to help push the dumbbells up, lift the dumbbells one at a time so that you can hold them at shoulder width.",
        "Once you have the dumbbells raised to shoulder width, rotate your wrists forward so that the palms of your hands are facing away from you. This will be your starting position.",
        "Be sure to keep full control of the dumbbells at all times. Then breathe out and push the dumbbells up with your chest.",
        "Lock your arms at the top, hold for a second, and then start slowly lowering the weight. Tip Ideally, lowering the weights should take about twice as long as raising them.",
        "Repeat the movement for the prescribed amount of repetitions.",
        "When you are done, place the dumbbells back on your thighs and then on the floor. This is the safest manner to release the dumbbells.",
      ],
    },
    {
      id: "ex-barbell-row",
      name: "Bent-Over Barbell Row",
      muscleGroup: "Back",
      equipment: "Barbell",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bent_Over_Barbell_Row/0.jpg",
      instructions: [
        "Holding a barbell with a pronated grip (palms facing down), bend your knees slightly and bring your torso forward, by bending at the waist, while keeping the back straight until it is almost parallel to the floor. Tip: Make sure that you keep the head up. The barbell should hang directly in front of you as your arms hang perpendicular to the floor and your torso. This is your starting position.",
        "Now, while keeping the torso stationary, breathe out and lift the barbell to you. Keep the elbows close to the body and only use the forearms to hold the weight. At the top contracted position, squeeze the back muscles and hold for a brief pause.",
        "Then inhale and slowly lower the barbell back to the starting position.",
        "Repeat for the recommended amount of repetitions.",
      ],
    },
    {
      id: "ex-lat-pulldown",
      name: "Wide-Grip Lat Pulldown",
      muscleGroup: "Back",
      equipment: "Cable machine",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Wide-Grip_Lat_Pulldown/0.jpg",
      instructions: [
        "Sit down on a pull-down machine with a wide bar attached to the top pulley. Make sure that you adjust the knee pad of the machine to fit your height. These pads will prevent your body from being raised by the resistance attached to the bar.",
        "Grab the bar with the palms facing forward using the prescribed grip. Note on grips: For a wide grip, your hands need to be spaced out at a distance wider than shoulder width. For a medium grip, your hands need to be spaced out at a distance equal to your shoulder width and for a close grip at a distance smaller than your shoulder width.",
        "As you have both arms extended in front of you holding the bar at the chosen grip width, bring your torso back around 30 degrees or so while creating a curvature on your lower back and sticking your chest out. This is your starting position.",
        "As you breathe out, bring the bar down until it touches your upper chest by drawing the shoulders and the upper arms down and back. Tip: Concentrate on squeezing the back muscles once you reach the full contracted position. The upper torso should remain stationary and only the arms should move. The forearms should do no other work except for holding the bar; therefore do not try to pull down the bar using the forearms.",
        "After a second at the contracted position squeezing your shoulder blades together, slowly raise the bar back to the starting position when your arms are fully extended and the lats are fully stretched. Inhale during this portion of the movement.",
        "Repeat this motion for the prescribed amount of repetitions.",
      ],
    },
    {
      id: "ex-seated-row",
      name: "Seated Cable Row",
      muscleGroup: "Back",
      equipment: "Cable machine",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Seated_Cable_Rows/0.jpg",
      instructions: [
        "For this exercise you will need access to a low pulley row machine with a V-bar. Note: The V-bar will enable you to have a neutral grip where the palms of your hands face each other. To get into the starting position, first sit down on the machine and place your feet on the front platform or crossbar provided making sure that your knees are slightly bent and not locked.",
        "Lean over as you keep the natural alignment of your back and grab the V-bar handles.",
        "With your arms extended pull back until your torso is at a 90-degree angle from your legs. Your back should be slightly arched and your chest should be sticking out. You should be feeling a nice stretch on your lats as you hold the bar in front of you. This is the starting position of the exercise.",
        "Keeping the torso stationary, pull the handles back towards your torso while keeping the arms close to it until you touch the abdominals. Breathe out as you perform that movement. At that point you should be squeezing your back muscles hard. Hold that contraction for a second and slowly go back to the original position while breathing in.",
        "Repeat for the recommended amount of repetitions.",
      ],
    },
    {
      id: "ex-superman",
      name: "Superman",
      muscleGroup: "Back",
      equipment: "None",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Superman/0.jpg",
      instructions: [
        "To begin, lie straight and face down on the floor or exercise mat. Your arms should be fully extended in front of you. This is the starting position.",
        "Simultaneously raise your arms, legs, and chest off of the floor and hold this contraction for 2 seconds. Tip: Squeeze your lower back to get the best results from this exercise. Remember to exhale during this movement. Note: When holding the contracted position, you should look like superman when he is flying.",
        "Slowly begin to lower your arms, legs and chest back down to the starting position while inhaling.",
        "Repeat for the recommended amount of repetitions prescribed in your program.",
      ],
    },
    {
      id: "ex-cat-stretch",
      name: "Cat Stretch",
      muscleGroup: "Back",
      equipment: "None",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Cat_Stretch/0.jpg",
      instructions: [
        "Position yourself on the floor on your hands and knees.",
        "Pull your belly in and round your spine, lower back, shoulders, and neck, letting your head drop.",
        "Hold for 15 seconds.",
      ],
    },
    {
      id: "ex-childs-pose",
      name: "Child's Pose",
      muscleGroup: "Back",
      equipment: "None",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Childs_Pose/0.jpg",
      instructions: [
        "Get on your hands and knees, walk your hands in front of you.",
        "Lower your buttocks down to sit on your heels. Let your arms drag along the floor as you sit back to stretch your entire spine.",
        "Once you settle onto your heels, bring your hands next to your feet and relax. \"breathe\" into your back. Rest your forehead on the floor. Avoid this position if you have knee problems.",
      ],
    },
    {
      id: "ex-shoulder-press",
      name: "Dumbbell Shoulder Press",
      muscleGroup: "Shoulders",
      equipment: "Dumbbell",
      difficulty: "intermediate" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Dumbbell_Shoulder_Press/0.jpg",
      instructions: [
        "While holding a dumbbell in each hand, sit on a military press bench or utility bench that has back support. Place the dumbbells upright on top of your thighs.",
        "Now raise the dumbbells to shoulder height one at a time using your thighs to help propel them up into position.",
        "Make sure to rotate your wrists so that the palms of your hands are facing forward. This is your starting position.",
        "Now, exhale and push the dumbbells upward until they touch at the top.",
        "Then, after a brief pause at the top contracted position, slowly lower the weights back down to the starting position while inhaling.",
        "Repeat for the recommended amount of repetitions.",
      ],
    },
    {
      id: "ex-lateral-raise",
      name: "Side Lateral Raise",
      muscleGroup: "Shoulders",
      equipment: "Dumbbell",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Side_Lateral_Raise/0.jpg",
      instructions: [
        "Pick a couple of dumbbells and stand with a straight torso and the dumbbells by your side at arms length with the palms of the hand facing you. This will be your starting position.",
        "While maintaining the torso in a stationary position (no swinging), lift the dumbbells to your side with a slight bend on the elbow and the hands slightly tilted forward as if pouring water in a glass. Continue to go up until you arms are parallel to the floor. Exhale as you execute this movement and pause for a second at the top.",
        "Lower the dumbbells back down slowly to the starting position as you inhale.",
        "Repeat for the recommended amount of repetitions.",
      ],
    },
    {
      id: "ex-face-pull",
      name: "Face Pull",
      muscleGroup: "Shoulders",
      equipment: "Cable machine",
      difficulty: "intermediate" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Face_Pull/0.jpg",
      instructions: [
        "Facing a high pulley with a rope or dual handles attached, pull the weight directly towards your face, separating your hands as you do so. Keep your upper arms parallel to the ground.",
      ],
    },
    {
      id: "ex-bicep-curl",
      name: "Dumbbell Bicep Curl",
      muscleGroup: "Arms",
      equipment: "Dumbbell",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Dumbbell_Bicep_Curl/0.jpg",
      instructions: [
        "Stand up straight with a dumbbell in each hand at arm's length. Keep your elbows close to your torso and rotate the palms of your hands until they are facing forward. This will be your starting position.",
        "Now, keeping the upper arms stationary, exhale and curl the weights while contracting your biceps. Continue to raise the weights until your biceps are fully contracted and the dumbbells are at shoulder level. Hold the contracted position for a brief pause as you squeeze your biceps.",
        "Then, inhale and slowly begin to lower the dumbbells back to the starting position.",
        "Repeat for the recommended amount of repetitions.",
      ],
    },
    {
      id: "ex-hammer-curl",
      name: "Hammer Curl",
      muscleGroup: "Arms",
      equipment: "Dumbbell",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Hammer_Curls/0.jpg",
      instructions: [
        "Stand up with your torso upright and a dumbbell on each hand being held at arms length. The elbows should be close to the torso.",
        "The palms of the hands should be facing your torso. This will be your starting position.",
        "Now, while holding your upper arm stationary, exhale and curl the weight forward while contracting the biceps. Continue to raise the weight until the biceps are fully contracted and the dumbbell is at shoulder level. Hold the contracted position for a brief moment as you squeeze the biceps. Tip: Focus on keeping the elbow stationary and only moving your forearm.",
        "After the brief pause, inhale and slowly begin the lower the dumbbells back down to the starting position.",
        "Repeat for the recommended amount of repetitions.",
      ],
    },
    {
      id: "ex-triceps-pushdown",
      name: "Triceps Pushdown",
      muscleGroup: "Arms",
      equipment: "Cable machine",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Triceps_Pushdown/0.jpg",
      instructions: [
        "Attach a straight or angled bar to a high pulley and grab with an overhand grip (palms facing down) at shoulder width.",
        "Standing upright with the torso straight and a very small inclination forward, bring the upper arms close to your body and perpendicular to the floor. The forearms should be pointing up towards the pulley as they hold the bar. This is your starting position.",
        "Using the triceps, bring the bar down until it touches the front of your thighs and the arms are fully extended perpendicular to the floor. The upper arms should always remain stationary next to your torso and only the forearms should move. Exhale as you perform this movement.",
        "After a second hold at the contracted position, bring the bar slowly up to the starting point. Breathe in as you perform this step.",
        "Repeat for the recommended amount of repetitions.",
      ],
    },
    {
      id: "ex-bench-dip",
      name: "Bench Dip",
      muscleGroup: "Arms",
      equipment: "Bench",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bench_Dips/0.jpg",
      instructions: [
        "For this exercise you will need to place a bench behind your back. With the bench perpendicular to your body, and while looking away from it, hold on to the bench on its edge with the hands fully extended, separated at shoulder width. The legs will be extended forward, bent at the waist and perpendicular to your torso. This will be your starting position.",
        "Slowly lower your body as you inhale by bending at the elbows until you lower yourself far enough to where there is an angle slightly smaller than 90 degrees between the upper arm and the forearm. Tip: Keep the elbows as close as possible throughout the movement. Forearms should always be pointing down.",
        "Using your triceps to bring your torso up again, lift yourself back to the starting position.",
        "Repeat for the recommended amount of repetitions.",
      ],
    },
    {
      id: "ex-crunch",
      name: "Crunches",
      muscleGroup: "Core",
      equipment: "None",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Crunches/0.jpg",
      instructions: [
        "Lie flat on your back with your feet flat on the ground, or resting on a bench with your knees bent at a 90 degree angle. If you are resting your feet on a bench, place them three to four inches apart and point your toes inward so they touch.",
        "Now place your hands lightly on either side of your head keeping your elbows in. Tip: Don't lock your fingers behind your head.",
        "While pushing the small of your back down in the floor to better isolate your abdominal muscles, begin to roll your shoulders off the floor.",
        "Continue to push down as hard as you can with your lower back as you contract your abdominals and exhale. Your shoulders should come up off the floor only about four inches, and your lower back should remain on the floor. At the top of the movement, contract your abdominals hard and keep the contraction for a second. Tip: Focus on slow, controlled movement - don't cheat yourself by using momentum.",
        "After the one second contraction, begin to come down slowly again to the starting position as you inhale.",
        "Repeat for the recommended amount of repetitions.",
      ],
    },
    {
      id: "ex-russian-twist",
      name: "Russian Twist",
      muscleGroup: "Core",
      equipment: "None",
      difficulty: "intermediate" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Russian_Twist/0.jpg",
      instructions: [
        "Lie down on the floor placing your feet either under something that will not move or by having a partner hold them. Your legs should be bent at the knees.",
        "Elevate your upper body so that it creates an imaginary V-shape with your thighs. Your arms should be fully extended in front of you perpendicular to your torso and with the hands clasped. This is the starting position.",
        "Twist your torso to the right side until your arms are parallel with the floor while breathing out.",
        "Hold the contraction for a second and move back to the starting position while breathing out. Now move to the opposite side performing the same techniques you applied to the right side.",
        "Repeat for the recommended amount of repetitions.",
      ],
    },
    {
      id: "ex-leg-raise",
      name: "Hanging Leg Raise",
      muscleGroup: "Core",
      equipment: "Pull-up bar",
      difficulty: "advanced" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Hanging_Leg_Raise/0.jpg",
      instructions: [
        "Hang from a chin-up bar with both arms extended at arms length in top of you using either a wide grip or a medium grip. The legs should be straight down with the pelvis rolled slightly backwards. This will be your starting position.",
        "Raise your legs until the torso makes a 90-degree angle with the legs. Exhale as you perform this movement and hold the contraction for a second or so.",
        "Go back slowly to the starting position as you breathe in.",
        "Repeat for the recommended amount of repetitions.",
      ],
    },
    {
      id: "ex-dead-bug",
      name: "Dead Bug",
      muscleGroup: "Core",
      equipment: "None",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Dead_Bug/0.jpg",
      instructions: [
        "Begin lying on your back with your hands extended above you toward the ceiling.",
        "Bring your feet, knees, and hips up to 90 degrees.",
        "Exhale hard to bring your ribcage down and flatten your back onto the floor, rotating your pelvis up and squeezing your glutes. Hold this position throughout the movement. This will be your starting position.",
        "Initiate the exercise by extending one leg, straightening the knee and hip to bring the leg just above the ground.",
        "Maintain the position of your lumbar and pelvis as you perform the movement, as your back is going to want to arch.",
        "Stay tight and return the working leg to the starting position.",
        "Repeat on the opposite side, alternating until the set is complete.",
      ],
    },
    {
      id: "ex-side-plank",
      name: "Side Plank",
      muscleGroup: "Core",
      equipment: "None",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Side_Bridge/0.jpg",
      instructions: [
        "Lie on one side with your legs stacked and your forearm on the floor, elbow under your shoulder.",
        "Press your forearm down and lift your hips until your body forms a straight line from head to feet.",
        "Keep your top hip stacked over your bottom hip rather than rolling forward or back.",
        "Hold the position for the target duration, breathing steadily.",
        "Lower under control, then repeat on the other side for the same time.",
      ],
    },
    {
      id: "ex-mountain-climber",
      name: "Mountain Climbers",
      muscleGroup: "Cardio",
      equipment: "None",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Mountain_Climbers/0.jpg",
      instructions: [
        "Begin in a pushup position, with your weight supported by your hands and toes. Flexing the knee and hip, bring one leg until the knee is approximately under the hip. This will be your starting position.",
        "Explosively reverse the positions of your legs, extending the bent leg until the leg is straight and supported by the toe, and bringing the other foot up with the hip and knee flexed. Repeat in an alternating fashion for 20-30 seconds.",
      ],
    },
    {
      id: "ex-jump-rope",
      name: "Jump Rope",
      muscleGroup: "Cardio",
      equipment: "Jump rope",
      difficulty: "intermediate" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Rope_Jumping/0.jpg",
      instructions: [
        "Hold an end of the rope in each hand. Position the rope behind you on the ground. Raise your arms up and turn the rope over your head bringing it down in front of you. When it reaches the ground, jump over it. Find a good turning pace that can be maintained. Different speeds and techniques can be used to introduce variation.",
        "Rope jumping is exciting, challenges your coordination, and requires a lot of energy. A 150 lb person will burn about 350 calories jumping rope for 30 minutes, compared to over 450 calories running.",
      ],
    },
    {
      id: "ex-treadmill-run",
      name: "Treadmill Run",
      muscleGroup: "Cardio",
      equipment: "Treadmill",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Running_Treadmill/0.jpg",
      instructions: [
        "To begin, step onto the treadmill and select the desired option from the menu. Most treadmills have a manual setting, or you can select a program to run. Typically, you can enter your age and weight to estimate the amount of calories burned during exercise. Elevation can be adjusted to change the intensity of the workout.",
        "Treadmills offer convenience, cardiovascular benefits, and usually have less impact than running outside. A 150 lb person will burn over 450 calories running 8 miles per hour for 30 minutes. Maintain proper posture as you run, and only hold onto the handles when necessary, such as when dismounting or checking your heart rate.",
      ],
    },
    {
      id: "ex-stationary-bike",
      name: "Stationary Bike",
      muscleGroup: "Cardio",
      equipment: "Exercise bike",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bicycling_Stationary/0.jpg",
      instructions: [
        "To begin, seat yourself on the bike and adjust the seat to your height.",
        "Select the desired option from the menu. You may have to start pedaling to turn it on. You can use the manual setting, or you can select a program to use. Typically, you can enter your age and weight to estimate the amount of calories burned during exercise. The level of resistance can be changed throughout the workout. The handles can be used to monitor your heart rate to help you stay at an appropriate intensity.",
      ],
    },
    {
      id: "ex-rowing-machine",
      name: "Rowing Machine",
      muscleGroup: "Cardio",
      equipment: "Rowing machine",
      difficulty: "intermediate" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Rowing_Stationary/0.jpg",
      instructions: [
        "To begin, seat yourself on the rower. Make sure that your heels are resting comfortably against the base of the foot pedals and that the straps are secured. Select the program that you wish to use, if applicable. Sit up straight and bend forward at the hips.",
        "There are three phases of movement when using a rower. The first phase is when you come forward on the rower. Your knees are bent and against your chest. Your upper body is leaning slightly forward while still maintaining good posture. Next, push against the foot pedals and extend your legs while bringing your hands to your upper abdominal area, squeezing your shoulders back as you do so. To avoid straining your back, use primarily your leg and hip muscles.",
        "The recovery phase simply involves straightening your arms, bending the knees, and bringing your body forward again as you transition back into the first phase.",
      ],
    },
    {
      id: "ex-inchworm",
      name: "Inchworm",
      muscleGroup: "Full Body",
      equipment: "None",
      difficulty: "beginner" as const,
      mediaUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Inchworm/0.jpg",
      instructions: [
        "Stand with your feet close together. Keeping your legs straight, stretch down and put your hands on the floor directly in front of you. This will be your starting position.",
        "Begin by walking your hands forward slowly, alternating your left and your right. As you do so, bend only at the hip, keeping your legs straight.",
        "Keep going until your body is parallel to the ground in a pushup position.",
        "Now, keep your hands in place and slowly take short steps with your feet, moving only a few inches at a time.",
        "Continue walking until your feet are by hour hands, keeping your legs straight as you do so.",
      ],
    },
  ];
  await Promise.all(exercises.map((e) => prisma.exercise.upsert({ where: { id: e.id }, create: e, update: e })));

  // Workouts + their exercise lists — docs/mobile/03-screen-inventory.md §C
  // Program Detail / Workout Detail / Active Workout need real navigable
  // data, not just a bare Program row. Grew from 2 workouts to 17 on 4 Sep
  // 2026 so all seven *fitness* programs are navigable, not just the first
  // one. (`prog-nutrition-reset` still has none on purpose — it's a
  // nutrition program; its content is the Recipes below, not workouts.)
  //
  // Each entry is [exerciseId, phase, targetSets, targetReps] — a compact
  // tuple rather than 90-odd repeated object literals. `order` is derived
  // from position within the phase, and the WorkoutExercise row id is
  // derived from the workout id + position, so a workout's exercise list
  // can be re-ordered here and re-seeded without leaving orphans behind
  // (see the deleteMany just below the loop for how stale rows go away).
  type ExerciseSpec = [
    exerciseId: string,
    phase: "warmup" | "main" | "cooldown",
    targetSets: number,
    targetReps: number,
  ];
  const workouts: Array<{
    id: string;
    programId: string;
    name: string;
    order: number;
    durationMinutes: number;
    intensity: "beginner" | "intermediate" | "advanced";
    exercises: ExerciseSpec[];
  }> = [
    {
      id: "wk-fbf-day1",
      programId: "prog-full-body-beginner",
      name: "Day 1: Full Body A",
      order: 1,
      durationMinutes: 30,
      intensity: "beginner",
      exercises: [
        ["ex-jog", "warmup", 1, 1],
        ["ex-squat", "main", 3, 12],
        ["ex-pushup", "main", 3, 10],
        ["ex-plank", "main", 3, 1],
        ["ex-stretch", "cooldown", 1, 1],
      ],
    },
    {
      id: "wk-fbf-day2",
      programId: "prog-full-body-beginner",
      name: "Day 2: Full Body B",
      order: 2,
      durationMinutes: 35,
      intensity: "beginner",
      exercises: [
        ["ex-jog", "warmup", 1, 1],
        ["ex-deadlift", "main", 3, 8],
        ["ex-pullup", "main", 3, 5],
        ["ex-stretch", "cooldown", 1, 1],
      ],
    },
    {
      id: "wk-fbf-day3",
      programId: "prog-full-body-beginner",
      name: "Day 3: Full Body C",
      order: 3,
      durationMinutes: 35,
      intensity: "beginner",
      exercises: [
        ["ex-jog", "warmup", 1, 1],
        ["ex-walking-lunge", "main", 3, 10],
        ["ex-bench-press", "main", 3, 10],
        ["ex-dead-bug", "main", 3, 8],
        ["ex-hamstring-stretch", "cooldown", 1, 1],
      ],
    },
    {
      id: "wk-ps-upper",
      programId: "prog-strength-intermediate",
      name: "Week A: Upper Body",
      order: 1,
      durationMinutes: 50,
      intensity: "intermediate",
      exercises: [
        ["ex-jump-rope", "warmup", 1, 1],
        ["ex-bench-press", "main", 4, 8],
        ["ex-barbell-row", "main", 4, 8],
        ["ex-shoulder-press", "main", 3, 10],
        ["ex-lat-pulldown", "main", 3, 10],
        ["ex-triceps-pushdown", "main", 3, 12],
        ["ex-cat-stretch", "cooldown", 1, 1],
      ],
    },
    {
      id: "wk-ps-lower",
      programId: "prog-strength-intermediate",
      name: "Week A: Lower Body",
      order: 2,
      durationMinutes: 50,
      intensity: "intermediate",
      exercises: [
        ["ex-stationary-bike", "warmup", 1, 1],
        ["ex-barbell-squat", "main", 4, 6],
        ["ex-romanian-deadlift", "main", 4, 8],
        ["ex-leg-press", "main", 3, 10],
        ["ex-calf-raise", "main", 3, 15],
        ["ex-hamstring-stretch", "cooldown", 1, 1],
      ],
    },
    {
      id: "wk-ps-full",
      programId: "prog-strength-intermediate",
      name: "Week B: Full Body Power",
      order: 3,
      durationMinutes: 55,
      intensity: "advanced",
      exercises: [
        ["ex-jump-rope", "warmup", 1, 1],
        ["ex-deadlift", "main", 5, 5],
        ["ex-pullup", "main", 4, 6],
        ["ex-incline-press", "main", 3, 8],
        ["ex-hip-thrust", "main", 3, 10],
        ["ex-plank", "main", 3, 1],
        ["ex-stretch", "cooldown", 1, 1],
      ],
    },
    {
      id: "wk-hiit-a",
      programId: "prog-hiit-shred",
      name: "Circuit A: Full Body Burn",
      order: 1,
      durationMinutes: 25,
      intensity: "intermediate",
      exercises: [
        ["ex-jump-rope", "warmup", 1, 1],
        ["ex-jump-squat", "main", 4, 15],
        ["ex-mountain-climber", "main", 4, 20],
        ["ex-pushup", "main", 4, 12],
        ["ex-russian-twist", "main", 4, 20],
        ["ex-stretch", "cooldown", 1, 1],
      ],
    },
    {
      id: "wk-hiit-b",
      programId: "prog-hiit-shred",
      name: "Circuit B: Conditioning",
      order: 2,
      durationMinutes: 30,
      intensity: "intermediate",
      exercises: [
        ["ex-rowing-machine", "warmup", 1, 1],
        ["ex-walking-lunge", "main", 4, 12],
        ["ex-bench-dip", "main", 4, 12],
        ["ex-mountain-climber", "main", 4, 20],
        ["ex-crunch", "main", 4, 20],
        ["ex-hamstring-stretch", "cooldown", 1, 1],
      ],
    },
    {
      id: "wk-mob-a",
      programId: "prog-mobility-recovery",
      name: "Session A: Spine & Hips",
      order: 1,
      durationMinutes: 20,
      intensity: "beginner",
      exercises: [
        ["ex-cat-stretch", "warmup", 1, 1],
        ["ex-childs-pose", "main", 3, 1],
        ["ex-hamstring-stretch", "main", 3, 1],
        ["ex-superman", "main", 3, 10],
        ["ex-dead-bug", "main", 3, 8],
        ["ex-stretch", "cooldown", 1, 1],
      ],
    },
    {
      id: "wk-mob-b",
      programId: "prog-mobility-recovery",
      name: "Session B: Full Body Reset",
      order: 2,
      durationMinutes: 20,
      intensity: "beginner",
      exercises: [
        ["ex-inchworm", "warmup", 1, 1],
        ["ex-glute-bridge", "main", 3, 10],
        ["ex-side-plank", "main", 3, 1],
        ["ex-childs-pose", "main", 3, 1],
        ["ex-stretch", "cooldown", 1, 1],
      ],
    },
    {
      id: "wk-lm-push",
      programId: "prog-lean-muscle",
      name: "Push Day",
      order: 1,
      durationMinutes: 55,
      intensity: "intermediate",
      exercises: [
        ["ex-jog", "warmup", 1, 1],
        ["ex-bench-press", "main", 4, 10],
        ["ex-incline-press", "main", 4, 10],
        ["ex-shoulder-press", "main", 3, 10],
        ["ex-lateral-raise", "main", 3, 12],
        ["ex-triceps-pushdown", "main", 3, 12],
        ["ex-stretch", "cooldown", 1, 1],
      ],
    },
    {
      id: "wk-lm-pull",
      programId: "prog-lean-muscle",
      name: "Pull Day",
      order: 2,
      durationMinutes: 55,
      intensity: "intermediate",
      exercises: [
        ["ex-jog", "warmup", 1, 1],
        ["ex-lat-pulldown", "main", 4, 10],
        ["ex-seated-row", "main", 4, 10],
        ["ex-barbell-row", "main", 3, 8],
        ["ex-face-pull", "main", 3, 15],
        ["ex-hammer-curl", "main", 3, 12],
        ["ex-bicep-curl", "main", 3, 12],
        ["ex-cat-stretch", "cooldown", 1, 1],
      ],
    },
    {
      id: "wk-lm-legs",
      programId: "prog-lean-muscle",
      name: "Leg Day",
      order: 3,
      durationMinutes: 60,
      intensity: "intermediate",
      exercises: [
        ["ex-stationary-bike", "warmup", 1, 1],
        ["ex-barbell-squat", "main", 4, 8],
        ["ex-romanian-deadlift", "main", 4, 10],
        ["ex-hip-thrust", "main", 3, 12],
        ["ex-calf-raise", "main", 4, 15],
        ["ex-leg-raise", "main", 3, 10],
        ["ex-hamstring-stretch", "cooldown", 1, 1],
      ],
    },
    {
      id: "wk-hbw-a",
      programId: "prog-home-bodyweight",
      name: "Home Day 1",
      order: 1,
      durationMinutes: 25,
      intensity: "beginner",
      exercises: [
        ["ex-jog", "warmup", 1, 1],
        ["ex-squat", "main", 3, 15],
        ["ex-pushup", "main", 3, 10],
        ["ex-walking-lunge", "main", 3, 12],
        ["ex-plank", "main", 3, 1],
        ["ex-stretch", "cooldown", 1, 1],
      ],
    },
    {
      id: "wk-hbw-b",
      programId: "prog-home-bodyweight",
      name: "Home Day 2",
      order: 2,
      durationMinutes: 25,
      intensity: "beginner",
      exercises: [
        ["ex-mountain-climber", "warmup", 1, 1],
        ["ex-jump-squat", "main", 3, 12],
        ["ex-bench-dip", "main", 3, 10],
        ["ex-side-plank", "main", 3, 1],
        ["ex-crunch", "main", 3, 20],
        ["ex-childs-pose", "cooldown", 1, 1],
      ],
    },
    {
      id: "wk-core-a",
      programId: "prog-core-strength",
      name: "Core Day 1",
      order: 1,
      durationMinutes: 20,
      intensity: "beginner",
      exercises: [
        ["ex-jog", "warmup", 1, 1],
        ["ex-plank", "main", 3, 1],
        ["ex-dead-bug", "main", 3, 10],
        ["ex-russian-twist", "main", 3, 20],
        ["ex-crunch", "main", 3, 20],
        ["ex-superman", "main", 3, 12],
        ["ex-cat-stretch", "cooldown", 1, 1],
      ],
    },
    {
      id: "wk-core-b",
      programId: "prog-core-strength",
      name: "Core Day 2",
      order: 2,
      durationMinutes: 25,
      intensity: "intermediate",
      exercises: [
        ["ex-mountain-climber", "warmup", 1, 1],
        ["ex-leg-raise", "main", 3, 10],
        ["ex-side-plank", "main", 3, 1],
        ["ex-glute-bridge", "main", 3, 12],
        ["ex-plank", "main", 3, 1],
        ["ex-childs-pose", "cooldown", 1, 1],
      ],
    },
  ];

  for (const w of workouts) {
    const { exercises: specs, ...workoutData } = w;
    await prisma.workout.upsert({ where: { id: w.id }, create: workoutData, update: workoutData });

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
    await Promise.all(
      workoutExercises.map((row) =>
        prisma.workoutExercise.upsert({ where: { id: row.id }, create: row, update: row }),
      ),
    );
    // Drop any WorkoutExercise this seed no longer lists for this workout.
    // Without it, shortening or re-ordering a list above would leave the old
    // rows behind and the workout would show both — which is exactly what
    // would have happened to the two original workouts here, whose rows used
    // a different id scheme (`we-fbf-d1-1`) before 4 Sep 2026. Safe to
    // delete: nothing references a WorkoutExercise (a logged ExerciseSetLog
    // points at the Exercise and the WorkoutSession, never at this join
    // row). Scoped to this seeded workout, so admin-authored data is
    // untouched.
    await prisma.workoutExercise.deleteMany({
      where: { workoutId: w.id, id: { notIn: workoutExercises.map((r) => r.id) } },
    });
  }

  // Grew from 4 recipes to 13 on 4 Sep 2026, each with a real hero image
  // (Recipe.imageUrl, added the same day — Recipe Detail has specified a
  // hero image since docs/mobile/03-screen-inventory.md §D was written and
  // never had one to show). The four original ids and their macros are
  // unchanged. Macros are realistic per-serving figures for the dish named,
  // not measured values — this is seed content, not a food database.
  const recipes = [
    { id: "rec-oats", name: "Overnight Oats", mealType: "breakfast" as const, calories: 350, proteinG: 14, carbsG: 52, fatG: 9, prepTimeMinutes: 5, tags: ["vegetarian", "high-fiber"], imageUrl: unsplash("photo-1552842016-443bcee0667b") },
    { id: "rec-avocado-toast", name: "Avocado & Egg Toast", mealType: "breakfast" as const, calories: 410, proteinG: 18, carbsG: 32, fatG: 24, prepTimeMinutes: 10, tags: ["vegetarian", "high-protein"], imageUrl: unsplash("photo-1525351484163-7529414344d8") },
    { id: "rec-yogurt-parfait", name: "Greek Yogurt Parfait", mealType: "breakfast" as const, calories: 300, proteinG: 24, carbsG: 38, fatG: 6, prepTimeMinutes: 5, tags: ["vegetarian", "high-protein"], imageUrl: unsplash("photo-1633104060731-32143505bacc") },
    { id: "rec-protein-pancakes", name: "Protein Pancakes", mealType: "breakfast" as const, calories: 380, proteinG: 28, carbsG: 44, fatG: 10, prepTimeMinutes: 15, tags: ["vegetarian", "high-protein"], imageUrl: unsplash("photo-1528207776546-365bb710ee93") },
    { id: "rec-chicken-bowl", name: "Grilled Chicken Bowl", mealType: "lunch" as const, calories: 520, proteinG: 45, carbsG: 48, fatG: 15, prepTimeMinutes: 20, tags: ["high-protein"], imageUrl: unsplash("photo-1679279726946-a158b8bcaa23") },
    { id: "rec-quinoa-salad", name: "Quinoa Chickpea Salad", mealType: "lunch" as const, calories: 450, proteinG: 18, carbsG: 60, fatG: 16, prepTimeMinutes: 15, tags: ["vegan", "vegetarian", "high-fiber"], imageUrl: unsplash("photo-1623428187969-5da2dcea5ebf") },
    { id: "rec-turkey-wrap", name: "Turkey & Hummus Wrap", mealType: "lunch" as const, calories: 430, proteinG: 32, carbsG: 40, fatG: 14, prepTimeMinutes: 10, tags: ["high-protein"], imageUrl: unsplash("photo-1719282431565-3b30bb7d2658") },
    { id: "rec-salmon", name: "Baked Salmon & Greens", mealType: "dinner" as const, calories: 480, proteinG: 38, carbsG: 20, fatG: 26, prepTimeMinutes: 25, tags: ["high-protein", "omega-3"], imageUrl: unsplash("photo-1519708227418-c8fd9a32b7a2") },
    { id: "rec-tofu-stirfry", name: "Tofu Veggie Stir-Fry", mealType: "dinner" as const, calories: 400, proteinG: 24, carbsG: 42, fatG: 14, prepTimeMinutes: 20, tags: ["vegan", "vegetarian", "high-fiber"], imageUrl: unsplash("photo-1601226809816-b8c32440158a") },
    { id: "rec-beef-sweet-potato", name: "Lean Beef & Sweet Potato", mealType: "dinner" as const, calories: 560, proteinG: 42, carbsG: 45, fatG: 22, prepTimeMinutes: 30, tags: ["high-protein"], imageUrl: unsplash("photo-1600891964092-4316c288032e") },
    { id: "rec-smoothie", name: "Berry Protein Smoothie", mealType: "snack" as const, calories: 220, proteinG: 20, carbsG: 28, fatG: 4, prepTimeMinutes: 5, tags: ["vegetarian"], imageUrl: unsplash("photo-1615478503562-ec2d8aa0e24e") },
    { id: "rec-hummus-veggies", name: "Hummus & Veggie Sticks", mealType: "snack" as const, calories: 190, proteinG: 7, carbsG: 20, fatG: 9, prepTimeMinutes: 5, tags: ["vegan", "vegetarian"], imageUrl: unsplash("photo-1683725519288-eab9fa352335") },
    { id: "rec-chia-pudding", name: "Chia Seed Pudding", mealType: "snack" as const, calories: 260, proteinG: 9, carbsG: 28, fatG: 13, prepTimeMinutes: 10, tags: ["vegetarian", "omega-3"], imageUrl: unsplash("photo-1642423453088-69ad302f0d3c") },
  ];
  await Promise.all(recipes.map((r) => prisma.recipe.upsert({ where: { id: r.id }, create: r, update: r })));

  const summary: string[] = [
    `Seeded ${plans.length} plans, ${programs.length} programs, ${workouts.length} workouts, ${exercises.length} exercises, ${recipes.length} recipes.`,
    // Counted, not asserted — this line is the one place a deploy log shows
    // whether the imagery actually made it into the database, without
    // anyone having to open the apps to check.
    `Content imagery: ${programs.filter((p) => p.imageUrl).length}/${programs.length} programs, ${recipes.filter((r) => r.imageUrl).length}/${recipes.length} recipes, ${exercises.filter((e) => "mediaUrl" in e).length}/${exercises.length} exercises have an image.`,
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
