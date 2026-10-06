import { createNotification } from "../notifications/notifications.service";
import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { SendCoachMessageInput } from "./coachMessages.schema";

/**
 * Coach ↔ Client Messaging (docs/coach/03-screen-inventory.md), added 31 Aug
 * 2026 — backs the Messages tab in BOTH apps (previously an honest "Coming
 * soon" placeholder in each). See schema.prisma's CoachMessage model doc
 * comment for the shape and the deliberate non-real-time / no-attachment
 * boundaries.
 *
 * One flat thread per (User, Professional) pair. Every read and write is
 * gated on an ACTIVE `Relationship` between the two parties — enforced here
 * in `assertActiveRelationship`, not merely filtered client-side, so neither
 * side can open or post to a thread with someone they aren't actually
 * engaged with. A conversation surfaces in the list as soon as a
 * relationship is active (even before any message is sent), the same way
 * "My Professional Team" / "Clients" already list the pairing.
 *
 * `viewer` distinguishes which side is looking: opening a thread marks the
 * OTHER party's messages read (a user reading marks the professional's
 * messages read, and vice versa), which is what the per-side unread counts
 * are computed from.
 *
 * Deliberately does NOT import Prisma model types — the un-generated
 * `@prisma/client` stub has no real model exports in this sandbox; see
 * apps/api/README.md.
 */

type Viewer = "user" | "professional";

async function assertActiveRelationship(userId: string, professionalId: string) {
  const relationship = await prisma.relationship.findFirst({
    where: { userId, professionalId, status: "active" },
    select: { id: true },
  });
  if (!relationship) {
    throw new ApiHttpError(
      404,
      "conversation_not_found",
      "You can only message someone you have an active coaching relationship with",
    );
  }
}

type MessageRow = {
  id: string;
  sender: string;
  content: string;
  createdAt: Date;
  readAt: Date | null;
};

function toMessageItem(m: MessageRow) {
  return { id: m.id, sender: m.sender, content: m.content, createdAt: m.createdAt, readAt: m.readAt };
}

export async function getThread(userId: string, professionalId: string, viewer: Viewer) {
  await assertActiveRelationship(userId, professionalId);

  // Mark the other party's unread messages as read for this viewer.
  const otherSender = viewer === "user" ? "professional" : "user";
  await prisma.coachMessage.updateMany({
    where: { userId, professionalId, sender: otherSender, readAt: null },
    data: { readAt: new Date() },
  });

  const [messages, partner] = await Promise.all([
    prisma.coachMessage.findMany({
      where: { userId, professionalId },
      orderBy: { createdAt: "asc" },
      select: { id: true, sender: true, content: true, createdAt: true, readAt: true },
    }),
    viewer === "user"
      ? prisma.professional.findUnique({ where: { id: professionalId }, select: { fullName: true } })
      : prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } }),
  ]);

  return {
    partnerId: viewer === "user" ? professionalId : userId,
    partnerName: (partner as { fullName: string } | null)?.fullName ?? "Unknown",
    messages: (messages as MessageRow[]).map(toMessageItem),
  };
}

export async function sendMessage(
  userId: string,
  professionalId: string,
  sender: Viewer,
  input: SendCoachMessageInput,
) {
  await assertActiveRelationship(userId, professionalId);

  const message = await prisma.coachMessage.create({
    data: { userId, professionalId, sender, content: input.content },
  });

  await recordAudit({
    ...(sender === "user" ? { actorId: userId } : { actorProfessionalId: professionalId }),
    action: "coach_message.sent",
    entityType: "CoachMessage",
    entityId: message.id,
    metadata: { userId, professionalId, sender },
  });

  // Inbox entry for the client when their coach writes (best-effort).
  if (sender === "professional") {
    await createNotification(userId, {
      kind: "coach",
      title: "New message from your coach",
      body: input.content.slice(0, 140),
      deepLink: "coach-messages",
    });
  }

  return toMessageItem(message as MessageRow);
}

type RelationshipPartnerRow = {
  userId: string;
  professionalId: string;
  user: { fullName: string };
  professional: { fullName: string };
};

/**
 * Build the conversation list for one side. Partners come from ACTIVE
 * relationships (so a thread exists the moment coaching starts), each
 * enriched with its last message and the viewer's unread count. Distinct by
 * partner — a client with both a fitness and a nutrition relationship is one
 * conversation, not two.
 */
async function listConversations(viewer: Viewer, selfId: string) {
  const relationships = (await prisma.relationship.findMany({
    where: viewer === "user" ? { userId: selfId, status: "active" } : { professionalId: selfId, status: "active" },
    include: {
      user: { select: { fullName: true } },
      professional: { select: { fullName: true } },
    },
    orderBy: { createdAt: "asc" },
  })) as RelationshipPartnerRow[];

  const partners = new Map<string, RelationshipPartnerRow>();
  for (const rel of relationships) {
    const partnerId = viewer === "user" ? rel.professionalId : rel.userId;
    if (!partners.has(partnerId)) partners.set(partnerId, rel);
  }

  const unreadSender = viewer === "user" ? "professional" : "user";

  const conversations = await Promise.all(
    [...partners.entries()].map(async ([partnerId, rel]) => {
      const userId = viewer === "user" ? selfId : partnerId;
      const professionalId = viewer === "user" ? partnerId : selfId;

      const [lastMessage, unreadCount] = await Promise.all([
        prisma.coachMessage.findFirst({
          where: { userId, professionalId },
          orderBy: { createdAt: "desc" },
          select: { content: true, createdAt: true },
        }),
        prisma.coachMessage.count({
          where: { userId, professionalId, sender: unreadSender, readAt: null },
        }),
      ]);

      const last = lastMessage as { content: string; createdAt: Date } | null;
      return {
        partnerId,
        partnerName: viewer === "user" ? rel.professional.fullName : rel.user.fullName,
        lastMessage: last?.content ?? null,
        lastMessageAt: last?.createdAt ?? null,
        unreadCount,
      };
    }),
  );

  // Most-recent activity first; threads with no messages yet sort last.
  conversations.sort((a, b) => {
    const aTime = a.lastMessageAt ? a.lastMessageAt.getTime() : 0;
    const bTime = b.lastMessageAt ? b.lastMessageAt.getTime() : 0;
    return bTime - aTime;
  });

  return { conversations };
}

export function listConversationsForUser(userId: string) {
  return listConversations("user", userId);
}

export function listConversationsForProfessional(professionalId: string) {
  return listConversations("professional", professionalId);
}
