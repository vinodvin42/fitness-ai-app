import { AsyncLocalStorage } from "node:async_hooks";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import type { Express, NextFunction, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import type { AdminAuthedRequest } from "../middleware/adminAuth";
import { ApiHttpError } from "../middleware/errorHandler";
import { MIN_REASON_LENGTH } from "./highImpactAction";

/**
 * Maker-checker (FynroX blueprint section 5, decision D21).
 *
 * - The Super Admin (Lakshman) applies changes directly; the reason he
 *   gives is written to the audit log.
 * - Anyone else's risky write is NOT applied. `captureForApproval` saves
 *   the request (method, path, body, reason) as an ApprovalRequest and
 *   answers 202. Nothing changes until the Super Admin approves it.
 * - On approval, `replayApprovedRequest` runs the very same route again,
 *   in-process, as the maker, with a replay marker so requirePermission
 *   lets it through. All validation and business rules of the original
 *   route run again at that moment, so an approval can never apply
 *   something the route itself would refuse.
 * - Every audit entry written while a change runs carries the reason and,
 *   for an approved request, the checker and the request id (AsyncLocalStorage,
 *   read by recordAudit) — so the audit log shows maker + checker.
 */

export interface ChangeContext {
  reason: string | null;
  checkerAdminId: string | null;
  approvalRequestId: string | null;
}

const changeContext = new AsyncLocalStorage<ChangeContext>();

/** The change context of the admin write currently running, if any. */
export function getChangeContext(): ChangeContext | undefined {
  return changeContext.getStore();
}

const APPROVAL_REPLAY = Symbol("fynrox.approvalReplay");

interface ReplayMarker {
  approvalRequestId: string;
  checkerAdminId: string;
  reason: string;
}

type ReplayableRequest = AdminAuthedRequest & { [APPROVAL_REPLAY]?: ReplayMarker };

/** True only for the internal replay of an approved request (never settable from outside: it is a Symbol property, not a header). */
export function isApprovalReplay(req: AdminAuthedRequest): boolean {
  return !!(req as ReplayableRequest)[APPROVAL_REPLAY];
}

/** The reason for a change: `X-Change-Reason` header, or `reason` / `changeReason` in the JSON body. */
export function readChangeReason(req: AdminAuthedRequest): string | null {
  const header = req.headers["x-change-reason"];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  const body = (req.body ?? {}) as Record<string, unknown>;
  // The header is URL-encoded by admin-web so reasons in Hindi/Telugu or
  // with symbols like ₹ survive HTTP header rules.
  let decodedHeader = fromHeader;
  if (typeof fromHeader === "string") {
    try {
      decodedHeader = decodeURIComponent(fromHeader);
    } catch {
      decodedHeader = fromHeader;
    }
  }
  const candidates = [decodedHeader, body.changeReason, body.reason];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim().slice(0, 2000);
  }
  return null;
}

/** Runs the rest of the request inside a change context (reason + checker for the audit log). */
export function runWithChangeContext(req: AdminAuthedRequest, next: NextFunction): void {
  const replay = (req as ReplayableRequest)[APPROVAL_REPLAY];
  const store: ChangeContext = {
    reason: replay?.reason ?? readChangeReason(req),
    checkerAdminId: replay?.checkerAdminId ?? null,
    approvalRequestId: replay?.approvalRequestId ?? null,
  };
  changeContext.run(store, () => next());
}

export const APPROVAL_EXPIRY_DAYS_DEFAULT = 7;

/** Requests expire after N days if nobody decides (`APPROVAL_EXPIRY_DAYS`, default 7). Read at call time so it can change without a redeploy of code. */
export function approvalExpiryDays(): number {
  const raw = Number(process.env.APPROVAL_EXPIRY_DAYS);
  return Number.isFinite(raw) && raw >= 1 && raw <= 90 ? Math.floor(raw) : APPROVAL_EXPIRY_DAYS_DEFAULT;
}

/** Strips the query string and replaces ids so the summary reads "POST /admin/plans/:id". */
function summarise(method: string, path: string): string {
  const pathOnly = path.split("?")[0];
  const generic = pathOnly
    .split("/")
    .map((part) => (/^[0-9a-f-]{16,}$/i.test(part) || /^\d+$/.test(part) ? ":id" : part))
    .join("/");
  return `${method.toUpperCase()} ${generic}`;
}

/**
 * Saves a non-Super-Admin's risky write as an approval request and answers
 * 202. The maker must give a reason (same 10-character floor as BR-ADM-005).
 */
