import { z } from "zod";

/**
 * Module 07.04 — Campaigns & Attribution (docs/admin/03-screen-inventory.md
 * §07.04), added 20 Sep 2026 (R2 Wave 4). R2 Wave 1 shipped the real
 * `AcquisitionSource`/`Campaign`/`Touchpoint` schema + signup-time
 * resolution (`apps/api/src/lib/acquisition.ts`) but explicitly left the
 * admin-web UI/reporting for a later wave — this is that wave. See
 * adminAcquisition.service.ts's own doc comment for the full real-vs-not
 * breakdown of what §11's Founder Dashboard wishlist this report actually
 * covers.
 *
 * Ids are plain Strings here, not `.uuid()` — see the project's own
 * "prisma-stub-and-id-conventions" note: every entity id in this codebase
 * is `String @id @default(uuid())` (a generator default, not a DB
 * constraint), and seeded/test fixtures commonly use readable non-uuid
 * ids. `.uuid()` would reject those on every write path that takes one.
 */

export const listCampaignsQuerySchema = z.object({
  status: z.enum(["active", "inactive"]).optional(),
  channel: z
    .enum(["organic", "paid_search", "paid_social", "referral", "influencer", "gym_partner", "direct"])
    .optional(),
  search: z.string().trim().min(1).max(100).optional(),
});
export type ListCampaignsQuery = z.infer<typeof listCampaignsQuerySchema>;

// `linkCode` is admin-chosen (a human-meaningful shareable code, e.g.
// "IG-REELS-SEP"), not server-generated like Gym.inviteCode/User.referralCode
// — those are secrets an invitee redeems; a Campaign linkCode is a public,
// marketing-owned identifier meant to appear in a UTM param/QR code the
// admin themselves is choosing. Same alphanumeric-plus-separators shape a
// URL/deep-link segment can safely carry.
export const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(160),
  sourceId: z.string().trim().min(1).max(191),
  linkCode: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[A-Za-z0-9_-]+$/, "linkCode may only contain letters, numbers, hyphens and underscores"),
  status: z.enum(["active", "inactive"]).default("active"),
  influencerId: z.string().trim().min(1).max(191).optional(),
  gymId: z.string().trim().min(1).max(191).optional(),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    status: z.enum(["active", "inactive"]),
    influencerId: z.string().trim().min(1).max(191).nullable(),
    gymId: z.string().trim().min(1).max(191).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

// Report — optional date range over `Touchpoint.occurredAt`. Unlike
// adminAnalytics.service.ts's `getUserAnalyticsQuerySchema` (which defaults
// to a rolling 30 days server-side), an omitted range here means all-time —
// see adminAcquisition.service.ts's own comment for why that's the more
// honest default for a channel-comparison report on data this young.
export const getAcquisitionReportQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});
export type GetAcquisitionReportQuery = z.infer<typeof getAcquisitionReportQuerySchema>;
