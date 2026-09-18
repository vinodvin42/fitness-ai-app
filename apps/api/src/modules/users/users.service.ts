import type { User } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { trackEvent } from "../../lib/analytics";
import { ApiHttpError } from "../../middleware/errorHandler";
import { hashPassword, verifyPassword } from "../../lib/password";
import {
  buildOtpauthUrl,
  decryptSecret,
  encryptSecret,
  generateQrCodeDataUrl,
  generateRecoveryCodes,
  generateTotpSecret,
  verifyTotpCode,
} from "../../lib/twoFactor";
import {
  ChangePasswordInput,
  consentTypes,
  DeleteAccountInput,
  DisableTwoFactorInput,
  EditOnboardingProfileInput,
  EnableTwoFactorInput,
  OnboardingProfileInput,
  UpdateConsentInput,
  UpdateProfileInput,
} from "./users.schema";

/**
 * Never return passwordHash/twoFactorSecret/twoFactorRecoveryCodes to a
 * client — this is the one place that boundary is enforced. `adminNotes`
 * (added 26 Aug 2026 alongside `status` for Module 02.01 suspend/
 * reactivate) is stripped here too — it's an admin's internal note about
 * why an account was suspended, not something to echo back to the
 * account it's about. The exact same field exists on `Professional` and
 * had the exact same leak in `toPublicProfessional` — fixed there too
 * while building this, see that function's own comment.
 */
export function toPublicUser(user: User) {
  const {
    passwordHash: _passwordHash,
    twoFactorSecret: _twoFactorSecret,
    twoFactorRecoveryCodes: _twoFactorRecoveryCodes,
    adminNotes: _adminNotes,
    ...publicUser
  } = user;
  return publicUser;
}

export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiHttpError(404, "user_not_found", "User not found");
  }
  return user;
}

/**
 * Drives RootNavigator's Auth -> Onboarding -> MainTabs switch on the
 * mobile app: a signed-up-but-not-onboarded user should land in the setup
 * wizard, not the tab shell, on every app open until it's done.
 */
export async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  const profile = await prisma.onboardingProfile.findUnique({
    where: { userId },
    select: { completedAt: true },
  });
  return !!profile?.completedAt;
}

/** View/Edit Profile + Preferences (docs/mobile/03-screen-inventory.md §N). */
export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const user = await prisma.user.update({ where: { id: userId }, data: input });

  await recordAudit({
    actorId: userId,
    action: "user.profile_updated",
    entityType: "User",
    entityId: userId,
    metadata: { fields: Object.keys(input) },
  });

  return user;
}

/**
 * `bodyFatPercent`/`waistCm`/`hipsCm` are the wizard's new baseline-
 * measurements step (broader Baseline/measurements, 18 Sep 2026) but are
 * NOT OnboardingProfile columns — `OnboardingProfile.update()` below would
 * throw on unknown fields if they were passed straight through. They're
 * split off here and, when the user actually gave at least one, written
 * into a real BodyMeasurement row instead: the same model/table Progress's
 * own Log Measurement feature already writes to (see progress.service.ts's
 * logMeasurement), so this is the user's real, honest day-one baseline —
 * not a second, competing measurements table bolted onto OnboardingProfile.
 */
