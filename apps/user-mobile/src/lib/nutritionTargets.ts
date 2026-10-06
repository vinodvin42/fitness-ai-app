/**
 * Daily macro targets shared by Fuel and Today's "Upcoming meal" card so both
 * show the same remaining numbers. These are still the app-wide defaults (the
 * API has no per-user nutrition target yet - see docs/mobile gap on targets);
 * swap this one constant for a real per-user target when that exists.
 */
export const DAILY_TARGETS = { calories: 2000, proteinG: 150, carbsG: 200, fatG: 65 } as const;
