import { AcquisitionChannel } from "@prisma/client";
import { prisma } from "../db/prisma";

/**
 * Acquisition/commercial attribution (R2 Wave 1, 20 Sep 2026) — see the
 * `AcquisitionSource`/`Campaign`/`Touchpoint` models' own doc comments in
 * schema.prisma for the full "Source -> Campaign -> Touchpoint" shape and
 * why `Touchpoint` is a distinct sibling to `AnalyticsEvent`/`AuditLog`,
 * not a repurposing of either.
 *
 * `User.acquisitionContext` (see its own doc comment) is a raw string
 * captured client-side, shape `"<source>:<code>"` — e.g. "gym:ABC123" or
 * "creator:XYZ789" (see apps/user-mobile/src/lib/acquisitionContext.ts's
 * `parseAcquisitionContext`). This is the one place that raw string is
 * ever interpreted server-side, and only best-effort: an unresolved code
 * is honestly recorded as a channel-only touchpoint, never invented or
 * silently dropped.
 *
 * Called from auth.service.ts#signup, same "real awaited write, but never
 * lets a tracking failure fail the request it's attached to" discipline
 * trackEvent()'s own call sites already follow — placed AFTER the real
 * User row already committed, so a Touchpoint failure here never blocks
 * account creation.
 */
export async function recordAcquisitionTouchpoint(
  userId: string,
  rawContext: string | null | undefined,
): Promise<void> {
  if (!rawContext) return;

  const [rawSource, ...rest] = rawContext.split(":");
  const code = rest.join(":").trim();

  // 1) Best case: the code matches a real, active Campaign's linkCode —
  // full commercial + marketing attribution, channel taken from that
  // Campaign's own Source (never re-derived from the raw prefix once a
  // real Campaign is found).
  if (code) {
    const campaign = await prisma.campaign.findUnique({
      where: { linkCode: code },
      include: { source: true },
    });
    if (campaign && campaign.status === "active") {
      await prisma.touchpoint.create({
        data: {
          userId,
          campaignId: campaign.id,
          channel: campaign.source.channel,
          touchpointType: "signup",
        },
      });
      return;
    }
  }

  // 2) Honest fallback: no matching Campaign (unresolved/retired code, or
  // a code-less raw context) — still record a channel-only Touchpoint
  // rather than losing the arrival context entirely. The channel is
  // derived from whatever the raw prefix actually says, not guessed:
  // "gym" maps to gym_partner, "creator" to influencer (the only two
  // prefixes the mobile client currently emits — see
  // parseAcquisitionContext's own allow-list), and anything else
  // (including a totally unrecognized shape) honestly falls back to
  // direct rather than fabricating a more specific channel.
  await prisma.touchpoint.create({
    data: {
      userId,
      channel: mapRawSourceToChannel(rawSource),
      touchpointType: "signup",
    },
  });
}

function mapRawSourceToChannel(rawSource: string): AcquisitionChannel {
  if (rawSource === "gym") return "gym_partner";
  if (rawSource === "creator") return "influencer";
  return "direct";
}