export async function upsertOnboardingProfile(userId: string, input: OnboardingProfileInput) {
  const { bodyFatPercent, waistCm, hipsCm, ...profileFields } = input;

  // BR-SAF-004 (R1 Developer 1, 18 Sep 2026) needs to know, BEFORE the
  // upsert below, whether this call is a genuinely NEW completion or a
  // re-submission of an already-completed assessment — read here, not
  // inferred from the upsert's own create/update branch (Prisma's upsert
  // doesn't expose which branch ran). `completedAt` is the one real
  // "has this user ever finished onboarding before" signal this model has.
  const existing = await prisma.onboardingProfile.findUnique({ where: { userId }, select: { completedAt: true } });
  const isNewCompletion = !existing?.completedAt;

  const profile = await prisma.onboardingProfile.upsert({
    where: { userId },
    create: { userId, ...profileFields, completedAt: new Date() },
    update: { ...profileFields, completedAt: new Date() },
  });

  if (profileFields.weightKg != null || bodyFatPercent != null || waistCm != null || hipsCm != null) {
    const baseline = await prisma.bodyMeasurement.create({
      data: {
        userId,
        weightKg: profileFields.weightKg ?? null,
        waistCm: waistCm ?? null,
        hipsCm: hipsCm ?? null,
        bodyFatPercent: bodyFatPercent ?? null,
      },
    });

    await recordAudit({
      actorId: userId,
      action: "body_measurement.logged",
      entityType: "BodyMeasurement",
      entityId: baseline.id,
      metadata: { source: "onboarding_baseline" },
    });
  }

  await recordAudit({
    actorId: userId,
    action: "user.onboarding_completed",
    entityType: "OnboardingProfile",
    entityId: userId,
  });

  // §8 "assessment.completed" — this PUT is the real, single completion
  // point for the Assessment wizard (see OnboardingWizardContext.tsx's own
  // comment: nothing is sent to the API until here).
  await trackEvent(userId, "assessment.completed", { onboardingProfileId: profile.userId });

  // BR-SAF-004 real safety escalation (R1 Developer 1, 18 Sep 2026) — see
  // SafetyEscalation's own schema.prisma doc comment for the full design.
  // Deliberately gated on `isNewCompletion`: this PUT is an upsert (a
  // resubmission of the wizard would hit it again with the same answers),
  // and `editOnboardingProfile` below — the OTHER real write path onto
  // this same model — never touches medicalConditions/injuries at all (see
  // editOnboardingProfileSchema's own comment), so it's structurally
  // incapable of reaching this branch. A real escalation only fires once,
  // at the one real moment this data is first reported.
  if (isNewCompletion && (input.medicalConditions.length > 0 || input.injuries.length > 0)) {
    const escalation = await prisma.safetyEscalation.create({
      data: { userId, medicalConditions: input.medicalConditions, injuries: input.injuries },
    });

    await trackEvent(
      userId,
      "safety.escalated",
      { safetyEscalationId: escalation.id, onboardingProfileId: profile.userId },
      {
        ruleId: "BR-SAF-004",
        metadata: {
          medicalConditionsCount: input.medicalConditions.length,
          injuriesCount: input.injuries.length,
        },
      },
    );
  }

  return profile;
}

/**
 * §N "View/Edit Profile" — gender/age/height/weight, added 19 Aug 2026 to
 * close the gap flagged in docs/platform/roadmap.md ("those live on
 * OnboardingProfile, which has no GET endpoint yet"). 404s if the user
 * hasn't completed onboarding — shouldn't be reachable from the client,
 * since RootNavigator gates MainTabs behind onboarding, but this is the
 * real server-side guarantee, same "404 not 403 doesn't apply here, this
 * really doesn't exist yet" reasoning as getOwnedSession elsewhere.
 */
export async function getOnboardingProfile(userId: string) {
  const profile = await prisma.onboardingProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new ApiHttpError(404, "onboarding_profile_not_found", "Onboarding profile not found");
  }
  return profile;
}

/**
 * Distinct from upsertOnboardingProfile above (which drives the onboarding
 * wizard and always stamps `completedAt`, since finishing the wizard IS
 * what that timestamp means) — this is a genuine partial edit of an
 * already-completed profile from Edit Profile, and deliberately leaves
 * `completedAt` untouched.
 */
export async function editOnboardingProfile(userId: string, input: EditOnboardingProfileInput) {
  await getOnboardingProfile(userId); // 404s if the profile doesn't exist yet

  const profile = await prisma.onboardingProfile.update({
    where: { userId },
    data: input,
  });

  await recordAudit({
    actorId: userId,
    action: "user.onboarding_profile_edited",
    entityType: "OnboardingProfile",
    entityId: userId,
    metadata: { fields: Object.keys(input) },
  });

  return profile;
}

/**
 * §L "Security" (docs/mobile/03-screen-inventory.md) — real password
 * change against the same bcrypt hash used at signup/login. Revokes every
 * active RefreshToken for this user afterward (all devices, including
 * this one) — a deliberate security behavior: the mobile client logs the
 * user out locally right after a successful call here and makes them log
 * back in with the new password, same pattern most banking/finance apps
 * use. Access tokens already issued stay valid until their own (short)
 * expiry — this API has no access-token revocation list, only refresh
 * tokens are tracked server-side (see lib/jwt.ts).
 */
export async function changePassword(userId: string, input: ChangePasswordInput) {
  const user = await getUserById(userId);

  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) {
    throw new ApiHttpError(401, "incorrect_password", "Current password is incorrect");
  }

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await recordAudit({ actorId: userId, action: "user.password_changed", entityType: "User", entityId: userId });
}

/**
 * §L "Security" — active sessions list. RefreshToken has no device
 * metadata (no user-agent/device-name captured at login), so this is a
 * plain list of session issuances, not the phone/laptop/tablet icons the
 * design shows — see docs/mobile/07-open-questions-gaps.md. Never expose
 * `tokenHash`.
 */
export async function listSessions(userId: string) {
  return prisma.refreshToken.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: "desc" },
  });
}

async function getOwnedSession(sessionId: string, userId: string) {
  const session = await prisma.refreshToken.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== userId) {
    // 404, not 403 — don't reveal that a session ID belongs to someone else.
    throw new ApiHttpError(404, "session_not_found", "Session not found");
  }
  return session;
}

