import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import {
  CreateCampaignInput,
  GetAcquisitionReportQuery,
  ListCampaignsQuery,
  UpdateCampaignInput,
} from "./adminAcquisition.schema";

/**
 * Module 07.04 — Campaigns & Attribution (docs/admin/03-screen-inventory.md
 * §07.04), added 20 Sep 2026 (R2 Wave 4). R2 Wave 1 (20 Sep 2026, same day)
 * shipped the real `AcquisitionSource`/`Campaign`/`Touchpoint` schema and
 * signup-time resolution (`apps/api/src/lib/acquisition.ts`'s
 * `recordAcquisitionTouchpoint`), explicitly scoped as "schema + service
 * layer only... left for later waves: the Founder/Admin analytics dashboard
 * itself". This module is that dashboard's real backend: a Campaign
 * directory/CRUD surface, plus a per-channel/per-campaign registration
 * report.
 *
 * **What §11's Founder Dashboard wishlist ("compare Gym, Creator, Meta,
 * Google, YouTube, Organic, Referral, Offline and Direct by registrations,
 * activated users, first workout, W1/W4 retention, paid conversion") this
 * report actually builds, and why:**
 * - **Registrations** — real, direct: one `Touchpoint` with
 *   `touchpointType: "signup"` is created per real signup (see
 *   `acquisition.ts`), so counting those rows per channel/campaign is
 *   exactly what happened, not an estimate.
 * - **Activated users** — real: joins each channel/campaign's signup
 *   `Touchpoint.userId` set against `OnboardingProfile.completedAt IS NOT
 *   NULL`, the same "activated" signal `adminAnalytics.service.ts`'s
 *   `computeFunnel()` already uses for 09.02 Engagement's funnel. Not a new
 *   definition, reused from the one place this codebase already answers
 *   "did this user activate".
 * - **First workout** — real: joins the same user set against a distinct
 *   `WorkoutSession.userId` existence check, again reusing
 *   `computeFunnel()`'s own `loggedFirstWorkout` signal. Named
 *   `usersWithFirstWorkout` here (an existence count, not a per-user
 *   timestamp) — the report doesn't claim to show *when* each channel's
 *   users first worked out, only whether they ever did.
 * - **Paid conversion** — real: joins the same user set against a distinct
 *   `Payment.userId` existence check where `status: "paid"`.
 * - **W1/W4 retention — deliberately NOT built, named in `notAvailable`.**
 *   `computeFunnel()` does compute a real "retained week 1" figure (workout
 *   within 7 days of the user's own signup), but only as a single
 *   platform-wide number, and nothing in this codebase computes a W4
 *   (28-day) equivalent at all — there is no existing precedent to reuse
 *   for that half, and building genuinely new time-windowed retention math,
 *   sliced by channel, with no prior art to match against, is exactly the
 *   "guessing at a number with no existing precedent" case this wave's own
 *   brief says to name as a gap rather than invent. A future wave should
 *   build a real `computeWeeklyRetention`-style, channel-sliced version
 *   (see `adminAnalytics.service.ts`'s existing weekly-retention cohort
 *   table for the shape a real implementation would take) rather than this
 *   module improvising a second, inconsistent definition.
 *
 * Deliberately does NOT import Prisma model types for row shapes (only the
 * `Prisma` namespace for `WhereInput` typing) — same convention as every
 * other admin service file in this build; the un-generated-until-CI-runs
 * client stub historically made model type imports unreliable (see the
 * project's own "prisma-stub-and-id-conventions" note).
 */

const ALL_CHANNELS = [
  "organic",
  "paid_search",
  "paid_social",
  "referral",
  "influencer",
  "gym_partner",
  "direct",
] as const;

type CampaignRow = {
  id: string;
  name: string;
  linkCode: string;
  status: string;
  createdAt: Date;
  source: { id: string; channel: string; label: string };
  influencer: { id: string; name: string } | null;
  gym: { id: string; name: string } | null;
};

function toCampaignItem(c: CampaignRow) {
  return {
    id: c.id,
    name: c.name,
    linkCode: c.linkCode,
    status: c.status,
    channel: c.source.channel,
    sourceLabel: c.source.label,
    influencer: c.influencer ? { id: c.influencer.id, name: c.influencer.name } : null,
    gym: c.gym ? { id: c.gym.id, name: c.gym.name } : null,
    createdAt: c.createdAt,
  };
}

export async function listAcquisitionSources() {
  const sources = await prisma.acquisitionSource.findMany({ orderBy: { channel: "asc" } });
  return { sources };
}

