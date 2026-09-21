import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";
import { toPublicInfluencer } from "../influencerAuth/influencerAuth.service";
import { getAcquisitionReport, listCampaignsForInfluencer } from "../adminAcquisition/adminAcquisition.service";
import { GetInfluencerAcquisitionReportQuery } from "./influencerPortal.schema";

/**
 * Creator Portal self-service (R2 Wave 5, 21 Sep 2026) — the real backend
 * for apps/creator-portal's dashboard: an influencer's own profile, own
 * Campaign(s), a per-campaign attribution report scoped to just those
 * campaigns, and their own InfluencerPayout history. Every function here
 * takes `influencerId` from the caller's OWN verified auth token only
 * (`req.influencerId`, set by `requireInfluencerAuth` — see
 * influencerPortal.routes.ts) — never a client-supplied id — so an
 * influencer can never see another influencer's data. This is the
 * "boundary discipline" requirement this wave's brief calls out
 * explicitly.
 *
 * Deliberately does NOT duplicate adminAcquisition.service.ts's report
 * aggregation: `getOwnAcquisitionReport` below calls that module's own
 * exported `getAcquisitionReport`/`listCampaignsForInfluencer` and then
 * filters/re-sums the result down to this influencer's own campaigns,
 * exactly as this wave's brief instructs ("add a thin influencer-authed
 * wrapper route, don't duplicate the aggregation logic").
 */

export async function getOwnProfile(influencerId: string) {
  const influencer = await prisma.influencer.findUnique({ where: { id: influencerId } });
  if (!influencer) {
    // Shouldn't happen for a valid token (the influencer row the token was
    // issued for was deleted after login) — same "404, not 401" precedent
    // getProfessionalById/getInfluencerById use for this edge case.
    throw new ApiHttpError(404, "influencer_not_found", "Influencer not found");
  }
  return toPublicInfluencer(influencer);
}

export async function getOwnCampaigns(influencerId: string) {
  const campaigns = await listCampaignsForInfluencer(influencerId);
  return { campaigns };
}

/**
 * `totals` here is a real sum over ONLY this influencer's own campaign
 * rows from the platform-wide report — not the platform-wide `totals`
 * field getAcquisitionReport returns (that would leak every other
 * influencer/channel's numbers). `registeredUsers` is summed per-campaign
 * rather than re-deduplicated across this influencer's campaigns (the
 * platform-wide report already dedupes per-channel/per-campaign, not
 * across an influencer's multiple campaigns) — an honest approximation
 * for the rare case one user signed up under two of the same influencer's
 * campaigns, flagged here rather than silently presented as exact.
 * `byChannel` is deliberately omitted entirely — channel-wide numbers
 * aren't this influencer's own data.
 */
export async function getOwnAcquisitionReport(
  influencerId: string,
  query: GetInfluencerAcquisitionReportQuery,
) {
  const [report, ownCampaigns] = await Promise.all([
    getAcquisitionReport(query),
    listCampaignsForInfluencer(influencerId),
  ]);

  const ownCampaignIds = new Set(ownCampaigns.map((c) => c.id));
  const byCampaign = report.byCampaign.filter((row) => ownCampaignIds.has(row.campaignId));

  const totals = byCampaign.reduce(
    (acc, row) => ({
      registrations: acc.registrations + row.registrations,
      registeredUsers: acc.registeredUsers + row.registeredUsers,
      activatedUsers: acc.activatedUsers + row.activatedUsers,
      usersWithFirstWorkout: acc.usersWithFirstWorkout + row.usersWithFirstWorkout,
      paidConversions: acc.paidConversions + row.paidConversions,
    }),
    { registrations: 0, registeredUsers: 0, activatedUsers: 0, usersWithFirstWorkout: 0, paidConversions: 0 },
  );

  return {
    period: report.period,
    byCampaign,
    totals,
    notAvailable: [
      ...report.notAvailable,
      "registeredUsersAcrossCampaigns", // see this function's own doc comment
    ],
  };
}

export async function getOwnPayouts(influencerId: string) {
  const payouts = await prisma.influencerPayout.findMany({
    where: { influencerId },
    orderBy: { createdAt: "desc" },
  });

  return {
    payouts: payouts.map((p) => ({
      id: p.id,
      amountCents: p.amountCents,
      periodLabel: p.periodLabel,
      status: p.status,
      paidAt: p.paidAt,
      note: p.note,
      createdAt: p.createdAt,
    })),
    counts: {
      total: payouts.length,
      paidCents: payouts.filter((p) => p.status === "paid").reduce((s, p) => s + p.amountCents, 0),
      pendingCents: payouts.filter((p) => p.status === "pending").reduce((s, p) => s + p.amountCents, 0),
    },
  };
}
