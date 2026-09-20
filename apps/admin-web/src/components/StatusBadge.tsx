const LABELS: Record<string, string> = {
  not_verified: "Not Verified",
  pending: "Pending",
  verified: "Verified",
  rejected: "Rejected",
  active: "Active",
  suspended: "Suspended",
  ended: "Ended",
  // Module 02 (Users) additions, 21 Aug 2026 — Subscription/Payment/
  // SupportTicket statuses, none of which overlap the Module 03/04 set
  // above.
  trialing: "Trialing",
  past_due: "Past Due",
  canceled: "Canceled",
  paid: "Paid",
  created: "Created",
  failed: "Failed",
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
  // Module 12.01 (Admin Users) addition, 22 Aug 2026 — AdminUserStatus's
  // second value. "active" above is already shared with Professional/
  // Relationship, so only "disabled" is new here.
  disabled: "Disabled",
  // Module 05 (Programs CMS) addition, 22 Aug 2026 — ContentStatus's two
  // values, for Program/Exercise/Recipe rows.
  draft: "Draft",
  published: "Published",
  // Module 08 (Support Tickets) addition, 22 Aug 2026 —
  // SupportTicketPriority's three values ("open"/"in_progress"/
  // "resolved"/"closed" above are already shared with Module 02).
  low: "Low",
  normal: "Normal",
  high: "High",
  // Module 06.05 (Pricing) addition, 25 Aug 2026 — SubscriptionPlan.isActive
  // rendered as a status pill ("active" above is already shared).
  archived: "Archived",
  // Module 04.03 (Change/Intervention Queue) addition, 25 Aug 2026 —
  // RelationshipChangeStatus's third value ("pending"/"rejected" above
  // are already shared with Module 03's credential statuses).
  approved: "Approved",
  // Module 10.08 (Taxes & Compliance) addition, 26 Aug 2026 —
  // TaxConfig.isActive rendered as a status pill. Distinct from
  // "archived" above: an inactive tax config isn't a retired/historical
  // record, it's a jurisdiction entered but not yet turned on.
  inactive: "Inactive",
  // Module 12.04 (Privacy & Data Governance) addition, 26 Aug 2026 —
  // SensitiveAccessStatus's third value ("pending"/"approved" above are
  // already shared with Module 02/04's own uses of this same status).
  denied: "Denied",
  // Module 06.04 (Refunds) addition, 31 Aug 2026 — RefundStatus's
  // "processed" value ("pending"/"failed" above are already shared).
  processed: "Processed",
  // Module 04 (Relationships) addition, 15 Sep 2026 — R1 U6 extended
  // `RelationshipStatus` from just active/ended to a real six-stage
  // lifecycle (see schema.prisma's own comment on that enum); "active"/
  // "ended" above already cover two of the six.
  requested: "Requested",
  accepted: "Accepted",
  awaiting_payment: "Awaiting Payment",
  activating: "Activating",
  // Gap §57 (18 Sep 2026) — SubscriptionStatus's two new terminal values.
  // "expired" is the real cancel-at-period-end lapse (distinct from the
  // legacy immediate "canceled"); "revoked" is always admin-initiated
  // (fraud/chargeback/ToS), never a user or lazy-expiry outcome.
  expired: "Expired",
  revoked: "Revoked",
  // R2 Wave 2 (20 Sep 2026) — ProfessionalLifecycleStatus's remaining
  // three values ("approved"/"suspended" above are already shared with
  // Module 04/03's own uses of those same words).
  application: "Application",
  verification: "Under Verification",
  available: "Available",
};

const TONE_CLASSES: Record<string, string> = {
  not_verified: "bg-surface-raised text-text-dim",
  pending: "bg-warning/15 text-warning",
  verified: "bg-accent/15 text-accent",
  active: "bg-accent/15 text-accent",
  rejected: "bg-danger/15 text-danger",
  suspended: "bg-danger/15 text-danger",
  ended: "bg-surface-raised text-text-dim",
  trialing: "bg-warning/15 text-warning",
  past_due: "bg-danger/15 text-danger",
  canceled: "bg-surface-raised text-text-dim",
  paid: "bg-accent/15 text-accent",
  created: "bg-warning/15 text-warning",
  failed: "bg-danger/15 text-danger",
  open: "bg-warning/15 text-warning",
  in_progress: "bg-warning/15 text-warning",
  resolved: "bg-accent/15 text-accent",
  closed: "bg-surface-raised text-text-dim",
  disabled: "bg-danger/15 text-danger",
  draft: "bg-surface-raised text-text-dim",
  published: "bg-accent/15 text-accent",
  low: "bg-surface-raised text-text-dim",
  normal: "bg-warning/15 text-warning",
  high: "bg-danger/15 text-danger",
  archived: "bg-surface-raised text-text-dim",
  approved: "bg-accent/15 text-accent",
  inactive: "bg-surface-raised text-text-dim",
  denied: "bg-danger/15 text-danger",
  processed: "bg-accent/15 text-accent",
  requested: "bg-warning/15 text-warning",
  accepted: "bg-warning/15 text-warning",
  awaiting_payment: "bg-warning/15 text-warning",
  activating: "bg-warning/15 text-warning",
  expired: "bg-surface-raised text-text-dim",
  revoked: "bg-danger/15 text-danger",
  application: "bg-surface-raised text-text-dim",
  verification: "bg-warning/15 text-warning",
  available: "bg-accent/15 text-accent",
};

const CHECKMARK_STATUSES = new Set(["verified", "active", "paid", "resolved", "published", "approved", "processed", "available"]);

/**
 * "Verification status badge (Verified ✓ / Not Verified / Pending,
 * color-coded green/amber)" — docs/admin/04-design-system.md §2, reused
 * here for Module 03's status pills (credential status, KYC status,
 * professional account status), Module 04's Relationship status, and
 * (21 Aug 2026) Module 02's Subscription/Payment/SupportTicket statuses.
 * Same color convention as apps/coach-mobile's own StatusBadge, just a
 * Tailwind implementation instead of RN StyleSheet.
 */
export function StatusBadge({ status }: { status: string }) {
  const toneClass = TONE_CLASSES[status] ?? TONE_CLASSES.not_verified;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${toneClass}`}>
      {LABELS[status] ?? status}
      {CHECKMARK_STATUSES.has(status) ? " ✓" : ""}
    </span>
  );
}
