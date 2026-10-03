import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, Image, Share, Switch, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import {
  changePassword,
  disableTwoFactor,
  enableTwoFactor,
  fetchDataExport,
  fetchSessions,
  revokeSession,
  setupTwoFactor,
} from "../../api/users";
import { useAuth } from "../../context/AuthContext";
import { BIOMETRIC_LOCK_IDLE_TIMEOUT_OPTIONS, type BiometricLockIdleTimeoutMinutes } from "../../lib/biometricAuth";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import type { SetupTwoFactorResponse } from "@fitness-ai-app/types";

// Returns a KEY plus its interpolation, because this is module-level and
// cannot reach the `t` hook. "min" is also a unit that pluralises
// differently across the ten languages offered, so it goes through
// i18next's count rather than string concatenation.
function idleTimeoutKey(minutes: BiometricLockIdleTimeoutMinutes): {
  key: string;
  options?: { count: number };
} {
  return minutes === 0
    ? { key: "security.biometric.immediately" }
    : { key: "security.biometric.minutes", options: { count: minutes } };
}

type Props = NativeStackScreenProps<MoreStackParamList, "Security">;

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

/**
 * Security (docs/mobile/03-screen-inventory.md §L) — folds in "Data &
 * Privacy"'s overlapping GDPR actions (download my data, delete account)
 * rather than building a near-duplicate second screen for them, same
 * "combine overlapping design screens into one real one" precedent as
 * Subscription Plans + Subscription Management. Also includes a real
 * **Biometric Unlock** toggle (Face ID/Touch ID app-lock via
 * expo-local-authentication, `src/lib/biometricAuth.ts` +
 * AuthContext + LockScreen) — a per-device setting, not synced to the
 * server, since hardware/enrollment is a property of the device, not the
 * account. 20 Aug 2026: Biometric Unlock also gained a real, configurable
 * **idle timeout** (a Chip row, shown only while the toggle is on) —
 * closes gap §22's "re-locks only on backgrounding, not on an idle timer"
 * note. "Immediately" (0 min) is the default and reproduces the exact
 * pre-20-Aug-2026 always-lock-on-background behavior for anyone who
 * doesn't touch it.
 *
 * **25 Aug 2026: real Two-Factor Authentication** (gap §17) — TOTP
 * (authenticator-app codes), not SMS: unlike gap §9's phone+OTP, this
 * needed no third-party provider account, only a server-side encryption
 * key (see apps/api's lib/twoFactor.ts). Genuinely different from
 * Biometric Unlock above: 2FA gates login itself against a second
 * real-world factor (something the user's phone's authenticator app
 * knows, not this device specifically), where Biometric Unlock just
 * re-locks an already signed-in session locally. Setup is three steps —
 * scan a QR (or enter the secret manually) → enter a live code to prove
 * it worked → save the one-time recovery codes shown exactly once — then
 * every future login needs that code too (see
 * screens/auth/TwoFactorChallengeScreen.tsx). Disable is confirmed via
 * Alert.alert, same as Revoke Session and Delete Account above — a
 * pre-existing, cross-cutting characteristic of this app's web-preview
 * dev build worth knowing when testing any of the three there:
 * react-native-web's Alert.alert is a no-op stub, so the confirm dialog
 * itself never renders in a browser (it does on a real device/simulator);
 * verifying this screen's disable flow against the web build required
 * scripting a real browser confirm() dialog around the click, not just
 * trusting that the tap alone did anything.
 *
 * **18 Sep 2026:** the data-sharing/consent toggles this comment used to
 * say weren't built now are — see the separate "Privacy & Consent" row on
 * SettingsHubScreen.tsx (PrivacySettingsScreen.tsx), backed by a real
 * `Consent` model. Kept as its own screen rather than folded in here: this
 * screen is account-security (password/2FA/sessions/data export/delete),
 * Privacy & Consent is data-processing opt-ins — a different concept, the
 * same split `adminPrivacy.service.ts`'s own DSAR-vs-consent distinction
 * draws on the admin side.
 *
 * Active Sessions has no device metadata to show (RefreshToken doesn't
 * capture a user-agent/device name at login), so sessions are listed
 * plainly by issue/expiry date rather than the phone/laptop/tablet icons
 * the design shows. Download My Data shares the export as JSON text via
 * the native share sheet rather than saving a file — no file-export
 * library is wired up this pass.
 */