export async function listCampaigns(query: ListCampaignsQuery) {
  const where: Prisma.CampaignWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.channel ? { source: { channel: query.channel } } : {}),
    ...(query.search
      ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { linkCode: { contains: query.search, mode: "insensitive" } }] }
      : {}),
  };

  const rows = (await prisma.campaign.findMany({
    where,
    include: {
      source: { select: { id: true, channel: true, label: true } },
      influencer: { select: { id: true, name: true } },
      gym: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  })) as CampaignRow[];

  const items = rows.map(toCampaignItem);
  return {
    campaigns: items,
    counts: { total: items.length, active: items.filter((c) => c.status === "active").length },
  };
}

async function assertCounterpartiesExist(input: { influencerId?: string | null; gymId?: string | null }) {
  if (input.influencerId) {
    const inf = await prisma.influencer.findUnique({ where: { id: input.influencerId }, select: { id: true } });
    if (!inf) throw new ApiHttpError(404, "influencer_not_found", "Influencer not found");
  }
  if (input.gymId) {
    const gym = await prisma.gym.findUnique({ where: { id: input.gymId }, select: { id: true } });
    if (!gym) throw new ApiHttpError(404, "gym_not_found", "Gym not found");
  }
}

export async function createCampaign(actorAdminId: string, input: CreateCampaignInput) {
  const source = await prisma.acquisitionSource.findUnique({ where: { id: input.sourceId } });
  if (!source) {
    throw new ApiHttpError(404, "acquisition_source_not_found", "Acquisition source not found");
  }
  await assertCounterpartiesExist(input);

  let campaign;
  try {
    campaign = await prisma.campaign.create({
      data: {
        name: input.name,
        sourceId: input.sourceId,
        linkCode: input.linkCode,
        status: input.status,
        influencerId: input.influencerId ?? null,
        gymId: input.gymId ?? null,
      },
      include: {
        source: { select: { id: true, channel: true, label: true } },
        influencer: { select: { id: true, name: true } },
        gym: { select: { id: true, name: true } },
      },
    });
  } catch (err) {
    // Same unique-constraint-plus-caught-P2002 discipline as
    // gyms.service.ts#createGym — here the code is admin-chosen (not
    // server-generated), so a collision is a real, expected "someone
    // already used this code" case, not an astronomically-unlikely retry.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ApiHttpError(409, "link_code_taken", "That link code is already in use by another campaign");
    }
    throw err;
  }

  await recordAudit({
    actorAdminId,
    action: "campaign.create",
    entityType: "Campaign",
    entityId: campaign.id,
    metadata: { name: input.name, linkCode: input.linkCode, channel: source.channel },
  });

  return toCampaignItem(campaign as CampaignRow);
}

export async function updateCampaign(actorAdminId: string, id: string, input: UpdateCampaignInput) {
  const existing = await prisma.campaign.findUnique({ where: { id } });
  if (!existing) {
    throw new ApiHttpError(404, "campaign_not_found", "Campaign not found");
  }
  await assertCounterpartiesExist(input);

  const campaign = await prisma.campaign.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.influencerId !== undefined ? { influencerId: input.influencerId } : {}),
      ...(input.gymId !== undefined ? { gymId: input.gymId } : {}),
    },
    include: {
      source: { select: { id: true, channel: true, label: true } },
      influencer: { select: { id: true, name: true } },
      gym: { select: { id: true, name: true } },
    },
  });

  await recordAudit({
    actorAdminId,
    action: "campaign.update",
    entityType: "Campaign",
    entityId: id,
    metadata: input,
  });

  return toCampaignItem(campaign as CampaignRow);
}

type SignupTouchpointRow = {
  userId: string | null;
  channel: string;
  campaignId: string | null;
  campaign: { id: string; name: string; linkCode: string; status: string } | null;
};

type ChannelBucket = {
  channel: string;
  sourceLabel: string;
  registrations: number;
  userIds: Set<string>;
};

type CampaignBucket = {
  campaignId: string;
  campaignName: string;
  linkCode: string;
  status: string;
  channel: string;
  registrations: number;
  userIds: Set<string>;
};

/**
 * Real per-channel + per-campaign registration report over `Touchpoint`,
 * with the honestly-joinable activation/first-workout/paid-conversion
 * columns from this file's own top comment. All-time by default — an
 * omitted `startDate`/`endDate` does NOT default to a rolling 30 days the
 * way `adminAnalytics.service.ts`'s KPI row does, because a channel-
 * comparison table's whole point is comparing full campaign lifetimes
 * against each other, and this data is young enough (R2 Wave 1 shipped the
 * same day as this report) that a 30-day default would silently hide most
 * of what exists. Passing both dates scopes it, same as every other
 * admin report in this build.
 */