export async function revokeSession(userId: string, sessionId: string) {
  const session = await getOwnedSession(sessionId, userId);
  if (!session.revokedAt) {
    await prisma.refreshToken.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  }

  await recordAudit({
    actorId: userId,
    action: "user.session_revoked",
    entityType: "RefreshToken",
    entityId: sessionId,
  });
}

/**
 * §L "Security" / "Data & Privacy" (folded into one screen, see
 * SecurityScreen.tsx) — a real GDPR-style "download my data" export:
 * every row this user owns, gathered live (not a stored export file/job
 * queue — small enough at this app's scale to build synchronously).
 * Excludes `passwordHash` and `AuditLog` entries (the audit trail isn't
 * "your data" in the export sense — it's the platform's own record).
 */
export async function exportUserData(userId: string) {
  const user = await getUserById(userId);

  const [
    onboardingProfile,
    workoutSessions,
    mealLogs,
    bodyMeasurements,
    programPurchases,
    subscriptions,
    reminders,
  ] = await Promise.all([
    prisma.onboardingProfile.findUnique({ where: { userId } }),
    prisma.workoutSession.findMany({ where: { userId }, include: { setLogs: true } }),
    prisma.mealLog.findMany({ where: { userId } }),
    prisma.bodyMeasurement.findMany({ where: { userId } }),
    prisma.programPurchase.findMany({ where: { userId } }),
    prisma.subscription.findMany({ where: { userId } }),
    prisma.reminder.findMany({ where: { userId } }),
  ]);

  await recordAudit({ actorId: userId, action: "user.data_exported", entityType: "User", entityId: userId });

  return {
    exportedAt: new Date().toISOString(),
    profile: toPublicUser(user),
    onboardingProfile,
    workoutSessions,
    mealLogs,
    bodyMeasurements,
    programPurchases,
    subscriptions,
    reminders,
  };
}

/**
 * §L "Security" / "Data & Privacy" — a real hard delete, requiring the
 * current password as confirmation. Cascades via Prisma's onDelete:
 * Cascade on every user-owned model (OnboardingProfile, RefreshToken,
 * WorkoutSession/ExerciseSetLog, MealLog, BodyMeasurement,
 * ProgramPurchase, Subscription, Reminder) except AuditLog, which uses
 * onDelete: SetNull so the write-once audit trail survives with an
 * anonymized actor rather than being destroyed by the account it logged.
 */
export async function deleteAccount(userId: string, input: DeleteAccountInput) {
  const user = await getUserById(userId);

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new ApiHttpError(401, "incorrect_password", "Password is incorrect");
  }

  await recordAudit({ actorId: userId, action: "user.account_deleted", entityType: "User", entityId: userId });

  await prisma.user.delete({ where: { id: userId } });
}

/**
 * §L "Security" — Two-Factor Authentication, step 1 of 2 (25 Aug 2026,
 * gap §17). Generates a fresh TOTP secret and stores it ENCRYPTED
 * immediately, but `twoFactorEnabled` stays false until enableTwoFactor
 * below verifies a real code from it — calling this again (the user backs
 * out and retries, or the QR didn't scan) just overwrites the pending
 * secret with a new one; nothing is half-protected by an unverified
 * secret sitting on the row in the meantime. Returns the plaintext secret
 * (for manual entry if scanning fails) alongside a QR code rendered
 * server-side, so no QR-rendering library is needed on the mobile client.
 */
export async function setupTwoFactor(userId: string) {
  const user = await getUserById(userId);
  const secret = generateTotpSecret();

  await prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: encryptSecret(secret) } });

  const otpauthUrl = buildOtpauthUrl(user.email, secret);
  const qrCodeDataUrl = await generateQrCodeDataUrl(otpauthUrl);

  await recordAudit({
    actorId: userId,
    action: "user.two_factor_setup_started",
    entityType: "User",
    entityId: userId,
  });

  return { secret, otpauthUrl, qrCodeDataUrl };
}

/**
 * Step 2 of 2 — proves the user actually finished scanning the QR (or
 * entered the secret manually) and their authenticator app is producing
 * real, current codes, before 2FA actually starts protecting the
 * account. Generates ten recovery codes at the same time, returned in
 * PLAINTEXT exactly once in this response — losing them means losing the
 * recovery path, the same tradeoff every TOTP-based 2FA implementation
 * makes (GitHub, Google, etc.).
 */
