import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { createActionItem } from "../../lib/adminActionQueue";
import {
  EscalateSupportTicketInput,
  ListEscalationsQuery,
  ListSupportTicketsQuery,
  ResolveEscalationInput,
  SendAdminSupportTicketMessageInput,
  UpdateSupportTicketInput,
} from "./adminSupport.schema";

/**
 * Module 08 — Support & Safety, 08.01 Support Tickets + 08.02 Escalations
 * (docs/admin/03-screen-inventory.md §08), 08.01 added 22 Aug 2026 — the
 * first admin surface over the real `SupportTicket` model (Phase 4's §L
 * "Support", `apps/api/src/modules/support`), which until now was
 * mobile-writable only (create + list-your-own, always starting and
 * staying `open` — see that module's own `createSupportTicketSchema` doc
 * comment: "priority/status/assignee/a message thread are admin-console
 * (Phase 6) concerns"). This is the pass that closes that gap, for
 * priority/status at least — see below for what's still not real.
 *
 * **Picked over Module 07 — Growth this cycle** (docs/platform/roadmap.md
 * sequences Growth, Phase 7, before Support & Safety, Phase 8): both
 * modules are similarly fractional against their own Figma spec — Growth
 * has real backing for only 07.03 Referrals (the `Referral` model), and
 * even that is thin (a bare referrer→referee link, no reward field, no
 * click-tracking, so its spec'd "funnel visualization ... alongside
 * referral economics" would render at most 2 of however many funnel
 * stages and zero economics) and entirely read-only, since there's no
 * user-facing action to take on a referral row. Support & Safety's own
 * real fraction, 08.01 Support Tickets, is a meaningfully richer slice:
 * a genuine 4-field triage surface (category/priority/status, each a
 * real mutable enum) with a real, bounded state-changing action — this
 * build's established precedent (every module ships at least one real
 * action where the domain honestly supports one, e.g. Relationships'
 * End/Reactivate, Module 05's Publish/Unpublish) rather than another
 * read-only view. 07.03 Referrals remains real, unbuilt, and available
 * for a future pass — this is a judgment call about which fractional
 * module is the better use of one build slice, not a claim that Growth
 * is blocked.
 *
 * **What's real vs. honestly not modeled**, against the Figma's fuller
 * 08.01 spec ("split panel — filterable list left, conversation thread
 * right: message bubbles, a system/shield note, a message composer;
 * stats bar with quick actions above"):
 * - The filterable list (Status/Category/Priority filters, a subject/
 *   message/user search) and the stats bar (Open/In Progress/Resolved/
 *   Closed counts, same values `adminDashboard.service.ts` already
 *   computes for the Executive Dashboard's `requiresAttention` card) are
 *   fully real.
 * - The detail panel's "message bubbles ... conversation thread ...
 *   composer" implies a multi-message back-and-forth. `SupportTicket` has
 *   exactly one `message` field — the ticket's original submission, no
 *   `SupportMessage`/reply table exists anywhere. This renders as a
 *   single read-only message from the user, not a thread, and there is
 *   no reply/composer action — building one would either fabricate a
 *   persisted conversation or silently discard whatever an admin typed,
 *   both worse than not offering it. Named in `notAvailable` as
 *   `conversationThread` rather than a working-looking composer that
 *   goes nowhere.
 * - "Assignee" has no backing field on `SupportTicket` at all (no
 *   assignment/ownership concept exists in this schema) — named in
 *   `notAvailable`, not fabricated as "Unassigned" for every row.
 * - **The one real state-changing action**: re-triaging a ticket's
 *   Status/Priority/Category (`updateSupportTicket` below), the mutable
 *   fields the model actually has. This replaces the Figma's "quick
 *   actions" (which read as reply/assign/escalate shortcuts — none of
 *   which have a real backing mechanism) with the one that does. Any
 *   status transition is allowed in either direction (no forward-only
 *   pipeline enforced) — support staff legitimately need to reopen a
 *   ticket closed by mistake, and nothing in the spec or schema implies
 *   a stricter workflow.
 * - Every triage change is audited (`admin.supportTicket.updated`,
 *   metadata capturing exactly which field(s) changed and their old/new
 *   values) and read back out as a "Triage history" panel on the detail
 *   view — same "the table already exists, this is the first screen to
 *   read it for this entity" precedent as Module 04's Relationship
 *   History and 06.02's Transaction audit trail.
 *
 * **25 Aug 2026: 08.02 Escalations shipped too** — the reasoning that used
 * to lump it in with 08.03/08.04 above turned out not to hold up: an
 * escalation is a workflow annotation on a `SupportTicket` an admin is
 * already looking at ("this needs attention beyond first-line support"),
 * not a new business concept needing its own filing flow. `Escalation` is
 * a direct, non-polymorphic FK to `SupportTicket` (there's exactly one
 * thing an escalation is ever about — no `AuditLog`/`ContentReview`-style
 * `entityType`/`entityId` pair needed). The producer and the consumer
 * shipped together: "Escalate" is a new action on this same Support
 * Tickets screen (additive, alongside the existing re-triage action, not
 * a replacement for it), and the Escalations queue (`listEscalations`
 * below) is the first real screen to read the rows it creates. One guard:
 * at most one *open* escalation per ticket (`escalation_already_open`) —
 * re-escalating a ticket whose prior escalation was already resolved is
 * fine and creates a fresh row. **Deliberately no self-resolution guard**
 * — unlike `ContentReview`'s `cannot_approve_own_content_review` (approving
 * your own submission is a real conflict of interest), resolving the
 * escalation you yourself raised isn't self-review, it's just "I flagged
 * this, and now it's handled" — a legitimate single-admin action, so
 * `resolveEscalation` below has no actor-mismatch check. No "reopen"
 * either, unlike `SupportTicket`'s own any-direction status transitions —
 * `open`→`resolved` is the escalation's entire lifecycle; a ticket that
 * flares back up gets a new `Escalation` row, not a resurrected old one,
 * so the queue's history stays an honest record of each time it happened.
 *
 * **3 Sep 2026: the conversation thread shipped too** — closing the one
 * piece of 08.01's own spec this file's original comment above named as
 * genuinely missing (`conversationThread` in `notAvailable`). A new
 * `SupportTicketMessage` table (prisma/schema.prisma's own doc comment
 * has the full design) backs a real, chronological reply thread: the
 * detail panel now shows every message alongside the ticket's original
 * submission, and `addSupportTicketMessage` below is the real composer
 * action — an admin can genuinely reply, not just read. Every reply is
 * audited (`admin.supportTicketMessage.created`) same as every other
 * mutation in this module. Two things deliberately NOT part of this: (1)
 * replying does not auto-transition `SupportTicket.status` — status stays
 * `updateSupportTicket`'s explicit, separate action, not an implicit
 * side effect of talking to a user; (2) `assignee` is still genuinely
 * unmodeled (no ownership concept exists anywhere in this schema) and
 * stays in `notAvailable` on its own.
 *
 * **08.03 Complaints and 08.04 Safety/Abuse Reports remain genuinely NOT
 * built.** Both are a meaningfully different, heavier shape of gap than
 * Escalations turned out to be — not "an annotation on an existing
 * ticket" but a standalone intake with no existing hook to extend:
 * - **`Complaint`** (docs/admin/06-data-model.md §2: "a formal complaint
 *   record with a 'dossier' of facts and a resolution") needs its own
 *   filing flow (who's complaining, against what or whom — a `User`? a
 *   `Professional`? both are plausible and nothing in this build decides
 *   it) that doesn't exist in either mobile app, plus a "resolution"
 *   action whose real effect is undefined — unlike Content Review's
 *   Approve (reuses the existing `publish*` functions) or Escalation's
 *   Resolve (just flips its own status), there's no existing, safe action
 *   a complaint resolution could honestly reuse.
 * - **`SafetyReport`** (severity/category/status) needs its own
 *   abuse-report flow (also absent from both mobile apps) plus real
 *   moderation actions behind it. **26 Aug 2026: `User` did gain a real
 *   `status` field** (Module 02.01 bulk-select/suspend — see
 *   docs/admin/06-data-model.md's `User` bullet), but that's
 *   account-operations (blocks login, no reason code, no appeal), not a
 *   trust-and-safety moderation concept — this still needs its own real
 *   ban/appeal/severity policy decision, not just a schema field to flip.
 *   A safety-report queue with no real moderation action behind
 *   it would misrepresent trust & safety capability this build doesn't
 *   have, a sharper version of the same "don't fabricate a working-looking
 *   control" reasoning that kept 08.01's reply composer and 06.02's
 *   Refund action out.
 *
 * Same "empty by construction, no producer anywhere" reasoning as
 * 04.03/05.04/06.04 originally used for all three of 08.02–08.04 — it
 * just turned out to actually apply to only two of them.
 *
 * Deliberately does NOT import `SupportTicket`/`Escalation` as Prisma
 * model types — same reasoning as every other admin service file this
 * build (the un-generated `@prisma/client` stub has no real model
 * exports).
 */

