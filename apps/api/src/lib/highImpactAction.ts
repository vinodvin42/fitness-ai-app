import { ApiHttpError } from "../middleware/errorHandler";

/**
 * BR-ADM-005 — "High-impact admin actions need impact preview, reason,
 * typed confirmation and an immutable audit event."
 *
 * Acceptance test 16 states it as a behaviour: "Every high-impact admin
 * action is refused without a reason and typed confirmation, and writes
 * an immutable audit event." Before R1 none of that was enforced —
 * `adminRefunds.schema.ts` had `reason: z.string().optional()` and no
 * typed-confirmation mechanism existed anywhere in the codebase, so the
 * test failed by construction.
 *
 * The admin console already renders a "type RESOLVE" confirmation step
 * (docs/admin/03-screen-inventory.md: "Impact Preview -> Reason ->
 * Confirmation ('type RESOLVE') -> Audit"). This is the server-side half:
 * a UI-only confirmation is theatre, and the spec's own Definition of
 * Done says "Every rule is enforced by the API, not only hidden in the
 * UI".
 */

/** The word an admin must type. Uppercase, and compared exactly. */
export const CONFIRMATION_WORD = "RESOLVE";

/**
 * Minimum reason length. Short enough not to obstruct real work, long
 * enough that "ok" or "." does not satisfy the audit trail. Matches the
 * 10-character floor the admin console's existing `ReasonGatedAction`
 * component already applies client-side.
 */
export const MIN_REASON_LENGTH = 10;

export type HighImpactConfirmation = {
  reason?: string | null;
  confirmation?: string | null;
};

/**
 * Refuses the action unless both gates are satisfied. Throws rather than
 * returning a result, so a caller cannot accidentally proceed by ignoring
 * a return value — the failure mode this guards against is a new admin
 * endpoint quietly skipping the check.
 *
 * Returns the trimmed reason so callers persist the normalised text
 * rather than whatever whitespace arrived.
 */
export function assertHighImpactConfirmed(input: HighImpactConfirmation): string {
  const reason = (input.reason ?? "").trim();
  if (reason.length < MIN_REASON_LENGTH) {
    throw new ApiHttpError(
      422,
      "reason_required",
      `This action changes money, access or personal data, so it needs a written reason of at least ${MIN_REASON_LENGTH} characters (BR-ADM-005).`,
    );
  }

  const confirmation = (input.confirmation ?? "").trim();
  if (confirmation !== CONFIRMATION_WORD) {
    throw new ApiHttpError(
      422,
      "confirmation_required",
      `Type ${CONFIRMATION_WORD} to confirm this action (BR-ADM-005).`,
    );
  }

  return reason;
}
