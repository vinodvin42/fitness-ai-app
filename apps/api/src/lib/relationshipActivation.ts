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
