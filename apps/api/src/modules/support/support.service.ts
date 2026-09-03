import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { CreateSupportTicketInput } from "./support.schema";

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

  return ticket;
}