type SupportTicketRow = {
  id: string;
  userId: string;
  category: string;
  subject: string;
  message: string;
  priority: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; fullName: string; email: string };
};

function toListItem(t: SupportTicketRow) {
  return {
    id: t.id,
    userId: t.user.id,
    userFullName: t.user.fullName,
    userEmail: t.user.email,
    category: t.category,
    subject: t.subject,
    message: t.message,
    priority: t.priority,
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export async function listSupportTickets(query: ListSupportTicketsQuery) {
  const where: Record<string, unknown> = {};
  if (query.search) {
    where.OR = [
      { subject: { contains: query.search, mode: "insensitive" } },
      { message: { contains: query.search, mode: "insensitive" } },
      { user: { fullName: { contains: query.search, mode: "insensitive" } } },
      { user: { email: { contains: query.search, mode: "insensitive" } } },
    ];
  }

  const tickets = await prisma.supportTicket.findMany({
    where,
    include: { user: { select: { id: true, fullName: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  const rows = tickets as SupportTicketRow[];

  // Stats reflect the search-scoped set, computed before the Status/
  // Category/Priority filters below narrow the list further — same
  // "stable superset of the filtered table" convention as every other
  // directory screen's counts (adminAccounts, adminProfessionals,
  // adminPayments).
  const stats = {
    total: rows.length,
    open: rows.filter((r) => r.status === "open").length,
    inProgress: rows.filter((r) => r.status === "in_progress").length,
    resolved: rows.filter((r) => r.status === "resolved").length,
    closed: rows.filter((r) => r.status === "closed").length,
  };

  const filtered = rows.filter(
    (r) =>
      (query.status ? r.status === query.status : true) &&
      (query.category ? r.category === query.category : true) &&
      (query.priority ? r.priority === query.priority : true),
  );

  return {
    tickets: filtered.map(toListItem),
    stats,
    // "assignee" — 08.01's spec'd ownership field, still genuinely
    // unmodeled (see this file's top comment). "conversationThread" is
    // real now (3 Sep 2026) — see getSupportTicketDetail below, where the
    // actual message list lives; this directory-level response only
    // carries what's still missing, for a single shared NotAvailablePanel
    // copy across both list and detail.
    notAvailable: ["assignee"],
  };
}

async function getSupportTicketOrThrow(id: string): Promise<SupportTicketRow> {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: { user: { select: { id: true, fullName: true, email: true } } },
  });
  if (!ticket) {
    throw new ApiHttpError(404, "not_found", "Support ticket not found");
  }
  return ticket as SupportTicketRow;
}

export async function getSupportTicketDetail(id: string) {
  const ticket = await getSupportTicketOrThrow(id);

  const historyRows = await prisma.auditLog.findMany({
    where: { entityType: "SupportTicket", entityId: id },
    orderBy: { createdAt: "desc" },
  });

  // Most recent Escalation for this ticket, if any — lets the detail
  // panel show whether it's currently (or was previously) escalated
  // without a separate round trip, and lets the frontend disable the
  // "Escalate" button instead of surfacing a confusing 409 for a ticket
  // that already has an open one. `null` if this ticket has never been
  // escalated — see this file's top comment for the full 08.02 design.
  const latestEscalation = await prisma.escalation.findFirst({
    where: { supportTicketId: id },
    include: ESCALATION_INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  // Real conversation thread (3 Sep 2026) — see this file's top comment
  // and prisma/schema.prisma's SupportTicketMessage doc comment.
  const messages = await getMessagesForTicket(id);

  return {
    ticket: toListItem(ticket),
    // Real triage history — see this file's top comment.
    history: (
      historyRows as Array<{ id: string; action: string; actorAdminId: string | null; metadata: unknown; createdAt: Date }>
    ).map((h) => ({
      id: h.id,
      action: h.action,
      actorAdminId: h.actorAdminId,
      metadata: (h.metadata as Record<string, unknown> | null) ?? null,
      createdAt: h.createdAt,
    })),
    escalation: latestEscalation ? toEscalationListItem(latestEscalation as EscalationRow) : null,
    messages,
    notAvailable: ["assignee"],
  };
}

export async function updateSupportTicket(adminId: string, id: string, input: UpdateSupportTicketInput) {
  const ticket = await getSupportTicketOrThrow(id);

  const changes: Record<string, { from: string; to: string }> = {};
  const data: Record<string, string> = {};
  for (const field of ["status", "priority", "category"] as const) {
    const next = input[field];
    if (next !== undefined && next !== ticket[field]) {
      changes[field] = { from: ticket[field], to: next };
      data[field] = next;
    }
  }

  if (Object.keys(data).length === 0) {
    // Every requested field already matches its current value — nothing
    // to persist or audit. Not an error (the caller's request was
    // otherwise valid), just a no-op that returns the ticket unchanged.
    return toListItem(ticket);
  }

  const updated = await prisma.supportTicket.update({ where: { id }, data });

  await recordAudit({
    actorAdminId: adminId,
    action: "admin.supportTicket.updated",
    entityType: "SupportTicket",
    entityId: id,
    metadata: { changes },
  });

  return toListItem({ ...updated, user: ticket.user } as SupportTicketRow);
}

// ---- 08.02 Escalations — see this file's top comment for the full
// real-vs-not breakdown against 08.03/08.04. ----------------------------

type EscalationRow = {
  id: string;
  supportTicketId: string;
  reason: string;
  status: string;
  resolutionNotes: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  escalatedByAdminId: string;
  escalatedByAdmin: { fullName: string };
  resolvedByAdminId: string | null;
  resolvedByAdmin: { fullName: string } | null;
  supportTicket: {
    id: string;
    subject: string;
    category: string;
    priority: string;
    status: string;
    user: { fullName: string; email: string };
  };
};

const ESCALATION_INCLUDE = {
  escalatedByAdmin: { select: { fullName: true } },
  resolvedByAdmin: { select: { fullName: true } },
  supportTicket: {
    select: {
      id: true,
      subject: true,
      category: true,
      priority: true,
      status: true,
      user: { select: { fullName: true, email: true } },
    },
  },
} as const;

function toEscalationListItem(e: EscalationRow) {
  return {
    id: e.id,
    supportTicketId: e.supportTicketId,
    ticketSubject: e.supportTicket.subject,
    ticketCategory: e.supportTicket.category,
    ticketPriority: e.supportTicket.priority,
    ticketStatus: e.supportTicket.status,
    ticketUserFullName: e.supportTicket.user.fullName,
    ticketUserEmail: e.supportTicket.user.email,
    reason: e.reason,
    status: e.status,
    escalatedByAdminId: e.escalatedByAdminId,
    escalatedByName: e.escalatedByAdmin.fullName,
    resolvedByAdminId: e.resolvedByAdminId,
    resolvedByName: e.resolvedByAdmin?.fullName ?? null,
    resolutionNotes: e.resolutionNotes,
    createdAt: e.createdAt,
    resolvedAt: e.resolvedAt,
  };
}

export async function listEscalations(query: ListEscalationsQuery) {
  const rows = (await prisma.escalation.findMany({
    include: ESCALATION_INCLUDE,
    orderBy: { createdAt: "desc" },
  })) as EscalationRow[];

  // Counts reflect the full set, computed before the Status filter below
  // narrows it — same "stable superset" convention as listSupportTickets
  // above and every other directory screen in this console.
  const counts = {
    total: rows.length,
    open: rows.filter((r) => r.status === "open").length,
    resolved: rows.filter((r) => r.status === "resolved").length,
  };

  const filtered = query.status ? rows.filter((r) => r.status === query.status) : rows;

  return { escalations: filtered.map(toEscalationListItem), counts };
}

async function getEscalationOrThrow(id: string): Promise<EscalationRow> {
  const escalation = await prisma.escalation.findUnique({ where: { id }, include: ESCALATION_INCLUDE });
  if (!escalation) {
    throw new ApiHttpError(404, "not_found", "Escalation not found");
  }
  return escalation as EscalationRow;
}

export async function escalateSupportTicket(
  actorAdminId: string,
  supportTicketId: string,
  input: EscalateSupportTicketInput,
) {
  await getSupportTicketOrThrow(supportTicketId);

  const existingOpen = await prisma.escalation.findFirst({
    where: { supportTicketId, status: "open" },
  });
  if (existingOpen) {
    throw new ApiHttpError(409, "escalation_already_open", "This ticket already has an open escalation");
  }

  const escalation = await prisma.escalation.create({
    data: { supportTicketId, escalatedByAdminId: actorAdminId, reason: input.reason },
  });

  await recordAudit({
    actorAdminId,
    action: "escalation.create",
    entityType: "Escalation",
    entityId: escalation.id,
    metadata: { supportTicketId, reason: input.reason },
  });

  // Admin Action Required queue (R2 Wave 1, 20 Sep 2026) — an Escalation
  // is by definition "needs attention beyond first-line support," so it's
  // a real, `medium`-severity queue item by default (higher than a plain
  // open ticket, since a human admin has already judged it worth raising).
  await createActionItem({
    type: "support_escalation",
    entityType: "Escalation",
    entityId: escalation.id,
    severity: "medium",
    metadata: { supportTicketId, reason: input.reason },
  });

  return toEscalationListItem(await getEscalationOrThrow(escalation.id));
}

export async function resolveEscalation(actorAdminId: string, id: string, input: ResolveEscalationInput) {
  const escalation = await getEscalationOrThrow(id);
  if (escalation.status !== "open") {
    throw new ApiHttpError(409, "escalation_already_resolved", "This escalation has already been resolved");
  }

  await prisma.escalation.update({
    where: { id },
    data: {
      status: "resolved",
      resolvedByAdminId: actorAdminId,
      resolvedAt: new Date(),
      resolutionNotes: input.resolutionNotes ?? null,
    },
  });

  await recordAudit({
    actorAdminId,
    action: "escalation.resolve",
    entityType: "Escalation",
    entityId: id,
    metadata: { resolutionNotes: input.resolutionNotes ?? null },
  });

  return toEscalationListItem(await getEscalationOrThrow(id));
}

// ---- Support Ticket Messages (added 3 Sep 2026) — see this file's top
// comment's "3 Sep 2026" entry and prisma/schema.prisma's
// SupportTicketMessage doc comment for the full design. ------------------

type SupportTicketMessageRow = {
  id: string;
  sender: string;
  body: string;
  createdAt: Date;
  senderAdmin: { fullName: string } | null;
};

const MESSAGE_INCLUDE = {
  senderAdmin: { select: { fullName: true } },
} as const;

function toMessageItem(m: SupportTicketMessageRow) {
  return {
    id: m.id,
    sender: m.sender,
    // Only meaningful for sender: "admin" — a "user" message is always
    // from the ticket's one owner, whose name the detail response's own
    // `ticket.userFullName` already carries, so it isn't duplicated here.
    senderAdminName: m.senderAdmin?.fullName ?? null,
    body: m.body,
    createdAt: m.createdAt,
  };
}

async function getMessagesForTicket(ticketId: string) {
  const rows = await prisma.supportTicketMessage.findMany({
    where: { ticketId },
    include: MESSAGE_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
  return (rows as SupportTicketMessageRow[]).map(toMessageItem);
}

export async function addSupportTicketMessage(
  actorAdminId: string,
  ticketId: string,
  input: SendAdminSupportTicketMessageInput,
) {
  await getSupportTicketOrThrow(ticketId);

  const message = await prisma.supportTicketMessage.create({
    data: { ticketId, sender: "admin", senderAdminId: actorAdminId, body: input.body },
    include: MESSAGE_INCLUDE,
  });

  await recordAudit({
    actorAdminId,
    action: "admin.supportTicketMessage.created",
    entityType: "SupportTicketMessage",
    entityId: message.id,
    metadata: { ticketId },
  });

  return toMessageItem(message as SupportTicketMessageRow);
}
