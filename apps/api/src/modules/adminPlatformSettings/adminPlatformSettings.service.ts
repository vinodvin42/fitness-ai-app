import { env } from "../../config/env";
import { approvalExpiryDays } from "../../lib/makerChecker";
import { isEmailConfigured } from "../../lib/mailer";
import { isSuperAdminReasonRequired } from "../../middleware/adminPermissions";
import { isAdminMfaRequired } from "../adminAuth/adminAuth.service";
import { getAiCoachSettings } from "../adminAiOps/adminAiOps.service";
import { getGrievanceOfficer } from "../../config/grievanceOfficer";

/**
 * 12.08 Platform Settings (docs/admin/03-screen-inventory.md §12.08), Oct
 * 2026 — what the platform is actually running with, in one place. These
 * values come from the server's configuration (environment), so they are
 * shown read-only: changing one is a deploy, not a click. The only setting
 * stored in the database today, AI Coach on/off, stays editable through
 * its existing audited endpoint (PATCH /admin/ai-ops/ai-coach).
 *
 * Never returns a secret: keys, passwords and connection strings are
 * reported only as configured / not configured.
 *
 * Not available: editing these settings in the console, localization,
 * billing defaults and API key management — none has a stored setting yet.
 */
export async function getPlatformSettings() {
  const aiCoach = await getAiCoachSettings();
  return {
    general: {
      environment: env.NODE_ENV,
      publicApiUrl: env.PUBLIC_API_URL ?? null,
      currency: env.RAZORPAY_CURRENCY,
      apiInstances: env.API_INSTANCE_COUNT,
      sharedRateLimitStore: Boolean(env.REDIS_URL),
    },
    security: {
      adminMfaRequired: isAdminMfaRequired(),
      superAdminReasonRequired: isSuperAdminReasonRequired(),
      approvalExpiryDays: approvalExpiryDays(),
      adminSessionMinutes: env.ADMIN_JWT_ACCESS_TTL_MIN,
      userAccessTokenMinutes: env.JWT_ACCESS_TTL_MIN,
      userRefreshTokenDays: env.JWT_REFRESH_TTL_DAYS,
    },
    integrations: {
      payments: {
        provider: env.PAYMENT_PROVIDER,
        configured: env.PAYMENT_PROVIDER === "mock" || Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
      },
      ai: aiCoach.provider,
      foodData: env.FOOD_DATA_PROVIDER,
      email: { configured: isEmailConfigured() },
      errorTracking: { configured: Boolean(env.SENTRY_DSN) },
    },
    // 08.03 Complaints (Oct 2026): shown in the app's Help screen; set in
    // config/grievanceOfficer.ts.
    grievanceOfficer: getGrievanceOfficer(),
    aiCoach: {
      isEnabled: aiCoach.isEnabled,
      updatedByAdminName: aiCoach.updatedByAdminName,
      updatedAt: aiCoach.updatedAt,
    },
    notAvailable: ["editableSettings", "localization", "billingDefaults", "apiKeys"],
  };
}
