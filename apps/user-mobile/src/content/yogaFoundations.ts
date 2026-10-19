import type { GuidedRoutine, GuidedStep } from "./recover";

/**
 * Yoga Foundations — a 4-week beginner program (Figma Train 19/20 and 15
 * programs/offline-01), bundled in the app like the other guided routines in
 * content/recover.ts. 3 sessions a week, 20–30 minutes each, run by the
 * existing guided-session timer (text and timing; there is no video).
 *
 * DRAFT (18 Oct 2026): written as general beginner guidance and NOT yet
 * reviewed by a qualified yoga teacher. Until `reviewStatus` is "reviewed" the
 * program only appears in development builds, marked as a draft (see
 * visibleYogaPrograms). No instructor is named: Figma's "by Anjali Rao" is a
 * placeholder, not a real, agreed attribution.
 */

export type ReviewStatus = "draft" | "reviewed";

export interface YogaProgramWeek {
  week: number;
  title: string;
  focus: string;
  sessions: GuidedRoutine[];
}

export interface YogaProgram {
  id: string;
  title: string;
  level: "Beginner";
  daysPerWeek: number;
  minutesLabel: string;
  description: string;
  needs: string;
  safetyTitle: string;
  safetyBody: string;
  weeks: YogaProgramWeek[];
  reviewStatus: ReviewStatus;
  /** Who reviewed it (a qualified yoga teacher) — required before reviewStatus becomes "reviewed". */
  reviewedBy: string | null;
}

// ---- Pose library: one cue per pose, reused by every session ----------------

type Pose = Omit<GuidedStep, "seconds">;

