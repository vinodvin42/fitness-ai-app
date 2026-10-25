/**
 * How long a relationship may sit at `activating` before it counts as stuck.
 * Activation (coaching.service.ts's createBooking) is a handful of sequential
 * DB writes that normally finish in well under a second, so anything still
 * `activating` 15 minutes later is genuinely stuck, not mid-request. Shared by
 * the professional dashboard's admin-queue detection and the user's own
 * status feed (GET /coaching/relationships/status) so both agree.
 */
export const STUCK_ACTIVATING_THRESHOLD_MS = 15 * 60 * 1000;

/**
 * Finished outcomes the user's status feed keeps listing under "Earlier" for
 * this long after `endedAt` (owner decision, 18 Oct 2026).
 */
export const FINISHED_RELATIONSHIP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const FINISHED_RELATIONSHIP_STATUSES = ["declined", "expired", "completed"] as const;

/**
 * How long a coach has to answer a guidance request before it ends (25 Oct
 * 2026, Figma coach/05 and 05b: "48 hours to reply, or the request ends").
 * Checked when either side reads the request, since this app has no scheduler
 * (see coaching.service.ts's expireOverdueRequests). Nothing is ever charged
 * before a coach accepts, so an expired request costs the member nothing.
 */
export const REQUEST_REPLY_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * How long the member has to pay once the coach accepts (Figma coach/09; 25 Oct 2026). After that an
 * `accepted` request becomes `expired` (endReason "not_paid"), lazily like the reply window, and
 * nothing is charged. A request already in `awaiting_payment` (a checkout was started) is left alone,
 * so a payment in flight is never cut off. Legacy rows without `acceptedAt` never lapse.
 */
export const PAYMENT_WINDOW_MS = 48 * 60 * 60 * 1000;
