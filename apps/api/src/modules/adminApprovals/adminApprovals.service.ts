import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { signAdminAccessToken } from "../../lib/adminJwt";
import { replayApprovedRequest } from "../../lib/makerChecker";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import type { ListApprovalsQuery } from "./adminApprovals.schema";

/**
 * Approvals inbox (blueprint section 5, decision D21). Only the Super Admin
 * decides. Makers see their own requests; the Super Admin and the
 * co-founder see all of them. Pending requests past `expiresAt` are marked
 * expired whenever the inbox is read or a decision is attempted, so no
 * scheduler is needed.
 */

type ApprovalRow = {
  id: string;
  status: string;
  makerAdminId: string;
  makerRole: string;
  checkerAdminId: string | null;
  method: string;
  path: string;
  body: unknown;
  module: string;
  action: string;
  summary: string;
  reason: string;
  decisionNote: string | null;
  expiresAt: Date;
  decidedAt: Date | null;
  appliedAt: Date | null;
  resultStatus: number | null;
  resultBody: unknown;
  createdAt: Date;
  makerAdmin?: { id: string; fullName: string; email: string; role: string } | null;
  checkerAdmin?: { id: string; fullName: string; email: string; role: string } | null;
};

const PEOPLE_SELECT = { select: { id: true, fullName: true, email: true, role: true } } as const;

const SECRET_KEY = /password|token|secret|recoverycodes|otp/i;

/** Removes secret-looking fields (passwords, tokens, secrets, recovery codes) before storing or showing JSON. */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 8 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? "[hidden]" : redactSecrets(v, depth + 1);
    }
    return out;
  }
  return value;
}

function canSeeAll(role: string | undefined): boolean {
  return role === "super_admin" || role === "co_founder";
}

export function toApprovalDTO(row: ApprovalRow) {
  return {
    id: row.id,
    status: row.status,
    maker: row.makerAdmin ?? { id: row.makerAdminId, fullName: null, email: null, role: row.makerRole },
    makerRole: row.makerRole,
    checker: row.checkerAdmin ?? (row.checkerAdminId ? { id: row.checkerAdminId, fullName: null, email: null, role: null } : null),
    method: row.method,
    path: row.path,
    body: redactSecrets(row.body),
    module: row.module,
    action: row.action,
    summary: row.summary,
    reason: row.reason,
    decisionNote: row.decisionNote,
    expiresAt: row.expiresAt.toISOString(),
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    appliedAt: row.appliedAt ? row.appliedAt.toISOString() : null,
    resultStatus: row.resultStatus,
    resultBody: redactSecrets(row.resultBody),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Marks every pending request past its expiry as expired, and any request
 * stuck in `applying` for more than 5 minutes (a crash or restart during
 * approval) as failed, so nothing waits forever.
 */
export async function expireStaleApprovals(now: Date = new Date()): Promise<number> {
  const [expired] = await Promise.all([
    prisma.approvalRequest.updateMany({
      where: { status: "pending", expiresAt: { lt: now } },
      data: { status: "expired" },
    }),
    prisma.approvalRequest.updateMany({
      where: { status: "applying", decidedAt: { lt: new Date(now.getTime() - 5 * 60 * 1000) } },
      data: { status: "failed", resultStatus: 504, resultBody: { error: { code: "apply_interrupted", message: "Applying was interrupted. Check the record and ask again if needed." } } },
    }),
  ]);
  return expired.count;
}

export async function listApprovals(viewer: { adminId: string; role: string | undefined }, query: ListApprovalsQuery) {
  await expireStaleApprovals();
  const where: Prisma.ApprovalRequestWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(canSeeAll(viewer.role) ? {} : { makerAdminId: viewer.adminId }),
  };
  const [rows, counts] = await Promise.all([
    prisma.approvalRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: query.limit,
      include: { makerAdmin: PEOPLE_SELECT, checkerAdmin: PEOPLE_SELECT },
    }),
    prisma.approvalRequest.groupBy({
      by: ["status"],
      where: canSeeAll(viewer.role) ? {} : { makerAdminId: viewer.adminId },
      _count: { _all: true },
      orderBy: { status: "asc" },
    }),
  ]);
  const countByStatus: Record<string, number> = {};
  for (const c of counts) countByStatus[c.status] = c._count._all;
  return { approvals: (rows as ApprovalRow[]).map(toApprovalDTO), counts: countByStatus };
}

export async function getApproval(viewer: { adminId: string; role: string | undefined }, id: string) {
  await expireStaleApprovals();
  const row = (await prisma.approvalRequest.findUnique({
    where: { id },
    include: { makerAdmin: PEOPLE_SELECT, checkerAdmin: PEOPLE_SELECT },
  })) as ApprovalRow | null;
  if (!row || (!canSeeAll(viewer.role) && row.makerAdminId !== viewer.adminId)) {
    throw new ApiHttpError(404, "not_found", "Approval request not found");
  }
  const auditTrail = await prisma.auditLog.findMany({
    where: { OR: [{ approvalRequestId: id }, { entityType: "ApprovalRequest", entityId: id }] },
    orderBy: { createdAt: "asc" },
    select: { id: true, action: true, actorAdminId: true, checkerAdminId: true, reason: true, createdAt: true },
  });
  return { approval: toApprovalDTO(row), auditTrail };
}

