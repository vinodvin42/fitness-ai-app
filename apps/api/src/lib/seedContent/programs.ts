/**
 * Seed programs — see ../seedDatabase.ts for how these are written.
 *
 * Grew from 3 to 8 and then to 18 on 4 Sep 2026. The three original ids,
 * prices and descriptions have never changed and must not: an existing
 * `ProgramPurchase.programId` or `Workout.programId` has to keep resolving.
 * Everything added takes a new id alongside them.
 *
 * Ordered here the way a catalogue reads rather than the way the API returns
 * it (the API orders by `createdAt` desc): free on-ramps first, then paid
 * training, then the nutrition programs. That ordering is presentational and
 * nothing depends on it.
 *
 * Pricing is deliberately coherent rather than arbitrary — the free tier is
 * the three programs a new member can start on day one, and paid programs
 * scale roughly with duration ($12.99 for 2–4 weeks up to $27.99 for 10–12).
 * `isAiOnly` is true throughout: coach-led programs need the coach-matching
 * work that is still deferred, so claiming one here would be a fake.
 */
import { unsplash } from "./images";
import type { SeedProgram } from "./types";

export const seedPrograms: SeedProgram[] = [
  // ---- Free: what a member can start without paying ----------------------
  {
    id: "prog-full-body-beginner",
    name: "Full Body Foundations",
    type: "fitness",
    description: "A 4-week full-body program for people new to structured training.",
    durationWeeks: 4,
    isAiOnly: true,
    priceCents: 0,
    imageUrl: unsplash("photo-1723117418183-2422c62a5a75"),
  },
  {
    id: "prog-home-bodyweight",
    name: "Home Bodyweight Blast",
    type: "fitness",
    description:
      "A 4-week program that needs no equipment at all — every session runs in a living room with nothing but your own bodyweight.",
    durationWeeks: 4,
    isAiOnly: true,
    priceCents: 0,
    imageUrl: unsplash("photo-1760084081757-6f918c08403b"),
  },
  {
    id: "prog-mobility-recovery",
    name: "Mobility & Recovery",
    type: "fitness",
    description:
      "A 3-week mobility program of short daily sessions for stiff hips, backs and hamstrings — pairs well with any strength plan.",
    durationWeeks: 3,
    isAiOnly: true,
    priceCents: 0,
    imageUrl: unsplash("photo-1552196527-bffef41ef674"),
  },
  {
    id: "prog-active-aging",
    name: "Active Aging",
    type: "fitness",
    description:
      "A 6-week program of low-impact strength and balance work, built for training that stays sustainable decade after decade.",
    durationWeeks: 6,
    isAiOnly: true,
    priceCents: 0,
    imageUrl: unsplash("photo-1764173040171-57f79264b358"),
  },
  {
    id: "prog-desk-reset",
    name: "Desk Reset",
    type: "fitness",
    description:
      "A 2-week program of short sessions that undo a day at a desk — hips, upper back and shoulders, in under fifteen minutes.",
    durationWeeks: 2,
    isAiOnly: true,
    priceCents: 0,
    imageUrl: unsplash("photo-1713947505684-25b9bf8d544f"),
  },

  // ---- Paid training -----------------------------------------------------
  {
    id: "prog-core-strength",
    name: "Core & Stability",
    type: "fitness",
    description:
      "A 4-week core program focused on real trunk stability — anti-rotation and anti-extension work, not just crunches.",
    durationWeeks: 4,
    isAiOnly: true,
    priceCents: 1299,
    imageUrl: unsplash("photo-1765302741884-e846c7a178df"),
  },
  {
    id: "prog-kettlebell",
    name: "Kettlebell Conditioning",
    type: "fitness",
    description:
      "A 5-week program built around a single kettlebell — swings, cleans and presses that train strength and conditioning together.",
    durationWeeks: 5,
    isAiOnly: true,
    priceCents: 1399,
    imageUrl: unsplash("photo-1758875570600-8daf8d2f05f3"),
  },
  {
    id: "prog-hiit-shred",
    name: "HIIT Fat Burn",
    type: "fitness",
    description:
      "A 6-week high-intensity interval program built around short, hard circuits you can finish in under half an hour.",
    durationWeeks: 6,
    isAiOnly: true,
    priceCents: 1499,
    imageUrl: unsplash("photo-1536922246289-88c42f957773"),
  },
  {
    id: "prog-glute-strength",
    name: "Glute Builder",
    type: "fitness",
    description:
      "A 6-week lower-body program centred on hip thrusts, bridges and posterior-chain work for glutes that actually do their job.",
    durationWeeks: 6,
    isAiOnly: true,
    priceCents: 1699,
    imageUrl: unsplash("photo-1784819482932-893a2b63df45"),
  },
  {
    id: "prog-upper-sculpt",
    name: "Upper Body Sculpt",
    type: "fitness",
    description:
      "A 6-week upper-body program of presses, rows and raises that balances pushing and pulling instead of over-training the mirror muscles.",
    durationWeeks: 6,
    isAiOnly: true,
    priceCents: 1799,
    imageUrl: unsplash("photo-1532384816664-01b8b7238c8d"),
  },
  {
    id: "prog-strength-intermediate",
    name: "Progressive Strength",
    type: "fitness",
    description: "An 8-week strength-focused program with progressive overload.",
    durationWeeks: 8,
    isAiOnly: true,
    priceCents: 1999,
    imageUrl: unsplash("photo-1521804906057-1df8fdb718b7"),
  },
  {
    id: "prog-run-5k-half",
    name: "5K to Half Marathon",
    type: "fitness",
    description:
      "A 10-week running program that takes a comfortable 5K up to half-marathon distance, with the strength work that keeps you uninjured.",
    durationWeeks: 10,
    isAiOnly: true,
    priceCents: 2199,
    imageUrl: unsplash("photo-1745790289741-12a211a8325d"),
  },
  {
    id: "prog-athlete-performance",
    name: "Athletic Performance",
    type: "combined",
    description:
      "An 8-week program pairing power, speed and Olympic-style lifting with the nutrition to support it — built for sport, not the mirror.",
    durationWeeks: 8,
    isAiOnly: true,
    priceCents: 2499,
    imageUrl: unsplash("photo-1698671823406-035c77ff6fcd"),
  },
  {
    id: "prog-powerlifting",
    name: "Powerlifting Foundations",
    type: "fitness",
    description:
      "A 10-week introduction to the squat, bench and deadlift as trained lifts — heavy, low-rep, and organised around the three competition movements.",
    durationWeeks: 10,
    isAiOnly: true,
    priceCents: 2799,
    imageUrl: unsplash("photo-1694023536590-60d02108b323"),
  },
  {
    id: "prog-lean-muscle",
    name: "Lean Muscle Builder",
    type: "combined",
    description:
      "A 12-week push/pull/legs hypertrophy split paired with a matching nutrition plan for a steady, controlled gaining phase.",
    durationWeeks: 12,
    isAiOnly: true,
    priceCents: 2999,
    imageUrl: unsplash("photo-1583454110551-21f2fa2afe61"),
  },

  // ---- Nutrition: no workouts, the recipes are the content ---------------
  {
    id: "prog-nutrition-reset",
    name: "Nutrition Reset",
    type: "nutrition",
    description: "A 2-week guided nutrition reset with daily meal plans.",
    durationWeeks: 2,
    isAiOnly: true,
    priceCents: 999,
    imageUrl: unsplash("photo-1590779033100-9f60a05a013d"),
  },
  {
    id: "prog-lean-kitchen",
    name: "Lean Kitchen",
    type: "nutrition",
    description:
      "A 4-week nutrition program built on high-protein, high-volume meals that keep you full through a calorie deficit.",
    durationWeeks: 4,
    isAiOnly: true,
    priceCents: 1299,
    imageUrl: unsplash("photo-1771762211132-2f0598b44dbb"),
  },
  {
    id: "prog-plant-based",
    name: "Plant-Based Plate",
    type: "nutrition",
    description:
      "A 4-week fully plant-based nutrition program that still hits real protein targets, for training on no animal products at all.",
    durationWeeks: 4,
    isAiOnly: true,
    priceCents: 1299,
    imageUrl: unsplash("photo-1512621776951-a57141f2eefd"),
  },
];