export async function enableTwoFactor(userId: string, input: EnableTwoFactorInput) {
  const user = await getUserById(userId);
  if (!user.twoFactorSecret) {
    throw new ApiHttpError(400, "two_factor_not_started", "Start two-factor setup before enabling it");
  }

  const secret = decryptSecret(user.twoFactorSecret);
  if (!(await verifyTotpCode(secret, input.code))) {
    throw new ApiHttpError(401, "invalid_code", "Incorrect code — check your authenticator app and try again");
  }

  const recoveryCodes = generateRecoveryCodes();
  const hashedRecoveryCodes = await Promise.all(recoveryCodes.map((code) => hashPassword(code)));

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true, twoFactorRecoveryCodes: hashedRecoveryCodes },
  });

  await recordAudit({ actorId: userId, action: "user.two_factor_enabled", entityType: "User", entityId: userId });

  return { recoveryCodes };
}

/**
 * Same "re-enter your password to confirm a security-sensitive change"
 * pattern as deleteAccount above. Clears the secret and every recovery
 * code entirely, not just the enabled flag — re-enabling later always
 * starts from a brand-new secret and a brand-new recovery-code set, never
 * a reused one.
 */
export async function disableTwoFactor(userId: string, input: DisableTwoFactorInput) {
  const user = await getUserById(userId);

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new ApiHttpError(401, "incorrect_password", "Password is incorrect");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorRecoveryCodes: [] },
  });

  await recordAudit({ actorId: userId, action: "user.two_factor_disabled", entityType: "User", entityId: userId });
}

/**
 * Used by auth.service.ts's login flow — NOT by setupTwoFactor/
 * enableTwoFactor/disableTwoFactor above, which all verify inline against
 * a fresh `code` for their own specific purpose. This is the "prove you
 * still have the second factor" check at login time: tries a live TOTP
 * code first, then falls back to matching `code` against each stored
 * recovery-code hash. A matched recovery code is consumed (removed from
 * the array) immediately, since each is single-use — same non-replayable
 * property a TOTP code already has by expiring every 30 seconds. Assumes
 * the caller has already confirmed `user.twoFactorEnabled` is true.
 */
export async function verifyTwoFactorLoginCode(user: User, code: string): Promise<boolean> {
  if (user.twoFactorSecret && /^\d{6}$/.test(code)) {
    const secret = decryptSecret(user.twoFactorSecret);
    if (await verifyTotpCode(secret, code)) {
      return true;
    }
  }

  for (const hashedCode of user.twoFactorRecoveryCodes) {
    if (await verifyPassword(code, hashedCode)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorRecoveryCodes: user.twoFactorRecoveryCodes.filter((c: string) => c !== hashedCode) },
      });
      await recordAudit({
        actorId: user.id,
        action: "user.two_factor_recovery_code_used",
        entityType: "User",
        entityId: user.id,
      });
      return true;
    }
  }

  return false;
}

/**
 * §4 Privacy/Consent settings (R1 Developer 1, 18 Sep 2026) — see
 * prisma/schema.prisma's `Consent` model doc comment for the full design.
 *
 * Returns exactly one entry per `ConsentType`, always — a type with no row
 * yet in the database reads as `granted: false, updatedAt: null` rather
 * than being omitted. This is a deliberate, honest default: `granted:
 * false` is never inferred as "the user declined it," only "no decision
 * has been recorded yet" (the same reasoning docs/mobile calls out for
 * every other "don't fabricate a default" case in this codebase) — the
 * mobile screen renders `updatedAt === null` distinctly (see
 * PrivacySettingsScreen.tsx) so a real "not yet toggled" state isn't
 * confused with a real "explicitly turned off" one. Returning all three
 * types unconditionally (rather than only the rows that exist) is what
 * lets the client render a real, complete toggle list on first load
 * without a separate "which types exist" lookup.
 */
export async function listConsents(userId: string) {
  const rows = await prisma.consent.findMany({ where: { userId } });
  const byType = new Map(rows.map((r) => [r.type, r]));

  return consentTypes.map((type) => {
    const row = byType.get(type);
    return {
      type,
      granted: row?.granted ?? false,
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

/**
 * The one real state-changing action behind §4's Privacy/Consent screen —
 * an upsert keyed on the real `@@unique([userId, type])` constraint, so a
 * toggle is always an update to the SAME row for that (user, type) pair,
 * never a growing history. Fires the real `consent.changed` event (§8),
 * closing the exact gap §50's own "Left genuinely unbuilt" section
 * named: no honest home existed for this event until this Consent model
 * did.
 */
export async function updateConsent(userId: string, input: UpdateConsentInput) {
  const consent = await prisma.consent.upsert({
    where: { userId_type: { userId, type: input.type } },
    create: { userId, type: input.type, granted: input.granted },
    update: { granted: input.granted },
  });

  await recordAudit({
    actorId: userId,
    action: "user.consent_changed",
    entityType: "Consent",
    entityId: consent.id,
    metadata: { type: input.type, granted: input.granted },
  });

  await trackEvent(userId, "consent.changed", { consentId: consent.id }, { metadata: { consentType: input.type, granted: input.granted } });

  return { type: consent.type, granted: consent.granted, updatedAt: consent.updatedAt };
}
