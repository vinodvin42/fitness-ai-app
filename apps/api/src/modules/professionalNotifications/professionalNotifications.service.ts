import type { ProfessionalNotificationKind } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { env } from "../../config/env";
import { ApiHttpError } from "../../middleware/errorHandler";
import { isEmailConfigured, sendEmail } from "../../lib/mailer";

/**
 * The coach inbox (26 Oct 2026). Members already had `Notification`; coaches
 * only had polled counts (professionalAlerts), so a verification decision, a
 * payout or a member ending coaching reached them nowhere. Rows are written by
 * professionalNotices.ts at the moment each event happens.
 *
 * Writing a notice is best-effort, like `createNotification` on the member
 * side: a failure is logged and swallowed, so it never fails the action that
 * caused it. `email: true` also emails the coach when SMTP is configured.
 */
export type ProfessionalNoticeInput = {
  kind: ProfessionalNotificationKind;
  title: string;
  body: string;
  /** A coach-web path, e.g. "/clients/requests". */
  link?: string | null;
  email?: boolean;
};


export async function notifyProfessional(professionalId: string, input: ProfessionalNoticeInput): Promise<void> {
  try {
    const row = await prisma.professionalNotification.create({
      data: { professionalId, kind: input.kind, title: input.title.slice(0, 200), body: input.body.slice(0, 1000), link: input.link ?? null },
    });
    if (input.email && isEmailConfigured()) {
      const pro = await prisma.professional.findUnique({ where: { id: professionalId }, select: { email: true, fullName: true } });
      if (pro) {
        const first = pro.fullName.split(" ")[0] || "there";
        const base = env.COACH_WEB_URL?.replace(/\/+$/, "");
        const open = base && input.link ? `\n\nOpen Fynrox Coach: ${base}${input.link}` : "";
        await sendEmail({
          to: pro.email,
          subject: input.title,
          text: `Hi ${first},\n\n${input.body}${open}\n\nFynrox Coach`,
        });
        await prisma.professionalNotification.update({ where: { id: row.id }, data: { emailedAt: new Date() } });
      }
    }
  } catch (err) {
    console.error("notifyProfessional failed:", err);
  }
}

const PAGE_SIZE = 30;

export async function listNotifications(professionalId: string, query: { before?: string; limit?: number }) {
  const take = Math.min(query.limit ?? PAGE_SIZE, 100);
  const [rows, unreadCount] = await Promise.all([
    prisma.professionalNotification.findMany({
      where: { professionalId, ...(query.before ? { createdAt: { lt: new Date(query.before) } } : {}) },
      orderBy: { createdAt: "desc" },
      take: take + 1,
    }),
    prisma.professionalNotification.count({ where: { professionalId, readAt: null } }),
  ]);
  const items = rows.slice(0, take).map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    link: r.link,
    readAt: r.readAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
  return { items, unreadCount, nextBefore: rows.length > take ? items[items.length - 1].createdAt : null };
}

export async function markRead(professionalId: string, id: string) {
  const row = await prisma.professionalNotification.findUnique({ where: { id } });
  if (!row || row.professionalId !== professionalId) {
    throw new ApiHttpError(404, "notification_not_found", "Notification not found");
  }
  if (!row.readAt) await prisma.professionalNotification.update({ where: { id }, data: { readAt: new Date() } });
  return { ok: true };
}

export async function markAllRead(professionalId: string) {
  const { count } = await prisma.professionalNotification.updateMany({
    where: { professionalId, readAt: null },
    data: { readAt: new Date() },
  });
  return { marked: count };
}
