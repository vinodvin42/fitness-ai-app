import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { createActionItem } from "../../lib/adminActionQueue";
import { CreateSupportTicketInput, SendSupportTicketMessageInput } from "./support.schema";

/**
 * §L "Support" (docs/mobile/03-screen-inventory.md) — real ticket
 * submission and a real "my tickets" list, both against a genuine
 * `SupportTicket` row (not a mailto-only stopgap). No update/delete from
 * this side: a submitted ticket is meaningful history for the user (like
 * a WorkoutSession or Subscription, not a deletable setting like a
 * Reminder), and only an admin (Phase 6, not built yet) should ever move
 * it out of `open`.
 */
export async function listMyTickets(userId: string) {
  return prisma.supportTicket.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createTicket(userId: string, input: CreateSupportTicketInput) {
  const ticket = await prisma.supportTicket.create({ data: { userId, ...input } });

  await recordAudit({
    actorId: userId,
    action: "support_ticket.created",
    entityType: "SupportTicket",
    entityId: ticket.id,
    metadata: { category: ticket.category },
  });

  // Admin Action Required queue (R2 Wave 1, 20 Sep 2026) — every newly
  // opened ticket is a real item a human admin should see in the unified
  // queue, not just in this module's own siloed list. Severity is a
  // simple, honest default (`low`) — this queue doesn't yet have a real
  // triage signal beyond SupportTicket.priority to derive a richer one
  // from, and inventing a scoring formula here would be exactly the kind
  // of fabricated-certainty this codebase's own conventions warn against
  // elsewhere (see FoodEstimate's/Plan's doc comments). A failure here
  // must never fail ticket creation — see lib/adminActionQueue.ts's top
  // comment.
  await createActionItem({
    type: "support_ticket_open",
    entityType: "SupportTicket",
    entityId: ticket.id,
    severity: "low",
    metadata: { category: ticket.category, priority: ticket.priority },
  });

  return ticket;
}

// ---- Support Ticket Messages (added 3 Sep 2026) ------------------------
// Closes gap §19's remaining "no message thread" note — see
// prisma/schema.prisma's SupportTicketMessage doc comment for the full
// design. Owner-only from this side: a user can only ever see/reply to
// their own ticket's thread.

type SupportTicketMessageRow = {
  id: string;
  sender: string;
  body: string;
  createdAt: Date;
};

function toMessageItem(m: SupportTicketMessageRow) {
  return { id: m.id, sender: m.sender, body: m.body, createdAt: m.createdAt };
}

async function getMyTicketOrThrow(userId: string, ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.userId !== userId) {
    // 404, not 403 — don't reveal that a ticket ID belongs to someone
    // else, same convention as reminders.service.ts / progress.service.ts /
    // workoutSessions.service.ts's own ownership checks.
    throw new ApiHttpError(404, "support_ticket_not_found", "Support ticket not found");
  }
  return ticket;
}

export async function getMyTicketDetail(userId: string, ticketId: string) {
  const ticket = await getMyTicketOrThrow(userId, ticketId);

  const messages = await prisma.supportTicketMessage.findMany({
    where: { ticketId },
    orderBy: { createdAt: "asc" },
  });

  return { ticket, messages: (messages as SupportTicketMessageRow[]).map(toMessageItem) };
}

export async function addMyTicketMessage(userId: string, ticketId: string, input: SendSupportTicketMessageInput) {
  await getMyTicketOrThrow(userId, ticketId);

  const message = await prisma.supportTicketMessage.create({
    data: { ticketId, sender: "user", senderUserId: userId, body: input.body },
  });

  await recordAudit({
    actorId: userId,
    action: "support_ticket_message.created",
    entityType: "SupportTicketMessage",
    entityId: message.id,
    metadata: { ticketId },
  });

  return toMessageItem(message as SupportTicketMessageRow);
}
