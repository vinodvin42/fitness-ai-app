import { HARD_EFFORT_RPE, HISTORY_DAYS, LIGHT_WEEK_COOLDOWN_DAYS, LIGHT_WEEK_HARD_WEEKS, LIGHT_WEEK_MIN_SESSIONS, MAX_PER_DAY } from "./dailySuggestions";
import { PORTION_GUIDE } from "./indianPortions";
import { DAILY_TARGETS } from "./nutritionTargets";
import { WARMUP_SCHEME } from "./fastLogging";
import { REQUEST_REPLY_HOURS } from "./coachRequest";

/**
 * Figma pattern/learn-more-sheet (24 Oct 2026): one sheet shape (a title, a
 * description, labelled facts, an optional worked calculation and a note)
 * filled from a topic. Every topic states what the app actually does, using
 * the same constants the code uses, so the explanation can't drift from the
 * behaviour.
 */
export type LearnMoreTopic = "food_estimates" | "daily_targets" | "daily_review" | "insights" | "warmups" | "supersets" | "coach_requests";

export interface LearnMoreContent {
  title: string;
  description: string;
  facts: Array<{ label: string; value: string }>;
  calculation?: { label: string; text: string };
  note?: string;
}

export const LEARN_MORE: Record<LearnMoreTopic, LearnMoreContent> = {
  food_estimates: {
    title: "How meal estimates work",
    description:
      "The AI names each food it sees or reads, picks a household portion and estimates its nutrition. You can change any portion or remove a food before it's logged.",
    facts: PORTION_GUIDE.map((g) => ({ label: g.label, value: g.value })),
    calculation: {
      label: "Changing a portion",
      text: "Nutrition scales with the grams: 1½ katori of a dal estimated at 100 kcal per katori is 225 g and about 150 kcal.",
    },
    note: "Estimates vary with the recipe and the oil used. Switch to grams if you weighed it.",
  },
  daily_targets: {
    title: "Your daily targets",
    description: "These are general daily targets, the same for every member for now. They aren't worked out from your body, goal or activity.",
    facts: [
      { label: "Calories", value: `${DAILY_TARGETS.calories.toLocaleString("en-IN")} kcal` },
      { label: "Protein", value: `${DAILY_TARGETS.proteinG} g` },
      { label: "Carbs", value: `${DAILY_TARGETS.carbsG} g` },
      { label: "Fat", value: `${DAILY_TARGETS.fatG} g` },
    ],
    calculation: { label: "What's left today", text: "Target minus what you've logged today." },
    note: "For personal advice, talk to a qualified nutrition professional.",
  },
  daily_review: {
    title: "How suggestions work",
    description: "The daily review only suggests something when there's a reason in your own logs. Nothing changes unless you tap Use it.",
    facts: [
      { label: "At most", value: `${MAX_PER_DAY} a day` },
      { label: "Go lighter today", value: `on a training day, after a session at RPE ${HARD_EFFORT_RPE}+ in the last 48 h or a low recovery score` },
      {
        label: "Lighter week",
        value: `after ${LIGHT_WEEK_HARD_WEEKS} weeks in a row with ${LIGHT_WEEK_MIN_SESSIONS}+ workouts and one rated Hard (if switched on)`,
      },
      { label: "Skip", value: "that kind of idea stays away for the rest of the week" },
      { label: "Lighter week again", value: `not within ${LIGHT_WEEK_COOLDOWN_DAYS} days of answering one` },
    ],
    note: `Your choices are kept on this phone for ${HISTORY_DAYS} days (Progress › Decision history).`,
  },
  insights: {
    title: "Where insights come from",
    description: "Each insight is a fixed rule over your own logs. When there isn't enough data for a rule, its card isn't shown.",
    facts: [
      { label: "Strength", value: "a lift whose heaviest set went up at least twice in 8 weeks" },
      { label: "Weight trend", value: "your weekly weigh-ins" },
      { label: "Sleep", value: "a change of 10% or more against the week before" },
      { label: "Recovery tip", value: "soreness 4+ or energy 2 or less, averaged over 7 days (3+ entries)" },
    ],
    note: "For information only, not medical advice.",
  },
  // Figma log/04 and log/03 (25 Oct 2026): what the workout screen does, from lib/fastLogging.ts and lib/supersets.ts.
  warmups: {
    title: "Warm-up sets",
    description:
      "Lighter sets before your first working set get your muscles and joints ready for the weight. They're worked out from the weight of your first working set.",
    facts: WARMUP_SCHEME.map((w, i) => ({ label: `Warm-up ${i + 1}`, value: `about ${Math.round(w.pct * 100)}% for ${w.reps} reps` })),
    calculation: {
      label: "Rounding",
      text: "Each weight is rounded to what you can load: 2.5 kg steps on a barbell, 2 kg on anything else. A weight that comes out the same as another, or as heavy as your working set, is left out.",
    },
    note: "Warm-up sets are marked W and don't count toward your volume or personal bests. Change any value before you log it.",
  },
  supersets: {
    title: "Supersets",
    description: "A superset links exercises you do back to back: one set of each in order with no rest in between, then a rest before the next round.",
    facts: [
      { label: "Order", value: "A1, then A2 (then A3 if there is one)" },
      { label: "Rest", value: "after the last exercise of each round" },
      { label: "When one is done", value: "the others carry on in the same order" },
      { label: "To undo", value: "⋯ › Remove from superset" },
    ],
  },
  // Figma coach/05 (25 Oct 2026): the request flow as the API runs it (apps/api coaching.service.ts).
  coach_requests: {
    title: "How requests work",
    description: "You ask a professional first. Nothing is charged until they accept and you choose to pay.",
    facts: [
      { label: "1. Request", value: "the service you want, a preferred day and an optional note" },
      { label: "2. Reply", value: `the professional accepts or declines within ${REQUEST_REPLY_HOURS} hours, or the request ends` },
      { label: "3. Pay", value: "pick a time and pay the fee FynroX set for their level, plus GST" },
      { label: "4. Booked", value: "your session is booked as soon as the payment goes through" },
    ],
    note: "You can cancel a request until you pay. You pay FynroX through Razorpay; FynroX pays the professional.",
  },
};