export function SecurityScreen({ navigation: _navigation }: Props) {
  const { t } = useTranslation();
  const {
    user,
    refreshUser,
    signOutLocally,
    deleteAccount,
    isBiometricHardwareChecked,
    isBiometricHardwareReady,
    isBiometricLockEnabled,
    enableBiometricLock,
    disableBiometricLock,
    biometricLockIdleTimeoutMinutes,
    setBiometricLockIdleTimeout,
  } = useAuth();
  const queryClient = useQueryClient();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [isExporting, setIsExporting] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const [isTogglingBiometric, setIsTogglingBiometric] = useState(false);
  const [biometricError, setBiometricError] = useState<string | null>(null);

  // §L "Security" — Two-Factor Authentication (25 Aug 2026, gap §17).
  // `twoFactorStep` walks setup forward: 'idle' (nothing in progress) ->
  // 'setup' (QR shown, waiting on a code to confirm) -> 'recoveryCodes'
  // (just enabled, showing the one-time backup codes) -> back to 'idle'.
  // Whether the account already has 2FA on comes from `user.twoFactorEnabled`
  // itself, not local state — refreshUser() re-syncs it after enable/disable.
  const [twoFactorStep, setTwoFactorStep] = useState<"idle" | "setup" | "recoveryCodes">("idle");
  const [twoFactorSetupData, setTwoFactorSetupData] = useState<SetupTwoFactorResponse | null>(null);
  const [twoFactorRecoveryCodes, setTwoFactorRecoveryCodes] = useState<string[]>([]);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [isStartingTwoFactorSetup, setIsStartingTwoFactorSetup] = useState(false);
  const [isEnablingTwoFactor, setIsEnablingTwoFactor] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [disableTwoFactorPassword, setDisableTwoFactorPassword] = useState("");
  const [isDisablingTwoFactor, setIsDisablingTwoFactor] = useState(false);

  const {
    data: sessions,
    isLoading: sessionsLoading,
    isError: sessionsError,
    refetch: refetchSessions,
  } = useQuery({
    queryKey: ["users", "sessions"],
    queryFn: fetchSessions,
  });

  const canChangePassword =
    currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword;

  const onChangePassword = async () => {
    if (!canChangePassword) return;
    setPasswordError(null);
    setIsChangingPassword(true);
    try {
      await changePassword({ currentPassword, newPassword });
      Alert.alert("Password changed", "For your security, you've been signed out of every session. Log in again with your new password.");
      await signOutLocally();
    } catch (err) {
      setPasswordError(extractErrorMessage(err, "Could not change password. Check your current password and try again."));
    } finally {
      setIsChangingPassword(false);
    }
  };

  const onRevokeSession = (id: string) => {
    Alert.alert("Sign out this session?", "That device will need to log in again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          try {
            await revokeSession(id);
            await queryClient.invalidateQueries({ queryKey: ["users", "sessions"] });
          } catch (err) {
            Alert.alert("Couldn't sign out that session", extractErrorMessage(err, "Try again."));
          }
        },
      },
    ]);
  };

  const onToggleBiometric = async (value: boolean) => {
    setBiometricError(null);
    setIsTogglingBiometric(true);
    try {
      if (value) {
        const success = await enableBiometricLock();
        if (!success) setBiometricError("Couldn't verify Face ID / Touch ID. Try again.");
      } else {
        await disableBiometricLock();
      }
    } finally {
      setIsTogglingBiometric(false);
    }
  };

  const onStartTwoFactorSetup = async () => {
    setTwoFactorError(null);
    setIsStartingTwoFactorSetup(true);
    try {
      const data = await setupTwoFactor();
      setTwoFactorSetupData(data);
      setTwoFactorCode("");
      setTwoFactorStep("setup");
    } catch (err) {
      Alert.alert("Couldn't start setup", extractErrorMessage(err, "Try again."));
    } finally {
      setIsStartingTwoFactorSetup(false);
    }
  };

  const onCancelTwoFactorSetup = () => {
    setTwoFactorStep("idle");
    setTwoFactorSetupData(null);
    setTwoFactorCode("");
    setTwoFactorError(null);
  };

  const onCopyTwoFactorSecret = async () => {
    if (twoFactorSetupData) {
      await Clipboard.setStringAsync(twoFactorSetupData.secret);
    }
  };

  const onConfirmEnableTwoFactor = async () => {
    if (twoFactorCode.trim().length !== 6) return;
    setTwoFactorError(null);
    setIsEnablingTwoFactor(true);
    try {
      const { recoveryCodes } = await enableTwoFactor({ code: twoFactorCode.trim() });
      setTwoFactorRecoveryCodes(recoveryCodes);
      setTwoFactorStep("recoveryCodes");
      setTwoFactorSetupData(null);
      setTwoFactorCode("");
      await refreshUser();
    } catch (err) {
      setTwoFactorError(extractErrorMessage(err, "Incorrect code. Check your authenticator app and try again."));
    } finally {
      setIsEnablingTwoFactor(false);
    }
  };

  const onCopyRecoveryCodes = async () => {
    await Clipboard.setStringAsync(twoFactorRecoveryCodes.join("\n"));
  };

  const onFinishTwoFactorSetup = () => {
    setTwoFactorStep("idle");
    setTwoFactorRecoveryCodes([]);
  };

  const onDisableTwoFactor = () => {
    if (!disableTwoFactorPassword) return;
    Alert.alert("Turn off two-factor authentication?", "Logins will only need your password after this.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Turn Off",
        style: "destructive",
        onPress: async () => {
          setIsDisablingTwoFactor(true);
          try {
            await disableTwoFactor({ password: disableTwoFactorPassword });
            setDisableTwoFactorPassword("");
            await refreshUser();
          } catch (err) {
            Alert.alert("Couldn't turn off two-factor authentication", extractErrorMessage(err, "Check your password and try again."));
          } finally {
            setIsDisablingTwoFactor(false);
          }
        },
      },
    ]);
  };

  const onDownloadData = async () => {
    setIsExporting(true);
    try {
      const data = await fetchDataExport();
      await Share.share({
        title: "My Fynrox data",
        message: JSON.stringify(data, null, 2),
      });
    } catch (err) {
      Alert.alert("Couldn't export your data", extractErrorMessage(err, "Try again."));
    } finally {
      setIsExporting(false);
    }
  };

  const onDeleteAccount = () => {
    if (!deletePassword) return;
    Alert.alert(
      "Delete your account?",
      "This permanently deletes your profile, workout history, meal logs, measurements, purchases, and reminders. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            try {
              await deleteAccount({ password: deletePassword });
            } catch (err) {
              Alert.alert("Couldn't delete account", extractErrorMessage(err, "Check your password and try again."));
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <ScreenContainer title={t("security.title")}>
      <Card>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>{t("security.changePassword")}</Text>
        <TextInput
          style={styles.input}
          placeholder={t("security.currentPassword")}
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={currentPassword}
          onChangeText={setCurrentPassword}
        />
        <TextInput
          style={[styles.input, { marginTop: spacing.sm }]}
          placeholder={t("security.newPassword")}
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
        />
        <TextInput
          style={[styles.input, { marginTop: spacing.sm }]}
          placeholder={t("security.confirmNewPassword")}
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
        {passwordError ? (
          <Text style={{ color: colors.danger, marginTop: spacing.sm }}>{passwordError}</Text>
        ) : null}
        <Button
          label={t("security.changePassword")}
          onPress={onChangePassword}
          loading={isChangingPassword}
          disabled={!canChangePassword}
          style={{ marginTop: spacing.md }}
        />
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>
          {t("security.twoFactor.title")}
        </Text>

        {twoFactorStep === "recoveryCodes" ? (
          <>
            <Text style={{ color: colors.textPrimary, marginBottom: spacing.sm }}>
              {t("security.twoFactor.recoveryCodes")}
            </Text>
            <View style={styles.recoveryCodesBox}>
              {twoFactorRecoveryCodes.map((code) => (
                <Text key={code} style={styles.recoveryCode}>
                  {code}
                </Text>
              ))}
            </View>
            <Button
              label={t("security.twoFactor.copyCodes")}
              variant="secondary"
              onPress={onCopyRecoveryCodes}
              style={{ marginTop: spacing.md }}
            />
            <Button label={t("common.done")} onPress={onFinishTwoFactorSetup} style={{ marginTop: spacing.sm }} />
          </>
        ) : twoFactorStep === "setup" && twoFactorSetupData ? (
          <>
            <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
              {t("security.twoFactor.scan")}
            </Text>
            <View style={styles.qrWrapper}>
              <Image source={{ uri: twoFactorSetupData.qrCodeDataUrl }} style={styles.qrImage} />
            </View>
            <Text style={{ color: colors.textMuted, ...typography.meta, marginBottom: spacing.xs }}>
              {t("security.twoFactor.cantScan")}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
              <Text style={[styles.manualSecret, { flex: 1 }]}>{twoFactorSetupData.secret}</Text>
              <Button label={t("security.twoFactor.copy")} variant="secondary" onPress={onCopyTwoFactorSecret} style={{ height: 36, paddingHorizontal: spacing.md }} />
            </View>
            <TextInput
              style={styles.input}
              placeholder={t("security.twoFactor.code")}
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              value={twoFactorCode}
              onChangeText={setTwoFactorCode}
            />
            {twoFactorError ? (
              <Text style={{ color: colors.danger, marginTop: spacing.sm }}>{twoFactorError}</Text>
            ) : null}
            <Button
              label={t("security.twoFactor.enable")}
              onPress={onConfirmEnableTwoFactor}
              loading={isEnablingTwoFactor}
              disabled={twoFactorCode.trim().length !== 6}
              style={{ marginTop: spacing.md }}
            />
            <Button label={t("common.cancel")} variant="secondary" onPress={onCancelTwoFactorSetup} style={{ marginTop: spacing.sm }} />
          </>
        ) : user?.twoFactorEnabled ? (
          <>
            <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
              {t("security.twoFactor.on")}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={t("security.password")}
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              value={disableTwoFactorPassword}
              onChangeText={setDisableTwoFactorPassword}
            />
            <Button
              label={t("security.twoFactor.turnOff")}
              variant="secondary"
              onPress={onDisableTwoFactor}
              loading={isDisablingTwoFactor}
              disabled={!disableTwoFactorPassword}
              style={{ marginTop: spacing.md }}
            />
          </>
        ) : (
          <>
            <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
              {t("security.twoFactor.pitch")}
            </Text>
            <Button label={t("security.twoFactor.setUp")} onPress={onStartTwoFactorSetup} loading={isStartingTwoFactorSetup} />
          </>
        )}
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>{t("security.sessions.title")}</Text>
        {sessionsLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : sessionsError ? (
          <ErrorState onRetry={() => refetchSessions()} />
        ) : (sessions ?? []).length === 0 ? (
          <EmptyState title={t("security.sessions.empty")} />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {(sessions ?? []).map((session) => (
              <View
                key={session.id}
                style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
              >
                <View style={{ flex: 1, marginRight: spacing.sm }}>
                  <Text style={{ color: colors.textPrimary }}>Signed in {formatDate(session.createdAt)}</Text>
                  <Text style={{ color: colors.textMuted, ...typography.meta }}>
                    Expires {formatDate(session.expiresAt)}
                  </Text>
                </View>
                <Button label={t("security.sessions.signOut")} variant="secondary" onPress={() => onRevokeSession(session.id)} style={{ height: 36, paddingHorizontal: spacing.md }} />
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1, marginRight: spacing.md }}>
            <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{t("security.biometric.title")}</Text>
            <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
              {!isBiometricHardwareChecked
                ? t("security.biometric.checking")
                : isBiometricHardwareReady
                  ? t("security.biometric.ready")
                  : t("security.biometric.unavailable")}
            </Text>
          </View>
          <Switch
            value={isBiometricLockEnabled}
            onValueChange={onToggleBiometric}
            disabled={!isBiometricHardwareChecked || !isBiometricHardwareReady || isTogglingBiometric}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </View>
        {biometricError ? (
          <Text style={{ color: colors.danger, marginTop: spacing.sm }}>{biometricError}</Text>
        ) : null}
        {isBiometricLockEnabled ? (
          <View style={{ marginTop: spacing.md }}>
            <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
              {t("security.biometric.lockAfter")}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
              {BIOMETRIC_LOCK_IDLE_TIMEOUT_OPTIONS.map((minutes) => (
                <Chip
                  key={minutes}
                  label={t(idleTimeoutKey(minutes).key, idleTimeoutKey(minutes).options)}
                  selected={biometricLockIdleTimeoutMinutes === minutes}
                  onPress={() => setBiometricLockIdleTimeout(minutes)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>{t("security.data.title")}</Text>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
          {t("security.data.body")}
        </Text>
        <Button label={t("security.data.download")} variant="secondary" onPress={onDownloadData} loading={isExporting} />
      </Card>

      <Card style={{ marginTop: spacing.md, borderColor: colors.danger }}>
        <Text style={{ color: colors.danger, ...typography.h2, marginBottom: spacing.sm }}>{t("security.deleteAccount.title")}</Text>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
          {t("security.deleteAccount.body")}
        </Text>
        <TextInput
          style={styles.input}
          placeholder={t("security.password")}
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={deletePassword}
          onChangeText={setDeletePassword}
        />
        <Button
          label={t("security.deleteAccount.submit")}
          variant="secondary"
          onPress={onDeleteAccount}
          loading={isDeleting}
          disabled={!deletePassword}
          style={{ marginTop: spacing.md, borderColor: colors.danger }}
        />
      </Card>
    </ScreenContainer>
  );
}

const styles = {
  input: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
  },
  qrWrapper: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  manualSecret: {
    color: colors.textPrimary,
    fontFamily: "monospace",
    letterSpacing: 1,
  },
  recoveryCodesBox: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  recoveryCode: {
    color: colors.textPrimary,
    fontFamily: "monospace",
    fontSize: 15,
    letterSpacing: 1,
  },
} as const;
