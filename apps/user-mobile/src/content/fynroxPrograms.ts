import type { IconName } from "../components/Icon";

/**
 * Fynrox programs (the owner's table, 20 Oct 2026), shown on My plan and on
 * the website. Owner, 20 Oct 2026: each runs 12 weeks and costs ₹4,999
 * including GST, bought separately (not part of Basic or Prime). Information
 * only for now: they are not the purchasable program data (apps/api
 * seedContent/programs.ts has no programs by these names), so the price is
 * the owner's stated price, shown here, and there is no button to buy or
 * start one until a purchase flow is agreed.
 */
export interface FynroxProgram {
  key: string;
  name: string;
  icon: IconName;
  /** Who it is for. */
  forWhom: string;
  goal: string;
  duration: string;
  /** Price in paise, including GST. */
  priceCents: number;
}

/** Owner, 20 Oct 2026: every program is 12 weeks and ₹4,999 incl. GST. */
const PROGRAM_WEEKS = "12 weeks";
const PROGRAM_PRICE_CENTS = 499900;

export const FYNROX_PROGRAMS: FynroxProgram[] = [
  {
    key: "fat-loss-reset",
    name: "Fynrox Fat Loss Reset",
    icon: "flame",
    forWhom: "Beginners, busy professionals and people wanting sustainable weight loss",
    goal: "Lose fat, improve habits and build a maintainable routine.",
    duration: PROGRAM_WEEKS,
    priceCents: PROGRAM_PRICE_CENTS,
  },
  {
    key: "muscle-strength",
    name: "Fynrox Muscle & Strength",
    icon: "dumbbell",
    forWhom: "Men and women wanting lean muscle, strength and better body composition",
    goal: "Build muscle and strength with progressive training.",
    duration: PROGRAM_WEEKS,
    priceCents: PROGRAM_PRICE_CENTS,
  },
  {
    key: "active-50",
    name: "Fynrox Active 50+",
    icon: "footprints",
    forWhom: "People aged 50+, beginners or returning to exercise",
    goal: "Improve mobility, balance, strength and daily independence.",
    duration: PROGRAM_WEEKS,
    priceCents: PROGRAM_PRICE_CENTS,
  },
  {
    key: "womens-wellness",
    name: "Fynrox Women's Wellness",
    icon: "flower",
    forWhom: "Women focused on PCOS/PCOD support, hormonal health, strength and energy",
    goal: "Build strength and sustainable health habits around the female lifecycle.",
    duration: PROGRAM_WEEKS,
    priceCents: PROGRAM_PRICE_CENTS,
  },
];
