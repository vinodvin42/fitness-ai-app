import React, { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { Pill } from "../../components/Pill";
import { ActionRow, GroupCard, SectionLabel, ToggleRow } from "../../components/SettingsParts";
import {
  changePassword,
  disableTwoFactor,
  enableTwoFactor,
  fetchSessions,
  revokeOtherSessions,
  revokeSession,
  setupTwoFactor,
} from "../../api/users";
import { useAuth } from "../../context/AuthContext";
import { BIOMETRIC_LOCK_IDLE_TIMEOUT_OPTIONS, type BiometricLockIdleTimeoutMinutes } from "../../lib/biometricAuth";
import { extractErrorMessage } from "../../lib/apiError";
import { confirmAction } from "../../lib/confirm";
import { describeUserAgent, timeAgo } from "../../lib/deviceLabel";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import type { SetupTwoFactorResponse } from "@fitness-ai-app/types";

function idleTimeoutLabel(minutes: BiometricLockIdleTimeoutMinutes): string {
  return minutes === 0 ? "Immediately" : `${minutes} min`;
}

type Props = NativeStackScreenProps<MoreStackParamList, "Security">;

/**
 * Figma Settings 11 - Security. Cards: Login (email + password, "Change
 * password"), Two-Factor Auth (authenticator-app TOTP, "Enabled" chip),
 * Face ID Login (per-device biometric app lock + idle timeout), Active
 * Sessions (device label from the sign-in User-Agent, this device flagged,
 * "Sign Out All Other Devices"), Download My Data (opens the Download my data
 * screen) and a red Delete Account (password-confirmed hard delete). The app
 * signs in with email + password, so the frame's mobile-OTP "Change number"
 * becomes "Change password".
 *
 * 25 Aug 2026: real TOTP two-factor (gap 17) - setup is three steps: scan a QR
 * (or enter the secret) -> enter a live code -> save the one-time recovery
 * codes shown exactly once. Biometric Unlock is per device (SecureStore), not
 * synced to the account.
 */
export function SecurityScreen({ navigation, route }: Props) {
  // Arriving from Consent withdrawn ("Manage account deletion"): show the Delete Account section first.
  const deleteFirst = route.params?.focus === "delete";
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
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const [showDeleteForm, setShowDeleteForm] = useState(deleteFirst);
  const [deletePassword, setDeletePassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSigningOutOthers, setIsSigningOutOthers] = useState(false);

  const [isTogglingBiometric, setIsTogglingBiometric] = useState(false);
  const [biometricError, setBiometricError] = useState<string | null>(null);

  // `twoFactorStep` walks setup forward: 'idle' -> 'setup' (QR shown, waiting
  // on a code) -> 'recoveryCodes' (just enabled) -> back to 'idle'. Whether the
  // account already has 2FA on comes from `user.twoFactorEnabled` itself.
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

  const canChangePassword = currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword;

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
    confirmAction("Sign out this session?", "That device will need to log in again.", "Sign out", async () => {
      try {
        await revokeSession(id);
        await queryClient.invalidateQueries({ queryKey: ["users", "sessions"] });
      } catch (err) {
        Alert.alert("Couldn't sign out that session", extractErrorMessage(err, "Try again."));
      }
    });
  };

  const onSignOutOthers = () => {
    confirmAction("Sign out all other devices?", "Every other device will need to log in again. This device stays signed in.", "Sign out", async () => {
      setIsSigningOutOthers(true);
      try {
        await revokeOtherSessions();
        await queryClient.invalidateQueries({ queryKey: ["users", "sessions"] });
      } catch (err) {
        Alert.alert("Couldn't sign out other devices", extractErrorMessage(err, "Try again."));
      } finally {
        setIsSigningOutOthers(false);
      }
    });
  };

  const onToggleBiometric = async (value: boolean) => {
    setBiometricError(null);
    setIsTogglingBiometric(true);
    try {
      if (value) {
        const success = await enableBiometricLock();
        if (!success) setBiometricError("Couldn't verify Face ID / fingerprint. Try again.");
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
    confirmAction("Turn off two-factor authentication?", "Logins will only need your password after this.", "Turn Off", async () => {
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
    });
  };

  const onDeleteAccount = () => {
    if (!deletePassword) return;
    confirmAction(
      "Delete your account?",
      "This permanently deletes your profile, workout history, meal logs, measurements, purchases, and reminders. This can't be undone.",
      "Delete Account",
      async () => {
        setIsDeleting(true);
        try {
          await deleteAccount({ password: deletePassword });
        } catch (err) {
          Alert.alert("Couldn't delete account", extractErrorMessage(err, "Check your password and try again."));
        } finally {
          setIsDeleting(false);
        }
      },
    );
  };

  const deleteForm = (
    <Card style={{ borderColor: colors.danger, gap: spacing.sm }}>
      <Text style={{ color: colors.danger, ...typography.h3 }}>Delete Account</Text>
      <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 17 }}>
        Permanently deletes your account and everything in it. Enter your password to confirm.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={colors.textMuted}
        secureTextEntry
        value={deletePassword}
        onChangeText={setDeletePassword}
      />
      <Button
        label="Delete Account"
        variant="secondary"
        onPress={onDeleteAccount}
        loading={isDeleting}
        disabled={!deletePassword}
        style={{ borderColor: colors.danger }}
      />
    </Card>
  );

  const rowStyle = { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: 14 } as const;
  const rowTitle = { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 } as const;
  const rowSub = { color: colors.textSecondary, ...typography.meta, fontSize: 11 } as const;
  const iconTile = (icon: "lock" | "shield-check", tint: string, soft: string) => (
    <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: soft, alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={18} color={tint} />
    </View>
  );

  const otherSessions = (sessions ?? []).filter((x) => !x.current);

  return (
    <ScreenContainer title="Security">
      {deleteFirst ? deleteForm : null}

      <Card style={{ padding: 0 }}>
        <View style={rowStyle}>
          {iconTile("lock", colors.accent, colors.accentSoft)}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={rowTitle}>Login</Text>
            <Text style={rowSub}>Email & password - {user?.email}</Text>
          </View>
        </View>
        <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
          <Button label={showPasswordForm ? "Cancel" : "Change password"} variant="secondary" onPress={() => setShowPasswordForm((v) => !v)} />
        </View>
        {showPasswordForm ? (
          <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: spacing.sm }}>
            <TextInput
              style={styles.input}
              placeholder="Current password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
            />
            <TextInput
              style={styles.input}
              placeholder="New password (min. 8 characters)"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm new password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            {passwordError ? <Text style={{ color: colors.danger }}>{passwordError}</Text> : null}
            <Text style={{ color: colors.textMuted, ...typography.meta }}>You'll be signed out of every session after changing it.</Text>
            <Button label="Save new password" onPress={onChangePassword} loading={isChangingPassword} disabled={!canChangePassword} />
          </View>
        ) : null}
      </Card>

      <Card style={{ padding: 0 }}>
        <View style={rowStyle}>
          {iconTile("shield-check", colors.success, colors.successSoft)}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={rowTitle}>Two-Factor Auth</Text>
            <Text style={rowSub}>Authenticator app (one-time codes)</Text>
          </View>
          {twoFactorStep === "idle" ? (
            user?.twoFactorEnabled ? (
              <Pill label="Enabled" tone="success" />
            ) : (
              <Pressable
                onPress={onStartTwoFactorSetup}
                disabled={isStartingTwoFactorSetup}
                accessibilityRole="button"
                accessibilityLabel="Set up two-factor authentication"
              >
                <Pill label={isStartingTwoFactorSetup ? "Starting..." : "Set up"} tone="accent" />
              </Pressable>
            )
          ) : null}
        </View>

        {twoFactorStep === "recoveryCodes" ? (
          <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
            <Text style={{ color: colors.textPrimary, marginBottom: spacing.sm }}>
              Two-factor authentication is on. Save these recovery codes somewhere safe - each works once, and this is the only time they'll be shown.
            </Text>
            <View style={styles.recoveryCodesBox}>
              {twoFactorRecoveryCodes.map((code) => (
                <Text key={code} style={styles.recoveryCode}>
                  {code}
                </Text>
              ))}
            </View>
            <Button label="Copy Codes" variant="secondary" onPress={onCopyRecoveryCodes} style={{ marginTop: spacing.md }} />
            <Button label="Done" onPress={onFinishTwoFactorSetup} style={{ marginTop: spacing.sm }} />
          </View>
        ) : twoFactorStep === "setup" && twoFactorSetupData ? (
          <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
            <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
              Scan this with your authenticator app (Google Authenticator, Authy, 1Password, etc.), then enter the 6-digit code it shows.
            </Text>
            <View style={styles.qrWrapper}>
              <Image source={{ uri: twoFactorSetupData.qrCodeDataUrl }} style={styles.qrImage} />
            </View>
            <Text style={{ color: colors.textMuted, ...typography.meta, marginBottom: spacing.xs }}>Can't scan it? Enter this code manually:</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
              <Text style={[styles.manualSecret, { flex: 1 }]}>{twoFactorSetupData.secret}</Text>
              <Button label="Copy" variant="secondary" onPress={onCopyTwoFactorSecret} style={{ height: 36, paddingHorizontal: spacing.md }} />
            </View>
            <TextInput
              style={styles.input}
              placeholder="6-digit code"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              value={twoFactorCode}
              onChangeText={setTwoFactorCode}
            />
            {twoFactorError ? <Text style={{ color: colors.danger, marginTop: spacing.sm }}>{twoFactorError}</Text> : null}
            <Button
              label="Enable"
              onPress={onConfirmEnableTwoFactor}
              loading={isEnablingTwoFactor}
              disabled={twoFactorCode.trim().length !== 6}
              style={{ marginTop: spacing.md }}
            />
            <Button label="Cancel" variant="secondary" onPress={onCancelTwoFactorSetup} style={{ marginTop: spacing.sm }} />
          </View>
        ) : user?.twoFactorEnabled ? (
          <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: spacing.sm }}>
            <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 17 }}>
              Logins need a code from your authenticator app. Enter your password to turn it off.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              value={disableTwoFactorPassword}
              onChangeText={setDisableTwoFactorPassword}
            />
            <Button
              label="Turn Off"
              variant="secondary"
              onPress={onDisableTwoFactor}
              loading={isDisablingTwoFactor}
              disabled={!disableTwoFactorPassword}
            />
          </View>
        ) : null}
      </Card>

      <Card style={{ padding: 0 }}>
        <ToggleRow
          icon="user"
          title="Face ID Login"
          subtitle={
            !isBiometricHardwareChecked
              ? "Checking this device..."
              : isBiometricHardwareReady
                ? "Enable seamless biometrics"
                : "No Face ID or fingerprint is set up on this device."
          }
          value={isBiometricLockEnabled}
          onValueChange={onToggleBiometric}
          disabled={!isBiometricHardwareChecked || !isBiometricHardwareReady || isTogglingBiometric}
        />
        {biometricError ? <Text style={{ color: colors.danger, paddingHorizontal: 14, paddingBottom: 10 }}>{biometricError}</Text> : null}
        {isBiometricLockEnabled ? (
          <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
            <Text style={{ color: colors.textSecondary, ...typography.meta, marginBottom: spacing.sm }}>Lock after being backgrounded for</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
              {BIOMETRIC_LOCK_IDLE_TIMEOUT_OPTIONS.map((minutes) => (
                <Chip
                  key={minutes}
                  label={idleTimeoutLabel(minutes)}
                  selected={biometricLockIdleTimeoutMinutes === minutes}
                  onPress={() => setBiometricLockIdleTimeout(minutes)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </Card>

      <SectionLabel text="Active Sessions" />
      {sessionsLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : sessionsError ? (
        <ErrorState onRetry={() => refetchSessions()} />
      ) : (sessions ?? []).length === 0 ? (
        <EmptyState title="No active sessions" />
      ) : (
        <GroupCard>
          {(sessions ?? []).map((session) => {
            const d = describeUserAgent(session.userAgent);
            return (
              <Pressable
                key={session.id}
                onPress={session.current ? undefined : () => onRevokeSession(session.id)}
                accessibilityRole={session.current ? undefined : "button"}
                accessibilityLabel={session.current ? `${d.name}, current device` : `Sign out ${d.name}`}
                style={rowStyle}
              >
                <Icon name={d.icon} size={18} color={session.current ? colors.success : colors.textSecondary} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={rowTitle}>{d.name}</Text>
                  <Text style={rowSub}>
                    {session.current ? `Current device - ${d.detail}` : `Active ${timeAgo(session.createdAt)} - ${d.detail}`}
                  </Text>
                </View>
                {session.current ? (
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success }} />
                ) : (
                  <Text style={{ color: colors.danger, fontFamily: fonts.bodySemi, fontSize: 12 }}>Sign out</Text>
                )}
              </Pressable>
            );
          })}
          {otherSessions.length > 0 ? (
            <Pressable
              onPress={onSignOutOthers}
              disabled={isSigningOutOthers}
              accessibilityRole="button"
              accessibilityLabel="Sign out all other devices"
              style={{ padding: 14, alignItems: "center" }}
            >
              <Text style={{ color: colors.danger, fontFamily: fonts.bodyBold, fontSize: 13 }}>
                {isSigningOutOthers ? "Signing out..." : "Sign Out All Other Devices"}
              </Text>
            </Pressable>
          ) : null}
        </GroupCard>
      )}

      <ActionRow label="Download My Data" icon="download" onPress={() => navigation.navigate("DownloadData")} />

      {showDeleteForm ? (
        deleteFirst ? null : deleteForm
      ) : (
        <ActionRow label="Delete Account" icon="trash" tone="danger" onPress={() => setShowDeleteForm(true)} />
      )}
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