const POSES = {
  breath: {
    title: "Settle and breathe",
    summary: "Sit tall, slow breaths into the belly.",
    instruction:
      "Sit cross-legged on a folded blanket or on a chair with your feet flat. Rest your hands on your belly. Breathe in through the nose and let the belly rise, then breathe out slowly and let it fall. Let the out-breath become a little longer than the in-breath.",
    easier: "Sit on a chair with your back supported.",
  },
  neck: {
    title: "Neck release",
    summary: "Ear towards shoulder, slowly each side.",
    instruction:
      "Sitting tall, let your right ear drop towards your right shoulder and stay for a few breaths. Bring your head back to centre, then go to the left. Keep your shoulders soft and move slowly.",
    note: "Both sides",
  },
  seatedSideBend: {
    title: "Seated side bend",
    summary: "One arm overhead, lean gently to the side.",
    instruction:
      "Sitting tall, place your left hand on the floor beside you and reach your right arm up and over to the left. Keep both sitting bones grounded and breathe into the right side of your ribs. Switch sides halfway.",
    easier: "Keep the top hand on your head instead of reaching up.",
    note: "Both sides",
  },
  catCow: {
    title: "Cat-cow",
    summary: "Round and lengthen the spine with the breath.",
    instruction:
      "On hands and knees, wrists under shoulders and knees under hips. Breathe in and let your belly lower and your chest open. Breathe out and round your back, letting your head relax. Move slowly with your breath.",
    easier: "Fold your mat or add a blanket under your knees. Make the movement smaller.",
  },
  childsPose: {
    title: "Child's pose",
    summary: "Sit back towards the heels, rest forward.",
    instruction:
      "From hands and knees, take your knees a little wider and sit back towards your heels. Rest your forehead on the mat, a block or your hands. Breathe into your back.",
    easier: "Place a cushion between your heels and hips, or under your chest.",
  },
  threadNeedle: {
    title: "Thread the needle",
    summary: "Gentle upper-back twist from tabletop.",
    instruction:
      "From hands and knees, slide your right arm under your left arm along the mat and rest your right shoulder and the side of your head down. Keep your hips over your knees. Switch sides halfway.",
    easier: "Stay on hands and knees and simply reach one arm up towards the ceiling.",
    note: "Both sides",
  },
  downDog: {
    title: "Down dog, knees bent",
    summary: "Hips up and back, knees soft.",
    instruction:
      "From hands and knees, tuck your toes and lift your hips up and back. Keep your knees well bent so your back stays long. Press the floor away with your hands. Lower to your knees to rest whenever you need.",
    easier: "Put your hands on the seat of a sturdy chair or on a wall instead of the floor.",
  },
  mountain: {
    title: "Mountain pose",
    summary: "Stand tall, weight even through both feet.",
    instruction:
      "Stand with your feet hip-width apart. Spread your weight evenly through both feet, soften your knees and let your arms hang. Lengthen up through the crown of your head and breathe steadily.",
  },
  forwardFold: {
    title: "Standing forward fold, knees bent",
    summary: "Fold forward with generous knee bend.",
    instruction:
      "From standing, bend your knees and fold forward from the hips. Let your head and arms hang, or hold opposite elbows. Keep the knees bent so there's no strain in the back of the legs. Roll up slowly.",
    easier: "Rest your hands on your thighs or on a chair instead of folding all the way.",
  },
  chair: {
    title: "Chair pose",
    summary: "Sit back as if into a chair.",
    instruction:
      "Stand with feet hip-width apart. Bend your knees and sit your hips back as if sitting into a chair, keeping your weight in your heels. Reach your arms forward or up. Hold for a few breaths, rise, and repeat.",
    easier: "Bend the knees only a little, with your hands on your thighs.",
  },
  lowLunge: {
    title: "Low lunge",
    summary: "Back knee down, ease the hips forward.",
    instruction:
      "Step your right foot forward between your hands and lower your left knee to the mat. Keep your front knee over your ankle. Ease your hips forward until you feel a stretch at the front of the left hip. Switch sides halfway.",
    easier: "Put a blanket under the back knee and your hands on blocks or a chair.",
    note: "Both sides",
  },
  warrior2: {
    title: "Warrior II",
    summary: "Wide stance, front knee bent, arms long.",
    instruction:
      "Step your feet wide. Turn your right foot out and bend your right knee so it stays over the ankle. Reach your arms out at shoulder height and look over your front hand. Breathe steadily. Switch sides halfway.",
    easier: "Take a shorter stance and bend the front knee less, or rest a hand on a chair.",
    note: "Both sides",
  },
  triangle: {
    title: "Triangle pose",
    summary: "Long front leg, reach forward and down.",
    instruction:
      "From a wide stance with the right foot turned out, keep both legs straight but not locked. Reach forward over the right leg, then lower your right hand to your shin or a block and lift your left arm up. Keep the chest open. Switch sides halfway.",
    easier: "Rest the lower hand high on the thigh or on a chair, and keep the top hand on your hip.",
    note: "Both sides",
  },
  tree: {
    title: "Tree pose",
    summary: "Balance on one leg, foot on ankle or calf.",
    instruction:
      "Stand near a wall. Shift your weight into your left foot and place the right heel on your left ankle, or the sole on your calf — never on the knee. Bring your hands together or out to the sides. Switch sides halfway.",
    easier: "Keep the toes of the lifted foot on the floor and a hand on the wall.",
    note: "Both sides",
  },
  bridge: {
    title: "Bridge",
    summary: "Lift the hips from lying on your back.",
    instruction:
      "Lie on your back with knees bent and feet flat, hip-width apart. Press into your feet and lift your hips, keeping your knees pointing forward. Hold for a few breaths, then lower slowly. Repeat.",
    easier: "Lift the hips only a little, or rest them on a block.",
  },
  supineTwist: {
    title: "Lying twist",
    summary: "Knees to one side, shoulders on the mat.",
    instruction:
      "Lie on your back, bend your knees and let them lower to the right while your shoulders stay on the mat. Turn your head the other way if comfortable. Switch sides halfway.",
    easier: "Put a cushion under your knees so they don't drop as far.",
    note: "Both sides",
  },
  figureFour: {
    title: "Reclined figure-four",
    summary: "Ankle over knee, draw the legs in.",
    instruction:
      "Lie on your back with knees bent. Cross your right ankle over your left knee. Keep the right foot flexed and, if comfortable, draw the left knee towards you, holding behind the thigh. Switch sides halfway.",
    easier: "Keep the bottom foot on the floor and simply let the top knee open.",
    note: "Both sides",
  },
  reclinedHamstring: {
    title: "Reclined hamstring stretch",
    summary: "Strap or towel around the foot, soft knee.",
    instruction:
      "Lie on your back. Loop a strap or towel around your right foot and lift the leg only as far as feels comfortable, keeping a soft bend in the knee. Keep the other knee bent with the foot on the floor. Switch sides halfway.",
    note: "Both sides",
  },
  butterfly: {
    title: "Butterfly",
    summary: "Soles together, knees open, sit tall.",
    instruction:
      "Sit on a folded blanket. Bring the soles of your feet together and let your knees open to the sides. Sit tall and hold your ankles. Lean forward only a little, if at all.",
    easier: "Put cushions under your knees, or move your feet further away.",
  },
  seatedForwardFold: {
    title: "Seated forward fold, knees bent",
    summary: "Legs forward, fold gently with bent knees.",
    instruction:
      "Sit with your legs out in front, knees bent and a cushion under them if you like. Sit tall, then hinge forward from the hips and rest your hands on your shins or the floor. Keep breathing easily.",
    easier: "Sit on a higher cushion and keep the fold small.",
  },
  legsUpWall: {
    title: "Legs up the wall",
    summary: "Rest with legs supported on a wall.",
    instruction:
      "Sit sideways next to a wall, then lie back and swing your legs up the wall. Move your hips a little away from the wall if the backs of your legs feel tight. Rest your arms by your sides.",
    easier: "Rest your calves on the seat of a chair instead.",
  },
  rest: {
    title: "Rest",
    summary: "Lie down, let the breath settle.",
    instruction:
      "Lie on your back with your arms by your sides, or on your side if that's more comfortable. Close your eyes if you like, let your breath return to its own rhythm and let the body be still.",
    easier: "Put a cushion under your knees and head.",
  },
} satisfies Record<string, Pose>;

