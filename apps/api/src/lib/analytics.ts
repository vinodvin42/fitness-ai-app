import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

/**
 * Product-analytics event stream (R1 U7, 15 Sep 2026) — see
 * `AnalyticsEvent`'s own doc comment in schema.prisma for the full
 * "why a new model, not AuditLog" reasoning. This is the one function
 * every call site funnels through, the same "single reusable helper, not
 * a raw `prisma.X.create` scattered at each site" shape as
 * `middleware/auditLog.ts`'s `recordAudit()` — deliberately a sibling to
 * it, not a replacement: `recordAudit()` still owns the admin-visible
 * compliance trail, this owns product-analytics.
 *
 * Write-once, fire-and-forget from the CALLER's point of view — every
 * call site in this codebase does `await trackEvent(...)` (so it's still
 * a real awaited write, not detached from the request lifecycle
 * server-side) but never lets a tracking failure fail the request it's
 * attached to; that discipline lives in each call site (a try/catch
 * around the call, or placement after the real mutation already
 * committed), not here — same "the real action must never depend on the
 * side-channel succeeding" principle `recordAudit()`'s own call sites
 * already follow throughout this codebase.
 *
 * `name` should follow the R1 work package §7 convention verbatim:
 * `domain.object.action` (e.g. "workout.set.logged",
 * "plan.generation_failed") — see §8's minimum event-family list, cited
 * at each call site so a future reader can trace which requirement it
 * satisfies.
 */
export async function trackEvent(
  userId: string,
  name: string,
  entityIds?: Record<string, string | null>,
  opts?: { ruleId?: string; metadata?: Record<string, unknown> },
): Promise<void> {
  await prisma.analyticsEvent.create({
    data: {
      userId,
      name,
      // Cast to Prisma's JSON input type — same reasoning as
      // recordAudit()'s own metadata cast (a plain Record<string, unknown>
      // isn't structurally assignable to InputJsonValue's recursive union).
      ...(entityIds !== undefined ? { entityIds: entityIds as Prisma.InputJsonObject } : {}),
      ...(opts?.ruleId !== undefined ? { ruleId: opts.ruleId } : {}),
      ...(opts?.metadata !== undefined ? { metadata: opts.metadata as Prisma.InputJsonObject } : {}),
    },
  });
}
