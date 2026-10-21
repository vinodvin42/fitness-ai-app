import React from "react";
import { FynroxProgramsSection } from "../../components/FynroxProgramsSection";

/**
 * Workouts > Programs tab body (also opened from More > Paid Programs).
 *
 * Owner, 21 Oct 2026: "in programs remove all free programmes, add all 4 paid
 * programmes". It lists only the four Fynrox programs
 * (content/fynroxPrograms.ts: 12 weeks, ₹4,999 incl. GST, bought separately).
 * The published programs from GET /programs (the free ones and the older paid
 * seed programs) are no longer listed; members keep any they already have
 * under My Programs. There is no buy button yet: the four programs have no
 * workouts in the API, so there is nothing to sell until those are written and
 * the purchase flow is built. The earlier catalog (type/level filters,
 * featured card, grid) is in git history before this change.
 */
export function ProgramsCatalog() {
  return <FynroxProgramsSection />;
}
