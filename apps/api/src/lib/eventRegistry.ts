/**
 * The spec's event vocabulary, mapped to what this codebase emits.
 *
 * Spec §11 names 60 events in `domain.object.action` form. 27 of them
 * were already emitted verbatim; about 15 more existed under a different
 * name that predates the spec (`workout.set.logged` for `set.logged`,
 * `payment.captured` for `payment.succeeded`, `professional_offer.*` for
 * `offer.*`); the rest did not exist at all.
 *
 * Renaming 15 live emitters would churn every call site and silently
 * break any dashboard already reading the current names, for no
 * behavioural gain. So the emitted name stays authoritative and this
 * registry is the contract: it states, in one place, which spec event
 * each emitted name satisfies, and it is asserted against the spec list
 * by `tests/eventRegistry.test.ts` so a spec event can never be quietly
 * dropped.
 *
 * `null` means deliberately not emitted in R1, with the reason given.
 */
export const SPEC_EVENT_NAMES = [
  "assessment.started",
  "assessment.resumed",
  "assessment.completed",
  "plan.generation_started",
  "plan.generated",
  "plan.failed",
  "plan.activated",
  "workout.started",
  "set.logged",
  "workout.completed",
  "workout.sync_recovered",
  "food_estimate.created",
  "food_estimate.confirmed",
  "food_estimate.edited",
  "meal.logged",
  "checkin.completed",
  "recommendation.viewed",
  "recommendation.accepted",
  "recommendation.declined",
  "recommendation.no_change",
  "premium.checkout_started",
  "payment.succeeded",
  "payment.failed",
  "entitlement.activated",
  "entitlement.activation_failed",
  "entitlement.retry_started",
  "professional.requested",
  "professional.application_submitted",
  "professional.approved",
  "professional.restricted",
  "professional.suspended",
  "professional.availability_changed",
  "offer.created",
  "offer.viewed",
  "offer.accepted",
  "offer.declined",
  "offer.expired",
  "relationship.activation_started",
  "relationship.activated",
  "relationship.changed",
  "relationship.completed",
  "relationship.ended",
  "review.started",
  "review.completed",
  "message.sent",
  "access.granted",
  "access.revoked",
  "earning.eligible",
  "earning.approved",
  "commission.eligible",
  "commission.disputed",
  "commission.paid",
  "payout.paid",
  "payout.failed",
  "safety.escalated",
  "consent.changed",
  "privacy.request_created",
  "privacy.request_completed",
  "admin.action_required.created",
  "admin.action_performed",
] as const;

export type SpecEventName = (typeof SPEC_EVENT_NAMES)[number];

/**
 * spec name -> the name actually emitted, or null with a reason.
 *
 * A reader tracing "where does `set.logged` come from" starts here.
 */
export const EVENT_NAME_MAP: Record<SpecEventName, string | null> = {
  "assessment.started": "assessment.started",
  "assessment.resumed": "assessment.resumed",
  "assessment.completed": "assessment.completed",
  "plan.generation_started": "plan.generation_started",
  "plan.generated": "plan.generated",
  // Emitted as `plan.generation_failed`, paired with the _started name
  // above rather than the spec's bare `plan.failed`.
  "plan.failed": "plan.generation_failed",
  "plan.activated": "plan.activated",
  "workout.started": "workout.started",
  // Namespaced under its parent workout, so a consumer can filter the
  // whole workout family with one prefix.
  "set.logged": "workout.set.logged",
  "workout.completed": "workout.completed",
  "workout.sync_recovered": "workout.sync_recovered",
  "food_estimate.created": "food_estimate.created",
  "food_estimate.confirmed": "food_estimate.confirmed",
  "food_estimate.edited": "food_estimate.edited",
  "meal.logged": "meal.logged",
  "checkin.completed": "checkin.completed",
  "recommendation.viewed": "recommendation.viewed",
  "recommendation.accepted": "recommendation.accepted",
  "recommendation.declined": "recommendation.declined",
  "recommendation.no_change": "recommendation.no_change",
  "premium.checkout_started": "premium.checkout_started",
  // The gateway's own vocabulary: an authorised payment is "captured".
  "payment.succeeded": "payment.captured",
  "payment.failed": "payment.failed",
  "entitlement.activated": "entitlement.activated",
  "entitlement.activation_failed": "entitlement.activation_failed",
  "entitlement.retry_started": "entitlement.retry_started",
  "professional.requested": "professional.requested",
  "professional.application_submitted": "professional_credential.submitted",
  "professional.approved": "professional.lifecycle.approved",
  // `restricted` is a new R1 lifecycle state; until an admin action
  // exists to set it (P-M3 territory), the demotion path is the
  // closest real transition and is what this maps to.
  "professional.restricted": "professional.lifecycle.demoted_to_approved",
  "professional.suspended": "professional.lifecycle.suspended",
  // Capacity IS availability here — `maxActiveClients` is the only
  // availability lever a professional has in R1.
  "professional.availability_changed": "professional.max_active_clients_updated",
  "offer.created": "professional_offer.created",
  // Not emitted in R1: the professional app has no read-receipt on an
  // offer, so a "viewed" event would be inferred from a list call and
  // would over-count every dashboard poll. P-M7 (the offers list) is
  // where a real view signal belongs.
  "offer.viewed": null,
  "offer.accepted": "professional_offer.accepted",
  "offer.declined": "professional_offer.declined",
  "offer.expired": "professional_offer.expired",
  "relationship.activation_started": "relationship.activation_started",
  "relationship.activated": "relationship.activated",
  "relationship.changed": "relationship.change_requested",
  "relationship.completed": "relationship.completed",
  "relationship.ended": "relationship.ended",
  "review.started": "review.started",
  "review.completed": "review.completed",
  "message.sent": "coach_message.sent",
  "access.granted": "access.granted",
  "access.revoked": "access.revoked",
  "earning.eligible": "earning.eligible",
  "earning.approved": "earning.approved",
  "commission.eligible": "commission.eligible",
  "commission.disputed": "commission.disputed",
  "commission.paid": "commission.paid",
  "payout.paid": "payout.paid",
  "payout.failed": "payout.failed",
  "safety.escalated": "safety.escalated",
  "consent.changed": "consent.changed",
  "privacy.request_created": "privacy.request_created",
  "privacy.request_completed": "privacy.request_completed",
  "admin.action_required.created": "admin_action_item.created",
  "admin.action_performed": "admin_action_item.resolved",
};

/** Resolve a spec event name to the name this codebase emits. */
export function emittedNameFor(spec: SpecEventName): string | null {
  return EVENT_NAME_MAP[spec];
}
