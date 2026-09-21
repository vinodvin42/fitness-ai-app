import { prisma } from "../../db/prisma";
import { hasPermission } from "../../middleware/adminPermissions";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { listConsents } from "../users/users.service";
import {
  CreateSensitiveAccessRequestInput,
  ListUsersQuery,
  MembershipTier,
  ReviewSensitiveAccessRequestInput,
  SuspendUserInput,
} from "./adminUsers.schema";

/**
 * Module 02 — Users (docs/admin/03-screen-inventory.md §02), added 21 Aug
 * 2026. **25 Aug 2026 update:** no longer fully read-only — the Sensitive
 * Data Access Request workflow below is a real, state-changing feature.
 * **26 Aug 2026 update: bulk-select + suspend/reactivate are real too** —
 * re-investigated directly against the schema (rather than trusting this
 * comment's own prior "User has no status field" framing at face value)
 * while working through `reports/build-plan.html`'s remaining "needs your
 * decision" items. That framing was accurate at the time, but the doc's
 * own suggested next step — "Suspend/reactivate is the smallest, most
 * defensible first cut — same reversible-state-flip pattern already used
 * for Professional, AdminUser" — turned out to be buildable without a
 * genuinely new product decision: it's the exact same account-operations
 * pattern already shipped twice in this codebase, not a trust-and-safety
 * policy call (that's 08.04 Safety/Abuse Reports, a separate, still-open
 * decision this doesn't resolve — no ban/appeal/reason-code concept
 * exists here, just "this account shouldn't sign in right now"). The
 * auto-renew toggle remains correctly unbuilt (see its own bullet below)
 * — it needs a real billing-engine decision this doesn't touch.
 *
 * **What's real vs. honestly not modeled**, against the Figma's fuller
 * spec:
 * - 02.01 Directory columns: User & Account ID / Email Identity /
 *   Registered are real (`User.id`/`email`/`createdAt`). "Membership" is a
 *   real derived value — this user's most recent `Subscription` row's
 *   plan tier if its status is active/trialing, else "free" (a user only
 *   ever has one live subscription at a time — subscribing cancels the
 *   old one, see subscriptions.service.ts). "Channel" is a real derived
 *   value too — "referral" if a `Referral` row exists with this user as
 *   referee, else "organic" (no richer acquisition-channel taxonomy is
 *   tracked anywhere). Region and "Last Sync" have NO backing field —
 *   `User` has no country/region column beyond the free-text
 *   `countryCode` added for Geographic Analytics (no curated region list
 *   to filter/display against), and no client ever reports a
 *   last-synced-at timestamp to the server. **"Status" is real as of 26
 *   Aug 2026** — `User.status` (`active`/`suspended`), same enum shape as
 *   `Professional.status`.
 * - **The checkbox/bulk-select column is real as of 26 Aug 2026** —
 *   `suspendUser`/`reactivateUser` below give a bulk action something
 *   real to drive. Not a single new atomic bulk endpoint: the frontend
 *   fires one real suspend/reactivate call per selected user (mirroring
 *   the existing single-user endpoints exactly, same shape as
 *   `adminProfessionals`'s), so a partial failure surfaces per-row rather
 *   than silently succeeding or failing as one unit — see
 *   `UserDirectoryScreen.tsx`'s own comment.
 * - 02.02 Profile: Overview's real fields are phone, referralCode,
 *   createdAt, the latest Subscription snapshot, real lifetime-financial
 *   numbers computed from `Payment` (total spent, months active, avg
 *   monthly spend, payment success rate), the real `Relationship`-backed
 *   assigned-professionals list, and a real recent-activity feed (every
 *   `AuditLog` row where this user is the actor — genuinely populated,
 *   since signup/login/password-change/workout-complete/meal-logged/
 *   payments/etc. all call `recordAudit()` with `actorId`). City,
 *   timezone, and acquisition source have no backing field. The
 *   "auto-renew toggle" has no backing field either (`Subscription` has
 *   no `autoRenew` column, and no billing/renewal engine exists to make a
 *   real toggle meaningful even if one were added) — not rendered as a
 *   fake switch, same "Request Info" precedent as Module 03's Credential
 *   Verification. Still genuinely open, re-checked 25 Aug 2026.
 * - The spec's locked "Sensitive Health Metrics" panel — **real as of 25
 *   Aug 2026.** `OnboardingProfile` has always had the real backing data
 *   (medicalConditions/injuries/allergens/gender/age/weightKg/heightCm);
 *   what was missing was the gate the Figma spec explicitly requires
 *   (docs/admin/05-roles-permissions.md §4: "requires supervisor
 *   approval" and "is logged"). That gate is now real: see this file's
 *   `createSensitiveAccessRequest`/`approveSensitiveAccessRequest`/
 *   `denySensitiveAccessRequest`, backed by the `SensitiveDataAccessRequest`
 *   model (prisma/schema.prisma — see that model's own doc comment for
 *   the full design, including why holding `sensitiveData: view` is a
 *   precondition to request, not a substitute for the per-user approval).
 *   `getUserDetail` now returns a `sensitiveAccess` block describing the
 *   CALLING admin's own state for this user, and `sensitiveHealthMetrics`
 *   only when that admin has an approved request — never unconditionally.
 * - Subscription/Payments/Support History tabs are fully real (existing
 *   `Subscription`/`Payment`/`SupportTicket` models, just scoped to one
 *   user). The Activity tab is NOT built — the spec gives no key-data
 *   detail for it beyond the tab name, and it would duplicate either the
 *   Overview's real event feed or a genuinely new fitness-activity-stats
 *   feature this slice doesn't have room for.
 *
 * Deliberately does NOT import `User`/`Subscription`/`Payment`/etc. as
 * Prisma model types — same reasoning as adminProfessionals.service.ts's
 * own comment.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function membershipOf(latestSubscription: { status: string; plan: { tier: string } } | null): MembershipTier {
  if (!latestSubscription) return "free";
  if (latestSubscription.status !== "active" && latestSubscription.status !== "trialing") return "free";
  return latestSubscription.plan.tier as MembershipTier;
}

export async function listUsers(query: ListUsersQuery) {
  const where: Record<string, unknown> = {};
  if (query.search) {
    where.OR = [
      { fullName: { contains: query.search, mode: "insensitive" } },
      { email: { contains: query.search, mode: "insensitive" } },
    ];
  }
  if (query.startDate || query.endDate) {
    where.createdAt = {
      ...(query.startDate ? { gte: query.startDate } : {}),
      ...(query.endDate ? { lte: query.endDate } : {}),
    };
  }

  if (query.status) {
    where.status = query.status;
  }

  const users = await prisma.user.findMany({
    where,
    include: {
      subscriptions: { orderBy: { createdAt: "desc" }, take: 1, include: { plan: { select: { tier: true } } } },
      referredBy: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = (
    users as Array<{
      id: string;
      fullName: string;
      email: string;
      createdAt: Date;
      status: string;
      subscriptions: Array<{ status: string; plan: { tier: string } }>;
      referredBy: { id: string } | null;
    }>
  ).map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    createdAt: u.createdAt,
    membership: membershipOf(u.subscriptions[0] ?? null),
    channel: u.referredBy ? "referral" : "organic",
    status: u.status,
  }));

  const filtered = query.plan ? rows.filter((r) => r.membership === query.plan) : rows;

  return {
    users: filtered,
    total: filtered.length,
    // Figma-spec'd 02.01 columns/filters with no backing field — see this
    // file's top comment. "status" removed 26 Aug 2026, now real.
    notAvailable: ["region", "lastSync"],
  };
}

/**
 * `viewingAdminId`/`viewingAdminRole` are the CALLING admin's own identity
 * (from `req.adminUserId`/`req.adminRole`), used only to shape the
 * `sensitiveAccess` block and decide whether `sensitiveHealthMetrics` gets
 * populated for THIS response — never to change which user's directory
 * record is returned.
 */