export async function getAcquisitionReport(query: GetAcquisitionReportQuery) {
  const start = query.startDate ? new Date(query.startDate) : null;
  const end = query.endDate ? new Date(query.endDate) : null;

  const [sources, touchpoints] = await Promise.all([
    prisma.acquisitionSource.findMany({ orderBy: { channel: "asc" } }),
    prisma.touchpoint.findMany({
      where: {
        touchpointType: "signup",
        ...(start && end ? { occurredAt: { gte: start, lte: end } } : {}),
      },
      select: {
        userId: true,
        channel: true,
        campaignId: true,
        campaign: { select: { id: true, name: true, linkCode: true, status: true } },
      },
    }) as unknown as Promise<SignupTouchpointRow[]>,
  ]);

  const userIds = [...new Set(touchpoints.map((t) => t.userId).filter((id): id is string => id != null))];

  const [onboardedRows, workoutRows, paidRows] = await Promise.all([
    userIds.length > 0
      ? prisma.onboardingProfile.findMany({ where: { userId: { in: userIds }, completedAt: { not: null } }, select: { userId: true } })
      : Promise.resolve([]),
    userIds.length > 0
      ? prisma.workoutSession.findMany({ where: { userId: { in: userIds } }, distinct: ["userId"], select: { userId: true } })
      : Promise.resolve([]),
    userIds.length > 0
      ? prisma.payment.findMany({ where: { userId: { in: userIds }, status: "paid" }, distinct: ["userId"], select: { userId: true } })
      : Promise.resolve([]),
  ]);
  const onboardedSet = new Set((onboardedRows as Array<{ userId: string }>).map((r) => r.userId));
  const workoutSet = new Set((workoutRows as Array<{ userId: string }>).map((r) => r.userId));
  const paidSet = new Set((paidRows as Array<{ userId: string }>).map((r) => r.userId));

  // Every real channel appears even at zero registrations — a founder
  // comparing channels needs to see "Direct: 0" as a real data point, not
  // a silently missing row.
  const channelBuckets = new Map<string, ChannelBucket>(
    sources.map((s) => [s.channel, { channel: s.channel, sourceLabel: s.label, registrations: 0, userIds: new Set<string>() }]),
  );
  const campaignBuckets = new Map<string, CampaignBucket>();

  for (const tp of touchpoints) {
    const bucket = channelBuckets.get(tp.channel);
    if (bucket) {
      bucket.registrations += 1;
      if (tp.userId) bucket.userIds.add(tp.userId);
    }

    if (tp.campaign) {
      let cb = campaignBuckets.get(tp.campaign.id);
      if (!cb) {
        cb = {
          campaignId: tp.campaign.id,
          campaignName: tp.campaign.name,
          linkCode: tp.campaign.linkCode,
          status: tp.campaign.status,
          channel: tp.channel,
          registrations: 0,
          userIds: new Set<string>(),
        };
        campaignBuckets.set(tp.campaign.id, cb);
      }
      cb.registrations += 1;
      if (tp.userId) cb.userIds.add(tp.userId);
    }
  }

  function summarize(userIdSet: Set<string>) {
    let activatedUsers = 0;
    let usersWithFirstWorkout = 0;
    let paidConversions = 0;
    for (const id of userIdSet) {
      if (onboardedSet.has(id)) activatedUsers += 1;
      if (workoutSet.has(id)) usersWithFirstWorkout += 1;
      if (paidSet.has(id)) paidConversions += 1;
    }
    return { activatedUsers, usersWithFirstWorkout, paidConversions };
  }

  const byChannel = ALL_CHANNELS.map((channel) => {
    // Defensive fallback, not the expected path — every real environment
    // has all 7 `AcquisitionSource` rows seeded (see seedDatabase.ts), but
    // this keeps the report from throwing rather than degrading honestly
    // if one is somehow missing (e.g. a fixture/test DB that seeded a
    // subset).
    const b = channelBuckets.get(channel) ?? { channel, sourceLabel: channel, registrations: 0, userIds: new Set<string>() };
    return {
      channel: b.channel,
      sourceLabel: b.sourceLabel,
      registrations: b.registrations,
      registeredUsers: b.userIds.size,
      ...summarize(b.userIds),
    };
  });

  const byCampaign = [...campaignBuckets.values()]
    .sort((a, b) => b.registrations - a.registrations)
    .map((b) => ({
      campaignId: b.campaignId,
      campaignName: b.campaignName,
      linkCode: b.linkCode,
      status: b.status,
      channel: b.channel,
      registrations: b.registrations,
      registeredUsers: b.userIds.size,
      ...summarize(b.userIds),
    }));

  return {
    period: start && end ? { start: start.toISOString(), end: end.toISOString() } : null,
    byChannel,
    byCampaign,
    totals: {
      registrations: touchpoints.length,
      registeredUsers: userIds.length,
      ...summarize(new Set(userIds)),
    },
    // See this file's top comment for exactly why these two, and only
    // these two, stay unbuilt this wave.
    notAvailable: ["w1RetentionByChannel", "w4RetentionByChannel"],
  };
}