type PoseKey = keyof typeof POSES;
const at = (key: PoseKey, seconds: number): GuidedStep => ({ ...POSES[key], seconds });

// ---- Sessions ----------------------------------------------------------------

const SAFETY_TITLE = "Listen to your body";
const SAFETY_BODY =
  "Move slowly and never force a stretch. Stop any pose that hurts, and stop if you feel dizzy or short of breath. If you are pregnant, have an injury, high blood pressure or another health condition, check with a doctor or a qualified yoga teacher before starting.";
const NEEDS = "A mat and a towel or strap. A cushion or folded blanket, a wall and a sturdy chair are helpful for support.";

function session(id: string, week: number, n: number, title: string, description: string, pace: string, steps: GuidedStep[]): GuidedRoutine {
  const minutes = Math.round(steps.reduce((s, x) => s + x.seconds, 0) / 60);
  return {
    id,
    kind: "yoga",
    category: "Yoga",
    title: `Week ${week} · Session ${n}: ${title}`,
    meta: `${minutes} min · Mat · Towel or strap`,
    overviewLabel: "Session overview",
    level: "Beginner",
    pace,
    description,
    needs: NEEDS,
    logType: "yoga",
    safetyTitle: SAFETY_TITLE,
    safetyBody: SAFETY_BODY,
    steps,
  };
}