export async function captureForApproval(
  req: AdminAuthedRequest,
  res: Response,
  target: { module: string; action: string },
): Promise<void> {
  const reason = readChangeReason(req);
  if (!reason || reason.length < MIN_REASON_LENGTH) {
    throw new ApiHttpError(
      422,
      "reason_required",
      `This change needs Lakshman's approval. Add a reason of at least ${MIN_REASON_LENGTH} characters so he can review it.`,
    );
  }

  const expiresAt = new Date(Date.now() + approvalExpiryDays() * 24 * 60 * 60 * 1000);
  const approval = await prisma.approvalRequest.create({
    data: {
      makerAdminId: req.adminUserId as string,
      makerRole: req.adminRole ?? "unknown",
      method: req.method.toUpperCase(),
      path: req.originalUrl,
      body: (req.body ?? {}) as Prisma.InputJsonObject,
      module: target.module,
      action: target.action,
      summary: summarise(req.method, req.originalUrl),
      reason,
      expiresAt,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorAdminId: req.adminUserId as string,
      action: "approval.requested",
      entityType: "ApprovalRequest",
      entityId: approval.id,
      reason,
      approvalRequestId: approval.id,
      metadata: { method: approval.method, path: approval.path, module: target.module, action: target.action },
    },
  });

  res.status(202).json({
    status: "pending_approval",
    message: "Sent to Lakshman for approval. Nothing changes until he approves it.",
    approvalRequest: {
      id: approval.id,
      status: approval.status,
      summary: approval.summary,
      reason: approval.reason,
      expiresAt: approval.expiresAt.toISOString(),
      createdAt: approval.createdAt.toISOString(),
    },
  });
}

let replayApp: Express | null = null;

const REPLAY_TIMEOUT_MS = 30_000;

/** Called once by createApp() so approvals can re-run routes in-process. */
export function setApprovalReplayApp(app: Express): void {
  replayApp = app;
}

export interface ReplayResult {
  status: number;
  body: unknown;
}

/**
 * Re-runs an approved request through the real Express app as the maker.
 * The JSON body is handed over already parsed (`_body` tells express.json
 * to skip parsing), and the response is captured instead of being written
 * to a socket.
 */
export function replayApprovedRequest(params: {
  method: string;
  path: string;
  body: unknown;
  makerAccessToken: string;
  marker: ReplayMarker;
}): Promise<ReplayResult> {
  const app = replayApp;
  if (!app) {
    return Promise.reject(new ApiHttpError(500, "approval_replay_unavailable", "Approvals cannot be applied right now"));
  }

  return new Promise<ReplayResult>((resolve) => {
    const socket = new Socket();
    Object.defineProperty(socket, "remoteAddress", { value: "127.0.0.1" });
    const req = new IncomingMessage(socket) as IncomingMessage & Record<string | symbol, unknown>;
    req.method = params.method;
    req.url = params.path;
    req.headers = {
      host: "internal.approval",
      authorization: `Bearer ${params.makerAccessToken}`,
      "content-type": "application/json",
      "x-forwarded-for": "127.0.0.1",
    };
    req.body = params.body ?? {};
    req._body = true;
    req[APPROVAL_REPLAY] = params.marker;

    const res = new ServerResponse(req);
    const chunks: Buffer[] = [];
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      const text = Buffer.concat(chunks).toString("utf8");
      let body: unknown = null;
      if (text.length > 0) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text.slice(0, 2000);
        }
      }
      resolve({ status: res.statusCode, body });
    };

    const collect = (chunk: unknown, encoding?: unknown) => {
      if (chunk == null || typeof chunk === "function") return;
      if (Buffer.isBuffer(chunk)) chunks.push(chunk);
      else chunks.push(Buffer.from(String(chunk), typeof encoding === "string" ? (encoding as BufferEncoding) : "utf8"));
    };

    (res as unknown as { write: (...args: unknown[]) => boolean }).write = (chunk: unknown, encoding?: unknown) => {
      collect(chunk, encoding);
      return true;
    };
    (res as unknown as { end: (...args: unknown[]) => ServerResponse }).end = (chunk?: unknown, encoding?: unknown) => {
      collect(chunk, encoding);
      finish();
      return res;
    };

    // Never wait forever on a route that does not answer.
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ status: 504, body: { error: { code: "apply_timeout", message: "Applying the approved change took too long" } } });
    }, REPLAY_TIMEOUT_MS);
    timer.unref?.();

    const handle = (app as unknown as { handle: (q: unknown, s: unknown, done: (err?: unknown) => void) => void }).handle;
    handle.call(app, req, res, (err?: unknown) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ status: err ? 500 : 404, body: { error: { code: err ? "internal_error" : "not_found", message: "The approved change could not be applied" } } });
    });
  });
}