/** Checks the CURRENT database role and status, never just the session token. */
async function assertSuperAdmin(checker: { adminId: string; role: string | undefined }) {
  const admin = await prisma.adminUser.findUnique({ where: { id: checker.adminId }, select: { role: true, status: true } });
  if (checker.role !== "super_admin" || !admin || admin.role !== "super_admin" || admin.status !== "active") {
    throw new ApiHttpError(403, "forbidden", "Only the Super Admin can decide approval requests");
  }
}

/**
 * Atomically moves one pending, unexpired request to `nextStatus`, so two
 * decisions can never both win. Throws 409 when it is no longer pending.
 */
async function claimPending(id: string, checkerAdminId: string, nextStatus: "applying" | "rejected" | "changes_requested", note: string | null) {
  await expireStaleApprovals();
  const existing = await prisma.approvalRequest.findUnique({ where: { id }, select: { makerAdminId: true, status: true } });
  if (!existing) throw new ApiHttpError(404, "not_found", "Approval request not found");
  if (existing.makerAdminId === checkerAdminId) {
    throw new ApiHttpError(403, "cannot_approve_own_request", "Nobody can decide their own change");
  }
  const now = new Date();
  const claimed = await prisma.approvalRequest.updateMany({
    where: { id, status: "pending", expiresAt: { gt: now } },
    data: { status: nextStatus, checkerAdminId, decidedAt: now, decisionNote: note },
  });
  if (claimed.count === 0) {
    const current = await prisma.approvalRequest.findUnique({ where: { id }, select: { status: true } });
    throw new ApiHttpError(409, "not_pending", `This request is already ${current?.status ?? "closed"}`);
  }
}

export async function approve(checker: { adminId: string; role: string | undefined }, id: string, note: string | null) {
  await assertSuperAdmin(checker);
  await claimPending(id, checker.adminId, "applying", note);

  const request = await prisma.approvalRequest.findUniqueOrThrow({ where: { id } });
  const maker = await prisma.adminUser.findUnique({ where: { id: request.makerAdminId } });

  let resultStatus: number;
  let resultBody: unknown;
  if (!maker || maker.status !== "active") {
    resultStatus = 409;
    resultBody = { error: { code: "maker_inactive", message: "The person who asked for this change no longer has an active admin account" } };
  } else {
    try {
      const makerToken = signAdminAccessToken({ sub: maker.id, email: maker.email, role: maker.role });
      const replay = await replayApprovedRequest({
        method: request.method,
        path: request.path,
        body: request.body ?? {},
        makerAccessToken: makerToken.token,
        marker: { approvalRequestId: request.id, checkerAdminId: checker.adminId, reason: request.reason },
      });
      resultStatus = replay.status;
      resultBody = replay.body;
    } catch (err) {
      // Never leave a request stuck in `applying`.
      resultStatus = 500;
      resultBody = { error: { code: "approval_apply_error", message: err instanceof Error ? err.message : "Could not apply the change" } };
    }
  }

  const applied = resultStatus >= 200 && resultStatus < 300;
  await prisma.approvalRequest.update({
    where: { id },
    data: {
      status: applied ? "approved" : "failed",
      appliedAt: applied ? new Date() : null,
      resultStatus,
      // Never store secrets (e.g. a new admin's temporary password).
      resultBody: (redactSecrets(resultBody) ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
  });

  await recordAudit({
    actorAdminId: checker.adminId,
    action: applied ? "approval.approved" : "approval.apply_failed",
    entityType: "ApprovalRequest",
    entityId: id,
    reason: note ?? request.reason,
    checkerAdminId: checker.adminId,
    approvalRequestId: id,
    metadata: { makerAdminId: request.makerAdminId, method: request.method, path: request.path, resultStatus },
  });

  // The un-redacted result goes to the approving Super Admin once (e.g. a
  // new admin's temporary password to hand over); it is never stored.
  return { ...(await getApproval(checker, id)), appliedResult: applied ? resultBody : null };
}

export async function reject(checker: { adminId: string; role: string | undefined }, id: string, note: string | null) {
  await assertSuperAdmin(checker);
  await claimPending(id, checker.adminId, "rejected", note);
  await recordAudit({
    actorAdminId: checker.adminId,
    action: "approval.rejected",
    entityType: "ApprovalRequest",
    entityId: id,
    reason: note,
    checkerAdminId: checker.adminId,
    approvalRequestId: id,
  });
  return getApproval(checker, id);
}

export async function requestChanges(checker: { adminId: string; role: string | undefined }, id: string, note: string) {
  await assertSuperAdmin(checker);
  await claimPending(id, checker.adminId, "changes_requested", note);
  await recordAudit({
    actorAdminId: checker.adminId,
    action: "approval.changes_requested",
    entityType: "ApprovalRequest",
    entityId: id,
    reason: note,
    checkerAdminId: checker.adminId,
    approvalRequestId: id,
  });
  return getApproval(checker, id);
}

/** The maker withdraws their own pending request. */
export async function cancel(maker: { adminId: string; role: string | undefined }, id: string) {
  const cancelled = await prisma.approvalRequest.updateMany({
    where: { id, makerAdminId: maker.adminId, status: "pending" },
    data: { status: "cancelled", decidedAt: new Date() },
  });
  if (cancelled.count === 0) {
    throw new ApiHttpError(409, "not_pending", "Only your own pending requests can be withdrawn");
  }
  await recordAudit({
    actorAdminId: maker.adminId,
    action: "approval.cancelled",
    entityType: "ApprovalRequest",
    entityId: id,
    approvalRequestId: id,
  });
  return getApproval(maker, id);
}