const WEEKS: YogaProgramWeek[] = [
  {
    week: 1,
    title: "Breath and posture basics",
    focus: "Slow breathing, a tall spine and gentle movement on the mat.",
    sessions: [
      session("yf-w1-s1", 1, 1, "Breath and a tall spine", "Learn a slow, easy breath and how to sit and stand tall.", "Gentle", [
        at("breath", 240), at("neck", 120), at("seatedSideBend", 120), at("catCow", 180), at("childsPose", 180), at("mountain", 120), at("rest", 240),
      ]),
      session("yf-w1-s2", 1, 2, "Finding neutral", "Gentle spine movements and your first hip lift.", "Gentle", [
        at("breath", 180), at("catCow", 180), at("threadNeedle", 180), at("mountain", 120), at("forwardFold", 120), at("bridge", 180), at("rest", 240),
      ]),
      session("yf-w1-s3", 1, 3, "Gentle full body", "A first taste of down dog and chair pose, with plenty of rest.", "Gentle", [
        at("breath", 180), at("catCow", 150), at("downDog", 120), at("childsPose", 150), at("mountain", 120), at("chair", 90), at("supineTwist", 150), at("rest", 240),
      ]),
    ],
  },
  {
    week: 2,
    title: "Standing poses and balance",
    focus: "Building steady legs, Warrior II and a supported tree pose.",
    sessions: [
      session("yf-w2-s1", 2, 1, "Steady legs", "Chair pose, Warrior II and your first balance.", "Steady", [
        at("breath", 120), at("catCow", 150), at("mountain", 120), at("chair", 120), at("warrior2", 240), at("forwardFold", 120), at("tree", 180), at("childsPose", 150), at("rest", 240),
      ]),
      session("yf-w2-s2", 2, 2, "Lunge and warrior", "Open the front of the hips, then stand strong.", "Steady", [
        at("breath", 120), at("catCow", 120), at("downDog", 120), at("lowLunge", 240), at("warrior2", 240), at("tree", 180), at("supineTwist", 180), at("rest", 240),
      ]),
      session("yf-w2-s3", 2, 3, "Balance practice", "Standing work with balance, finishing on the floor.", "Steady", [
        at("breath", 120), at("mountain", 90), at("chair", 120), at("warrior2", 240), at("tree", 180), at("lowLunge", 240), at("bridge", 150), at("rest", 240),
      ]),
    ],
  },
  {
    week: 3,
    title: "Hip and hamstring mobility",
    focus: "Unhurried stretches for the hips and the backs of the legs.",
    sessions: [
      session("yf-w3-s1", 3, 1, "Open hips", "Lunges and reclined stretches for the hips.", "Gentle", [
        at("breath", 120), at("catCow", 150), at("lowLunge", 240), at("reclinedHamstring", 240), at("figureFour", 240), at("butterfly", 180), at("supineTwist", 150), at("rest", 180),
      ]),
      session("yf-w3-s2", 3, 2, "Long legs", "Hamstrings and hips, ending with legs up the wall.", "Gentle", [
        at("breath", 120), at("threadNeedle", 180), at("downDog", 120), at("lowLunge", 240), at("seatedForwardFold", 180), at("butterfly", 180), at("legsUpWall", 240), at("rest", 240),
      ]),
      session("yf-w3-s3", 3, 3, "Stand, then stretch", "A short standing start, then longer floor stretches.", "Steady", [
        at("breath", 120), at("catCow", 150), at("chair", 90), at("warrior2", 240), at("reclinedHamstring", 240), at("figureFour", 240), at("bridge", 180), at("rest", 240),
      ]),
    ],
  },
  {
    week: 4,
    title: "Your first full 30-minute flow",
    focus: "Putting it together: standing, balance and floor work in one practice.",
    sessions: [
      session("yf-w4-s1", 4, 1, "Building the flow", "Everything you've learned, plus triangle pose.", "Steady", [
        at("breath", 120), at("catCow", 150), at("downDog", 120), at("lowLunge", 240), at("warrior2", 240), at("triangle", 180), at("tree", 180), at("bridge", 150), at("supineTwist", 180), at("rest", 240),
      ]),
      session("yf-w4-s2", 4, 2, "Strong and open", "Standing strength, then a long hip and hamstring finish.", "Steady", [
        at("breath", 120), at("catCow", 120), at("chair", 120), at("warrior2", 240), at("triangle", 240), at("forwardFold", 120), at("figureFour", 240), at("butterfly", 180), at("legsUpWall", 180), at("rest", 240),
      ]),
      session("yf-w4-s3", 4, 3, "Your full 30-minute flow", "A complete 30-minute practice from breath to rest.", "Steady", [
        at("breath", 120), at("catCow", 150), at("downDog", 120), at("lowLunge", 240), at("warrior2", 240), at("triangle", 180), at("tree", 180), at("bridge", 150), at("reclinedHamstring", 180), at("rest", 240),
      ]),
    ],
  },
];

export const YOGA_FOUNDATIONS: YogaProgram = {
  id: "yoga-foundations",
  title: "Yoga Foundations",
  level: "Beginner",
  daysPerWeek: 3,
  minutesLabel: "20–30",
  description: "Learn breathing, posture and the core beginner poses over 4 weeks, building up to a full 30-minute practice.",
  needs: NEEDS,
  safetyTitle: SAFETY_TITLE,
  safetyBody: SAFETY_BODY,
  weeks: WEEKS,
  reviewStatus: "draft",
  reviewedBy: null,
};

export const YOGA_PROGRAMS: YogaProgram[] = [YOGA_FOUNDATIONS];

/** Every program session, so getRoutine() can open them like any other guided routine. */
export const YOGA_PROGRAM_ROUTINES: GuidedRoutine[] = YOGA_PROGRAMS.flatMap((p) => p.weeks.flatMap((w) => w.sessions));

/** Reviewed programs everywhere; drafts only in development builds. */
export function visibleYogaPrograms(isDev: boolean): YogaProgram[] {
  return YOGA_PROGRAMS.filter((p) => p.reviewStatus === "reviewed" || isDev);
}