export async function getUserDetail(id: string, viewingAdminId: string, viewingAdminRole: string | undefined) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      referralCode: true,
      createdAt: true,
      updatedAt: true,
      status: true,
    },
  });
  if (!user) {
    throw new ApiHttpError(404, "not_found", "User not found");
  }

  const [subscriptions, payments, relationships, supportTickets, recentActivity, myLatestRequest, pendingRequestForReview] =
    await Promise.all([
      prisma.subscription.findMany({
        where: { userId: id },
        include: { plan: { select: { id: true, tier: true, name: true, priceCents: true, billingCycle: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.payment.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" } }),
      prisma.relationship.findMany({
        where: { userId: id },
        include: { professional: { select: { id: true, fullName: true, email: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.supportTicket.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" } }),
      prisma.auditLog.findMany({ where: { actorId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
      // This admin's own most recent request for THIS user — drives
      // `sensitiveAccess.myLatestRequest`/`permitted`/`canRequest` below.
      prisma.sensitiveDataAccessRequest.findFirst({
        where: { userId: id, requestedByAdminId: viewingAdminId },
        orderBy: { createdAt: "desc" },
      }),
      // The single most recent OTHER admin's pending request for this
      // user, if any — surfaced only when the viewer can actually act on
      // it (see the `canReview` shaping below). A simplification, not a
      // full multi-request queue: the Figma's 02.02 panel is one card,
      // not a list, and in practice one pending request per user at a
      // time is the overwhelmingly common case.
      prisma.sensitiveDataAccessRequest.findFirst({
        where: { userId: id, status: "pending", requestedByAdminId: { not: viewingAdminId } },
        orderBy: { createdAt: "desc" },
        include: { requestedByAdmin: { select: { id: true, fullName: true } } },
      }),
    ]);

  const typedSubscriptions = subscriptions as Array<{
    id: string;
    userId: string;
    planId: string;
    status: string;
    renewsAt: Date | null;
    cancelAtPeriodEnd: boolean;
    revokedAt: Date | null;
    revokedReason: string | null;
    createdAt: Date;
    plan: { id: string; tier: string; name: string; priceCents: number; billingCycle: string };
  }>;

  const typedPayments = payments as Array<{
    id: string;
    purpose: string;
    amountCents: number;
    currency: string;
    status: string;
    createdAt: Date;
  }>;

  const paidPayments = typedPayments.filter((p) => p.status === "paid");
  const totalSpentCents = paidPayments.reduce((sum, p) => sum + p.amountCents, 0);
  // Approximated as 30-day months since account creation — there's no
  // billing-cycle-anchored "months active" concept modeled anywhere else
  // in this schema to reuse instead. Floored at 1 so a brand-new account
  // never divides by zero below.
  const monthsActive = Math.max(1, Math.ceil((Date.now() - user.createdAt.getTime()) / (DAY_MS * 30)));
  const paymentSuccessRate = typedPayments.length > 0 ? paidPayments.length / typedPayments.length : null;

  // Sensitive Data Access — see this file's top comment and
  // SensitiveDataAccessRequest's own doc comment for the full design.
  const typedMyLatestRequest = myLatestRequest as {
    id: string;
    reason: string;
    status: string;
    reviewNotes: string | null;
    createdAt: Date;
    reviewedAt: Date | null;
  } | null;
  const canRequest = hasPermission(viewingAdminRole, "sensitiveData", "view");
  const canReview = hasPermission(viewingAdminRole, "sensitiveData", "approve");
  const permitted = typedMyLatestRequest?.status === "approved";
  // Gap §57 (18 Sep 2026) — whether this viewing admin can force-revoke a
  // subscription for this user (`commerce: approve`, the same gate the
  // route itself enforces server-side — this is only for the frontend to
  // decide whether to render the button at all, never a substitute for
  // that route-level check).
  const canForceRevoke = hasPermission(viewingAdminRole, "commerce", "approve");

  const typedPendingForReview = pendingRequestForReview as {
    id: string;
    reason: string;
    createdAt: Date;
    requestedByAdmin: { id: string; fullName: string };
  } | null;

  let sensitiveHealthMetrics: {
    gender: string | null;
    age: number | null;
    weightKg: number | null;
    heightCm: number | null;
    allergens: string[];
    medicalConditions: string[];
    injuries: string[];
  } | null = null;
  if (permitted) {
    const onboardingProfile = await prisma.onboardingProfile.findUnique({
      where: { userId: id },
      select: {
        gender: true,
        age: true,
        weightKg: true,
        heightCm: true,
        allergens: true,
        medicalConditions: true,
        injuries: true,
      },
    });
    // A granted admin sees whatever real data exists — null fields if the
    // user never completed onboarding, not a fabricated placeholder.
    sensitiveHealthMetrics = onboardingProfile ?? {
      gender: null,
      age: null,
      weightKg: null,
      heightCm: null,
      allergens: [],
      medicalConditions: [],
      injuries: [],
    };
  }

  return {
    user,
    membership: membershipOf(typedSubscriptions[0] ?? null),
    lifetimeValue: {
      totalSpentCents,
      monthsActive,
      avgMonthlySpendCents: Math.round(totalSpentCents / monthsActive),
      paymentSuccessRate,
    },
    currentSubscription: typedSubscriptions[0] ?? null,
    subscriptions: typedSubscriptions,
    canForceRevoke,
    payments: typedPayments,
    relationships: (
      relationships as Array<{
        id: string;
        serviceType: string;
        status: string;
        createdAt: Date;
        endedAt: Date | null;
        professional: { id: string; fullName: string; email: string };
      }>
    ).map((r) => ({
      relationshipId: r.id,
      professionalId: r.professional.id,
      professionalFullName: r.professional.fullName,
      professionalEmail: r.professional.email,
      serviceType: r.serviceType,
      status: r.status,
      createdAt: r.createdAt,
      endedAt: r.endedAt,
    })),
    supportTickets: supportTickets as Array<{
      id: string;
      userId: string;
      category: string;
      subject: string;
      message: string;
      status: string;
      priority: string;
      createdAt: Date;
      updatedAt: Date;
    }>,
    recentActivity: (
      recentActivity as Array<{ id: string; action: string; entityType: string; createdAt: Date }>
    ).map((a) => ({ id: a.id, action: a.action, entityType: a.entityType, createdAt: a.createdAt })),
    // 02.02's city/timezone/acquisition source, auto-renew toggle, and the
    // Activity tab — see this file's top comment.
    // "sensitiveHealthMetrics" is deliberately NOT in this list any more —
    // its availability is a real, per-viewing-admin state now (see
    // `sensitiveAccess`/`sensitiveHealthMetrics` below), not a blanket gap.
    notAvailable: ["city", "timezone", "acquisitionSource", "autoRenew", "activity"],
    sensitiveAccess: {
      // Whether this VIEWING admin's role even carries the `sensitiveData`
      // module permission at all — false means the frontend shouldn't
      // offer a "Request Access" button in the first place (today: only
      // super_admin; see adminPermissions.ts).
      canRequest,
      // Whether this viewing admin can see OTHER admins' pending requests
      // for this user and act on them (approve/deny) — gates
      // `pendingRequestForReview` below.
      canReview,
      // True only when THIS admin has an approved request for THIS user —
      // the sole condition under which `sensitiveHealthMetrics` below is
      // populated.
      permitted,
      myLatestRequest: typedMyLatestRequest
        ? {
            id: typedMyLatestRequest.id,
            reason: typedMyLatestRequest.reason,
            status: typedMyLatestRequest.status,
            reviewNotes: typedMyLatestRequest.reviewNotes,
            createdAt: typedMyLatestRequest.createdAt,
            reviewedAt: typedMyLatestRequest.reviewedAt,
          }
        : null,
      // Only ever non-null when `canReview` is also true — see the query
      // above (it's fetched regardless of role, but only meaningful to
      // show a reviewer).
      pendingRequestForReview:
        canReview && typedPendingForReview
          ? {
              id: typedPendingForReview.id,
              reason: typedPendingForReview.reason,
              createdAt: typedPendingForReview.createdAt,
              requestedByAdminId: typedPendingForReview.requestedByAdmin.id,
              requestedByAdminFullName: typedPendingForReview.requestedByAdmin.fullName,
            }
          : null,
    },
    // Only populated when `sensitiveAccess.permitted` is true — see this
    // file's top comment and SensitiveDataAccessRequest's own doc comment.
    sensitiveHealthMetrics,
  };
}

/**
 * Creates a request to view one user's locked "Sensitive Health Metrics"
 * panel. Gated by `sensitiveData: view` at the route level (see
 * adminUsers.routes.ts) — that module permission is a PRECONDITION to
 * request, not a substitute for the per-user approval this creates. See
 * SensitiveDataAccessRequest's own doc comment in prisma/schema.prisma for
 * the full design.
 */
export async function createSensitiveAccessRequest(
  actorAdminId: string,
  targetUserId: string,
  input: CreateSensitiveAccessRequestInput,
) {
  const user = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
  if (!user) {
    throw new ApiHttpError(404, "not_found", "User not found");
  }

  const latest = await prisma.sensitiveDataAccessRequest.findFirst({
    where: { userId: targetUserId, requestedByAdminId: actorAdminId },
    orderBy: { createdAt: "desc" },
  });
  const latestStatus = (latest as { status: string } | null)?.status;
  if (latestStatus === "pending") {
    throw new ApiHttpError(409, "sensitive_access_already_requested", "You already have a pending request for this user");
  }
  if (latestStatus === "approved") {
    throw new ApiHttpError(409, "sensitive_access_already_granted", "You already have approved access to this user's sensitive data");
  }

  const request = await prisma.sensitiveDataAccessRequest.create({
    data: {
      userId: targetUserId,
      requestedByAdminId: actorAdminId,
      reason: input.reason,
    },
  });

  await recordAudit({
    actorAdminId,
    action: "sensitive_access.request",
    entityType: "SensitiveDataAccessRequest",
    entityId: request.id,
    metadata: { userId: targetUserId, reason: input.reason },
  });

  return { request };
}

async function getRequestOrThrow(id: string) {
  const request = await prisma.sensitiveDataAccessRequest.findUnique({ where: { id } });
  if (!request) {
    throw new ApiHttpError(404, "not_found", "Sensitive data access request not found");
  }
  return request as {
    id: string;
    userId: string;
    requestedByAdminId: string;
    reason: string;
    status: string;
    reviewNotes: string | null;
    createdAt: Date;
    reviewedAt: Date | null;
  };
}

/**
 * Approves a pending request — grants the REQUESTING admin (not the
 * approver) indefinite access to that one user's sensitive panel. Gated by
 * `sensitiveData: approve` at the route level. `cannot_approve_own_request`
 * mirrors adminAccounts.service.ts's `cannot_disable_self`: the whole
 * point of this workflow is a second set of eyes, so an admin approving
 * their own request would defeat it entirely.
 */
export async function approveSensitiveAccessRequest(
  actorAdminId: string,
  requestId: string,
  input: ReviewSensitiveAccessRequestInput,
) {
  const request = await getRequestOrThrow(requestId);
  if (request.requestedByAdminId === actorAdminId) {
    throw new ApiHttpError(400, "cannot_approve_own_request", "You cannot approve your own sensitive-data access request");
  }
  if (request.status !== "pending") {
    throw new ApiHttpError(409, "request_already_reviewed", `This request has already been ${request.status}`);
  }

  const updated = await prisma.sensitiveDataAccessRequest.update({
    where: { id: requestId },
    data: {
      status: "approved",
      reviewedByAdminId: actorAdminId,
      reviewedAt: new Date(),
      reviewNotes: input.reviewNotes ?? null,
    },
  });

  await recordAudit({
    actorAdminId,
    action: "sensitive_access.approve",
    entityType: "SensitiveDataAccessRequest",
    entityId: requestId,
    metadata: { userId: request.userId, requestedByAdminId: request.requestedByAdminId },
  });

  return { request: updated };
}

/** Denies a pending request. Same self-review guard as approve, for consistency (an admin shouldn't self-deny to hide the attempt either — a real reviewer's decision either way). */
export async function denySensitiveAccessRequest(
  actorAdminId: string,
  requestId: string,
  input: ReviewSensitiveAccessRequestInput,
) {
  const request = await getRequestOrThrow(requestId);
  if (request.requestedByAdminId === actorAdminId) {
    throw new ApiHttpError(400, "cannot_approve_own_request", "You cannot review your own sensitive-data access request");
  }
  if (request.status !== "pending") {
    throw new ApiHttpError(409, "request_already_reviewed", `This request has already been ${request.status}`);
  }

  const updated = await prisma.sensitiveDataAccessRequest.update({
    where: { id: requestId },
    data: {
      status: "denied",
      reviewedByAdminId: actorAdminId,
      reviewedAt: new Date(),
      reviewNotes: input.reviewNotes ?? null,
    },
  });

  await recordAudit({
    actorAdminId,
    action: "sensitive_access.deny",
    entityType: "SensitiveDataAccessRequest",
    entityId: requestId,
    metadata: { userId: request.userId, requestedByAdminId: request.requestedByAdminId },
  });

  return { request: updated };
}

/**
 * Module 02.01 Bulk-select + suspend/reactivate (added 26 Aug 2026) —
 * mirrors adminProfessionals.service.ts's suspendProfessional/
 * reactivateProfessional exactly: same audit-logged state flip, same
 * "one latest note on the row, full trail in AuditLog" convention. See
 * this file's top comment for why this doesn't need the 08.04 Safety/
 * Abuse Reports moderation-policy decision that's still genuinely open.
 * Blocks login immediately for future login attempts (auth.service.ts's
 * login()) — same limitation as Professional/AdminUser suspend: an
 * already-issued, still-valid access/refresh token pair isn't proactively
 * revoked, only blocked from being renewed via a fresh login.
 */
export async function suspendUser(adminId: string, userId: string, input: SuspendUserInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiHttpError(404, "not_found", "User not found");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { status: "suspended", adminNotes: input.adminNotes ?? undefined },
  });

  await recordAudit({
    actorAdminId: adminId,
    action: "admin.user.suspended",
    entityType: "User",
    entityId: userId,
    metadata: { adminNotes: input.adminNotes },
  });

  return updated;
}

/**
 * Consent Management admin view (Wave 4, 20 Sep 2026) — closes the gap
 * `adminPrivacy.service.ts`'s own top comment names: a real `Consent`
 * model (R1 Developer 1, 18 Sep 2026) with real user-facing read/write
 * endpoints (`GET`/`PATCH /users/me/consents`) existed with zero
 * admin-console visibility into it. This is a thin, read-only wrapper
 * around `users.service.ts#listConsents` — the exact same per-(user,type)
 * "always return all 3 types, `granted: false` + `updatedAt: null` means
 * 'never decided', not 'declined'" logic that function already owns, not
 * duplicated here. No admin-side override/force-change action: consent is
 * the user's own choice everywhere else in this codebase (the mobile
 * PrivacySettingsScreen is the only place a Consent row is ever written),
 * and nothing in the work package asks for an admin to be able to grant
 * or revoke consent on a user's behalf — see docs/admin/07-open-
 * questions-gaps.md's dated entry for this wave for the full reasoning.
 * Gated by `sensitiveData: view` at the route level, same as the rest of
 * 12.04 Privacy & Data Governance (`adminPrivacy.routes.ts`) — consent
 * state (especially `health_data_processing`) is privacy-sensitive in the
 * same sense the DSAR/Sensitive Access logs already are, so this reuses
 * that existing gate rather than inventing a narrower one.
 */
export async function listUserConsents(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, email: true },
  });
  if (!user) {
    throw new ApiHttpError(404, "not_found", "User not found");
  }

  const consents = await listConsents(userId);

  return {
    userId: user.id,
    userFullName: user.fullName,
    userEmail: user.email,
    consents,
  };
}

export async function reactivateUser(adminId: string, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiHttpError(404, "not_found", "User not found");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { status: "active" },
  });

  await recordAudit({
    actorAdminId: adminId,
    action: "admin.user.reactivated",
    entityType: "User",
    entityId: userId,
  });

  return updated;
}
