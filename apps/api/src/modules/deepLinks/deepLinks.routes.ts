import { Router } from "express";
import { z } from "zod";
import { deepLinkProvider } from "../../providers";
import { prisma } from "../../db/prisma";
import { ApiHttpError } from "../../middleware/errorHandler";

export const deepLinksRouter = Router();


/**
 * W-M2 — "'Continue to Fynrox' on invite / referral pages has no defined
 * destination. Installed app -> deep link with attribution; not installed
 * -> store with deferred deep link; pre-launch -> Early Access with
 * source prefilled."
 *
 * This is the resolver the website's invite and referral landings call.
 * It validates the code against real rows first, so an expired or
 * unknown link produces the "unavailable" state those pages already have
 * rather than a link into the app that fails after install — and so
 * acceptance test 3 ("an expired invite or referral link lets the user
 * continue with no attribution applied") has a server-side answer.
 *
 * D6 is still open, so `deferredDeepLinkSupported` is reported honestly
 * rather than assumed. Until a provider is chosen, the website must tell
 * an uninstalled visitor to enter their code in the app (the "Have a
 * code?" field, U-M12) instead of promising an automatic hand-off it
 * cannot deliver.
 */

const gymParams = z.object({ gymCode: z.string().trim().min(1).max(64) });
const creatorParams = z.object({ creatorCode: z.string().trim().min(1).max(64) });

deepLinksRouter.get("/links/gym/:gymCode", async (req, res, next) => {
  try {
    const { gymCode } = gymParams.parse(req.params);
    const gym = await prisma.gym.findUnique({
      where: { inviteCode: gymCode },
      select: { id: true, name: true, status: true },
    });

    // An unknown code and a suspended/ended gym are the same thing to a
    // visitor: the invite does not work. Deliberately not distinguished
    // in the response — a public endpoint that confirms which gym codes
    // exist is an enumeration oracle.
    // `approved` is this schema's live state for a gym — the §10
    // lifecycle's ACTIVE. Every other status (application, more_info,
    // rejected, suspended, ended) means the invite must not work.
    const usable = gym != null && gym.status === "approved";
    if (!usable) {
      return res.status(404).json({
        valid: false,
        reason: "This gym invite link is no longer active.",
        // Acceptance test 3: the visitor continues, with nothing applied.
        continueWithoutAttribution: true,
      });
    }

    const link = deepLinkProvider.build({ kind: "gym_invite", gymCode });
    return res.json({
      valid: true,
      gymName: gym!.name,
      ...link,
      deferredDeepLinkSupported: deepLinkProvider.isConfigured(),
    });
  } catch (err) {
    next(err);
  }
});

deepLinksRouter.get("/links/r/:creatorCode", async (req, res, next) => {
  try {
    const { creatorCode } = creatorParams.parse(req.params);
    const campaign = await prisma.campaign.findUnique({
      where: { linkCode: creatorCode },
      select: { id: true, status: true, influencer: { select: { name: true, status: true } } },
    });

    const usable =
      campaign != null &&
      campaign.status === "active" &&
      campaign.influencer != null &&
      campaign.influencer.status === "active";
    if (!usable) {
      return res.status(404).json({
        valid: false,
        reason: "This referral link is no longer active.",
        continueWithoutAttribution: true,
      });
    }

    const link = deepLinkProvider.build({ kind: "creator_referral", creatorCode });
    return res.json({
      valid: true,
      creatorName: campaign!.influencer!.name,
      ...link,
      deferredDeepLinkSupported: deepLinkProvider.isConfigured(),
    });
  } catch (err) {
    if (err instanceof ApiHttpError) return next(err);
    next(err);
  }
});
